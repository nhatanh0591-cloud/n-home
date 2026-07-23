// js/modules/documents.js
// Module "Giấy tờ": chọn 1 tòa nhà, xuất PDF hàng loạt cho các khách còn hợp đồng hoạt động.

import { getBuildings, getCustomers, getContracts } from '../store.js';
import { showToast, cleanupAfterPrint, getBuildingShortCode } from '../utils.js';
import { getContractStatus, getStatusInfo } from './contracts.js';
import { buildCT01Html } from './ct01-utils.js';
import { buildOnho1Html } from './onho1-utils.js';
import { buildOnho2Html } from './onho2-utils.js';
import { buildOnho3Html } from './onho3-utils.js';
import { buildOnho4Html } from './onho4-utils.js';

const documentsSection = document.getElementById('documents-section');
const typeSelect = document.getElementById('documents-type-select');
const buildingSelect = document.getElementById('documents-building-select');
const noTypeEl = document.getElementById('documents-no-type');
const noBuildingEl = document.getElementById('documents-no-building');
const customerPanelEl = document.getElementById('documents-customer-panel');
const customerListEl = document.getElementById('documents-customer-list');
const customerMobileListEl = document.getElementById('documents-customer-mobile-list');
const exportBtn = document.getElementById('documents-export-btn');
const residenceUntilInput = document.getElementById('documents-temp-residence-until');
const signDateInput = document.getElementById('documents-ct01-sign-date');
const onho1SignDateInput = document.getElementById('documents-onho1-sign-date');
const onho2SignDateInput = document.getElementById('documents-onho2-sign-date');
const onho3SignDateInput = document.getElementById('documents-onho3-sign-date');
const onho4SignDateInput = document.getElementById('documents-onho4-sign-date');

// Field bổ sung riêng của từng loại giấy tờ - chỉ hiện khi loại đó được chọn.
const EXTRA_FIELDS_BY_TYPE = {
    ct01: document.getElementById('documents-ct01-fields'),
    onho1: document.getElementById('documents-onho1-fields'),
    onho2: document.getElementById('documents-onho2-fields'),
    onho3: document.getElementById('documents-onho3-fields'),
    onho4: document.getElementById('documents-onho4-fields')
};

// Trạng thái hợp đồng được coi là "còn hoạt động" (khách vẫn đang ở)
const ACTIVE_STATUSES = ['active', 'expiring'];

export function initDocuments() {
    typeSelect.addEventListener('change', handleTypeChange);
    buildingSelect.addEventListener('change', () => renderCustomerList(buildingSelect.value));

    document.getElementById('documents-select-all').addEventListener('change', (e) => {
        customerPanelEl.querySelectorAll('.doc-customer-checkbox').forEach(cb => cb.checked = e.target.checked);
    });

    // Bảng desktop và card mobile render 2 checkbox riêng cho cùng 1 khách (chỉ 1 bên hiển thị tuỳ màn hình) -
    // đồng bộ 2 bên khi người dùng tick 1 trong 2, tránh lệch trạng thái lúc xuất.
    customerPanelEl.addEventListener('change', (e) => {
        if (!e.target.classList.contains('doc-customer-checkbox')) return;
        const customerId = e.target.dataset.customerId;
        customerPanelEl.querySelectorAll(`.doc-customer-checkbox[data-customer-id="${customerId}"]`)
            .forEach(cb => cb.checked = e.target.checked);
    });

    exportBtn.addEventListener('click', handleExport);
}

function handleTypeChange() {
    const type = typeSelect.value;

    Object.entries(EXTRA_FIELDS_BY_TYPE).forEach(([key, el]) => el?.classList.toggle('hidden', key !== type));

    if (!type) {
        buildingSelect.disabled = true;
        buildingSelect.value = '';
        noTypeEl.classList.remove('hidden');
        noBuildingEl.classList.add('hidden');
        customerPanelEl.classList.add('hidden');
        return;
    }

    buildingSelect.disabled = false;
    noTypeEl.classList.add('hidden');
    renderCustomerList(buildingSelect.value);
}

