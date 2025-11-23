// js/modules/customers.js

import { db, addDoc, setDoc, doc, deleteDoc, collection, serverTimestamp } from '../firebase.js';
import { getCustomers, getContracts, getBuildings, getState, saveToCache, updateInLocalStorage, deleteFromLocalStorage } from '../store.js';
import { showToast, openModal, closeModal, exportToExcel, importFromExcel, showConfirm } from '../utils.js';

// --- BIẾN CỤC BỘ CHO MODULE ---
let currentCustomerPage = 1;
const customersPerPage = 20;
let customersCache_filtered = []; // Cache đã lọc để phân trang
let selectedMobileCustomerIds = new Set(); // Checkbox mobile persistent

// --- DOM ELEMENTS (Chỉ liên quan đến Khách hàng) ---
const customersSection = document.getElementById('customers-section');
const customersListEl = document.getElementById('customers-list');

// Stats
const totalCustomersEl = document.getElementById('total-customers');
const activeCustomersEl = document.getElementById('active-customers');
const movedCustomersEl = document.getElementById('moved-customers');

// Filters
const filterBuildingEl = document.getElementById('filter-customer-building');
const filterRoomEl = document.getElementById('filter-customer-room');
const filterStatusEl = document.getElementById('filter-customer-status');
const searchEl = document.getElementById('customer-search');
const selectAllCheckbox = document.getElementById('select-all-customers');

// Pagination
const paginationEl = document.getElementById('customer-pagination');
const showingStartEl = document.getElementById('customer-showing-start');
const showingEndEl = document.getElementById('customer-showing-end');
const totalEl = document.getElementById('customer-total');
const pageInfoEl = document.getElementById('customer-page-info');
const prevBtn = document.getElementById('customer-prev-page');
const nextBtn = document.getElementById('customer-next-page');

// Modals
const customerModal = document.getElementById('customer-modal');
const customerModalTitle = document.getElementById('customer-modal-title');
const customerForm = document.getElementById('customer-form');
const importCustomersModal = document.getElementById('import-customers-modal');

// --- HÀM CHÍNH ---

/**
 * Hàm khởi tạo, được gọi 1 lần duy nhất từ main.js
 */
export function initCustomers() {
    // Lắng nghe sự kiện từ store
    document.addEventListener('store:customers:updated', () => {
        if (!customersSection.classList.contains('hidden')) {
            loadCustomers();
        }
    });
    // Tải lại khi hợp đồng hoặc tòa nhà thay đổi (vì cần thông tin trạng thái)
    document.addEventListener('store:contracts:updated', () => {
        if (!customersSection.classList.contains('hidden')) {
            loadCustomers();
        }
    });
    document.addEventListener('store:buildings:updated', () => {
        if (!customersSection.classList.contains('hidden')) {
            loadCustomers();
        }
    });

    // Lắng nghe sự kiện click trên toàn trang
    document.body.addEventListener('click', handleBodyClick);
    
    // Lắng nghe form
    customerForm.addEventListener('submit', handleCustomerFormSubmit);
    
    // Lắng nghe nút bỏ chọn hàng loạt
    document.getElementById('clear-selection-customers-btn')?.addEventListener('click', () => {
        selectedMobileCustomerIds.clear();
        document.querySelectorAll('.customer-checkbox').forEach(cb => cb.checked = false);
        updateClearSelectionButton();
        showToast('Bỏ chọn thành công!');
    });

    // Lắng nghe bộ lọc
    filterBuildingEl.addEventListener('change', () => { currentCustomerPage = 1; loadCustomers(); });
    filterRoomEl.addEventListener('change', () => { currentCustomerPage = 1; loadCustomers(); });
    filterStatusEl.addEventListener('change', () => { currentCustomerPage = 1; loadCustomers(); });
    searchEl.addEventListener('input', () => { currentCustomerPage = 1; loadCustomers(); });

    // Lắng nghe phân trang
    prevBtn.addEventListener('click', () => {
        if (currentCustomerPage > 1) {
            currentCustomerPage--;
            renderCustomersPage();
        }
    });
    nextBtn.addEventListener('click', () => {
        const totalPages = Math.ceil(customersCache_filtered.length / customersPerPage);
        if (currentCustomerPage < totalPages) {
            currentCustomerPage++;
            renderCustomersPage();
        }
    });

    // Lắng nghe select all
    selectAllCheckbox.addEventListener('change', (e) => {
        document.querySelectorAll('.customer-checkbox').forEach(cb => cb.checked = e.target.checked);
    });

    // Khởi tạo modal import
    initImportModal();
}

