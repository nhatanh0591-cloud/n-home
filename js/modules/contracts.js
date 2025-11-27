// js/modules/contracts.js

import { db, addDoc, setDoc, doc, deleteDoc, updateDoc, collection, serverTimestamp } from '../firebase.js';
import { getContracts, getBuildings, getCustomers, getServices, getBills, getState, saveToCache, updateInLocalStorage, deleteFromLocalStorage } from '../store.js';
import { 
    showToast, openModal, closeModal, 
    formatDateDisplay, convertToDateInputFormat, parseDateInput, parseFormattedNumber, formatMoney, 
    importFromExcel, exportToExcel, showConfirm, getCurrentDateString, formatDateForStorage, safeToDate
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
const totalContractsEl = document.getElementById('total-contracts');
const activeContractsEl = document.getElementById('active-contracts');
const expiringContractsEl = document.getElementById('expiring-contracts');
const expiredContractsEl = document.getElementById('expired-contracts');

// Filters
const filterBuildingEl = document.getElementById('filter-building');
const filterRoomEl = document.getElementById('filter-room');
const filterStatusEl = document.getElementById('filter-status');
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

    // Lấy giá trị bộ lọc
    const buildingFilter = filterBuildingEl.value;
    const roomFilter = filterRoomEl.value;
    const statusFilter = filterStatusEl.value;
    const searchTerm = searchEl.value.toLowerCase();

    // Lọc
    contractsCache_filtered = contracts.filter(contract => {
        if (buildingFilter && contract.buildingId !== buildingFilter) return false;
        if (roomFilter && contract.room !== roomFilter) return false;
        if (statusFilter && contract.status !== statusFilter) return false;
        
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
                    // Sử dụng safeToDate để xử lý cả 2 trường hợp Firebase timestamp
                    return safeToDate(contract.createdAt).getTime();
                } else {
                }
                return 0;
            };
            
            return getCreatedTime(b) - getCreatedTime(a);
        }
    });

    // Cập nhật thống kê dựa trên data đã lọc
    updateContractStats(contractsCache_filtered);

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
                    <button data-id="${contract.id}" class="terminate-contract-btn w-8 h-8 rounded bg-orange-500 hover:bg-orange-600 flex items-center justify-center" title="${contract.status === 'terminated' ? 'Bỏ thanh lý' : 'Thanh lý'}">
                        <svg class="w-4 h-4 text-white pointer-events-none" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"/></svg>
                    </button>
                    <button data-id="${contract.id}" class="delete-contract-btn w-8 h-8 rounded bg-red-500 hover:bg-red-600 flex items-center justify-center" title="Xóa">
                        <svg class="w-4 h-4 text-white pointer-events-none" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd"/></svg>
                    </button>
                </div>
            </td>
            <td class="py-4 px-4">
                <div>
                    <div class="font-medium">${customer ? customer.name : 'N/A'}</div>
                    <div class="text-sm text-gray-500">${building ? building.code : 'N/A'} - ${contract.room || 'Chưa có phòng'}</div>
                </div>
            </td>
            <td class="py-4 px-4">${formatDateDisplay(contract.startDate)}</td>
            <td class="py-4 px-4">${formatDateDisplay(contract.endDate)}</td>
            <td class="py-4 px-4 text-center">${peopleCount}</td>
            <td class="py-4 px-4 text-center">${vehicleCount}</td>
            <td class="py-4 px-4 whitespace-nowrap">${formatMoney(contract.rentPrice)} VNĐ</td>
            <td class="py-4 px-4 whitespace-nowrap">${formatMoney(contract.deposit || 0)} VNĐ</td>
            <td class="py-4 px-4">
                <span class="px-2 py-1 rounded-full text-xs font-medium ${statusInfo.className}">
                    ${statusInfo.text}
                </span>
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
                    <span class="mobile-card-value font-medium">${customer ? customer.name : 'N/A'}</span>
                </div>
                <div class="mobile-card-row">
                    <span class="mobile-card-label">Phòng:</span>
                    <span class="mobile-card-value">${building ? building.code : 'N/A'} - ${contract.room || 'Chưa có phòng'}</span>
                </div>
                <div class="mobile-card-row">
                    <span class="mobile-card-label">Thời gian:</span>
                    <span class="mobile-card-value">${formatDateDisplay(contract.startDate)} → ${formatDateDisplay(contract.endDate)}</span>
                </div>
                <div class="mobile-card-row">
                    <span class="mobile-card-label">Số người/xe:</span>
                    <span class="mobile-card-value">${peopleCount} người / ${vehicleCount} xe</span>
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
                        <span class="px-2 py-1 rounded-full text-xs font-medium ${statusInfo.className}">
                            ${statusInfo.text}
                        </span>
                    </span>
                </div>
                <div class="mobile-card-actions">
                    <button data-id="${contract.id}" class="edit-contract-btn bg-gray-500 hover:bg-gray-600 text-white">
                        <svg class="w-4 h-4 pointer-events-none" fill="currentColor" viewBox="0 0 20 20"><path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z"/></svg>
                        Sửa
                    </button>
                    <button data-id="${contract.id}" class="terminate-contract-btn bg-orange-500 hover:bg-orange-600 text-white">
                        <svg class="w-4 h-4 pointer-events-none" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"/></svg>
                        ${contract.status === 'terminated' ? 'Bỏ thanh lý' : 'Thanh lý'}
                    </button>
                    <button data-id="${contract.id}" class="delete-contract-btn bg-red-500 hover:bg-red-600 text-white">
                        <svg class="w-4 h-4 pointer-events-none" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd"/></svg>
                        Xóa
                    </button>
                </div>
            `;
            mobileListEl.appendChild(mobileCard);
        }
    });

    updateContractPagination();
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
    totalContractsEl.textContent = contracts.length;
    activeContractsEl.textContent = contracts.filter(c => c.status === 'active').length;
    expiringContractsEl.textContent = contracts.filter(c => c.status === 'expiring').length;
    expiredContractsEl.textContent = contracts.filter(c => c.status === 'expired').length;
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
                    
                    showToast('Đã bỏ thanh lý hợp đồng thành công!');
                } catch (error) {
                    showToast('Lỗi bỏ thanh lý hợp đồng: ' + error.message, 'error');
                }
            }
        } else {
            // Thanh lý
            const confirmed = await showConfirm('Bạn có chắc chắn muốn thanh lý hợp đồng này? Hệ thống sẽ tự động tạo hóa đơn thanh lý.', 'Xác nhận thanh lý');
            if (confirmed) {
                try {
                    // Tạo hóa đơn thanh lý trước
                    showToast('Đang tạo hóa đơn thanh lý...', 'info');
                    const terminationBillId = await createTerminationBill(contract);
                    
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
        }
        return;
    }
    
    // Nút đóng modal - kiểm tra cả target và closest
    if (target.id === 'close-contract-modal' || target.closest('#close-contract-modal') || target.id === 'cancel-contract-btn' || target.closest('#cancel-contract-btn')) {
        closeModal(contractModal);
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

    if (!name || !phone) {
        return showToast('Vui lòng nhập đủ tên và SĐT!', 'error');
    }

    try {
        const customerData = {
            name,
            phone,
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
async function createTerminationBill(contract) {
    try {
        const building = getBuildings().find(b => b.id === contract.buildingId);
        const customer = getCustomers().find(c => c.id === contract.representativeId);
        
        if (!building || !customer) {
            throw new Error('Không tìm thấy thông tin tòa nhà hoặc khách hàng');
        }

        const billId = Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
        const now = new Date();
        const currentMonth = now.getMonth() + 1;
        const currentYear = now.getFullYear();
        const currentDate = `${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        
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
            status: 'unpaid',
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
 * Tính toán trạng thái hợp đồng (active, expiring, expired, terminated)
 */
function getContractStatus(contract) {
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
function getStatusInfo(status) {
    switch (status) {
        case 'active': return { text: 'Đang thuê', className: 'bg-green-100 text-green-800' };
        case 'expiring': return { text: 'Sắp hết hạn', className: 'bg-yellow-100 text-yellow-800' };
        case 'expired': return { text: 'Quá hạn', className: 'bg-red-100 text-red-800' };
        case 'terminated': return { text: 'Đã thanh lý', className: 'bg-gray-100 text-gray-800' };
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