export function loadDocuments() {
    if (documentsSection?.classList.contains('hidden')) return;

    const currentValue = buildingSelect.value;
    const buildings = getBuildings().filter(b => b.isActive !== false);
    buildingSelect.innerHTML = '<option value="">-- Chọn tòa nhà --</option>' +
        buildings.map(b => `<option value="${b.id}">${b.code}</option>`).join('');
    buildingSelect.value = currentValue;

    handleTypeChange();
}

/**
 * Lấy ảnh chữ ký để in cho 1 khách trong 1 hợp đồng (dùng cho CT01 - mỗi người 1 chữ ký riêng).
 * Ưu tiên chữ ký cá nhân lưu trên hồ sơ khách hàng (áp dụng cho cả người chung phòng lẫn đại diện).
 * Nếu khách chưa có chữ ký cá nhân và là đại diện hợp đồng, dự phòng bằng chữ ký hợp đồng đã ký
 * qua app khách hàng (dữ liệu cũ trước khi có trường chữ ký riêng trên hồ sơ khách).
 */
function getCustomerSignature(customer, contract) {
    if (customer?.signatureImage) return customer.signatureImage;
    if (contract?.representativeId === customer?.id) return contract?.signatureData?.signatureImage || null;
    return null;
}

/**
 * Lấy danh sách khách (kèm hợp đồng) còn hoạt động trong 1 tòa nhà, mỗi khách xuất hiện 1 lần.
 */
function getActiveCustomersOfBuilding(buildingId) {
    const contracts = getContracts().filter(c =>
        c.buildingId === buildingId && ACTIVE_STATUSES.includes(getContractStatus(c))
    );
    const customers = getCustomers();
    const rows = [];
    const seen = new Set();

    contracts.forEach(contract => {
        (contract.customers || []).forEach(customerId => {
            if (seen.has(customerId)) return;
            const customer = customers.find(c => c.id === customerId);
            if (!customer) return;
            seen.add(customerId);
            rows.push({
                customer,
                contract,
                hasSignature: !!getCustomerSignature(customer, contract)
            });
        });
    });

    // Sắp xếp theo phòng - cùng logic với màn Khách hàng: phòng G... lên đầu, rồi phòng số tăng dần,
    // rồi phòng chữ khác, Sân Thượng/Rooftop luôn ở cuối
    rows.sort((a, b) => {
        const roomA = a.contract.room || '';
        const roomB = b.contract.room || '';
        const getSpecialOrder = (room) => {
            if (room.toLowerCase().includes('sân thượng') || room.toLowerCase().includes('rooftop')) return 4;
            if (/^G/i.test(room)) return 1;
            if (isNaN(parseInt(room))) return 3;
            return 2;
        };
        const orderA = getSpecialOrder(roomA);
        const orderB = getSpecialOrder(roomB);
        if (orderA !== orderB) return orderA - orderB;
        if (orderA === 2) return parseInt(roomA) - parseInt(roomB);
        return roomA.localeCompare(roomB);
    });

    return rows;
}