/**
 * Tải, lọc, và chuẩn bị dữ liệu khách hàng
 */
export function loadCustomers() {
    if (customersSection?.classList.contains('hidden')) return;
    
    const allCustomers = getCustomers();
    const contracts = getContracts();
    const buildings = getBuildings();

    // Tạo danh sách customer với thông tin chi tiết cho từng phòng
    const customersWithInfo = [];
    
    allCustomers.forEach(customer => {
        const customerContracts = contracts.filter(c => 
            c.customers && Array.isArray(c.customers) && c.customers.includes(customer.id)
        );
        
        if (customerContracts.length === 0) {
            // Customer chưa có hợp đồng nào
            customersWithInfo.push({ 
                ...customer, 
                status: 'no_contract', 
                buildingId: '', 
                buildingName: '', 
                roomName: '' 
            });
        } else {
            // Tạo một record cho mỗi hợp đồng
            customerContracts.forEach(contract => {
                let status = 'no_contract';
                let buildingId = contract.buildingId || '';
                let buildingName = '';
                let roomName = contract.room || '';

                // Kiểm tra trạng thái hợp đồng
                if (contract.status === 'terminated') {
                    status = 'moved';
                } else {
                    const today = new Date(); 
                    today.setHours(0, 0, 0, 0);
                    const endDate = parseDateInput(contract.endDate);
                    if (endDate) {
                        endDate.setHours(0, 0, 0, 0);
                        status = endDate >= today ? 'active' : 'moved';
                    }
                }

                // Tìm thông tin tòa nhà
                const building = buildings.find(b => b.id === buildingId);
                buildingName = building ? building.code : '';

                // Thêm một record riêng cho hợp đồng này
                customersWithInfo.push({
                    ...customer,
                    contractId: contract.id, // Thêm ID hợp đồng để phân biệt
                    id: `${customer.id}_${contract.id}`, // ID unique cho mỗi record
                    originalCustomerId: customer.id, // Giữ lại ID customer gốc
                    status,
                    buildingId,
                    buildingName,
                    roomName
                });
            });
        }
    });

    // Áp dụng bộ lọc
    const filterBuilding = filterBuildingEl.value;
    const filterRoom = filterRoomEl.value;
    const filterStatus = filterStatusEl.value;
    const searchText = searchEl.value.toLowerCase();

    customersCache_filtered = customersWithInfo.filter(customer => {
        if (filterBuilding && customer.buildingName !== filterBuilding) return false;
        if (filterRoom && customer.roomName !== filterRoom) return false;
        if (filterStatus && customer.status !== filterStatus) return false;
        if (searchText && !customer.name.toLowerCase().includes(searchText) && 
            !customer.phone.includes(searchText)) return false;
        return true;
    });

    // SẮP XẾP: Theo thời gian tạo khi không filter, theo phòng khi có filter tòa nhà
    const hasBuildingFilter = filterBuilding && filterBuilding.trim() !== '';
    
    if (hasBuildingFilter) {
        // Có filter tòa nhà -> sắp xếp theo phòng
        customersCache_filtered.sort((a, b) => {
            const roomA = a.roomName || '';
            const roomB = b.roomName || '';
            
            // Xử lý phòng đặc biệt (có chữ)
            const getSpecialOrder = (room) => {
                if (room.toLowerCase().includes('sân thượng') || room.toLowerCase().includes('rooftop')) return 3;
                if (isNaN(parseInt(room))) return 2; // Phòng có chữ
                return 1; // Phòng số
            };
            
            const orderA = getSpecialOrder(roomA);
            const orderB = getSpecialOrder(roomB);
            
            if (orderA !== orderB) {
                return orderA - orderB;
            }
            
            // Cùng loại thì sắp xếp theo số hoặc chữ cái
            if (orderA === 1) { // Cả hai đều là số
                return parseInt(roomA) - parseInt(roomB);
            } else {
                return roomA.localeCompare(roomB);
            }
        });
    } else {
        // Không có filter tòa nhà -> sắp xếp theo thời gian tạo (mới nhất trước)
        customersCache_filtered.sort((a, b) => {
            const timeA = a.createdAt?.toDate?.() || new Date(a.createdAt || 0);
            const timeB = b.createdAt?.toDate?.() || new Date(b.createdAt || 0);
            return timeB - timeA; // Mới nhất trước
        });
    }

    // Cập nhật thống kê dựa trên data đã lọc
    const uniqueCustomers = new Set(customersCache_filtered.map(c => c.originalCustomerId || c.id)).size;
    updateCustomerStats(uniqueCustomers, customersCache_filtered);
    
    // Cập nhật dropdown bộ lọc
    updateCustomerFilterOptions(customersWithInfo, buildings);
    
    // Hiển thị trang đầu tiên
    currentCustomerPage = 1;
    renderCustomersPage();
}

