// js/modules/contracts.js

import { db, addDoc, setDoc, doc, deleteDoc, updateDoc, collection, serverTimestamp, deleteField } from '../firebase.js';
import { getContracts, getBuildings, getCustomers, getServices, getBills, getState, saveToCache, updateInLocalStorage, deleteFromLocalStorage } from '../store.js';
import { 
    showToast, openModal, closeModal,
    formatDateDisplay, convertToDateInputFormat, parseDateInput, parseFormattedNumber, formatMoney,
    importFromExcel, exportToExcel, showConfirm, getCurrentDateString, formatDateForStorage, safeToDate,
    attachDateSlashMask
} from '../utils.js';

// --- BIẾN CỤC BỘ CHO MODULE ---
let currentContractPage = 1;
const contractsPerPage = 100;
let contractsCache_filtered = []; // Cache đã lọc để phân trang
let selectedCustomers = []; // Khách hàng tạm thời cho modal
let currentContractServices = []; // Dịch vụ tạm thời cho modal
let originalContractServices = []; // Sao lưu dịch vụ gốc
let isCreatingServiceFromContract = false; // Cờ báo hiệu
let selectedMobileContractIds = new Set(); // Checkbox mobile persistent

// --- DOM ELEMENTS (Chỉ liên quan đến Hợp đồng) ---
const contractsSection = document.getElementById('contracts-section');
const contractsListEl = document.getElementById('contracts-list');

// Stats
const vacantRoomsEl = document.getElementById('vacant-rooms');
const totalContractsEl = document.getElementById('total-contracts');
const activeContractsEl = document.getElementById('active-contracts');
const expiringContractsEl = document.getElementById('expiring-contracts');
const expiredContractsEl = document.getElementById('expired-contracts');

// Filters
const filterBuildingEl = document.getElementById('filter-building');
const filterRoomEl = document.getElementById('filter-room');
const filterStatusEl = document.getElementById('filter-status');
const filterSignatureEl = document.getElementById('filter-signature');
const searchEl = document.getElementById('contract-search');
const selectAllCheckbox = document.getElementById('select-all-contracts');

// Pagination
const paginationEl = document.getElementById('contract-pagination');
const showingStartEl = document.getElementById('contract-showing-start');
const showingEndEl = document.getElementById('contract-showing-end');
const totalEl = document.getElementById('contract-total');
const pageInfoEl = document.getElementById('contract-page-info');
const prevBtn = document.getElementById('contract-prev-page');
const nextBtn = document.getElementById('contract-next-page');

// Modals
const contractModal = document.getElementById('contract-modal');
const contractModalTitle = document.getElementById('contract-modal-title');
const contractForm = document.getElementById('contract-form');
const contractBuildingSelect = document.getElementById('contract-building');
const contractRoomSelect = document.getElementById('contract-room');
const customerSearchInput = document.getElementById('customer-search');
const customerDropdown = document.getElementById('customer-dropdown');
const customerOptionsEl = document.getElementById('customer-options');
const selectedCustomersDisplay = document.getElementById('selected-customers-display');
const contractServicesListEl = document.getElementById('contract-services-list');

const quickCustomerModal = document.getElementById('quick-customer-modal');
const quickCustomerForm = document.getElementById('quick-customer-form');

const contractDetailModal = document.getElementById('contract-detail-modal');

const selectContractServiceModal = document.getElementById('select-contract-service-modal');
const availableContractServicesListEl = document.getElementById('available-contract-services-list');
const searchContractServicesInput = document.getElementById('search-contract-services');

const importContractsModal = document.getElementById('import-contracts-modal');
const importBuildingSelect = document.getElementById('import-building-select');

// --- HÀM CHÍNH ---

/**
 * Hàm khởi tạo, được gọi 1 lần duy nhất từ main.js
 */
export function initContracts() {
    // Lắng nghe sự kiện từ store
    document.addEventListener('store:contracts:updated', () => {
        if (!contractsSection.classList.contains('hidden')) {
            loadContracts();
        }
    });
    
    // 🔥 Lắng nghe sự kiện xóa hóa đơn để cập nhật hợp đồng
    document.addEventListener('store:bills:updated', () => {
        // Không cần reload toàn bộ, chỉ cần kiểm tra nếu đang ở trang hợp đồng
        if (!contractsSection.classList.contains('hidden')) {
            console.log('🔄 Bills updated, checking for terminated contract status changes...');
        }
    });
    // Tải lại khi tòa nhà/khách hàng thay đổi (để cập nhật tên)
    document.addEventListener('store:buildings:updated', () => {
        if (!contractsSection.classList.contains('hidden')) {
            loadContracts();
        }
        updateContractFilterOptions(); // Cập nhật filter
    });
    document.addEventListener('store:customers:updated', () => {
        if (!contractsSection.classList.contains('hidden')) {
            loadContracts();
        }
    });
    // Lắng nghe dịch vụ mới được tạo từ modal này
    document.addEventListener('service:createdForContract', (e) => {
        if (e.detail) {
            const newService = { ...e.detail, id: 'temp_' + Date.now(), isNew: true };
            currentContractServices.push(newService);
            renderContractServices();
            showToast('Đã thêm dịch vụ mới vào hợp đồng!');
        }
        isCreatingServiceFromContract = false;
    });

    // Lắng nghe sự kiện click trên toàn trang
    document.body.addEventListener('click', handleBodyClick);
    
    // Lắng nghe form
    contractForm.addEventListener('submit', handleContractFormSubmit);
    quickCustomerForm.addEventListener('submit', handleQuickCustomerSubmit);
    attachDateSlashMask(document.getElementById('quick-customer-birth-date'));

    // Lắng nghe nút bỏ chọn hàng loạt
    document.getElementById('clear-selection-contracts-btn')?.addEventListener('click', () => {
        selectedMobileContractIds.clear();
        document.querySelectorAll('.contract-checkbox').forEach(cb => cb.checked = false);
        updateClearSelectionButton();
        showToast('Bỏ chọn thành công!');
    });

    // Lắng nghe bộ lọc
    filterBuildingEl.addEventListener('change', handleBuildingFilterChange);
    filterRoomEl.addEventListener('change', () => { currentContractPage = 1; applyContractFilters(); });
    filterStatusEl.addEventListener('change', () => { currentContractPage = 1; applyContractFilters(); });
    filterSignatureEl.addEventListener('change', () => { currentContractPage = 1; applyContractFilters(); });
    searchEl.addEventListener('input', () => { currentContractPage = 1; applyContractFilters(); });

    // Lắng nghe phân trang
    prevBtn.addEventListener('click', () => {
        if (currentContractPage > 1) {
            currentContractPage--;
            renderContractsPage();
        }
    });
    nextBtn.addEventListener('click', () => {
        const totalPages = Math.ceil(contractsCache_filtered.length / contractsPerPage);
        if (currentContractPage < totalPages) {
            currentContractPage++;
            renderContractsPage();
        }
    });

    // Lắng nghe select all
    selectAllCheckbox.addEventListener('change', (e) => {
        document.querySelectorAll('.contract-checkbox').forEach(cb => cb.checked = e.target.checked);
    });

    // Lắng nghe trong modal hợp đồng
    contractBuildingSelect.addEventListener('change', handleContractBuildingChange);
    customerSearchInput.addEventListener('focus', () => loadCustomerOptions(customerSearchInput.value));
    customerSearchInput.addEventListener('input', () => loadCustomerOptions(customerSearchInput.value));
    searchContractServicesInput.addEventListener('input', showAvailableContractServices);

    // Khởi tạo modal import
    initImportModal();
    
    // Export hàm để có thể gọi từ onclick
    window.showContractDetail = showContractDetail;
}

/**
 * Tải, lọc, và chuẩn bị dữ liệu hợp đồng
 */
export function loadContracts() {
    if (contractsSection?.classList.contains('hidden')) return;
    
    let allContracts = getContracts();
    
    // Tính toán trạng thái cho từng hợp đồng
    const contractsWithStatus = allContracts.map(contract => ({
        ...contract,
        status: getContractStatus(contract)
    }));

    // Cập nhật dropdown bộ lọc
    updateContractFilterOptions();
    
    // Áp dụng bộ lọc và hiển thị (stats sẽ được update trong đây)
    applyContractFilters(contractsWithStatus);
}

/**
 * Áp dụng bộ lọc và gọi hàm render
 */
function applyContractFilters(contracts = null) {
    if (contracts === null) {
        // Nếu không có dữ liệu mới, lấy từ store và tính trạng thái
        contracts = getContracts().map(contract => ({
            ...contract,
            status: getContractStatus(contract)
        }));
    }

    // Stats luôn dựa trên toàn bộ dữ liệu, không phụ thuộc filter
    updateContractStats(contracts);

    // Lấy giá trị bộ lọc
    const buildingFilter = filterBuildingEl.value;
    const roomFilter = filterRoomEl.value;
    const statusFilter = filterStatusEl.value;
    const signatureFilter = filterSignatureEl.value;
    const searchTerm = searchEl.value.toLowerCase();

    // Xử lý filter "Còn trống" — hiển thị phòng chưa có ai thuê
    if (statusFilter === 'vacant') {
        if (signatureFilter) {
            contractsCache_filtered = [];
            currentContractPage = 1;
            renderContractsPage();
            return;
        }
        const buildings = getBuildings();
        // Tập hợp các phòng đang có hợp đồng active/expiring
        const occupiedKeys = new Set(
            contracts
                .filter(c => c.status === 'active' || c.status === 'expiring')
                .map(c => `${c.buildingId}__${c.room}`)
        );
        // Tạo danh sách phòng trống
        contractsCache_filtered = [];
        buildings
            .filter(b => b.isActive !== false)
            .filter(b => !buildingFilter || b.id === buildingFilter)
            .forEach(building => {
                (building.rooms || []).forEach(room => {
                    if (roomFilter && room !== roomFilter) return;
                    if (occupiedKeys.has(`${building.id}__${room}`)) return;
                    if (searchTerm && !room.toLowerCase().includes(searchTerm) && !building.code.toLowerCase().includes(searchTerm)) return;
                    contractsCache_filtered.push({
                        _isVacant: true,
                        id: `vacant__${building.id}__${room}`,
                        buildingId: building.id,
                        buildingCode: building.code,
                        room,
                        status: 'vacant'
                    });
                });
            });

        // Sắp xếp theo tòa nhà rồi phòng
        contractsCache_filtered.sort((a, b) => {
            if (a.buildingCode !== b.buildingCode) return a.buildingCode.localeCompare(b.buildingCode);
            return a.room.localeCompare(b.room);
        });

        currentContractPage = 1;
        renderContractsPage();
        return;
    }

    // Lọc thông thường
    contractsCache_filtered = contracts.filter(contract => {
        if (buildingFilter && contract.buildingId !== buildingFilter) return false;
        if (roomFilter && contract.room !== roomFilter) return false;
        if (statusFilter && contract.status !== statusFilter) return false;
        if (signatureFilter === 'signed' && !contract.signatureData) return false;
        if (signatureFilter === 'unsigned' && contract.signatureData) return false;

        if (searchTerm) {
            const contractNumber = `CT${contract.id.slice(-6).toUpperCase()}`;
            const building = getBuildings().find(b => b.id === contract.buildingId);
            const customer = getCustomers().find(c => c.id === contract.representativeId);

            return contractNumber.toLowerCase().includes(searchTerm) ||
                   (customer && customer.name.toLowerCase().includes(searchTerm)) ||
                   (building && building.code.toLowerCase().includes(searchTerm)) ||
                   contract.room.toLowerCase().includes(searchTerm);
        }
        return true;
    });

    // Kiểm tra xem có lọc theo tòa nhà cụ thể không
    const isFilteringByBuilding = filterBuildingEl && filterBuildingEl.value && filterBuildingEl.value !== '';

    // Sắp xếp theo logic mới
    contractsCache_filtered.sort((a, b) => {
        if (isFilteringByBuilding) {
            // TRƯỜNG HỢP LỌC THEO TÒA NHÀ - SẮP XẾP THEO PHÒNG
            const roomA = a.room;
            const roomB = b.room;

            // Hàm helper để phân loại và sắp xếp phòng
            function getRoomSortKey(room) {
                // Rooftop luôn ở cuối cùng
                if (room.toLowerCase().includes('rooftop')) {
                    return [9999, room];
                }

                // Kiểm tra phòng số (101, 102, 201, 202...)
                const numMatch = room.match(/^(\d{3})$/);
                if (numMatch) {
                    return [parseInt(numMatch[1]), parseInt(numMatch[1])];
                }

                // Các phòng đặc biệt (G01, 001, M01, Mặt bằng...)
                // Đặt ở đầu (trước phòng 101)
                return [0, room];
            }

            const [categoryA, valueA] = getRoomSortKey(roomA);
            const [categoryB, valueB] = getRoomSortKey(roomB);

            // So sánh theo category trước
            if (categoryA !== categoryB) {
                return categoryA - categoryB;
            }

            // Trong cùng category, so sánh theo value
            if (typeof valueA === 'number' && typeof valueB === 'number') {
                return valueA - valueB;
            } else {
                return valueA.toString().localeCompare(valueB.toString());
            }
        } else {
            // TRƯỜNG HỢP KHÔNG LỌC - SẮP XẾP THEO THỜI GIAN TẠO (mới nhất trước)
            const getCreatedTime = (contract) => {
                if (contract.createdAt) {
                    return safeToDate(contract.createdAt).getTime();
                }
                return 0;
            };

            return getCreatedTime(b) - getCreatedTime(a);
        }
    });

    // Render trang đầu tiên
    currentContractPage = 1;
    renderContractsPage();
}

/**
 * Hiển thị dữ liệu lên bảng (theo trang)
 */
