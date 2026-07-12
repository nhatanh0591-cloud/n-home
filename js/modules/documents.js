// js/modules/documents.js
// Module "Giấy tờ": chọn 1 tòa nhà, xuất PDF hàng loạt cho các khách còn hợp đồng hoạt động.

import { getBuildings, getCustomers, getContracts } from '../store.js';
import { showToast } from '../utils.js';
import { getContractStatus } from './contracts.js';
import { buildCT01Html } from './ct01-utils.js';

const documentsSection = document.getElementById('documents-section');
const buildingSelect = document.getElementById('documents-building-select');
const noBuildingEl = document.getElementById('documents-no-building');
const customerPanelEl = document.getElementById('documents-customer-panel');
const customerListEl = document.getElementById('documents-customer-list');
const exportBtn = document.getElementById('documents-export-ct01-btn');
const residenceUntilInput = document.getElementById('documents-temp-residence-until');

// Trạng thái hợp đồng được coi là "còn hoạt động" (khách vẫn đang ở)
const ACTIVE_STATUSES = ['active', 'expiring'];

export function initDocuments() {
    buildingSelect.addEventListener('change', () => renderCustomerList(buildingSelect.value));

    document.getElementById('documents-select-all-btn').addEventListener('click', () => {
        customerListEl.querySelectorAll('.doc-customer-checkbox').forEach(cb => cb.checked = true);
    });
    document.getElementById('documents-deselect-all-btn').addEventListener('click', () => {
        customerListEl.querySelectorAll('.doc-customer-checkbox').forEach(cb => cb.checked = false);
    });

    exportBtn.addEventListener('click', handleExportCT01);
}

export function loadDocuments() {
    if (documentsSection?.classList.contains('hidden')) return;

    const currentValue = buildingSelect.value;
    const buildings = getBuildings().filter(b => b.isActive !== false);
    buildingSelect.innerHTML = '<option value="">-- Chọn tòa nhà --</option>' +
        buildings.map(b => `<option value="${b.id}">${b.code} - ${b.address}</option>`).join('');
    buildingSelect.value = currentValue;

    renderCustomerList(buildingSelect.value);
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
                hasSignature: contract.representativeId === customerId && !!contract.signatureData?.signatureImage
            });
        });
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

    customerListEl.innerHTML = rows.map(({ customer, contract, hasSignature }) => `
        <label class="flex items-center gap-3 p-3 border rounded-lg hover:bg-gray-50 cursor-pointer">
            <input type="checkbox" class="doc-customer-checkbox w-4 h-4" data-customer-id="${customer.id}" data-contract-id="${contract.id}" checked>
            <div class="flex-1">
                <div class="font-medium">${customer.name} <span class="text-xs text-gray-400">(Phòng ${contract.room || '?'})</span></div>
                <div class="text-xs text-gray-500">${customer.phone || ''}${hasSignature ? '' : ' · Chưa có chữ ký hợp đồng'}</div>
            </div>
        </label>
    `).join('');
}

function _waitFontsReady() {
    return Promise.all([
        document.fonts.load('400 11pt Tinos'),
        document.fonts.load('700 11pt Tinos')
    ]).catch(() => {});
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

    // Ngày "tạm trú đến" do người dùng tự nhập trước khi xuất (input type=date, dạng yyyy-mm-dd) -> đổi sang dd/mm/yyyy
    const residenceUntilRaw = residenceUntilInput.value;
    const residenceUntilDate = residenceUntilRaw
        ? residenceUntilRaw.split('-').reverse().join('/')
        : '';

    const pagesHtml = checkedBoxes.map(cb => {
        const customer = customers.find(c => c.id === cb.dataset.customerId);
        const contract = contracts.find(c => c.id === cb.dataset.contractId);
        const signature = (contract?.representativeId === customer?.id) ? (contract?.signatureData?.signatureImage || null) : null;
        return buildCT01Html(building, customer, signature, residenceUntilDate);
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
    document.title = `CT01 - ${building.code}`;

    // Lề trang riêng cho CT01 (trên 2cm / phải 2cm / dưới 1cm / trái 4cm - lề trái nới thêm 1cm so với
    // file CT01.docx gốc (3cm) theo yêu cầu), ghi đè tạm thời @page dùng chung của hợp đồng thuê, gỡ ra ngay sau khi in xong.
    const pageStyle = document.createElement('style');
    pageStyle.id = 'ct01-page-override';
    pageStyle.textContent = '@media print { @page { size: A4; margin: 20mm 20mm 10mm 40mm; } }';
    document.head.appendChild(pageStyle);

    await Promise.all([imgsReady, _waitFontsReady()]);
    window.print();
    document.title = originalTitle;
    pageStyle.remove();
    setTimeout(() => { printRoot.innerHTML = ''; }, 2000);
}