/**
 * Hiển thị dữ liệu lên bảng (theo trang)
 */
function renderCustomersPage() {
    customersListEl.innerHTML = '';
    const mobileListEl = document.getElementById('customers-mobile-list');
    if (mobileListEl) mobileListEl.innerHTML = '';

    if (customersCache_filtered.length === 0) {
        customersListEl.innerHTML = '<tr><td colspan="7" class="p-8 text-center text-gray-500">Không tìm thấy khách hàng nào.</td></tr>';
        if (mobileListEl) {
            mobileListEl.innerHTML = '<div class="p-8 text-center text-gray-500">Không tìm thấy khách hàng nào.</div>';
        }
        updateCustomerPagination();
        return;
    }

    const startIndex = (currentCustomerPage - 1) * customersPerPage;
    const endIndex = Math.min(startIndex + customersPerPage, customersCache_filtered.length);
    const pageCustomers = customersCache_filtered.slice(startIndex, endIndex);

    pageCustomers.forEach(customer => {
        let statusInfo;
        if (customer.status === 'active') {
            statusInfo = { text: 'Đang ở', className: 'bg-green-100 text-green-800' };
        } else if (customer.status === 'moved') {
            statusInfo = { text: 'Đã chuyển đi', className: 'bg-gray-100 text-gray-800' };
        } else {
            statusInfo = { text: 'Chưa thuê', className: 'bg-yellow-100 text-yellow-800' };
        }
        
        const tr = document.createElement('tr');
        tr.className = 'border-b hover:bg-gray-50';
        tr.innerHTML = `
            <td class="py-4 px-4">
                <input type="checkbox" class="customer-checkbox w-4 h-4 cursor-pointer" data-id="${customer.originalCustomerId || customer.id}">
            </td>
            <td class="py-4 px-4">
                <div class="flex gap-3">
                    <button data-id="${customer.originalCustomerId || customer.id}" class="edit-customer-btn w-8 h-8 rounded bg-gray-500 hover:bg-gray-600 flex items-center justify-center" title="Sửa">
                        <svg class="w-4 h-4 text-white pointer-events-none" fill="currentColor" viewBox="0 0 20 20"><path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z"/></svg>
                    </button>
                    <button data-id="${customer.originalCustomerId || customer.id}" class="delete-customer-btn w-8 h-8 rounded bg-red-500 hover:bg-red-600 flex items-center justify-center" title="Xóa">
                        <svg class="w-4 h-4 text-white pointer-events-none" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd"/></svg>
                    </button>
                </div>
            </td>
            <td class="py-4 px-4 font-medium">${customer.name}</td>
            <td class="py-4 px-4">
                <a href="tel:${customer.phone}" class="text-blue-600 hover:text-blue-800 hover:underline">${customer.phone}</a>
            </td>
            <td class="py-4 px-4">${customer.buildingName || '-'}</td>
            <td class="py-4 px-4">${customer.roomName || '-'}</td>
            <td class="py-4 px-4">
                <span class="px-3 py-1 rounded-full text-xs font-semibold ${statusInfo.className}">${statusInfo.text}</span>
            </td>
        `;
        customersListEl.appendChild(tr);
        
        // 📱 RENDER MOBILE CARD
        if (mobileListEl) {
            const customerId = customer.originalCustomerId || customer.id;
            const isChecked = selectedMobileCustomerIds.has(customerId);
            const mobileCard = document.createElement('div');
            mobileCard.className = 'mobile-card';
            mobileCard.innerHTML = `
                <div class="flex items-center gap-3 mb-3 pb-3 border-b">
                    <input type="checkbox" class="customer-checkbox w-5 h-5 cursor-pointer" data-id="${customerId}" ${isChecked ? 'checked' : ''}>
                    <span class="text-xs text-gray-500 flex-1">Chọn để xóa nhiều</span>
                </div>
                <div class="mobile-card-row">
                    <span class="mobile-card-label">Họ tên:</span>
                    <span class="mobile-card-value font-semibold">${customer.name}</span>
                </div>
                <div class="mobile-card-row">
                    <span class="mobile-card-label">Số điện thoại:</span>
                    <span class="mobile-card-value">
                        <a href="tel:${customer.phone}" class="text-blue-600 hover:text-blue-800">${customer.phone}</a>
                    </span>
                </div>
                <div class="mobile-card-row">
                    <span class="mobile-card-label">Tòa nhà:</span>
                    <span class="mobile-card-value">${customer.buildingName || '-'}</span>
                </div>
                <div class="mobile-card-row">
                    <span class="mobile-card-label">Phòng:</span>
                    <span class="mobile-card-value">${customer.roomName || '-'}</span>
                </div>
                <div class="mobile-card-row">
                    <span class="mobile-card-label">Trạng thái:</span>
                    <span class="mobile-card-value">
                        <span class="px-3 py-1 rounded-full text-xs font-semibold ${statusInfo.className}">${statusInfo.text}</span>
                    </span>
                </div>
                <div class="mobile-card-actions">
                    <button data-id="${customer.originalCustomerId || customer.id}" class="edit-customer-btn bg-gray-500 hover:bg-gray-600 text-white">
                        <svg class="w-4 h-4 pointer-events-none" fill="currentColor" viewBox="0 0 20 20"><path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z"/></svg>
                        Sửa
                    </button>
                    <button data-id="${customer.originalCustomerId || customer.id}" class="delete-customer-btn bg-red-500 hover:bg-red-600 text-white">
                        <svg class="w-4 h-4 pointer-events-none" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd"/></svg>
                        Xóa
                    </button>
                </div>
            `;
            mobileListEl.appendChild(mobileCard);
        }
    });

    updateCustomerPagination();
    
    // Ẩn nút action theo quyền (với timeout để đảm bảo DOM đã render)
    setTimeout(() => {
        if (window.hideActionButtons && typeof window.hideActionButtons === 'function') {
            window.hideActionButtons('customers');
        }
    }, 100);
}