function renderContractsPage() {
    contractsListEl.innerHTML = '';
    const mobileListEl = document.getElementById('contracts-mobile-list');
    if (mobileListEl) mobileListEl.innerHTML = '';
    
    const totalItems = contractsCache_filtered.length;

    if (totalItems === 0) {
        contractsListEl.innerHTML = '<tr><td colspan="10" class="p-8 text-center text-gray-500">Không tìm thấy hợp đồng nào.</td></tr>';
        if (mobileListEl) {
            mobileListEl.innerHTML = '<div class="p-8 text-center text-gray-500">Không tìm thấy hợp đồng nào.</div>';
        }
        updateContractPagination();
        return;
    }

    const startIndex = (currentContractPage - 1) * contractsPerPage;
    const endIndex = Math.min(startIndex + contractsPerPage, totalItems);
    const pageContracts = contractsCache_filtered.slice(startIndex, endIndex);

    const buildings = getBuildings();
    const customers = getCustomers();

    pageContracts.forEach(contract => {
        // Render row phòng trống (từ filter Còn trống)
        if (contract._isVacant) {
            const tr = document.createElement('tr');
            tr.className = 'border-b hover:bg-gray-50';
            tr.innerHTML = `
                <td class="py-4 px-4"></td>
                <td class="py-4 px-4"></td>
                <td class="py-4 px-4">
                    <div class="font-medium text-gray-400 italic">Chưa có người thuê</div>
                    <div class="text-sm text-gray-500">${contract.buildingCode} - ${contract.room}</div>
                </td>
                <td class="py-4 px-4">-</td>
                <td class="py-4 px-4">-</td>
                <td class="py-4 px-4 text-center">-</td>
                <td class="py-4 px-4 text-center">-</td>
                <td class="py-4 px-4">-</td>
                <td class="py-4 px-4">-</td>
                <td class="py-4 px-4 text-center">
                    <span class="px-2 py-1 rounded-full text-xs font-medium whitespace-nowrap inline-block bg-gray-100 text-gray-500">
                        Còn trống
                    </span>
                </td>
            `;
            contractsListEl.appendChild(tr);
            return;
        }

        const building = buildings.find(b => b.id === contract.buildingId);
        const customer = customers.find(c => c.id === contract.representativeId);
        const statusInfo = getStatusInfo(contract.status);
        const contractNumber = `CT${contract.id.slice(-6).toUpperCase()}`;
        
        // Tính số người dựa vào dịch vụ nước
        const getPeopleCount = (contract) => {
            if (!contract.serviceDetails) return '-';
            const waterService = contract.serviceDetails.find(s => {
                const service = getServices().find(sv => sv.id === s.serviceId);
                return service && service.name.toLowerCase().includes('nước') && service.unit.toLowerCase().includes('người');
            });
            return waterService ? waterService.quantity || 1 : '-';
        };
        
        // Tính số xe dựa vào dịch vụ xe
        const getVehicleCount = (contract) => {
            if (!contract.serviceDetails) return '-';
            const vehicleService = contract.serviceDetails.find(s => {
                const service = getServices().find(sv => sv.id === s.serviceId);
                return service && (service.name.toLowerCase().includes('xe') || service.name.toLowerCase().includes('gửi xe'));
            });
            return vehicleService ? vehicleService.quantity || 1 : '-';
        };
        
        const peopleCount = getPeopleCount(contract);
        const vehicleCount = getVehicleCount(contract);
        
        const tr = document.createElement('tr');
        tr.className = 'border-b hover:bg-gray-50';
        tr.innerHTML = `
            <td class="py-4 px-4">
                <input type="checkbox" class="contract-checkbox w-4 h-4 cursor-pointer" data-id="${contract.id}" data-code="${contractNumber}">
            </td>
            <td class="py-4 px-4">
                <div class="flex gap-3">
                    <button data-id="${contract.id}" class="edit-contract-btn w-8 h-8 rounded bg-gray-500 hover:bg-gray-600 flex items-center justify-center" title="Sửa">
                        <svg class="w-4 h-4 text-white pointer-events-none" fill="currentColor" viewBox="0 0 20 20"><path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z"/></svg>
                    </button>
                    <button data-id="${contract.id}" class="terminate-contract-btn w-8 h-8 rounded ${contract.status === 'terminated' ? 'bg-blue-500 hover:bg-blue-600' : 'bg-orange-500 hover:bg-orange-600'} flex items-center justify-center" title="${contract.status === 'terminated' ? 'Bỏ thanh lý' : 'Thanh lý'}">
                        ${contract.status === 'terminated' ? 
                            '<svg class="w-4 h-4 text-white pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"/></svg>' : 
                            '<svg class="w-4 h-4 text-white pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>'
                        }
                    </button>
                    <button data-id="${contract.id}" class="delete-contract-btn w-8 h-8 rounded bg-red-500 hover:bg-red-600 flex items-center justify-center" title="Xóa">
                        <svg class="w-4 h-4 text-white pointer-events-none" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd"/></svg>
                    </button>
                    ${contract.signatureData ? `
                    <button data-id="${contract.id}" class="revoke-signature-btn w-8 h-8 rounded bg-purple-500 hover:bg-purple-600 flex items-center justify-center" title="Thu hồi chữ ký">
                        <svg class="w-4 h-4 text-white pointer-events-none" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M15 12H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                    </button>` : ''}
                </div>
            </td>
            <td class="py-4 px-4">
                <div>
                    <div class="font-medium cursor-pointer hover:bg-gray-100 rounded transition-colors" onclick="window.showContractDetail('${contract.id}')" title="Click để xem chi tiết">${customer ? customer.name : 'N/A'}</div>
                    <div class="text-sm text-gray-500">${building ? building.code : 'N/A'} - ${contract.room || 'Chưa có phòng'}</div>
                </div>
            </td>
            <td class="py-4 px-4 text-center">
                <div class="text-sm whitespace-nowrap">${formatDateDisplay(contract.startDate)}</div>
                <div class="text-gray-400 text-xs">↓</div>
                <div class="text-sm whitespace-nowrap">${formatDateDisplay(contract.endDate)}</div>
            </td>
            <td class="py-4 px-4 text-center">${peopleCount}</td>
            <td class="py-4 px-4 whitespace-nowrap">${formatMoney(contract.rentPrice)} VNĐ</td>
            <td class="py-4 px-4 whitespace-nowrap">${formatMoney(contract.deposit || 0)} VNĐ</td>
            <td class="py-4 px-4 text-center">
                <span class="px-2 py-1 rounded-full text-xs font-medium whitespace-nowrap inline-block ${statusInfo.className}">
                    ${statusInfo.text}
                </span>
            </td>
            <td class="py-4 px-4 text-center">
                ${contract.signatureData ? `
                <span data-id="${contract.id}" class="download-signed-contract-btn cursor-pointer px-2 py-1 rounded-full text-xs font-medium whitespace-nowrap inline-block bg-green-100 text-green-800 hover:bg-green-200 transition-colors" title="Tải hợp đồng đã ký">
                    Đã ký
                </span>` : `
                <span class="px-2 py-1 rounded-full text-xs font-medium whitespace-nowrap inline-block bg-gray-100 text-gray-500">
                    Chưa ký
                </span>`}
            </td>
        `;
        contractsListEl.appendChild(tr);
        
        // 📱 RENDER MOBILE CARD
        if (mobileListEl) {
            const isChecked = selectedMobileContractIds.has(contract.id);
            const mobileCard = document.createElement('div');
            mobileCard.className = 'mobile-card';
            mobileCard.innerHTML = `
                <div class="flex items-center gap-3 mb-3 pb-3 border-b">
                    <input type="checkbox" class="contract-checkbox w-5 h-5 cursor-pointer" data-id="${contract.id}" data-code="${contractNumber}" ${isChecked ? 'checked' : ''}>
                    <span class="text-xs text-gray-500 flex-1">Chọn để xóa nhiều</span>
                </div>
                <div class="mobile-card-row">
                    <span class="mobile-card-label">Khách hàng:</span>
                    <span class="mobile-card-value font-medium cursor-pointer hover:underline" onclick="window.showContractDetail('${contract.id}')">${customer ? customer.name : 'N/A'}</span>
                </div>
                <div class="mobile-card-row">
                    <span class="mobile-card-label">Phòng:</span>
                    <span class="mobile-card-value">${building ? building.code : 'N/A'} - ${contract.room || 'Chưa có phòng'}</span>
                </div>
                <div class="mobile-card-row">
                    <span class="mobile-card-label">Thời hạn:</span>
                    <span class="mobile-card-value">${formatDateDisplay(contract.startDate)} → ${formatDateDisplay(contract.endDate)}</span>
                </div>
                <div class="mobile-card-row">
                    <span class="mobile-card-label">Số người:</span>
                    <span class="mobile-card-value">${peopleCount} người</span>
                </div>
                <div class="mobile-card-row">
                    <span class="mobile-card-label">Giá thuê:</span>
                    <span class="mobile-card-value font-semibold text-green-600">${formatMoney(contract.rentPrice)} VNĐ</span>
                </div>
                <div class="mobile-card-row">
                    <span class="mobile-card-label">Tiền cọc:</span>
                    <span class="mobile-card-value">${formatMoney(contract.deposit || 0)} VNĐ</span>
                </div>
                <div class="mobile-card-row">
                    <span class="mobile-card-label">Trạng thái:</span>
                    <span class="mobile-card-value">
                        <span class="px-2 py-1 rounded-full text-xs font-medium whitespace-nowrap inline-block ${statusInfo.className}">
                            ${statusInfo.text}
                        </span>
                    </span>
                </div>
                <div class="mobile-card-row">
                    <span class="mobile-card-label">Chữ ký:</span>
                    <span class="mobile-card-value">
                        ${contract.signatureData ? `
                        <span data-id="${contract.id}" class="download-signed-contract-btn cursor-pointer px-2 py-1 rounded-full text-xs font-medium whitespace-nowrap inline-block bg-green-100 text-green-800" title="Tải hợp đồng đã ký">
                            Đã ký
                        </span>` : `
                        <span class="px-2 py-1 rounded-full text-xs font-medium whitespace-nowrap inline-block bg-gray-100 text-gray-500">
                            Chưa ký
                        </span>`}
                    </span>
                </div>
                <div class="mobile-card-actions">
                    <button data-id="${contract.id}" class="edit-contract-btn bg-gray-500 hover:bg-gray-600 text-white">
                        <svg class="w-4 h-4 pointer-events-none" fill="currentColor" viewBox="0 0 20 20"><path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z"/></svg>
                        Sửa
                    </button>
                    <button data-id="${contract.id}" class="terminate-contract-btn ${contract.status === 'terminated' ? 'bg-blue-500 hover:bg-blue-600' : 'bg-orange-500 hover:bg-orange-600'} text-white">
                        ${contract.status === 'terminated' ? 
                            '<svg class="w-4 h-4 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"/></svg>' : 
                            '<svg class="w-4 h-4 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>'
                        }
                        ${contract.status === 'terminated' ? 'Bỏ thanh lý' : 'Thanh lý'}
                    </button>
                    <button data-id="${contract.id}" class="delete-contract-btn bg-red-500 hover:bg-red-600 text-white">
                        <svg class="w-4 h-4 pointer-events-none" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd"/></svg>
                        Xóa
                    </button>
                    ${contract.signatureData ? `
                    <button data-id="${contract.id}" class="revoke-signature-btn bg-purple-500 hover:bg-purple-600 text-white">
                        <svg class="w-4 h-4 pointer-events-none" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M15 12H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                        Thu hồi chữ ký
                    </button>` : ''}
                </div>
            `;
            mobileListEl.appendChild(mobileCard);
        }
    });

    updateContractPagination();
    
    // Ẩn nút action theo quyền (với timeout để đảm bảo DOM đã render)
    setTimeout(() => {
        if (window.hideActionButtons && typeof window.hideActionButtons === 'function') {
            window.hideActionButtons('contracts');
        }
    }, 100);
}

/**
 * Cập nhật thông tin phân trang
 */
function updateContractPagination() {
    const totalItems = contractsCache_filtered.length;
    const totalPages = Math.ceil(totalItems / contractsPerPage);
    const startIndex = (currentContractPage - 1) * contractsPerPage + 1;
    const endIndex = Math.min(currentContractPage * contractsPerPage, totalItems);

    showingStartEl.textContent = totalItems > 0 ? startIndex : 0;
    showingEndEl.textContent = endIndex;
    totalEl.textContent = totalItems;
    pageInfoEl.textContent = `Trang ${currentContractPage} / ${totalPages || 1}`;
    
    prevBtn.disabled = currentContractPage === 1;
    nextBtn.disabled = currentContractPage >= totalPages;
}

/**
 * Cập nhật thống kê
 */
function updateContractStats(contracts) {
    // Tính số phòng trống
    const buildings = getBuildings();
    console.log('🏢 DEBUG Buildings:', buildings.map(b => ({
        code: b.code,
        isActive: b.isActive,
        totalRooms: b.totalRooms,
        rooms: b.rooms?.length
    })));
    
    const totalRooms = buildings
        .filter(b => b.isActive !== false) // Chỉ tính các tòa nhà đang hoạt động
        .reduce((total, building) => {
            // Dùng rooms.length nếu totalRooms không có
            const roomCount = building.totalRooms || (building.rooms ? building.rooms.length : 0);
            console.log(`🏢 Building ${building.code}: ${roomCount} rooms`);
            return total + roomCount;
        }, 0);
    
    console.log('🏢 Total rooms:', totalRooms);
    console.log('📋 Contracts status:', contracts.map(c => c.status));
    
    // Đếm tất cả phòng đang thuê (active + expiring đều là đang thuê)
    const activeContracts = contracts.filter(c => c.status === 'active').length;
    const expiringContracts = contracts.filter(c => c.status === 'expiring').length;
    const occupiedContracts = activeContracts + expiringContracts;
    
    console.log('📋 Active contracts:', activeContracts);
    console.log('📋 Expiring contracts:', expiringContracts);  
    console.log('📋 Total occupied contracts:', occupiedContracts);
    
    const vacantRooms = Math.max(0, totalRooms - occupiedContracts);
    console.log('🏠 Vacant rooms:', vacantRooms);
    
    // Cập nhật giao diện
    vacantRoomsEl.textContent = vacantRooms;
    totalContractsEl.textContent = contracts.length;
    activeContractsEl.textContent = activeContracts;
    expiringContractsEl.textContent = expiringContracts;
    expiredContractsEl.textContent = contracts.filter(c => c.status === 'terminated').length;
}

/**
 * Cập nhật dropdown bộ lọc
 */
function updateContractFilterOptions() {
    const buildings = getBuildings();
    const currentBuilding = filterBuildingEl.value;
    filterBuildingEl.innerHTML = '<option value="">Tòa nhà</option>';
    buildings.forEach(building => {
        filterBuildingEl.innerHTML += `<option value="${building.id}">${building.code || 'N/A'}</option>`;
    });
    filterBuildingEl.value = currentBuilding;
    
    // Cập nhật phòng dựa trên tòa nhà đã chọn
    handleBuildingFilterChange();
}

/**
 * Xử lý khi thay đổi bộ lọc Tòa nhà
 */
function handleBuildingFilterChange() {
    const selectedBuildingId = filterBuildingEl.value;
    const currentRoom = filterRoomEl.value;
    filterRoomEl.innerHTML = '<option value="">Phòng</option>';
    
    if (selectedBuildingId) {
        const building = getBuildings().find(b => b.id === selectedBuildingId);
        if (building && building.rooms) {
            building.rooms.forEach(room => {
                filterRoomEl.innerHTML += `<option value="${room}">${room}</option>`;
            });
        }
    }
    filterRoomEl.value = currentRoom;
    
    currentContractPage = 1;
    applyContractFilters();
}

// --- IN / TẢI HỢP ĐỒNG PDF (copy y nguyên logic từ app.html khách hàng) ---
const LANDLORD_SIG = './assets/landlord-sig.jpg';