function renderCustomerList(buildingId) {
    if (!buildingId) {
        noBuildingEl.classList.remove('hidden');
        customerPanelEl.classList.add('hidden');
        return;
    }

    const rows = getActiveCustomersOfBuilding(buildingId);

    if (rows.length === 0) {
        noBuildingEl.textContent = 'Tòa nhà này chưa có khách nào còn hợp đồng hoạt động.';
        noBuildingEl.classList.remove('hidden');
        customerPanelEl.classList.add('hidden');
        return;
    }

    noBuildingEl.classList.add('hidden');
    customerPanelEl.classList.remove('hidden');

    const building = getBuildings().find(b => b.id === buildingId);

    customerListEl.innerHTML = rows.map(({ customer, contract, hasSignature }) => {
        const statusInfo = getStatusInfo(getContractStatus(contract));
        const note = hasSignature ? '' : '<div class="text-xs text-gray-400">Khách chưa có chữ ký</div>';
        return `
        <tr class="border-b hover:bg-gray-50">
            <td class="py-4 px-4">
                <input type="checkbox" class="doc-customer-checkbox w-4 h-4 cursor-pointer" data-customer-id="${customer.id}" data-contract-id="${contract.id}">
            </td>
            <td class="py-4 px-4">
                <div class="font-medium">${customer.name}</div>
                ${note}
            </td>
            <td class="py-4 px-4">${building?.code || '-'}</td>
            <td class="py-4 px-4">${contract.room || '-'}</td>
            <td class="py-4 px-4">
                <span class="px-3 py-1 rounded-full text-xs font-semibold ${statusInfo.className}">${statusInfo.text}</span>
            </td>
        </tr>`;
    }).join('');

    customerMobileListEl.innerHTML = rows.map(({ customer, contract, hasSignature }) => {
        const statusInfo = getStatusInfo(getContractStatus(contract));
        const note = hasSignature ? '' : '<div class="text-xs text-gray-400 mt-1">Khách chưa có chữ ký</div>';
        return `
        <div class="mobile-card">
            <div class="flex items-center gap-3 mb-3 pb-3 border-b">
                <input type="checkbox" class="doc-customer-checkbox w-5 h-5 cursor-pointer" data-customer-id="${customer.id}" data-contract-id="${contract.id}">
                <span class="text-xs text-gray-500 flex-1">Chọn để xuất</span>
            </div>
            <div class="mobile-card-row">
                <span class="mobile-card-label">Họ tên:</span>
                <span class="mobile-card-value font-semibold">${customer.name}</span>
            </div>
            <div class="mobile-card-row">
                <span class="mobile-card-label">Tòa nhà:</span>
                <span class="mobile-card-value">${building?.code || '-'}</span>
            </div>
            <div class="mobile-card-row">
                <span class="mobile-card-label">Phòng:</span>
                <span class="mobile-card-value">${contract.room || '-'}</span>
            </div>
            <div class="mobile-card-row">
                <span class="mobile-card-label">Trạng thái:</span>
                <span class="mobile-card-value">
                    <span class="px-3 py-1 rounded-full text-xs font-semibold ${statusInfo.className}">${statusInfo.text}</span>
                </span>
            </div>
            ${note}
        </div>`;
    }).join('');
}

function _waitFontsReady() {
    return Promise.all([
        document.fonts.load('400 11pt Tinos'),
        document.fonts.load('700 11pt Tinos')
    ]).catch(() => {});
}

async function handleExport() {
    switch (typeSelect.value) {
        case 'ct01':
            return handleExportCT01();
        case 'onho1':
            return handleExportOnho1();
        case 'onho2':
            return handleExportOnho2();
        case 'onho3':
            return handleExportOnho3();
        case 'onho4':
            return handleExportOnho4();
        default:
            showToast('Vui lòng chọn loại giấy tờ cần xuất!', 'error');
    }
}

async function handleExportCT01() {
    const buildingId = buildingSelect.value;
    const building = getBuildings().find(b => b.id === buildingId);
    if (!building) {
        showToast('Vui lòng chọn tòa nhà!', 'error');
        return;
    }

    const checkedBoxes = [...customerListEl.querySelectorAll('.doc-customer-checkbox:checked')];
    if (checkedBoxes.length === 0) {
        showToast('Vui lòng chọn ít nhất 1 khách!', 'error');
        return;
    }

    const customers = getCustomers();
    const contracts = getContracts();

    // Ngày "tạm trú đến" và ngày tháng ký do người dùng tự nhập trước khi xuất (input type=date, dạng yyyy-mm-dd) -> đổi sang dd/mm/yyyy
    const residenceUntilRaw = residenceUntilInput.value;
    const residenceUntilDate = residenceUntilRaw
        ? residenceUntilRaw.split('-').reverse().join('/')
        : '';
    const signDateRaw = signDateInput.value;
    const signDate = signDateRaw
        ? signDateRaw.split('-').reverse().join('/')
        : '';

    const pagesHtml = checkedBoxes.map(cb => {
        const customer = customers.find(c => c.id === cb.dataset.customerId);
        const contract = contracts.find(c => c.id === cb.dataset.contractId);
        const signature = getCustomerSignature(customer, contract);
        return buildCT01Html(building, customer, signature, residenceUntilDate, signDate);
    });

    const printRoot = document.getElementById('_print_root');
    printRoot.innerHTML = pagesHtml
        .map((html, i) => `<div style="${i < pagesHtml.length - 1 ? 'page-break-after:always;' : ''}">${html}</div>`)
        .join('');

    const imgs = Array.from(printRoot.querySelectorAll('img'));
    const imgsReady = new Promise(resolve => {
        if (imgs.length === 0) return resolve();
        let pending = imgs.length;
        imgs.forEach(img => {
            if (img.complete && img.naturalWidth > 0) { if (--pending === 0) resolve(); }
            else { img.onload = img.onerror = () => { if (--pending === 0) resolve(); }; }
        });
    });

    const originalTitle = document.title;
    const roomLabel = [...new Set(checkedBoxes.map(cb => contracts.find(c => c.id === cb.dataset.contractId)?.room).filter(Boolean))].join('+');
    document.title = `CT01 - ${roomLabel} - ${getBuildingShortCode(building)}`;

    // Lề trang CT01 đúng số đo thật trong file CT01.docx gốc (Page Setup: Top 0.79" / Bottom 0.39" /
    // Left 1.18" / Right 0.79" = trên 2cm / dưới 1cm / trái 3cm / phải 2cm), ghi đè tạm thời @page
    // dùng chung của hợp đồng thuê, gỡ ra ngay sau khi in xong.
    const pageStyle = document.createElement('style');
    pageStyle.id = 'ct01-page-override';
    pageStyle.textContent = '@media print { @page { size: A4; margin: 20mm 20mm 10mm 30mm; } }';
    document.head.appendChild(pageStyle);

    await Promise.all([imgsReady, _waitFontsReady()]);
    window.print();
    cleanupAfterPrint(printRoot, originalTitle, () => pageStyle.remove());
}