/**
 * Cập nhật thông tin phân trang
 */
function updateCustomerPagination() {
    const totalItems = customersCache_filtered.length;
    const totalPages = Math.ceil(totalItems / customersPerPage);
    const startIndex = (currentCustomerPage - 1) * customersPerPage + 1;
    const endIndex = Math.min(currentCustomerPage * customersPerPage, totalItems);

    showingStartEl.textContent = totalItems > 0 ? startIndex : 0;
    showingEndEl.textContent = endIndex;
    totalEl.textContent = totalItems;
    pageInfoEl.textContent = `Trang ${currentCustomerPage} / ${totalPages || 1}`;
    
    prevBtn.disabled = currentCustomerPage === 1;
    nextBtn.disabled = currentCustomerPage >= totalPages;
}

/**
 * Cập nhật thống kê khách hàng
 */
function updateCustomerStats(total, customersWithInfo) {
    const active = customersWithInfo.filter(c => c.status === 'active').length;
    const moved = customersWithInfo.filter(c => c.status === 'moved').length;
    
    totalCustomersEl.textContent = total;
    activeCustomersEl.textContent = active;
    movedCustomersEl.textContent = moved;
}

/**
 * Cập nhật dropdown bộ lọc
 */
function updateCustomerFilterOptions(customers, buildings) {
    // Lọc Tòa nhà
    const currentBuilding = filterBuildingEl.value;
    filterBuildingEl.innerHTML = '<option value="">Tòa nhà</option>';
    buildings.forEach(building => {
        filterBuildingEl.innerHTML += `<option value="${building.code}">${building.code}</option>`;
    });
    filterBuildingEl.value = currentBuilding;

    // Lọc Phòng
    const selectedBuildingCode = filterBuildingEl.value;
    const currentRoom = filterRoomEl.value;
    filterRoomEl.innerHTML = '<option value="">Phòng</option>';
    
    let rooms = [];
    if (selectedBuildingCode) {
        const building = buildings.find(b => b.code === selectedBuildingCode);
        if (building) rooms = building.rooms || [];
    } else {
        rooms = [...new Set(customers.map(c => c.roomName).filter(r => r))].sort();
    }
    
    rooms.forEach(room => {
        filterRoomEl.innerHTML += `<option value="${room}">${room}</option>`;
    });
    filterRoomEl.value = currentRoom;
}