function buildA4ContractHtml(contract, building, customer, tenantSigDataUrl) {
    const startDateRaw = contract.startDate;
    let signDay = '......', signMonth = '......', signYear = '..........';
    if (startDateRaw) {
        const d = startDateRaw.toDate ? startDateRaw.toDate() : new Date(startDateRaw);
        if (!isNaN(d)) {
            signDay = String(d.getDate()).padStart(2, '0');
            signMonth = String(d.getMonth() + 1).padStart(2, '0');
            signYear = d.getFullYear();
        }
    }
    const fmtDate = (raw) => {
        if (!raw) return '..............';
        const d = raw.toDate ? raw.toDate() : new Date(raw);
        return isNaN(d) ? '...............' : `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
    };
    const startDateStr = fmtDate(contract.startDate);
    const endDateStr = fmtDate(contract.endDate);
    let durationMonths = '..........';
    if (contract.startDate && contract.endDate) {
        const s = contract.startDate.toDate ? contract.startDate.toDate() : new Date(contract.startDate);
        const e = contract.endDate.toDate ? contract.endDate.toDate() : new Date(contract.endDate);
        if (!isNaN(s) && !isNaN(e)) {
            const m = (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth() + 1);
            durationMonths = m > 0 ? m : '..........';
        }
    }
    const tenantName = customer?.name ? customer.name.toUpperCase() : '............................................................................';
    const tenantBirthYear = customer?.birthYear || '............................................................................';
    const tenantIdNumber = customer?.idNumber || '............................................................................';
    const tenantAddress = customer?.permanentAddress || '............................................................................';
    const tenantPhone = customer?.phone || '............................................................................';
    const roomCode = contract.room || '........................';
    const getFloor = (code) => {
        if (!code || code.includes('.')) return '........................';
        const c = String(code).trim();
        if (/^rooftop$/i.test(c)) return 'Sân Thượng';
        const first = c.charAt(0);
        if (first >= '1' && first <= '9') return `Tầng ${first}`;
        return 'Tầng trệt';
    };
    const floor = getFloor(roomCode);
    const fmtMoney = (n) => n ? new Intl.NumberFormat('vi-VN').format(n) : '............................';
    const rentPrice = fmtMoney(contract.rentPrice || contract.roomPrice);
    const deposit = fmtMoney(contract.deposit);
    let servicesRows = '';
    if (contract.serviceDetails && contract.serviceDetails.length > 0) {
        const services = getServices();
        contract.serviceDetails.forEach(detail => {
            const svc = services.find(s => s.id === detail.serviceId);
            if (!svc) return;
            const svcName = svc.name || '';
            const priceStr = new Intl.NumberFormat('vi-VN').format(svc.price || 0);
            const nl = svcName.toLowerCase();
            const unit = (svc.unit || '').toLowerCase();
            if (nl.includes('điện') || unit === 'kwh') {
                servicesRows += `- ${svcName}: ${priceStr} VNĐ/kWh (theo chỉ số công tơ).\n`;
            } else if (unit === 'm3' || unit === 'm³') {
                servicesRows += `- ${svcName}: ${priceStr} VNĐ/m³ (theo chỉ số đồng hồ).\n`;
            } else if (nl.includes('xe') || nl.includes('parking')) {
                servicesRows += `- ${svcName}: ${priceStr} VNĐ/xe/tháng.\n`;
            } else if (unit === 'person' || (nl.includes('nước') && unit !== 'm3' && unit !== 'm³')) {
                servicesRows += `- ${svcName}: ${priceStr} VNĐ/người.\n`;
            } else {
                servicesRows += `- ${svcName}: ${priceStr} VNĐ/phòng.\n`;
            }
        });
    }
    const address = building?.address || '337/38A Lê Văn Sỹ, Phường Tân Sơn Hòa, TP. Hồ Chí Minh';

    const mb3 = 'margin-bottom:1pt;';
    const mb6 = 'margin-bottom:4pt;';
    const ind = 'margin-left:18pt;margin-bottom:1pt;';
    const hd = 'margin-top:3pt;margin-bottom:1pt;';
    const sp = '<div style="height:10pt;"></div>';
    if (!servicesRows) servicesRows = '- Điện: 4.000 VNĐ/kWh (theo chỉ số công tơ).\n- Nước: 100.000 VNĐ/người.\n- Dịch vụ chung (rác, Internet): 100.000 VNĐ/phòng.\n';
    let servicesHtml = servicesRows.split('\n').filter(l => l.trim()).map(line =>
        `<p style="${ind}${mb3}">${line.trim()}</p>`
    ).join('\n');
    const tenantSigHtml = tenantSigDataUrl
        ? `<img src="${tenantSigDataUrl}" style="height:75pt;max-width:100%;object-fit:contain;display:block;margin:14pt auto 0;">`
        : '';

    return `
<div style="margin-bottom:2pt;">
  <p style="text-align:center;font-weight:700;font-size:14pt;letter-spacing:0.5px;margin-bottom:2pt;">CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</p>
  <p style="text-align:center;font-weight:700;margin-bottom:2pt;">Độc lập – Tự do – Hạnh phúc</p>
  <p style="text-align:center;margin-bottom:2pt;">─────────────────────────────────</p>
  <p style="text-align:center;font-weight:700;font-size:15pt;margin-bottom:3pt;">HỢP ĐỒNG THUÊ PHÒNG</p>
</div>
<p style="font-style:italic;${mb3}">- Căn cứ Bộ Luật Dân sự 2015 (số 91/2015/QH13); Luật Nhà ở 2023 (số 27/2023/QH15); Luật Cư trú 2020; Bộ Luật Tố tụng Dân sự 2015 và các văn bản pháp luật liên quan;</p>
<p style="font-style:italic;${mb3}">- Căn cứ vào nhu cầu và thỏa thuận của hai bên;</p>
${sp}
<p style="font-style:italic;${mb3}">Hôm nay, ngày ${signDay} tháng ${signMonth} năm ${signYear}, tại TP. Hồ Chí Minh, hai bên cùng ký kết hợp đồng thuê phòng với các điều khoản sau:</p>
${sp}

<p style="font-weight:700;${hd}">I. BÊN CHO THUÊ (Bên A):</p>
<p style="${mb3}"><strong>Ông:</strong> ĐẶNG NHẬT ANH</p>
<p style="${mb3}"><strong>Sinh năm:</strong> 1991</p>
<p style="${mb3}"><strong>CCCD:</strong> 072091000145</p>
<p style="${mb3}"><strong>Địa chỉ thường trú:</strong> Khu Phố 4, Thị Trấn Châu Thành, Châu Thành, Tây Ninh</p>
<p style="${mb3}"><strong>Địa chỉ cho thuê:</strong> ${address}</p>
${sp}

<p style="font-weight:700;${hd}">II. BÊN THUÊ (Bên B):</p>
<p style="${mb3}"><strong>Ông/Bà:</strong> ${tenantName}</p>
<p style="${mb3}"><strong>Sinh năm:</strong> ${tenantBirthYear}</p>
<p style="${mb3}"><strong>CCCD:</strong> ${tenantIdNumber}</p>
<p style="${mb3}"><strong>Địa chỉ thường trú:</strong> ${tenantAddress}</p>
<p style="${mb3}"><strong>Số điện thoại:</strong> ${tenantPhone}</p>
${sp}

<p style="${mb3}">Hai bên thống nhất gọi chung là "Các Bên" và cùng đồng ý thực hiện hợp đồng như sau:</p>
${sp}

<p style="font-weight:700;${hd}">ĐIỀU 1. ĐỐI TƯỢNG HỢP ĐỒNG</p>
<p style="font-weight:700;${mb3}">1.1 Tài sản cho thuê:</p>
<p style="${mb3}">01 phòng tại tòa nhà số ${address}</p>
<p style="${mb3}">- Mã phòng: ${roomCode} &nbsp;&nbsp; Tầng: ${floor}</p>
<p style="${mb3}"><strong>1.2 Mục đích thuê:</strong> Để ở.</p>
<p style="${mb3}"><strong>1.3 Thời hạn thuê:</strong> ${durationMonths} tháng, từ ngày ${startDateStr} đến hết ngày ${endDateStr}</p>
${sp}

<p style="font-weight:700;${hd}">ĐIỀU 2. TIỀN ĐẶT CỌC</p>
<p style="font-style:italic;${mb3}">(Căn cứ Điều 328 Bộ Luật Dân sự 2015)</p>
<p style="${mb3}"><strong>2.1</strong> Bên B đặt cọc cho Bên A số tiền: <strong>${deposit} (VNĐ)</strong> làm bảo đảm thực hiện hợp đồng. Tiền cọc không sinh lãi và được Bên A giữ đến khi hợp đồng chấm dứt.</p>
<p style="${mb3}"><strong>2.2</strong> Tiền cọc không được Bên B sử dụng để khấu trừ hay bù trừ bất kỳ khoản nghĩa vụ nào trong thời gian thuê, bao gồm tiền thuê, tiền điện, tiền nước, phí dịch vụ, chi phí sửa chữa, bồi thường thiệt hại hoặc bất kỳ khoản nào khác phát sinh theo hợp đồng này. Bên B phải thanh toán toàn bộ các nghĩa vụ trên một cách độc lập và đầy đủ trước khi tiền cọc được hoàn trả.</p>
<p style="${mb3}"><strong>2.3</strong> Tiền cọc được hoàn trả trong vòng 3 ngày sau khi chấm dứt hợp đồng, với điều kiện:</p>
<p style="${ind}">- Bên B bàn giao phòng đúng hiện trạng và tiêu chuẩn hoàn trả theo Điều 7 của hợp đồng này.</p>
<p style="${ind}${mb3}">- Bên B đã thanh toán đầy đủ tiền thuê, điện, nước và các chi phí phát sinh.</p>
${sp}

<p style="font-weight:700;${hd}">ĐIỀU 3. GIÁ THUÊ VÀ PHỤ PHÍ</p>
<p style="${mb3}"><strong>3.1 Giá thuê:</strong> <strong>${rentPrice} (VNĐ)/tháng.</strong></p>
<p style="font-weight:700;${mb3}">3.2 Phụ phí hàng tháng:</p>
${servicesHtml}

<p style="font-weight:700;margin-top:0;margin-bottom:1pt;page-break-before:always;">ĐIỀU 4. PHƯƠNG THỨC THANH TOÁN VÀ HẬU QUẢ VI PHẠM</p>
<p style="${mb3}"><strong>4.1</strong> Bên B thanh toán tiền thuê từ ngày 1 đến ngày 3 dương lịch hàng tháng bằng tiền mặt hoặc chuyển khoản vào tài khoản do Bên A chỉ định. Hóa đơn và thông tin thanh toán được cung cấp qua hệ thống tra cứu trực tuyến của Bên A, Bên B có thể tra cứu bất kỳ lúc nào bằng số điện thoại đã đăng ký trong hợp đồng. Bên B có trách nhiệm chủ động tra cứu và thanh toán đúng hạn; việc không tra cứu hóa đơn không được coi là lý do miễn trừ nghĩa vụ thanh toán.</p>
<p style="${mb3}"><strong>4.2</strong> Bên B xác nhận và đồng ý rằng nếu vi phạm thời hạn thanh toán quá ngày 03 dương lịch, hợp đồng này tự động chấm dứt vào 00:01 ngày 04 dương lịch cùng tháng mà không cần thêm bất kỳ thông báo hay thủ tục nào. Trường hợp Bên B có thỏa thuận gia hạn thanh toán với Bên A, thỏa thuận đó chỉ có hiệu lực khi được Bên A xác nhận bằng văn bản hoặc tin nhắn Zalo/SMS; thời hạn gia hạn không vượt quá ngày Bên A chấp thuận và không làm thay đổi các điều khoản còn lại của hợp đồng. Thông báo qua Zalo hoặc SMS đến số điện thoại Bên B đã đăng ký có hiệu lực ngay khi gửi, không phụ thuộc vào việc Bên B có đọc hay không. Sau thời điểm chấm dứt, Bên B không còn tư cách pháp lý để tiếp tục cư trú, và việc tiếp tục lưu trú cấu thành hành vi chiếm hữu bất hợp pháp tài sản của Bên A. Bên A có quyền thực hiện toàn bộ các biện pháp sau:</p>
<p style="${ind}"><strong>a.</strong> Đơn phương chấm dứt hợp đồng ngay lập tức. Bên B mất toàn bộ tiền cọc và không được hoàn trả dưới bất kỳ hình thức nào. Ngoài ra, Bên B vẫn có nghĩa vụ thanh toán đầy đủ toàn bộ các khoản phát sinh đến ngày thực tế bàn giao phòng, bao gồm: tiền thuê tháng vi phạm; tiền điện tính theo chỉ số công tơ thực tế; tiền nước và phí dịch vụ theo tháng hiện hành; mọi chi phí thiệt hại khác do Bên B gây ra (nếu có).</p>
<p style="${ind}"><strong>b.</strong> Tạm dừng toàn bộ dịch vụ tiện ích do Bên A cung cấp bao gồm điện, nước, internet và vô hiệu hóa toàn bộ phương thức truy cập (khóa vân tay, khóa từ, mã số).</p>
<p style="${ind}"><strong>c.</strong> Yêu cầu Bên B tự dọn toàn bộ tài sản cá nhân và bàn giao phòng trong vòng 24 giờ kể từ thời điểm hợp đồng chấm dứt.</p>
<p style="${ind}"><strong>d.</strong> Trình báo Công an phường/xã nơi tọa lạc tòa nhà về hành vi chiếm hữu bất hợp pháp của Bên B và yêu cầu cơ quan công an hỗ trợ cưỡng chế bàn giao phòng theo quy định pháp luật. Bên B cam kết hợp tác đầy đủ với cơ quan công an trong quá trình giải quyết.</p>
<p style="${ind}${mb3}"><strong>e.</strong> Khởi kiện ra Tòa án nhân dân có thẩm quyền tại TP. Hồ Chí Minh để yêu cầu cưỡng chế bàn giao phòng và thu hồi toàn bộ các khoản tiền nêu tại điểm a. Toàn bộ án phí và chi phí tố tụng do Bên B chịu.</p>
${sp}

<p style="font-weight:700;${hd}">ĐIỀU 5. NGHĨA VỤ CỦA CÁC BÊN</p>
<p style="font-weight:700;${mb3}">5.1 Nghĩa vụ của Bên A:</p>
<p style="${ind}"><strong>a.</strong> Bàn giao phòng đúng theo hợp đồng và đảm bảo cho Bên B sử dụng ổn định, không bị can thiệp trong suốt thời hạn thuê, với điều kiện Bên B thực hiện đúng nghĩa vụ hợp đồng và không vi phạm quy định pháp luật.</p>
<p style="${ind}"><strong>b.</strong> Hướng dẫn Bên B thực hiện đăng ký tạm trú theo Luật Cư trú 2020.</p>
<p style="${ind}${mb6}"><strong>c.</strong> Chịu trách nhiệm sửa chữa các hư hỏng phát sinh do sự cố kỹ thuật, kết cấu tòa nhà mà không phải do lỗi của Bên B gây ra.</p>
<p style="font-weight:700;${mb3}">5.2 Nghĩa vụ của Bên B:</p>
<p style="${ind}"><strong>a.</strong> Sử dụng phòng đúng mục đích đã thỏa thuận (để ở).</p>
<p style="${ind}"><strong>b.</strong> Thuê đủ thời hạn theo Điều 1.3 và thanh toán đầy đủ, đúng hạn các khoản tiền theo hợp đồng. Trường hợp chấm dứt hợp đồng trước hạn, Bên B chịu hậu quả theo Điều 6.2.</p>
<p style="${ind}"><strong>c.</strong> Không chuyển nhượng hợp đồng cho bên thứ ba khi chưa được Bên A đồng ý bằng văn bản.</p>
<p style="${ind}"><strong>d.</strong> Chấp hành quy định về phòng cháy chữa cháy, an ninh trật tự; không tàng trữ ma túy, chất gây nghiện, vũ khí, vật liệu nổ; không tổ chức cờ bạc, mại dâm.</p>
<p style="${ind}"><strong>e.</strong> Toàn bộ trách nhiệm pháp lý đối với mọi hành vi vi phạm pháp luật xảy ra trong phòng thuê (bao gồm nhưng không giới hạn: tàng trữ/sử dụng ma túy, mại dâm, cờ bạc, gây rối trật tự công cộng...) thuộc về Bên B. Bên A chỉ cho thuê phòng và không có quyền kiểm soát hoạt động cá nhân bên trong phòng khi cửa đóng. Mọi hậu quả pháp lý phát sinh từ hành vi vi phạm của Bên B, Bên B phải tự chịu trước pháp luật; Bên A không liên đới chịu trách nhiệm.</p>
<p style="${ind}"><strong>f.</strong> Giữ gìn vệ sinh phòng và khu vực chung, không gây ảnh hưởng đến người thuê khác.</p>
<p style="${ind}${mb3}"><strong>g.</strong> Không tự ý thay đổi, cải tạo cấu trúc phòng khi chưa được Bên A đồng ý bằng văn bản.</p>

<p style="font-weight:700;margin-top:0;margin-bottom:1pt;page-break-before:always;">ĐIỀU 6. CHẤM DỨT HỢP ĐỒNG</p>
<p style="font-style:italic;${mb3}">(Căn cứ Điều 156, 157 Luật Nhà ở 2023 và Điều 420, 428 Bộ Luật Dân sự 2015)</p>
<p style="font-weight:700;${mb3}">6.1 Hợp đồng chấm dứt đương nhiên khi:</p>
<p style="${ind}">- Hết thời hạn thuê.</p>
<p style="${ind}${mb6}">- Hai bên thỏa thuận chấm dứt. Bên A hoàn trả tiền cọc theo Điều 2.3.</p>
<p style="font-weight:700;${mb3}">6.2 Bên A được đơn phương chấm dứt hợp đồng khi:</p>
<p style="${ind}">- Bên B không thanh toán tiền thuê hoặc bất kỳ khoản tiền nào theo hợp đồng sau ngày 3 dương lịch hàng tháng.</p>
<p style="${ind}">- Bên B tự ý chấm dứt hợp đồng trước hạn mà không có căn cứ theo Điều 6.3.</p>
<p style="${mb6}"><strong>Hậu quả:</strong> Bên B mất toàn bộ tiền cọc và phải thanh toán đầy đủ các khoản sau trước khi được phép bàn giao phòng và nhận lại tài sản cá nhân: tiền thuê đến ngày chấm dứt; tiền điện tính theo chỉ số công tơ thực tế đến ngày bàn giao (không phụ thuộc kỳ hóa đơn); tiền nước và phí dịch vụ theo tháng hiện hành; mọi chi phí phát sinh khác theo hợp đồng.</p>
<p style="font-weight:700;${mb3}">6.3 Bên B được đơn phương chấm dứt hợp đồng (không chịu phạt) khi:</p>
<p style="${ind}">- Phòng thuê xảy ra sự cố nghiêm trọng về kết cấu hoặc hệ thống (sụt lún, thấm dột nặng, mất điện/nước kéo dài) mà Bên A nhận được thông báo nhưng không khắc phục trong vòng 10 ngày, khiến phòng không còn đáp ứng điều kiện sinh sống tối thiểu.</p>
<p style="${ind}">- Bên A tự ý thu hồi phòng, xâm phạm quyền sử dụng hợp pháp của Bên B trong thời hạn thuê mà không có căn cứ theo hợp đồng này. Điều khoản này không áp dụng đối với các hành động Bên A thực hiện đúng thẩm quyền tại Điều 4.2 khi Bên B đã vi phạm nghĩa vụ thanh toán.</p>
<p style="${mb3}"><strong>Hậu quả:</strong> Bên A hoàn trả toàn bộ tiền cọc cho Bên B. Bên B vẫn có nghĩa vụ thanh toán đầy đủ tiền thuê, điện, nước, phí dịch vụ phát sinh đến ngày thực tế bàn giao phòng.</p>
${sp}

<p style="font-weight:700;${hd}">ĐIỀU 7. BÀN GIAO PHÒNG VÀ TIÊU CHUẨN HOÀN TRẢ</p>
<p style="font-weight:700;${mb3}">7.1 Xác nhận hiện trạng lúc nhận phòng:</p>
<p style="${mb3}">Tại thời điểm nhận phòng, Bên A và Bên B cùng ghi nhận hiện trạng toàn bộ phòng bằng ảnh và/hoặc video quay toàn bộ các hạng mục (tường, trần, sàn, thiết bị vệ sinh, nội thất, hệ thống điện nước...). Bộ ảnh/video này được gửi từ số điện thoại Bên A sang số điện thoại Bên B đã đăng ký trong hợp đồng qua Zalo. Việc Bên B không phản hồi hoặc xác nhận trong vòng 24 giờ kể từ khi nhận được coi là Bên B đã đồng ý với toàn bộ hiện trạng đó. Bộ ảnh/video này là tài liệu pháp lý duy nhất xác định tiêu chuẩn hoàn trả phòng, có giá trị tương đương biên bản ký tay và được hai bên đồng ý sử dụng làm chứng cứ trong mọi tranh chấp phát sinh.</p>
<p style="font-weight:700;${mb3}">7.2 Tiêu chuẩn hoàn trả phòng:</p>
<p style="${mb3}">Khi chấm dứt hợp đồng, Bên B có nghĩa vụ hoàn trả phòng đúng 100% hiện trạng theo bộ ảnh/video bàn giao tại Điều 7.1. Bên B xác nhận và đồng ý trước rằng các hư hỏng dưới đây không được coi là hao mòn tự nhiên và Bên B có trách nhiệm sửa chữa hoặc bồi thường chi phí khắc phục trước khi bàn giao phòng:</p>
<p style="${ind}"><strong>a.</strong> Tường, trần: vết đinh, vết dán, vết sơn xịt, vết bút, vết bẩn do sinh hoạt không được vệ sinh, ố vàng do khói thuốc hoặc ẩm mốc không được xử lý. Nếu có → Bên B phải sơn lại toàn bộ mặt tường/trần đó về đúng màu ban đầu.</p>
<p style="${ind}"><strong>b.</strong> Sàn: trầy xước nặng do kéo lê đồ vật, bong tróc, vỡ gạch do va đập mạnh, ố bẩn do không vệ sinh định kỳ. Nếu có → Bên B chịu chi phí sửa hoặc thay thế phần bị hư hỏng.</p>
<p style="${ind}"><strong>c.</strong> Nhà vệ sinh, bồn cầu, lavabo, vòi sen: cặn bám, ố vàng, mốc do không vệ sinh định kỳ. Đây là trách nhiệm vệ sinh cơ bản của người thuê, không phải hao mòn tự nhiên – Bên B có nghĩa vụ chà rửa sạch và bàn giao đúng hiện trạng ban đầu.</p>
<p style="${ind}"><strong>d.</strong> Nội thất, thiết bị (tủ lạnh, máy lạnh, tủ quần áo, bàn ghế, nệm...): hư hỏng do sử dụng sai cách, va đập, bất cẩn, mất phụ kiện hoặc không hoạt động do lỗi của Bên B → Bên B sửa hoặc thay thế thiết bị tương đương. Hư hỏng do lỗi kỹ thuật hoặc tuổi thọ thiết bị thuộc trách nhiệm Bên A.</p>
<p style="${ind}${mb6}"><strong>e.</strong> Toàn bộ phòng: phải được vệ sinh sạch sẽ, không còn rác, không mùi hôi, không để lại đồ cá nhân.</p>
<p style="font-weight:700;${mb3}">7.3 Hậu quả nếu không hoàn trả đúng tiêu chuẩn:</p>
<p style="${ind}"><strong>a.</strong> Bên B phải tự sửa chữa, vệ sinh và đưa phòng về đúng tiêu chuẩn trước ngày chấm dứt hợp đồng.</p>
<p style="${ind}"><strong>b.</strong> Nếu Bên B không thực hiện, Bên A có quyền thuê người sửa chữa, vệ sinh và khấu trừ toàn bộ chi phí từ tiền cọc. Nếu chi phí vượt tiền cọc, Bên B phải bồi thường phần chênh lệch.</p>
<p style="${ind}${mb3}"><strong>c.</strong> Bên A có quyền khởi kiện ra Tòa án nhân dân có thẩm quyền tại TP. Hồ Chí Minh để đòi bồi thường nếu Bên B không tự nguyện thực hiện.</p>

<p style="font-weight:700;margin-top:0;margin-bottom:1pt;page-break-before:always;">7.4 Bàn giao phòng:</p>
<p style="${mb3}">Bên B phải bàn giao phòng cho Bên A trước 23:59 của ngày cuối cùng trong thời hạn thuê quy định tại Điều 1.3. Nếu không bàn giao đúng hạn, Bên A có quyền trình báo Công an phường/xã nơi tọa lạc tòa nhà để yêu cầu hỗ trợ cưỡng chế bàn giao phòng theo quy định pháp luật, toàn bộ chi phí phát sinh do Bên B chịu.</p>
${sp}

<p style="font-weight:700;${hd}">ĐIỀU 8. KHU VỰC CHUNG VÀ AN NINH TÒA NHÀ</p>
<p style="font-weight:700;${mb3}">8.1 Quy định khu vực chung:</p>
<p style="${ind}"><strong>a.</strong> Bên B chỉ được sử dụng phòng thuê của mình. Mọi tài sản, đồ đạc cá nhân (xe đạp, thùng đồ, túi xách...) không được để ở hành lang, cầu thang, sân hoặc bất kỳ khu vực chung nào trong tòa nhà.</p>
<p style="${ind}"><strong>b.</strong> Nếu Bên B tự ý để đồ ở khu vực chung, Bên A có quyền yêu cầu dọn dẹp ngay. Nếu Bên B không thực hiện trong vòng 24 giờ, Bên A có quyền di chuyển tài sản đó và không chịu trách nhiệm về hư hỏng hay mất mát.</p>
<p style="${ind}${mb6}"><strong>c.</strong> Mọi tài sản để ở khu vực chung ngoài ý muốn của Bên A, nếu bị mất, hư hỏng do bất kỳ nguyên nhân nào, Bên B hoàn toàn tự chịu trách nhiệm. Bên A không bồi thường.</p>
<p style="font-weight:700;${mb3}">8.2 An ninh ra vào tòa nhà:</p>
<p style="${ind}"><strong>a.</strong> Tòa nhà sử dụng khóa vân tay tại lối ra vào chính. Bên B chỉ được sử dụng vân tay đã đăng ký của mình để ra vào.</p>
<p style="${ind}${mb3}"><strong>b.</strong> Bên B tự chịu trách nhiệm đối với mọi người do mình đưa vào tòa nhà. Mọi mất mát, hư hỏng, trộm cắp tài sản của phòng khác, mất xe hoặc bất kỳ vi phạm pháp luật nào phát sinh từ người do Bên B đưa vào, Bên B chịu toàn bộ trách nhiệm bồi thường cho bên bị thiệt hại và chịu mọi hậu quả pháp lý. Bên A không liên đới.</p>
${sp}

<p style="font-weight:700;${hd}">ĐIỀU 9. MIỄN TRÁCH NHIỆM</p>
<p style="${mb3}"><strong>9.1</strong> Bên A không chịu trách nhiệm về tai nạn, thương tích, mất mát tài sản xảy ra trong phạm vi thuê không do lỗi của Bên A gây ra.</p>
<p style="${mb3}"><strong>9.2</strong> Bên A không chịu bất kỳ trách nhiệm pháp lý nào liên quan đến hành vi vi phạm pháp luật của Bên B và những người do Bên B đưa vào tòa nhà.</p>
${sp}

<p style="font-weight:700;${hd}">ĐIỀU 10. LUẬT ÁP DỤNG VÀ GIẢI QUYẾT TRANH CHẤP</p>
<p style="font-style:italic;${mb3}">(Căn cứ Bộ Luật Tố tụng Dân sự 2015)</p>
<p style="${mb3}"><strong>10.1</strong> Hợp đồng được điều chỉnh bởi pháp luật Việt Nam.</p>
<p style="${mb3}"><strong>10.2</strong> Tranh chấp được ưu tiên giải quyết bằng thương lượng, hòa giải.</p>
<p style="${mb3}"><strong>10.3</strong> Nếu không giải quyết được trong 30 ngày kể từ khi phát sinh tranh chấp, vụ việc sẽ được đưa ra Tòa án nhân dân có thẩm quyền tại TP. Hồ Chí Minh theo quy định của Bộ Luật Tố tụng Dân sự 2015.</p>
<p style="${mb3}"><strong>10.4</strong> Hợp đồng vẫn có hiệu lực trong thời gian tố tụng, trừ phần nội dung đang bị tranh chấp.</p>
${sp}

<p style="font-weight:700;${hd}">ĐIỀU 11. ĐIỀU KHOẢN CHUNG</p>
<p style="${mb3}"><strong>11.1</strong> Hai bên xác nhận đã tự nguyện ký kết, không bị ép buộc, đã đọc và hiểu rõ toàn bộ nội dung hợp đồng, cam kết thực hiện đầy đủ các điều khoản đã thỏa thuận.</p>
<p style="${mb3}"><strong>11.2</strong> Mọi thông tin, tài liệu trao đổi trong quá trình thực hiện hợp đồng được bảo mật, không tiết lộ cho bên thứ ba khi chưa có sự đồng ý của bên còn lại.</p>
<p style="${mb3}"><strong>11.3</strong> Nếu một điều khoản bị tuyên vô hiệu, các điều khoản còn lại vẫn có giá trị pháp lý đầy đủ.</p>
<p style="${mb3}"><strong>11.4</strong> Hợp đồng được lập thành 02 (hai) bản gốc có giá trị pháp lý như nhau, mỗi bên giữ 01 (một) bản.</p>
${sp}

<p style="text-align:center;margin-top:2pt;margin-bottom:2pt;">TP. Hồ Chí Minh, ngày ${signDay} tháng ${signMonth} năm ${signYear}</p>
<table style="width:100%;margin-top:8pt;border-collapse:collapse;">
  <tr style="page-break-inside:avoid;break-inside:avoid;">
    <td style="width:44%;text-align:center;vertical-align:top;padding:0;">
      <p style="text-align:center;font-weight:700;${mb3}">BÊN CHO THUÊ (Bên A)</p>
      <p style="text-align:center;font-style:italic;${mb3}">(Ký, ghi rõ họ tên)</p>
      <img src="${LANDLORD_SIG}" style="height:95pt;max-width:100%;object-fit:contain;display:block;margin:0 auto;">
    </td>
    <td style="width:12%;"></td>
    <td style="width:44%;text-align:center;vertical-align:top;padding:0;">
      <p style="text-align:center;font-weight:700;${mb3}">BÊN THUÊ (Bên B)</p>
      <p style="text-align:center;font-style:italic;${mb3}">(Ký, ghi rõ họ tên)</p>
      ${tenantSigHtml}
    </td>
  </tr>
</table>`;
}

function _waitContractFontsReady() {
    return Promise.all([
        document.fonts.load('400 11pt Tinos'),
        document.fonts.load('700 11pt Tinos'),
        document.fonts.load('italic 400 11pt Tinos'),
        document.fonts.load('italic 700 11pt Tinos')
    ]).catch(() => {});
}

/**
 * Tải/in hợp đồng đã ký ra PDF chuẩn A4 — y hệt bản khách hàng thấy trong app
 */
async function downloadContractPDF(contractId) {
    const contract = getContracts().find(c => c.id === contractId);
    if (!contract) {
        showToast('Không tìm thấy hợp đồng!', 'error');
        return;
    }
    const building = getBuildings().find(b => b.id === contract.buildingId);
    const customer = getCustomers().find(c => c.id === contract.representativeId);
    const tenantSig = contract.signatureData?.signatureImage || null;

    const printRoot = document.getElementById('_print_root');
    printRoot.innerHTML = buildA4ContractHtml(contract, building, customer, tenantSig);

    const originalTitle = document.title;
    const roomCode = contract.room || '';
    const buildingCode = building?.code || '';
    document.title = `Hợp Đồng Thuê Phòng ${roomCode} - ${buildingCode}`.trim();

    const imgs = Array.from(printRoot.querySelectorAll('img'));
    const imgsReady = new Promise(resolve => {
        if (imgs.length === 0) return resolve();
        let pending = imgs.length;
        imgs.forEach(img => {
            if (img.complete && img.naturalWidth > 0) { if (--pending === 0) resolve(); }
            else { img.onload = img.onerror = () => { if (--pending === 0) resolve(); }; }
        });
    });

    await Promise.all([imgsReady, _waitContractFontsReady()]);
    window.print();
    document.title = originalTitle;
    setTimeout(() => { printRoot.innerHTML = ''; }, 2000);
}

/**
 * Xử lý sự kiện click
 */
async function handleBodyClick(e) {
    const target = e.target;
    const id = target.dataset?.id;

    // Nút "Thêm hợp đồng" - kiểm tra cả target và closest
    if (target.id === 'add-contract-btn' || target.closest('#add-contract-btn')) {
        e.preventDefault();
        e.stopPropagation();
        openContractModal();
        return;
    }
    // Nút "Import" - kiểm tra cả target và closest
    if (target.id === 'import-contracts-btn' || target.closest('#import-contracts-btn')) {
        e.preventDefault();
        e.stopPropagation();
        initImportModalDropdown();
        openModal(importContractsModal);
        return;
    }
    // Nút "Xuất Excel" - kiểm tra cả target và closest
    if (target.id === 'export-contracts-btn' || target.closest('#export-contracts-btn')) {
        e.preventDefault();
        e.stopPropagation();
        handleExport();
        return;
    }
    // Badge "Đã ký" - bấm để tải hợp đồng đã ký ra PDF
    const downloadSignedBtn = target.classList.contains('download-signed-contract-btn') ? target : target.closest('.download-signed-contract-btn');
    if (downloadSignedBtn) {
        downloadContractPDF(downloadSignedBtn.dataset.id);
        return;
    }

    // Nút "Xóa nhiều" - kiểm tra cả target và closest
    if (target.id === 'bulk-delete-contracts-btn' || target.closest('#bulk-delete-contracts-btn')) {
        e.preventDefault();
        e.stopPropagation();
        handleBulkDelete();
        return;
    }
    
    // Nút "Sửa" - kiểm tra cả target và closest
    const editBtn = target.classList.contains('edit-contract-btn') ? target : target.closest('.edit-contract-btn');
    if (editBtn) {
        const contractId = editBtn.dataset.id;
        openContractModal({ contractId });
        return;
    }
    
    // Nút "Xóa" - kiểm tra cả target và closest
    const deleteBtn = target.classList.contains('delete-contract-btn') ? target : target.closest('.delete-contract-btn');
    if (deleteBtn) {
        const confirmed = await showConfirm('Bạn có chắc muốn xóa hợp đồng này?', 'Xác nhận xóa');
        if (confirmed) {
            try {
                const contractId = deleteBtn.dataset.id;
                // Delete Firebase
                await deleteDoc(doc(db, 'contracts', contractId));
                
                // Delete localStorage
                deleteFromLocalStorage('contracts', contractId);
                showToast('Xóa hợp đồng thành công!');
            } catch (error) {
                showToast('Lỗi xóa hợp đồng: ' + error.message, 'error');
            }
        }
        return;
    }
    
    // Nút "Thu hồi chữ ký"
    const revokeBtn = target.classList.contains('revoke-signature-btn') ? target : target.closest('.revoke-signature-btn');
    if (revokeBtn) {
        const contractId = revokeBtn.dataset.id;
        const confirmed = await showConfirm('Thu hồi chữ ký của khách? Khách sẽ phải ký lại hợp đồng.', 'Xác nhận thu hồi chữ ký');
        if (confirmed) {
            try {
                await updateDoc(doc(db, 'contracts', contractId), { signatureData: deleteField() });
                const allContracts = getContracts();
                const idx = allContracts.findIndex(c => c.id === contractId);
                if (idx !== -1) { allContracts[idx].signatureData = null; }
                document.dispatchEvent(new CustomEvent('store:contracts:updated'));
                showToast('Đã thu hồi chữ ký thành công!');
            } catch (error) {
                showToast('Lỗi thu hồi chữ ký: ' + error.message, 'error');
            }
        }
        return;
    }

    // Checkbox mobile
    if (target.classList.contains('contract-checkbox')) {
        const contractId = target.dataset.id;
        if (target.checked) {
            selectedMobileContractIds.add(contractId);
        } else {
            selectedMobileContractIds.delete(contractId);
        }
        updateClearSelectionButton();
        return;
    }
    
    // Đóng modal chi tiết hợp đồng
    if (target.id === 'close-contract-detail-modal') {
        closeModal(contractDetailModal);
        return;
    }
    
    // Nút "Thanh lý" - kiểm tra cả target và closest
    const terminateBtn = target.classList.contains('terminate-contract-btn') ? target : target.closest('.terminate-contract-btn');
    if (terminateBtn) {
        const contractId = terminateBtn.dataset.id;
        const contract = getContracts().find(c => c.id === contractId);
        
        if (!contract) {
            showToast('Không tìm thấy hợp đồng!', 'error');
            return;
        }

        if (contract.status === 'terminated') {
            // Bỏ thanh lý
            const confirmed = await showConfirm('Bạn có chắc chắn muốn bỏ thanh lý hợp đồng này?', 'Xác nhận bỏ thanh lý');
            if (confirmed) {
                try {
                    // 🔥 TÌM VÀ XÓA HÓA ĐƠN THANH LÝ TRƯỚC KHI BỎ THANH LÝ
                    console.log('🔍 Tìm hóa đơn thanh lý cho contract:', contractId);
                    const bills = getBills();
                    const terminationBill = bills.find(bill => 
                        bill.contractId === contractId && bill.isTerminationBill === true
                    );
                    
                    if (terminationBill) {
                        console.log('🗑️ Xóa hóa đơn thanh lý:', terminationBill.id);
                        
                        // Xóa hóa đơn thanh lý từ Firebase
                        await deleteDoc(doc(db, 'bills', terminationBill.id));
                        
                        // Xóa hóa đơn thanh lý từ localStorage
                        deleteFromLocalStorage('bills', terminationBill.id);
                        
                        // Dispatch event để UI bills cập nhật
                        document.dispatchEvent(new CustomEvent('store:bills:updated'));
                        
                        console.log('✅ Đã xóa hóa đơn thanh lý thành công');
                    } else {
                        console.log('⚠️ Không tìm thấy hóa đơn thanh lý cho contract:', contractId);
                    }
                    
                    // Tính toán trạng thái mới dựa trên ngày hết hạn
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);
                    const endDate = new Date(contract.endDate);
                    endDate.setHours(0, 0, 0, 0);
                    
                    let newStatus = 'active';
                    const diffTime = endDate.getTime() - today.getTime();
                    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                    
                    if (diffDays < 0) newStatus = 'expired';
                    else if (diffDays <= 30) newStatus = 'expiring';
                    
                    // Update Firebase
                    await setDoc(doc(db, 'contracts', contractId), {
                        status: newStatus,
                        terminatedAt: null,
                        terminationBillId: null,
                        updatedAt: serverTimestamp()
                    }, { merge: true });
                    
                    // Update localStorage
                    updateInLocalStorage('contracts', contractId, {
                        status: newStatus,
                        terminatedAt: null,
                        terminationBillId: null,
                        updatedAt: new Date()
                    });
                    
                    showToast('Đã bỏ thanh lý hợp đồng và xóa hóa đơn thanh lý!');
                } catch (error) {
                    showToast('Lỗi bỏ thanh lý hợp đồng: ' + error.message, 'error');
                }
            }
        } else {
            // Thanh lý - mở modal chọn ngày
            openTerminationModal(contract);
        }
        return;
    }
    
    // Nút đóng modal - kiểm tra cả target và closest
    if (target.id === 'close-contract-modal' || target.closest('#close-contract-modal') || target.id === 'cancel-contract-btn' || target.closest('#cancel-contract-btn')) {
        closeModal(contractModal);
        return;
    }
    
    // Modal thanh lý - đóng modal
    if (target.id === 'close-termination-modal' || target.closest('#close-termination-modal') || target.id === 'cancel-termination-btn' || target.closest('#cancel-termination-btn')) {
        closeModal(document.getElementById('termination-modal'));
        return;
    }
    
    // Modal thanh lý - xác nhận
    if (target.id === 'confirm-termination-btn' || target.closest('#confirm-termination-btn')) {
        await handleTerminationConfirm();
        return;
    }
    
    // --- Xử lý trong Modal Hợp đồng ---
    
    // Nút "Thêm khách hàng" - kiểm tra cả target và closest
    if (target.id === 'add-customer-from-contract' || target.closest('#add-customer-from-contract')) {
        quickCustomerForm.reset();
        openModal(quickCustomerModal);
        return;
    }
    // Nút đóng modal quick add - kiểm tra cả target và closest
    if (target.id === 'close-quick-customer-modal' || target.closest('#close-quick-customer-modal') || target.id === 'cancel-quick-customer-btn' || target.closest('#cancel-quick-customer-btn')) {
        closeModal(quickCustomerModal);
        return;
    }
    // Nút "Xóa" khách hàng khỏi danh sách tạm - kiểm tra cả target và closest
    const removeCustomerBtn = target.classList.contains('remove-customer-btn') ? target : target.closest('.remove-customer-btn');
    if (removeCustomerBtn) {
        const customerId = removeCustomerBtn.dataset.id;
        selectedCustomers = selectedCustomers.filter(cId => cId !== customerId);
        updateSelectedCustomersDisplay();
        return;
    }
    // Click chọn khách hàng từ dropdown
    if (target.closest('.customer-option-item')) {
        const customerId = target.closest('.customer-option-item').dataset.id;
        if (!selectedCustomers.includes(customerId)) {
            selectedCustomers.push(customerId);
            updateSelectedCustomersDisplay();
        }
        customerSearchInput.value = '';
        customerDropdown.classList.add('hidden');
        return;
    }
    // Nút "Thêm dịch vụ" - kiểm tra cả target và closest
    if (target.id === 'add-contract-service-btn' || target.closest('#add-contract-service-btn')) {
        showAvailableContractServices();
        openModal(selectContractServiceModal);
        return;
    }
    // Nút đóng modal chọn dịch vụ - kiểm tra cả target và closest
    if (target.id === 'close-select-contract-service-modal' || target.closest('#close-select-contract-service-modal') || target.id === 'cancel-select-contract-service-btn' || target.closest('#cancel-select-contract-service-btn')) {
        closeModal(selectContractServiceModal);
        return;
    }
    // Nút "Thêm" dịch vụ vào hợp đồng - kiểm tra cả target và closest
    const addServiceBtn = target.classList.contains('add-service-to-contract-btn') ? target : target.closest('.add-service-to-contract-btn');
    if (addServiceBtn) {
        const serviceId = addServiceBtn.dataset.id;
        const service = getServices().find(s => s.id === serviceId);
        if (service && !currentContractServices.some(s => s.id === service.id)) {
            currentContractServices.push({ ...service, quantity: 1 }); // Mặc định số lượng là 1
            renderContractServices();
            showAvailableContractServices(); // Refresh modal
        }
        return;
    }
    // Nút "Xóa" dịch vụ khỏi hợp đồng - kiểm tra cả target và closest
    const removeServiceBtn = target.classList.contains('remove-contract-service-btn') ? target : target.closest('.remove-contract-service-btn');
    if (removeServiceBtn) {
        const index = parseInt(removeServiceBtn.dataset.index);
        currentContractServices.splice(index, 1);
        renderContractServices();
        return;
    }
    // Nút "Tạo dịch vụ mới" - kiểm tra cả target và closest
    if (target.id === 'create-new-service-from-contract-btn' || target.closest('#create-new-service-from-contract-btn')) {
        closeModal(selectContractServiceModal);
        isCreatingServiceFromContract = true;
        // Gửi yêu cầu cho main.js (hoặc services.js) để mở modal
        document.dispatchEvent(new CustomEvent('request:openServiceModal', { detail: { isFromContract: true } }));
        return;
    }
    
    // Link "Tải file mẫu" trong modal import
    if (target.id === 'download-template-link') {
        e.preventDefault();
        const buildingSelect = document.getElementById('import-building-select');
        const buildingId = buildingSelect.value;
        if (!buildingId) {
            showToast('Vui lòng chọn tòa nhà để tải file mẫu!', 'warning');
            return;
        }
        window.downloadContractTemplate(buildingId);
        return;
    }
}

/**
 * Mở modal Thêm/Sửa Hợp đồng
 */
function openContractModal(options = {}) {
    const { contractId } = options;
    contractForm.reset();
    selectedCustomers = [];
    currentContractServices = [];
    originalContractServices = [];
    
    // Tải danh sách tòa nhà
    const buildings = getBuildings();
    contractBuildingSelect.innerHTML = '<option value="">-- Chọn tòa nhà --</option>';
    buildings.forEach(building => {
        contractBuildingSelect.innerHTML += `<option value="${building.id}">${building.code}</option>`;
    });
    contractRoomSelect.innerHTML = '<option value="">-- Chọn phòng --</option>';

    if (contractId) {
        // Chế độ Sửa
        contractModalTitle.textContent = 'Sửa Hợp đồng thuê';
        document.getElementById('contract-id').value = contractId;
        
        const contract = getContracts().find(c => c.id === contractId);
        if (contract) {
            contractBuildingSelect.value = contract.buildingId;
            handleContractBuildingChange(contract.buildingId); // Tải phòng
            // Set room value sau khi rooms đã được tải
            setTimeout(() => {
                console.log(`🏠 Available rooms in select:`, Array.from(contractRoomSelect.options).map(opt => opt.value));
                console.log(`🏠 Contract room: "${contract.room}"`);
                contractRoomSelect.value = contract.room;
                console.log(`🏠 Selected room after setting: "${contractRoomSelect.value}"`);
                
                // Nếu không match được, thử tìm room theo text
                if (!contractRoomSelect.value && contract.room) {
                    Array.from(contractRoomSelect.options).forEach(option => {
                        if (option.text === contract.room || option.value === contract.room) {
                            option.selected = true;
                            console.log(`🏠 Found room by matching: "${option.value}"`);
                        }
                    });
                }
            }, 100);
            document.getElementById('contract-start-date').value = formatDateDisplay(contract.startDate);
            document.getElementById('contract-end-date').value = formatDateDisplay(contract.endDate);
            document.getElementById('contract-payment-day').value = contract.paymentDay;
            document.getElementById('contract-rent-price').value = formatMoney(contract.rentPrice);
            document.getElementById('contract-deposit').value = formatMoney(contract.deposit);

            // Tải khách hàng
            selectedCustomers = contract.customers || [];
            updateSelectedCustomersDisplay(contract.representativeId);

            // Tải dịch vụ
            const allServices = getServices();
            currentContractServices = (contract.serviceDetails || []).map(detail => {
                const service = allServices.find(s => s.id === detail.serviceId);
                return service ? { ...service, ...detail } : null;
            }).filter(Boolean); // Lọc bỏ dịch vụ không tìm thấy
            
            originalContractServices = JSON.parse(JSON.stringify(currentContractServices));
            renderContractServices();
        }
    } else {
        // Chế độ Thêm mới
        contractModalTitle.textContent = 'Thêm Hợp đồng thuê';
        document.getElementById('contract-id').value = '';
        document.getElementById('contract-start-date').value = formatDateDisplay(new Date());
        // Tự động set ngày kết thúc là 1 năm sau
        const nextYear = new Date();
        nextYear.setFullYear(nextYear.getFullYear() + 1);
        document.getElementById('contract-end-date').value = formatDateDisplay(nextYear);
    }

    updateSelectedCustomersDisplay();
    renderContractServices();
    openModal(contractModal);
}

/**
 * Xử lý khi submit form Thêm/Sửa Hợp đồng
 */
async function handleContractFormSubmit(e) {
    e.preventDefault();
    
    const id = document.getElementById('contract-id').value;
    const buildingId = contractBuildingSelect.value;
    const room = contractRoomSelect.value;
    const startDate = document.getElementById('contract-start-date').value;
    const endDate = document.getElementById('contract-end-date').value;
    const paymentDay = parseInt(document.getElementById('contract-payment-day').value);
    const rentPrice = parseFormattedNumber(document.getElementById('contract-rent-price').value);
    const deposit = parseFormattedNumber(document.getElementById('contract-deposit').value);
    
    const representativeId = document.querySelector('input[name="representative"]:checked')?.value;
    
    if (!buildingId || !room || !startDate || !endDate || !rentPrice) {
        return showToast('Vui lòng nhập đầy đủ thông tin bắt buộc!', 'error');
    }
    if (selectedCustomers.length === 0) {
        return showToast('Vui lòng chọn ít nhất một khách hàng!', 'error');
    }
    if (!representativeId) {
        return showToast('Vui lòng chọn người đại diện hợp đồng!', 'error');
    }

    try {
        // Xử lý các dịch vụ mới (nếu có)
        const serviceDetails = [];
        for (const service of currentContractServices) {
            let serviceId = service.id;
            if (service.isNew) {
                // Tạo dịch vụ mới trong collection 'services'
                const newServiceDoc = await addDoc(collection(db, 'services'), {
                    name: service.name,
                    price: service.price,
                    unit: service.unit,
                    buildings: [buildingId], // Gán cho tòa nhà này
                    createdAt: serverTimestamp(),
                    updatedAt: serverTimestamp()
                });
                serviceId = newServiceDoc.id;
            }
            serviceDetails.push({
                serviceId: serviceId,
                quantity: service.quantity || 1,
                initialReading: service.initialReading || 0
            });
        }

        const contractData = {
            buildingId,
            room,
            startDate: formatDateForStorage(parseDateInput(startDate)),
            endDate: formatDateForStorage(parseDateInput(endDate)),
            paymentDay,
            rentPrice,
            deposit,
            customers: selectedCustomers,
            representativeId,
            serviceDetails: serviceDetails,
            services: serviceDetails.map(s => s.serviceId), // Giữ lại mảng ID cho code cũ
            updatedAt: serverTimestamp()
        };

        if (id) {
            // Update Firebase
            await setDoc(doc(db, 'contracts', id), contractData, { merge: true });
            
            // Update localStorage
            updateInLocalStorage('contracts', id, contractData);
            showToast('Cập nhật hợp đồng thành công!');
        } else {
            // Create Firebase
            contractData.status = 'active'; // Mặc định
            contractData.createdAt = serverTimestamp();
            const docRef = await addDoc(collection(db, 'contracts'), contractData);
            
            // Add to localStorage với Firebase ID
            const newItem = { 
                ...contractData, 
                id: docRef.id,
                createdAt: new Date(),
                updatedAt: new Date()
            };
            const state = getState();
            state.contracts.unshift(newItem);
            saveToCache();
            document.dispatchEvent(new CustomEvent('store:contracts:updated'));
            
            showToast('Thêm hợp đồng thành công!');
        }

        closeModal(contractModal);
    } catch (error) {
        showToast('Lỗi lưu hợp đồng: ' + error.message, 'error');
    }
}

/**
 * Xử lý khi submit form Thêm nhanh Khách hàng
 */
async function handleQuickCustomerSubmit(e) {
    e.preventDefault();
    const name = document.getElementById('quick-customer-name').value.trim();
    const phone = document.getElementById('quick-customer-phone').value.trim();
    const idNumber = document.getElementById('quick-customer-id-number').value.trim();
    const permanentAddress = document.getElementById('quick-customer-permanent-address').value.trim();
    const birthDate = document.getElementById('quick-customer-birth-date').value.trim();
    const gender = document.getElementById('quick-customer-gender').value;
    const hometown = document.getElementById('quick-customer-hometown').value.trim();
    const ethnicity = document.getElementById('quick-customer-ethnicity').value.trim();

    if (!name || !phone) {
        return showToast('Vui lòng nhập đủ tên và SĐT!', 'error');
    }

    try {
        const customerData = {
            name,
            phone,
            ...(idNumber && { idNumber }),
            ...(permanentAddress && { permanentAddress }),
            ...(birthDate && { birthDate }),
            ...(gender && { gender }),
            ...(hometown && { hometown }),
            ...(ethnicity && { ethnicity }),
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        };
        // Create Firebase
        const docRef = await addDoc(collection(db, 'customers'), customerData);
        
        // Add to localStorage với Firebase ID
        const newItem = { 
            ...customerData, 
            id: docRef.id,
            createdAt: new Date(),
            updatedAt: new Date()
        };
        const state = getState();
        state.customers.unshift(newItem);
        saveToCache();
        document.dispatchEvent(new CustomEvent('store:customers:updated'));
        
        // Thêm khách hàng mới vào danh sách đã chọn
        selectedCustomers.push(docRef.id);
        
        // Cập nhật UI ngay lập tức
        updateSelectedCustomersDisplay(docRef.id); // Tự động chọn làm đại diện
        
        closeModal(quickCustomerModal);
        showToast(`Đã thêm khách hàng "${name}"!`);
    } catch (error) {
        showToast('Lỗi thêm khách hàng: ' + error.message, 'error');
    }
}

/**
 * Xử lý Xóa nhiều
 */
async function handleBulkDelete() {
    // Lấy từ Set mobile nếu có, không thì lấy từ desktop checkboxes
    const selectedIds = selectedMobileContractIds.size > 0 
        ? Array.from(selectedMobileContractIds)
        : Array.from(document.querySelectorAll('.contract-checkbox:checked')).map(cb => cb.dataset.id);
    
    if (selectedIds.length === 0) {
        return showToast('Vui lòng chọn ít nhất một hợp đồng để xóa!', 'warning');
    }
    
    const confirmed = await showConfirm(`Bạn có chắc muốn xóa ${selectedIds.length} hợp đồng đã chọn?`, 'Xác nhận xóa');
    if (confirmed) {
        try {
            // Bulk delete Firebase + localStorage
            for (const id of selectedIds) {
                await deleteDoc(doc(db, 'contracts', id));
                deleteFromLocalStorage('contracts', id);
            }
            
            // Reset trạng thái checkbox sau khi xóa thành công
            selectedMobileContractIds.clear();
            resetBulkSelection();
            
            showToast(`Đã xóa ${selectedIds.length} hợp đồng thành công!`);
        } catch (error) {
            showToast('Lỗi xóa hợp đồng: ' + error.message, 'error');
        }
    }
}

/**
 * Reset trạng thái bulk selection
 */
function resetBulkSelection() {
    // Bỏ chọn checkbox "select all"
    const selectAllCheckbox = document.getElementById('select-all-contracts');
    if (selectAllCheckbox) {
        selectAllCheckbox.checked = false;
    }
    
    // Bỏ chọn tất cả checkbox con
    const contractCheckboxes = document.querySelectorAll('.contract-checkbox');
    contractCheckboxes.forEach(checkbox => {
        checkbox.checked = false;
    });
}

/**
 * Cập nhật hiển/ẩn nút bỏ chọn hàng loạt (chỉ hiện khi chọn >= 2)
 */
function updateClearSelectionButton() {
    const btn = document.getElementById('clear-selection-contracts-btn');
    if (btn) {
        if (selectedMobileContractIds.size >= 2) {
            btn.classList.remove('hidden');
        } else {
            btn.classList.add('hidden');
        }
    }
}

/**
 * Hiển thị chi tiết hợp đồng trong modal
 */
export function showContractDetail(contractId) {
    const contract = getContracts().find(c => c.id === contractId);
    if (!contract) {
        showToast('Không tìm thấy hợp đồng!', 'error');
        return;
    }
    
    const building = getBuildings().find(b => b.id === contract.buildingId);
    const customer = getCustomers().find(c => c.id === contract.representativeId);
    const statusInfo = getStatusInfo(contract.status || getContractStatus(contract));
    const contractNumber = `CT${contract.id.slice(-6).toUpperCase()}`;
    
    // Helper function để set text
    const setEl = (id, text) => {
        const element = document.getElementById(id);
        if (element) {
            element.textContent = text || 'N/A';
        }
    };
    
    // Thông tin cơ bản
    setEl('contract-detail-number', contractNumber);
    const statusEl = document.getElementById('contract-detail-status');
    if (statusEl) {
        statusEl.innerHTML = `<span class="px-2 py-1 rounded-full text-xs font-medium ${statusInfo.className}">${statusInfo.text}</span>`;
    }
    setEl('contract-detail-start-date', formatDateDisplay(contract.startDate));
    setEl('contract-detail-end-date', formatDateDisplay(contract.endDate));
    
    // Thông tin khách hàng
    setEl('contract-detail-customer-name', customer ? customer.name : 'N/A');
    setEl('contract-detail-customer-phone', customer ? customer.phone : 'N/A');
    
    // Thông tin phòng
    setEl('contract-detail-building', building ? (building.name ? `${building.code} - ${building.name}` : building.code) : 'N/A');
    setEl('contract-detail-room', contract.room || 'N/A');
    setEl('contract-detail-rent', formatMoney(contract.rentPrice) + ' VNĐ');
    setEl('contract-detail-deposit', formatMoney(contract.deposit || 0) + ' VNĐ');
    
    // Dịch vụ đính kèm
    const servicesListEl = document.getElementById('contract-detail-services-list');
    servicesListEl.innerHTML = '';
    
    if (contract.serviceDetails && contract.serviceDetails.length > 0) {
        contract.serviceDetails.forEach((serviceDetail, index) => {
            const service = getServices().find(s => s.id === serviceDetail.serviceId);
            const serviceName = service ? service.name : 'Dịch vụ không xác định';
            const quantity = serviceDetail.quantity || 1;
            const unit = service ? service.unit : '';
            const oldReading = serviceDetail.oldReading || serviceDetail.initialReading || '-';
            
            // Kiểm tra xem có phải dịch vụ điện không (theo tên hoặc đơn vị)
            const isElectric = serviceName.toLowerCase().includes('điện') || unit.toLowerCase().includes('kwh');
            
            const serviceItem = document.createElement('div');
            serviceItem.className = 'bg-white rounded-lg p-3 border border-orange-200';
            
            if (isElectric) {
                // Tiền điện: chỉ hiện chỉ số đầu
                serviceItem.innerHTML = `
                    <div class="font-semibold text-gray-900 mb-2">${index + 1}. ${serviceName}</div>
                    <div class="grid grid-cols-2 gap-4 text-sm">
                        <div>
                            <span class="text-gray-600">Chỉ số đầu:</span>
                            <span class="font-medium ml-1">${oldReading}</span>
                        </div>
                        <div>
                            <span class="text-gray-600">Đơn vị:</span>
                            <span class="font-medium ml-1">${unit}</span>
                        </div>
                    </div>
                `;
            } else {
                // Các dịch vụ khác: chỉ hiện số lượng và đơn vị
                serviceItem.innerHTML = `
                    <div class="font-semibold text-gray-900 mb-2">${index + 1}. ${serviceName}</div>
                    <div class="grid grid-cols-2 gap-4 text-sm">
                        <div>
                            <span class="text-gray-600">Số lượng:</span>
                            <span class="font-medium ml-1">${quantity}</span>
                        </div>
                        <div>
                            <span class="text-gray-600">Đơn vị:</span>
                            <span class="font-medium ml-1">${unit}</span>
                        </div>
                    </div>
                `;
            }
            
            servicesListEl.appendChild(serviceItem);
        });
    } else {
        servicesListEl.innerHTML = '<div class="text-center text-gray-500 py-4">Không có dịch vụ nào</div>';
    }
    
    // Mở modal
    openModal(contractDetailModal);
}

/**
 * Xử lý Xuất Excel
 */
function handleExport() {
    if (contractsCache_filtered.length === 0) {
        return showToast('Không có dữ liệu để xuất!', 'error');
    }
    
    const buildings = getBuildings();
    const customers = getCustomers();
    
    const data = contractsCache_filtered.map(c => {
        const building = buildings.find(b => b.id === c.buildingId);
        const customer = customers.find(cu => cu.id === c.representativeId);
        const statusInfo = getStatusInfo(c.status);
        
        // Tính số người và số xe cho export
        const getPeopleCountForExport = (contract) => {
            if (!contract.serviceDetails) return 0;
            const waterService = contract.serviceDetails.find(s => {
                const service = getServices().find(sv => sv.id === s.serviceId);
                return service && service.name.toLowerCase().includes('nước') && service.unit.toLowerCase().includes('người');
            });
            return waterService ? waterService.quantity || 1 : 0;
        };
        
        const getVehicleCountForExport = (contract) => {
            if (!contract.serviceDetails) return 0;
            const vehicleService = contract.serviceDetails.find(s => {
                const service = getServices().find(sv => sv.id === s.serviceId);
                return service && (service.name.toLowerCase().includes('xe') || service.name.toLowerCase().includes('gửi xe'));
            });
            return vehicleService ? vehicleService.quantity || 1 : 0;
        };

        return {
            'Mã HĐ': `CT${c.id.slice(-6).toUpperCase()}`,
            'Khách hàng': customer ? customer.name : 'N/A',
            'Tòa nhà': building ? building.code : 'N/A',
            'Phòng': c.room,
            'Bắt đầu': formatDateDisplay(c.startDate),
            'Kết thúc': formatDateDisplay(c.endDate),
            'Số người': getPeopleCountForExport(c),
            'Số xe': getVehicleCountForExport(c),
            'Giá thuê': c.rentPrice,
            'Tiền cọc': c.deposit || 0,
            'Trạng thái': statusInfo.text
        };
    });
    
    exportToExcel(data, 'Danh_sach_hop_dong');
    showToast('Xuất dữ liệu thành công!');
}

/**
 * Khởi tạo modal Import
 */
function initImportModal() {
    const closeBtn = document.getElementById('close-import-contracts-modal');
    const cancelBtn = document.getElementById('cancel-import-contracts-btn');
    const submitBtn = document.getElementById('submit-import-contracts-btn');
    const fileInput = document.getElementById('import-contracts-file');
    const fileNameEl = document.getElementById('import-file-name');

    closeBtn.addEventListener('click', () => closeModal(importContractsModal));
    cancelBtn.addEventListener('click', () => closeModal(importContractsModal));

    fileInput.addEventListener('change', (e) => {
        fileNameEl.textContent = e.target.files[0] ? `Đã chọn: ${e.target.files[0].name}` : '';
    });

    submitBtn.addEventListener('click', handleImportSubmit);
}

/**
 * Tải dropdown tòa nhà cho modal import
 */
function initImportModalDropdown() {
    const buildings = getBuildings();
    importBuildingSelect.innerHTML = '<option value="">-- Chọn tòa nhà để tải mẫu --</option>';
    buildings.forEach(b => {
        importBuildingSelect.innerHTML += `<option value="${b.id}">${b.code} - ${b.address || ''}</option>`;
    });
}

/**
 * Tải file mẫu excel cho hợp đồng
 */
function downloadContractsTemplateForBuilding(buildingCode) {
    const building = getBuildings().find(b => b.code === buildingCode);
    if (!building) return;

    const services = getServices();
    
    // Tạo header
    const header = ['Tòa nhà', 'Phòng', 'Tên khách hàng', 'SĐT khách hàng', 'Ngày bắt đầu', 'Ngày kết thúc', 'Hạn thanh toán (ngày)', 'Giá thuê', 'Tiền cọc'];
    
    const buildingServices = (building.services || []).map(bs => services.find(s => s.id === bs.id)).filter(Boolean);
    
    buildingServices.forEach(service => {
        const serviceName = service.name.toLowerCase();
        if (serviceName.includes('điện') || (serviceName.includes('nước') && (service.unit === 'm³' || service.unit === 'khối'))) {
            header.push(`${service.name} (Chỉ số đầu)`);
        } else {
            header.push(`${service.name} (Số lượng)`);
        }
    });

    // Tạo dữ liệu mẫu
    const sampleRow1 = [buildingCode, '101', 'Nguyễn Văn A', '0901234567', '01-01-2025', '31-12-2025', 3, 3500000, 7000000];
    buildingServices.forEach(service => sampleRow1.push(1)); // Mặc định là 1

    const data = [header, sampleRow1, [buildingCode], [buildingCode]];
    
    const ws = XLSX.utils.aoa_to_sheet(data);
    ws['!cols'] = header.map(h => ({ wch: h.length + 5 }));
    XLSX.utils.book_append_sheet(XLSX.utils.book_new(), ws, 'Hợp đồng');
    XLSX.writeFile(XLSX.utils.book_new(), `mau-hop-dong-${buildingCode}.xlsx`);
    showToast('Đã tải file mẫu Excel!');
}

/**
 * Xử lý submit import
 */
async function handleImportSubmit() {
    const file = document.getElementById('import-contracts-file').files[0];
    
    if (!file) {
        showToast('Vui lòng chọn file Excel!', 'warning');
        return;
    }
    
    showToast('Đang xử lý file Excel...', 'info');
    
    try {
        const reader = new FileReader();
        reader.onload = async (e) => {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const worksheet = workbook.Sheets[workbook.SheetNames[0]];
            const jsonData = XLSX.utils.sheet_to_json(worksheet);
            
            console.log('Parsed JSON data:', jsonData);
            
            if (jsonData.length === 0) {
                showToast('File Excel không có dữ liệu!', 'error');
                return;
            }
            
            // Import contracts
            let successCount = 0;
            let errorCount = 0;
            let errorDetails = [];
            
            for (let i = 0; i < jsonData.length; i++) {
                const row = jsonData[i];
                const rowNumber = i + 2; // +2 vì Excel bắt đầu từ 1 và có header
                
                // Skip dòng trống hoàn toàn
                const hasAnyData = Object.values(row).some(value => 
                    value !== null && value !== undefined && value.toString().trim() !== ''
                );
                
                if (!hasAnyData) {
                    console.log(`Skipping empty row ${rowNumber}`);
                    continue; // Bỏ qua dòng trống, không đếm là lỗi
                }
                
                try {
                    // Validate required fields chỉ cho dòng có data
                    const missingFields = [];
                    const toaNha = (row['Tòa nhà'] || row['Mã tòa nhà'] || '').toString().trim();
                    const phong = (row['Phòng'] || '').toString().trim();
                    const tenKhach = (row['Tên khách hàng'] || '').toString().trim();
                    const sdt = (row['SĐT khách hàng'] || '').toString().trim();
                    const ngayBatDau = (row['Ngày bắt đầu'] || '').toString().trim();
                    const ngayKetThuc = (row['Ngày kết thúc'] || '').toString().trim();
                    const giaThue = (row['Giá thuê'] || '').toString().trim();
                    const tienCoc = (row['Tiền cọc'] || '').toString().trim();
                    
                    if (!toaNha) missingFields.push('Tòa nhà/Mã tòa nhà');
                    if (!phong) missingFields.push('Phòng');
                    if (!tenKhach) missingFields.push('Tên khách hàng');
                    if (!sdt) missingFields.push('SĐT khách hàng');
                    if (!ngayBatDau) missingFields.push('Ngày bắt đầu');
                    if (!ngayKetThuc) missingFields.push('Ngày kết thúc');
                    if (!giaThue) missingFields.push('Giá thuê');
                    if (!tienCoc) missingFields.push('Tiền cọc');
                    
                    if (missingFields.length > 0) {
                        errorDetails.push(`Dòng ${rowNumber}: Thiếu ${missingFields.join(', ')}`);
                        errorCount++;
                        continue;
                    }
                    
                    // Find building from Excel data
                    const buildings = getBuildings();
                    const buildingCode = toaNha;
                    const building = buildings.find(b => b.code === buildingCode);
                    if (!building) {
                        errorDetails.push(`Dòng ${rowNumber}: Không tìm thấy tòa nhà "${buildingCode}"`);
                        errorCount++;
                        continue;
                    }
                    
                    console.log(`🏢 Building found for row ${rowNumber}:`, building);
                    console.log(`🔧 Building services:`, building.services);
                    
                    // Find or create customer
                    const customers = getCustomers();
                    let customer = customers.find(c => c.phone === row['SĐT khách hàng']);
                    
                    if (!customer) {
                        const customerData = {
                            name: row['Tên khách hàng'],
                            phone: row['SĐT khách hàng'],
                            createdAt: serverTimestamp(),
                            updatedAt: serverTimestamp()
                        };
                        // Create Firebase
                        const docRef = await addDoc(collection(db, 'customers'), customerData);
                        
                        // Add to localStorage với Firebase ID
                        const newItem = { 
                            ...customerData, 
                            id: docRef.id,
                            createdAt: new Date(),
                            updatedAt: new Date()
                        };
                        const state = getState();
                        state.customers.unshift(newItem);
                        
                        customer = { id: docRef.id, ...customerData };
                    }
                    
                    // Xử lý dịch vụ từ Excel
                    const contractServices = [];
                    if (building.services) {
                        building.services.forEach(service => {
                            const serviceName = service.name.toLowerCase();
                            if (serviceName.includes('điện')) {
                                // Dịch vụ điện luôn có, không cần số lượng
                                contractServices.push({
                                    serviceId: service.id,
                                    quantity: 1,
                                    initialReading: parseInt(row['Chỉ số điện ban đầu']) || 0
                                });
                            } else {
                                // Các dịch vụ khác đọc từ cột số lượng
                                const columnName = `${service.name} (số lượng)`;
                                const quantity = parseInt(row[columnName]) || 0;
                                if (quantity > 0) {
                                    contractServices.push({
                                        serviceId: service.id,
                                        quantity: quantity,
                                        initialReading: 0
                                    });
                                }
                            }
                        });
                    }
                    
                    // Parse dates from DD-MM-YYYY format
                    const startDateParsed = parseDateInput(row['Ngày bắt đầu']);
                    const endDateParsed = parseDateInput(row['Ngày kết thúc']);
                    
                    if (!startDateParsed || !endDateParsed) {
                        errorDetails.push(`Dòng ${rowNumber}: Lỗi format ngày "${row['Ngày bắt đầu']}" hoặc "${row['Ngày kết thúc']}" (yêu cầu DD-MM-YYYY)`);
                        errorCount++;
                        continue;
                    }
                    
                    // Create contract
                    console.log(`🗓️ Date parsing for row ${rowNumber}:`);
                    console.log(`  Start date raw: "${row['Ngày bắt đầu']}" -> parsed: ${startDateParsed} -> formatted: ${formatDateForStorage(startDateParsed)}`);
                    console.log(`  End date raw: "${row['Ngày kết thúc']}" -> parsed: ${endDateParsed} -> formatted: ${formatDateForStorage(endDateParsed)}`);
                    const roomValue = row['Phòng'] ? row['Phòng'].toString().trim() : '';
                    console.log(`🚪 Room: "${row['Phòng']}" -> processed: "${roomValue}" -> isEmpty: ${!roomValue}`);
                    
                    // Tự động thêm phòng vào building nếu chưa tồn tại
                    if (roomValue && building.rooms && !building.rooms.includes(roomValue)) {
                        console.log(`🏠 Adding new room "${roomValue}" to building "${building.code}"`);
                        building.rooms.push(roomValue);
                        // Cập nhật building trong Firebase
                        const buildingRef = doc(db, 'buildings', building.id);
                        await updateDoc(buildingRef, {
                            rooms: building.rooms,
                            updatedAt: serverTimestamp()
                        });
                        console.log(`✅ Room "${roomValue}" added to building successfully`);
                    }
                    
                    const contractData = {
                        buildingId: building.id,
                        room: roomValue, // Đảm bảo room là string và trim
                        startDate: formatDateForStorage(startDateParsed),
                        endDate: formatDateForStorage(endDateParsed),
                        paymentDay: parseInt(row['Hạn thanh toán (ngày)']) || 3,
                        rentPrice: parseInt(row['Giá thuê']) || 0,
                        deposit: parseInt(row['Tiền cọc']) || 0,
                        initialElectricReading: parseInt(row['Chỉ số điện ban đầu']) || 0,
                        customers: [customer.id],
                        representativeId: customer.id,
                        services: contractServices.map(s => s.serviceId), // Chỉ lưu ID cho compatibility
                        serviceDetails: contractServices, // Lưu chi tiết dịch vụ riêng
                        status: 'active',
                        createdAt: serverTimestamp(),
                        updatedAt: serverTimestamp()
                    };
                    
                    console.log(`💾 Contract data to save:`, contractData);
                    
                    // Import to Firebase + localStorage
                    const docRef = await addDoc(collection(db, 'contracts'), contractData);
                    
                    // Add to localStorage với Firebase ID
                    const newItem = { 
                        ...contractData, 
                        id: docRef.id,
                        createdAt: new Date(),
                        updatedAt: new Date()
                    };
                    const state = getState();
                    state.contracts.unshift(newItem);
                    
                    successCount++;
                } catch (error) {
                    errorDetails.push(`Dòng ${rowNumber}: ${error.message}`);
                    errorCount++;
                }
            }
            
            // Save cache và dispatch event sau khi import xong
            if (successCount > 0) {
                saveToCache();
                document.dispatchEvent(new CustomEvent('store:contracts:updated'));
            }
            
            closeModal(importContractsModal);
            
            if (errorCount > 0) {
                // Hiển thị chi tiết lỗi
                const errorMsg = `Nhập thành công ${successCount} hợp đồng, ${errorCount} lỗi:\n\n${errorDetails.join('\n')}`;
                alert(errorMsg);
                showToast(`Nhập thành công ${successCount} hợp đồng, ${errorCount} lỗi!`, errorCount > 0 ? 'warning' : 'success');
            } else {
                showToast(`Nhập thành công ${successCount} hợp đồng!`, 'success');
            }
        };
        reader.readAsArrayBuffer(file);
    } catch (error) {
        console.error('Error reading file:', error);
        showToast('Lỗi đọc file Excel: ' + error.message, 'error');
    }
}

// --- HÀM TIỆN ÍCH CỦA MODULE ---

/**
 * Tạo hóa đơn thanh lý hợp đồng
 */
async function createTerminationBill(contract, terminationDate = null) {
    try {
        const building = getBuildings().find(b => b.id === contract.buildingId);
        const customer = getCustomers().find(c => c.id === contract.representativeId);
        
        if (!building || !customer) {
            throw new Error('Không tìm thấy thông tin tòa nhà hoặc khách hàng');
        }

        const billId = Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
        
        // Sử dụng ngày được chọn hoặc ngày hiện tại
        const billDate = terminationDate || new Date();
        const currentMonth = billDate.getMonth() + 1;
        const currentYear = billDate.getFullYear();
        const currentDate = `${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(billDate.getDate()).padStart(2, '0')}`;
        
        const billData = {
            id: billId,
            buildingId: contract.buildingId,
            room: contract.room,
            customerId: contract.representativeId,
            customerName: customer.name,
            period: `${currentMonth}`,
            year: currentYear,
            billDate: currentDate,
            dueDate: 3,
            services: [{
                name: 'Thanh lý hợp đồng',
                serviceName: 'Thanh lý hợp đồng',
                amount: 0,
                type: 'termination',
                fromDate: currentDate,
                toDate: currentDate
            }],
            totalAmount: 0,
            status: 'unpaid', // Trạng thái thông thường, sẽ được xử lý khi duyệt
            approved: false,
            paidAmount: 0,
            isTerminationBill: true,
            contractId: contract.id,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        };
        
        // Create Firebase + localStorage
        await setDoc(doc(db, 'bills', billId), billData);
        
        // Add to localStorage với Firebase ID
        const newItem = { 
            ...billData,
            createdAt: new Date(),
            updatedAt: new Date()
        };
        const state = getState();
        state.bills.unshift(newItem);
        saveToCache();
        document.dispatchEvent(new CustomEvent('store:bills:updated'));
        
        return billId;
    } catch (error) {
        console.error('Lỗi tạo hóa đơn thanh lý:', error);
        throw error;
    }
}

/**
 * Kiểm tra xem hợp đồng đã có hóa đơn thanh lý chưa
 */
function hasTerminationBill(contractId) {
    const bills = getBills();
    return bills.some(bill => bill.contractId === contractId && bill.isTerminationBill);
}

/**
 * Mở modal chọn ngày thanh lý
 */
function openTerminationModal(contract) {
    const building = getBuildings().find(b => b.id === contract.buildingId);
    const contractInfo = `${building?.code || ''} - ${contract.room}`;
    
    // Hiển thị thông tin hợp đồng
    document.getElementById('termination-contract-info').textContent = contractInfo;
    
    // Set ngày mặc định là hôm nay
    const today = formatDateDisplay(new Date());
    document.getElementById('termination-date').value = today;
    
    // Lưu contract để sử dụng khi confirm
    document.getElementById('termination-modal').dataset.contractId = contract.id;
    
    openModal(document.getElementById('termination-modal'));
}

/**
 * Xử lý xác nhận thanh lý hợp đồng
 */
async function handleTerminationConfirm() {
    const modal = document.getElementById('termination-modal');
    const contractId = modal.dataset.contractId;
    const terminationDateStr = document.getElementById('termination-date').value;
    const terminationDate = parseDateInput(terminationDateStr);
    
    if (!terminationDate) {
        showToast('Vui lòng chọn ngày thanh lý!', 'error');
        return;
    }
    
    const contract = getContracts().find(c => c.id === contractId);
    if (!contract) {
        showToast('Không tìm thấy hợp đồng!', 'error');
        return;
    }
    
    try {
        // Đóng modal
        closeModal(modal);
        
        // Tạo hóa đơn thanh lý với ngày đã chọn
        showToast('Đang tạo hóa đơn thanh lý...', 'info');
        const terminationBillId = await createTerminationBill(contract, terminationDate);
        
        // Update Firebase
        await setDoc(doc(db, 'contracts', contractId), {
            status: 'terminated',
            terminatedAt: serverTimestamp(),
            terminationBillId: terminationBillId,
            updatedAt: serverTimestamp()
        }, { merge: true });
        
        // Update localStorage
        updateInLocalStorage('contracts', contractId, {
            status: 'terminated',
            terminatedAt: new Date(),
            terminationBillId: terminationBillId,
            updatedAt: new Date()
        });
        
        showToast('Đã thanh lý hợp đồng và tạo hóa đơn thanh lý thành công!');
    } catch (error) {
        showToast('Lỗi thanh lý hợp đồng: ' + error.message, 'error');
    }
}

/**
 * 🔥 Xử lý khi xóa hóa đơn thanh lý - cập nhật lại trạng thái hợp đồng
 */
export async function handleTerminationBillDeleted(billId, contractId) {
    try {
        console.log('🔄 [CONTRACT] Xử lý xóa hóa đơn thanh lý:', billId, 'for contract:', contractId);
        
        const contract = getContracts().find(c => c.id === contractId);
        if (!contract) {
            console.log('⚠️ [CONTRACT] Không tìm thấy hợp đồng:', contractId);
            return;
        }
        
        // Tính toán lại trạng thái hợp đồng
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const endDate = new Date(contract.endDate);
        endDate.setHours(0, 0, 0, 0);
        
        let newStatus = 'active';
        const diffTime = endDate.getTime() - today.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        if (diffDays < 0) newStatus = 'expired';
        else if (diffDays <= 30) newStatus = 'expiring';
        
        // Cập nhật Firebase
        await setDoc(doc(db, 'contracts', contractId), {
            status: newStatus,
            terminatedAt: null,
            terminationBillId: null,
            updatedAt: serverTimestamp()
        }, { merge: true });
        
        // Cập nhật localStorage
        updateInLocalStorage('contracts', contractId, {
            status: newStatus,
            terminatedAt: null,
            terminationBillId: null,
            updatedAt: new Date()
        });
        
        console.log('✅ [CONTRACT] Đã khôi phục hợp đồng từ trạng thái terminated sang:', newStatus);
        
    } catch (error) {
        console.error('❌ [CONTRACT] Lỗi khôi phục hợp đồng:', error);
    }
}

/**
 * Tính toán trạng thái hợp đồng (active, expiring, expired, terminated)
 */
export function getContractStatus(contract) {
    if (contract.status === 'terminated') return 'terminated';
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const endDate = parseDateInput(contract.endDate);
    if (!endDate) return 'terminated'; // Lỗi dữ liệu
    endDate.setHours(0, 0, 0, 0);
    
    const diffTime = endDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays < 0) return 'expired';
    if (diffDays <= 30) return 'expiring';
    return 'active';
}

/**
 * Lấy thông tin hiển thị (text, class) cho từng trạng thái
 */
export function getStatusInfo(status) {
    switch (status) {
        case 'active': return { text: '🟢 Thuê', className: 'bg-green-100 text-green-800' };
        case 'expiring': return { text: '🟡 Sắp hết', className: 'bg-yellow-100 text-yellow-800' };
        case 'expired': return { text: '🔴 Quá hạn', className: 'bg-red-100 text-red-800' };
        case 'terminated': return { text: '⚫ Thanh lý', className: 'bg-gray-100 text-gray-800' };
        default: return { text: 'Không xác định', className: 'bg-gray-100 text-gray-800' };
    }
}

/**
 * Tải danh sách khách hàng vào dropdown tìm kiếm
 */
function loadCustomerOptions(searchTerm = '') {
    const customers = getCustomers();
    const filteredCustomers = customers.filter(customer => 
        !selectedCustomers.includes(customer.id) && (
            customer.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            customer.phone.includes(searchTerm)
        )
    );
    
    if (filteredCustomers.length === 0) {
        customerOptionsEl.innerHTML = '<div class="p-3 text-gray-500 text-sm text-center">Không tìm thấy khách hàng.</div>';
        customerDropdown.classList.remove('hidden');
        return;
    }
    
    customerOptionsEl.innerHTML = filteredCustomers.map(customer => `
        <div class="flex items-center gap-3 p-3 hover:bg-gray-50 cursor-pointer border-b customer-option-item" data-id="${customer.id}">
            <div class="flex-1">
                <div class="font-medium">${customer.name}</div>
                <div class="text-gray-500 text-sm">${customer.phone}</div>
            </div>
        </div>
    `).join('');
    
    customerDropdown.classList.remove('hidden');
}

/**
 * Cập nhật bảng khách hàng đã chọn trong modal
 */
function updateSelectedCustomersDisplay(defaultRepresentativeId = null) {
    const customers = getCustomers();
    
    if (selectedCustomers.length === 0) {
        selectedCustomersDisplay.innerHTML = '<tr><td colspan="4" class="p-4 text-center text-gray-500">Chưa chọn khách hàng nào</td></tr>';
        return;
    }
    
    const repId = defaultRepresentativeId || document.querySelector('input[name="representative"]:checked')?.value || selectedCustomers[0];
    
    const selectedCustomerData = customers.filter(c => selectedCustomers.includes(c.id));
    selectedCustomersDisplay.innerHTML = selectedCustomerData.map(customer => `
        <tr class="border-b">
            <td class="py-3 px-2">${customer.name}</td>
            <td class="py-3 px-2">${customer.phone}</td>
            <td class="py-3 px-2">
                <label class="relative inline-flex items-center cursor-pointer">
                    <input type="radio" name="representative" value="${customer.id}" class="sr-only peer" ${customer.id === repId ? 'checked' : ''}>
                    <div class="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-600"></div>
                </label>
            </td>
            <td class="py-3 px-2">
                <button type="button" class="w-8 h-8 rounded bg-red-500 hover:bg-red-600 flex items-center justify-center remove-customer-btn" data-id="${customer.id}" title="Xóa">
                    <svg class="w-4 h-4 text-white pointer-events-none" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd"/></svg>
                </button>
            </td>
        </tr>
    `).join('');
}

/**
 * Xử lý khi chọn tòa nhà trong modal
 */
function handleContractBuildingChange(eventOrId) {
    // Nếu là Event object thì lấy e.target.value, nếu là string thì dùng luôn
    const buildingId = (typeof eventOrId === 'string') ? eventOrId : (eventOrId?.target?.value || contractBuildingSelect.value);
    
    const building = getBuildings().find(b => b.id === buildingId);
    
    contractRoomSelect.innerHTML = '<option value="">-- Chọn phòng --</option>';
    
    if (building) {
        (building.rooms || []).forEach(room => {
            contractRoomSelect.innerHTML += `<option value="${room}">${room}</option>`;
        });

        // Tải dịch vụ của tòa nhà (copy từ index1.html)
        if (building && building.services && building.services.length > 0) {
            const services = getServices();
            // building.services is array of service objects (not IDs)
            currentContractServices = building.services.map(s => ({...s}));
        } else {
            currentContractServices = [];
        }
    } else {
        currentContractServices = [];
    }
    
    originalContractServices = JSON.parse(JSON.stringify(currentContractServices));
    renderContractServices();
}

/**
 * Hiển thị danh sách dịch vụ trong modal chọn
 */
function showAvailableContractServices() {
    const services = getServices();
    const searchText = searchContractServicesInput.value.toLowerCase();
    
    const filteredServices = services.filter(s => 
        s.name.toLowerCase().includes(searchText)
    );
    
    availableContractServicesListEl.innerHTML = filteredServices.map(service => {
        const isAdded = currentContractServices.some(s => s.id === service.id);
        return `
            <div class="flex items-center justify-between p-3 border rounded-lg ${isAdded ? 'bg-gray-100 opacity-50' : 'bg-white hover:bg-gray-50'}">
                <div class="flex-1">
                    <div class="font-medium text-gray-700">${service.name}</div>
                    <div class="text-sm text-gray-600">${formatMoney(service.price)} đ/${service.unit}</div>
                </div>
                ${isAdded ? 
                    '<span class="text-sm text-gray-500">Đã thêm</span>' : 
                    `<button type="button" class="add-service-to-contract-btn bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded text-sm" data-id="${service.id}">Thêm</button>`
                }
            </div>
        `;
    }).join('');
    
    if (filteredServices.length === 0) {
        availableContractServicesListEl.innerHTML = '<div class="text-center text-gray-500 py-4">Không tìm thấy dịch vụ nào.</div>';
    }
}

/**
 * Hiển thị danh sách dịch vụ đã chọn trong modal
 */
function renderContractServices() {
    if (currentContractServices.length === 0) {
        contractServicesListEl.innerHTML = '<p class="text-gray-500 text-sm">Chưa có dịch vụ nào.</p>';
        return;
    }
    
    contractServicesListEl.innerHTML = currentContractServices.map((service, index) => {
        const isMetered = service.name.toLowerCase().includes('điện') || (service.name.toLowerCase().includes('nước') && (service.unit === 'm³' || service.unit === 'khối'));
        const reading = service.initialReading || 0;
        const quantity = service.quantity || 1;
        
        return `
            <div class="p-3 border rounded bg-white">
                <div class="flex items-center justify-between">
                    <div class="flex-1">
                        <span class="font-medium">${service.name}</span>
                        <span class="text-gray-500 text-sm ml-2">${formatMoney(service.price)} đ/${service.unit}</span>
                    </div>
                    <div class="flex items-center gap-2">
                        ${isMetered ? `
                            <label class="text-xs text-gray-600">Chỉ số đầu:</label>
                            <input type="number" value="${reading}" class="w-24 text-sm p-1 border rounded contract-service-reading" data-index="${index}" min="0">
                        ` : `
                            <label class="text-xs text-gray-600">Số lượng:</label>
                            <input type="number" value="${quantity}" class="w-20 text-sm p-1 border rounded contract-service-quantity" data-index="${index}" min="1">
                        `}
                        <button type="button" class="remove-contract-service-btn w-8 h-8 rounded bg-red-500 hover:bg-red-600 flex items-center justify-center flex-shrink-0" data-index="${index}" title="Xóa">
                            <svg class="w-4 h-4 text-white pointer-events-none" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd"/></svg>
                        </button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
    
    // Gắn listener cho các input mới
    document.querySelectorAll('.contract-service-reading').forEach(input => {
        input.addEventListener('input', (e) => {
            currentContractServices[e.target.dataset.index].initialReading = parseInt(e.target.value) || 0;
        });
    });
    document.querySelectorAll('.contract-service-quantity').forEach(input => {
        input.addEventListener('input', (e) => {
            currentContractServices[e.target.dataset.index].quantity = parseInt(e.target.value) || 1;
        });
    });
}