async function handleExportOnho1() {
    const buildingId = buildingSelect.value;
    const building = getBuildings().find(b => b.id === buildingId);
    if (!building) {
        showToast('Vui lòng chọn tòa nhà!', 'error');
        return;
    }

    const checkedBoxes = [...customerListEl.querySelectorAll('.doc-customer-checkbox:checked')];
    if (checkedBoxes.length === 0) {
        showToast('Vui lòng chọn ít nhất 1 khách!', 'error');
        return;
    }

    const customers = getCustomers();
    const contracts = getContracts();

    // Ngày ký hợp đồng ở nhờ do người dùng tự chọn trước khi xuất (input type=date, dạng yyyy-mm-dd) -> đổi sang dd/mm/yyyy
    const onho1SignDateRaw = onho1SignDateInput.value;
    const onho1SignDate = onho1SignDateRaw
        ? onho1SignDateRaw.split('-').reverse().join('/')
        : '';

    // Gom khách đã chọn theo từng hợp đồng - mỗi hợp đồng ra 1 trang, bảng Bên B liệt kê hết khách đã chọn của hợp đồng đó
    const customerIdsByContract = new Map();
    checkedBoxes.forEach(cb => {
        const contractId = cb.dataset.contractId;
        if (!customerIdsByContract.has(contractId)) customerIdsByContract.set(contractId, []);
        customerIdsByContract.get(contractId).push(cb.dataset.customerId);
    });

    const pagesHtml = [...customerIdsByContract.entries()].map(([contractId, customerIds]) => {
        const contract = contracts.find(c => c.id === contractId);
        const tenants = customerIds.map(id => customers.find(c => c.id === id)).filter(Boolean);
        const tenantSignature = contract?.signatureData?.signatureImage || null;
        return buildOnho1Html(building, contract, tenants, tenantSignature, onho1SignDate);
    });

    const printRoot = document.getElementById('_print_root');
    printRoot.innerHTML = pagesHtml
        .map((html, i) => `<div style="${i < pagesHtml.length - 1 ? 'page-break-after:always;' : ''}">${html}</div>`)
        .join('');

    const imgs = Array.from(printRoot.querySelectorAll('img'));
    const imgsReady = new Promise(resolve => {
        if (imgs.length === 0) return resolve();
        let pending = imgs.length;
        imgs.forEach(img => {
            if (img.complete && img.naturalWidth > 0) { if (--pending === 0) resolve(); }
            else { img.onload = img.onerror = () => { if (--pending === 0) resolve(); }; }
        });
    });

    const originalTitle = document.title;
    const roomLabel = [...customerIdsByContract.keys()].map(id => contracts.find(c => c.id === id)?.room).filter(Boolean).join('+');
    document.title = `Ở nhờ - ${roomLabel} - ${getBuildingShortCode(building)}`;

    await Promise.all([imgsReady, _waitFontsReady()]);
    window.print();
    cleanupAfterPrint(printRoot, originalTitle);
}