/**
 * Xử lý sự kiện click
 */
async function handleBodyClick(e) {
    const target = e.target;
    const id = target.dataset.id;

    // Nút "Thêm khách hàng"
    if (target.id === 'add-customer-btn' || target.closest('#add-customer-btn')) {
        customerModalTitle.textContent = 'Thêm Khách hàng';
        customerForm.reset();
        document.getElementById('customer-id').value = '';
        openModal(customerModal);
    }
    // Nút "Sửa"
    else if (target.classList.contains('edit-customer-btn')) {
        const customer = getCustomers().find(c => c.id === id);
        if (customer) {
            customerModalTitle.textContent = 'Sửa Khách hàng';
            document.getElementById('customer-id').value = customer.id;
            document.getElementById('customer-name').value = customer.name;
            document.getElementById('customer-phone').value = customer.phone;
            openModal(customerModal);
        }
    }
    // Nút "Xóa"
    else if (target.classList.contains('delete-customer-btn')) {
        const confirmed = await showConfirm('Bạn có chắc muốn xóa khách hàng này?', 'Xác nhận xóa');
        if (confirmed) {
            try {
                // Delete Firebase
                await deleteDoc(doc(db, 'customers', id));
                
                // Delete localStorage
                deleteFromLocalStorage('customers', id);
                showToast('Xóa khách hàng thành công!');
            } catch (error) {
                showToast('Lỗi xóa khách hàng: ' + error.message, 'error');
            }
        }
    }
    // Nút "Xóa nhiều"
    else if (target.id === 'bulk-delete-customers-btn' || target.closest('#bulk-delete-customers-btn')) {
        e.preventDefault();
        handleBulkDelete();
    }
    // Nút "Xuất Excel"
    else if (target.id === 'export-customers-btn' || target.closest('#export-customers-btn')) {
        handleExport();
    }
    // Nút "Đóng modal"
    else if (target.id === 'close-customer-modal' || target.id === 'cancel-customer-btn') {
        closeModal(customerModal);
    }
    // Checkbox mobile
    else if (target.classList.contains('customer-checkbox')) {
        const customerId = target.dataset.id;
        if (target.checked) {
            selectedMobileCustomerIds.add(customerId);
        } else {
            selectedMobileCustomerIds.delete(customerId);
        }
        updateClearSelectionButton();
    }
}

/**
 * Xử lý submit form Thêm/Sửa Khách hàng
 */
async function handleCustomerFormSubmit(e) {
    e.preventDefault();
    const id = document.getElementById('customer-id').value;
    const name = document.getElementById('customer-name').value.trim();
    const phone = document.getElementById('customer-phone').value.trim();

    if (!name || !phone) {
        showToast('Vui lòng nhập đầy đủ thông tin!', 'error');
        return;
    }

    try {
        const customerData = {
            name,
            phone,
            updatedAt: serverTimestamp()
        };

        if (id) {
            // Update Firebase
            await setDoc(doc(db, 'customers', id), customerData, { merge: true });
            
            // Update localStorage
            updateInLocalStorage('customers', id, customerData);
            showToast('Cập nhật khách hàng thành công!');
        } else {
            // Create Firebase
            customerData.createdAt = serverTimestamp();
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
            
            showToast('Thêm khách hàng thành công!');
        }

        closeModal(customerModal);
    } catch (error) {
        showToast('Lỗi lưu khách hàng: ' + error.message, 'error');
    }
}

/**
 * Xử lý Xóa nhiều
 */
async function handleBulkDelete() {
    // Lấy từ Set mobile nếu có, không thì lấy từ desktop checkboxes
    const selectedIds = selectedMobileCustomerIds.size > 0
        ? Array.from(selectedMobileCustomerIds)
        : Array.from(document.querySelectorAll('.customer-checkbox:checked')).map(cb => cb.dataset.id);
    
    if (selectedIds.length === 0) {
        showToast('Vui lòng chọn ít nhất một khách hàng để xóa!', 'warning');
        return;
    }
    
    const confirmed = await showConfirm(`Bạn có chắc muốn xóa ${selectedIds.length} khách hàng đã chọn?`, 'Xác nhận xóa');
    if (confirmed) {
        try {
            // Bulk delete Firebase + localStorage
            for (const id of selectedIds) {
                await deleteDoc(doc(db, 'customers', id));
                deleteFromLocalStorage('customers', id);
            }
            showToast(`Đá xóa ${selectedIds.length} khách hàng thành công!`);
            
            // Reset tất cả checkbox sau khi xóa thành công
            selectedMobileCustomerIds.clear();
            document.querySelectorAll('.customer-checkbox').forEach(cb => cb.checked = false);
            if (selectAllCheckbox) selectAllCheckbox.checked = false;
        } catch (error) {
            showToast('Lỗi xóa khách hàng: ' + error.message, 'error');
        }
    }
}

/**
 * Xử lý Xuất Excel
 */
function handleExport() {
    // Dùng cache đã lọc để xuất đúng nội dung đang xem
    if (customersCache_filtered.length === 0) {
        showToast('Không có dữ liệu để xuất!', 'error');
        return;
    }
    
    const data = customersCache_filtered.map(c => ({
        'Họ tên': c.name,
        'Số điện thoại': c.phone,
        'Tòa nhà': c.buildingName || '',
        'Phòng': c.roomName || '',
        'Trạng thái': c.status === 'active' ? 'Đang ở' : (c.status === 'moved' ? 'Đã chuyển đi' : 'Chưa thuê')
    }));
    
    exportToExcel(data, 'Danh_sach_khach_hang');
}