async function handleExportOnho2() {
    const buildingId = buildingSelect.value;
    const building = getBuildings().find(b => b.id === buildingId);
    if (!building) {
        showToast('Vui lòng chọn tòa nhà!', 'error');
        return;
    }

    const checkedBoxes = [...customerListEl.querySelectorAll('.doc-customer-checkbox:checked')];
    if (checkedBoxes.length === 0) {
        showToast('Vui lòng chọn ít nhất 1 khách!', 'error');
        return;
    }

    const customers = getCustomers();
    const contracts = getContracts();

    // Ngày ký hợp đồng ở nhờ do người dùng tự chọn trước khi xuất (input type=date, dạng yyyy-mm-dd) -> đổi sang dd/mm/yyyy
    const onho2SignDateRaw = onho2SignDateInput.value;
    const onho2SignDate = onho2SignDateRaw
        ? onho2SignDateRaw.split('-').reverse().join('/')
        : '';

    // Gom khách đã chọn theo từng hợp đồng - mỗi hợp đồng ra 1 trang, liệt kê hết khách đã chọn của hợp đồng đó
    const customerIdsByContract = new Map();
    checkedBoxes.forEach(cb => {
        const contractId = cb.dataset.contractId;
        if (!customerIdsByContract.has(contractId)) customerIdsByContract.set(contractId, []);
        customerIdsByContract.get(contractId).push(cb.dataset.customerId);
    });

    const pagesHtml = [...customerIdsByContract.entries()].map(([contractId, customerIds]) => {
        const contract = contracts.find(c => c.id === contractId);
        const tenants = customerIds.map(id => customers.find(c => c.id === id)).filter(Boolean);
        const tenantSignature = contract?.signatureData?.signatureImage || null;
        return buildOnho2Html(building, contract, tenants, tenantSignature, onho2SignDate);
    });

    const printRoot = document.getElementById('_print_root');
    printRoot.innerHTML = pagesHtml
        .map((html, i) => `<div style="${i < pagesHtml.length - 1 ? 'page-break-after:always;' : ''}">${html}</div>`)
        .join('');

    const imgs = Array.from(printRoot.querySelectorAll('img'));
    const imgsReady = new Promise(resolve => {
        if (imgs.length === 0) return resolve();
        let pending = imgs.length;
        imgs.forEach(img => {
            if (img.complete && img.naturalWidth > 0) { if (--pending === 0) resolve(); }
            else { img.onload = img.onerror = () => { if (--pending === 0) resolve(); }; }
        });
    });

    const originalTitle = document.title;
    const roomLabel = [...customerIdsByContract.keys()].map(id => contracts.find(c => c.id === id)?.room).filter(Boolean).join('+');
    document.title = `Ở nhờ - ${roomLabel} - ${getBuildingShortCode(building)}`;

    await Promise.all([imgsReady, _waitFontsReady()]);
    window.print();
    cleanupAfterPrint(printRoot, originalTitle);
}

async function handleExportOnho3() {
    const buildingId = buildingSelect.value;
    const building = getBuildings().find(b => b.id === buildingId);
    if (!building) {
        showToast('Vui lòng chọn tòa nhà!', 'error');
        return;
    }

    const checkedBoxes = [...customerListEl.querySelectorAll('.doc-customer-checkbox:checked')];
    if (checkedBoxes.length === 0) {
        showToast('Vui lòng chọn ít nhất 1 khách!', 'error');
        return;
    }

    const customers = getCustomers();
    const contracts = getContracts();

    // Ngày ký hợp đồng ở nhờ do người dùng tự chọn trước khi xuất (input type=date, dạng yyyy-mm-dd) -> đổi sang dd/mm/yyyy
    const onho3SignDateRaw = onho3SignDateInput.value;
    const onho3SignDate = onho3SignDateRaw
        ? onho3SignDateRaw.split('-').reverse().join('/')
        : '';

    // Gom khách đã chọn theo từng hợp đồng - mỗi hợp đồng ra 1 trang, liệt kê hết khách đã chọn của hợp đồng đó
    const customerIdsByContract = new Map();
    checkedBoxes.forEach(cb => {
        const contractId = cb.dataset.contractId;
        if (!customerIdsByContract.has(contractId)) customerIdsByContract.set(contractId, []);
        customerIdsByContract.get(contractId).push(cb.dataset.customerId);
    });

    const pagesHtml = [...customerIdsByContract.entries()].map(([contractId, customerIds]) => {
        const contract = contracts.find(c => c.id === contractId);
        const tenants = customerIds.map(id => customers.find(c => c.id === id)).filter(Boolean);
        const tenantSignature = contract?.signatureData?.signatureImage || null;
        return buildOnho3Html(building, contract, tenants, tenantSignature, onho3SignDate);
    });

    const printRoot = document.getElementById('_print_root');
    printRoot.innerHTML = pagesHtml
        .map((html, i) => `<div style="${i < pagesHtml.length - 1 ? 'page-break-after:always;' : ''}">${html}</div>`)
        .join('');

    const imgs = Array.from(printRoot.querySelectorAll('img'));
    const imgsReady = new Promise(resolve => {
        if (imgs.length === 0) return resolve();
        let pending = imgs.length;
        imgs.forEach(img => {
            if (img.complete && img.naturalWidth > 0) { if (--pending === 0) resolve(); }
            else { img.onload = img.onerror = () => { if (--pending === 0) resolve(); }; }
        });
    });

    const originalTitle = document.title;
    const roomLabel = [...customerIdsByContract.keys()].map(id => contracts.find(c => c.id === id)?.room).filter(Boolean).join('+');
    document.title = `Ở nhờ - ${roomLabel} - ${getBuildingShortCode(building)}`;

    await Promise.all([imgsReady, _waitFontsReady()]);
    window.print();
    cleanupAfterPrint(printRoot, originalTitle);
}

async function handleExportOnho4() {
    const buildingId = buildingSelect.value;
    const building = getBuildings().find(b => b.id === buildingId);
    if (!building) {
        showToast('Vui lòng chọn tòa nhà!', 'error');
        return;
    }

    const checkedBoxes = [...customerListEl.querySelectorAll('.doc-customer-checkbox:checked')];
    if (checkedBoxes.length === 0) {
        showToast('Vui lòng chọn ít nhất 1 khách!', 'error');
        return;
    }

    const customers = getCustomers();
    const contracts = getContracts();

    // Ngày ký hợp đồng do người dùng tự chọn trước khi xuất (input type=date, dạng yyyy-mm-dd) -> đổi sang dd/mm/yyyy
    const onho4SignDateRaw = onho4SignDateInput.value;
    const onho4SignDate = onho4SignDateRaw
        ? onho4SignDateRaw.split('-').reverse().join('/')
        : '';

    // Mỗi khách đã chọn ra riêng 1 trang (không gộp theo hợp đồng như mẫu 1/2/3)
    const pagesHtml = checkedBoxes.map(cb => {
        const customer = customers.find(c => c.id === cb.dataset.customerId);
        const contract = contracts.find(c => c.id === cb.dataset.contractId);
        const tenantSignature = getCustomerSignature(customer, contract);
        return buildOnho4Html(building, contract, customer, tenantSignature, onho4SignDate);
    });

    const printRoot = document.getElementById('_print_root');
    printRoot.innerHTML = pagesHtml
        .map((html, i) => `<div style="${i < pagesHtml.length - 1 ? 'page-break-after:always;' : ''}">${html}</div>`)
        .join('');

    const imgs = Array.from(printRoot.querySelectorAll('img'));
    const imgsReady = new Promise(resolve => {
        if (imgs.length === 0) return resolve();
        let pending = imgs.length;
        imgs.forEach(img => {
            if (img.complete && img.naturalWidth > 0) { if (--pending === 0) resolve(); }
            else { img.onload = img.onerror = () => { if (--pending === 0) resolve(); }; }
        });
    });

    const originalTitle = document.title;
    const roomLabel = [...new Set(checkedBoxes.map(cb => contracts.find(c => c.id === cb.dataset.contractId)?.room).filter(Boolean))].join('+');
    document.title = `Ở nhờ M4 - ${roomLabel} - ${getBuildingShortCode(building)}`;

    await Promise.all([imgsReady, _waitFontsReady()]);
    window.print();
    cleanupAfterPrint(printRoot, originalTitle);
}