/**
 * Cập nhật hiển/ẩn nút bỏ chọn hàng loạt (chỉ hiện khi chọn >= 2)
 */
function updateClearSelectionButton() {
    const btn = document.getElementById('clear-selection-customers-btn');
    if (btn) {
        if (selectedMobileCustomerIds.size >= 2) {
            btn.classList.remove('hidden');
        } else {
            btn.classList.add('hidden');
        }
    }
}

/**
 * Khởi tạo modal Import
 */
function initImportModal() {
    const importBtn = document.getElementById('import-customers-btn');
    const closeBtn = document.getElementById('close-import-customers-modal');
    const cancelBtn = document.getElementById('cancel-import-customers-btn');
    const submitBtn = document.getElementById('submit-import-customers-btn');
    const fileInput = document.getElementById('import-customers-file');
    const fileNameEl = document.getElementById('import-customers-file-name');
    const downloadTemplateLink = document.getElementById('download-customers-template-link');

    importBtn.addEventListener('click', () => {
        fileInput.value = '';
        fileNameEl.textContent = '';
        openModal(importCustomersModal);
    });
    closeBtn.addEventListener('click', () => closeModal(importCustomersModal));
    cancelBtn.addEventListener('click', () => closeModal(importCustomersModal));

    downloadTemplateLink.addEventListener('click', () => {
        window.downloadCustomersTemplate();
    });

    fileInput.addEventListener('change', (e) => {
        fileNameEl.textContent = e.target.files[0] ? `Đã chọn: ${e.target.files[0].name}` : '';
    });

    submitBtn.addEventListener('click', async () => {
        const file = fileInput.files[0];
        if (!file) {
            showToast('Vui lòng chọn file để nhập!', 'warning');
            return;
        }

        try {
            const jsonData = await importFromExcel(file);
            if (jsonData.length === 0) {
                showToast('File không có dữ liệu!', 'warning');
                return;
            }

            let successCount = 0, errorCount = 0;
            for (const row of jsonData) {
                const name = row['Họ tên'];
                const phone = row['Số điện thoại']?.toString().trim();
                
                if (!name || !phone) {
                    errorCount++;
                    continue;
                }

                try {
                    // Import to Firebase + localStorage
                    const docRef = await addDoc(collection(db, 'customers'), {
                        name: name.toString().trim(),
                        phone: phone,
                        createdAt: serverTimestamp(),
                        updatedAt: serverTimestamp()
                    });
                    
                    // Add to localStorage với Firebase ID
                    const newItem = {
                        name: name.toString().trim(),
                        phone: phone,
                        id: docRef.id,
                        createdAt: new Date(),
                        updatedAt: new Date()
                    };
                    const state = getState();
                    state.customers.unshift(newItem);
                    
                    successCount++;
                } catch (err) {
                    errorCount++;
                }
            }
            
            // Save cache và dispatch event sau khi import xong
            if (successCount > 0) {
                saveToCache();
                document.dispatchEvent(new CustomEvent('store:customers:updated'));
            }
            
            closeModal(importCustomersModal);
            showToast(`Nhập thành công ${successCount} khách hàng${errorCount > 0 ? `, lỗi ${errorCount}` : ''}!`);
        } catch (error) {
            showToast('Lỗi nhập dữ liệu: ' + error.message, 'error');
        }
    });
}

// Hàm tiện ích parse ngày (vì nó cần dùng ở đây)
function parseDateInput(dateStr) {
    if (!dateStr) return null;
    if (dateStr instanceof Date) return dateStr;
    
    // YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        const [year, month, day] = dateStr.split('-');
        return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
    }
    // DD-MM-YYYY
    if (/^\d{2}-\d{2}-\d{4}$/.test(dateStr)) {
        const [day, month, year] = dateStr.split('-');
        return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
    }
    
    const date = new Date(dateStr);
    return !isNaN(date.getTime()) ? date : null;
}