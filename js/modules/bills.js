    // js/modules/bills.js

import { db, addDoc, setDoc, doc, deleteDoc, collection, serverTimestamp, query, where, getDocs, orderBy } from '../firebase.js';
import { getBills, getBuildings, getCustomers, getContracts, getServices, getAccounts, getTransactionCategories, getState, saveToCache, updateInLocalStorage, deleteFromLocalStorage } from '../store.js';
import { 
    showToast, openModal, closeModal, 
    formatDateDisplay, convertToDateInputFormat, parseDateInput, parseFormattedNumber, formatMoney, 
    importFromExcel, exportToExcel, showConfirm, getCurrentDateString, formatDateForStorage, safeToDate
} from '../utils.js';

// --- HÀM HELPER ---

/**
 * Tính ngày hạn thanh toán từ thông tin hóa đơn
 * Ví dụ: Hóa đơn tháng 11/2025 + Hạn = 3 → 03-11-2025
 */
function getPaymentDueDate(bill) {
    if (!bill.period || !bill.dueDate || !bill.billDate) {
        return 'N/A';
    }
    
    try {
        // Lấy năm từ ngày lập hóa đơn
        const billDate = parseDateInput(bill.billDate);
        if (!billDate) return 'N/A';
        const year = billDate.getFullYear();
        
        // Lấy tháng từ period (VD: "Tháng 11" → 11, "11" → 11)
        const monthMatch = bill.period.toString().match(/\d+/);
        const month = monthMatch ? parseInt(monthMatch[0]) : 1;
        
        // Lấy ngày từ dueDate (VD: 3 → 3)
        const day = parseInt(bill.dueDate) || 1;
        
        // Tạo ngày: dd-mm-yyyy
        const dayStr = day.toString().padStart(2, '0');
        const monthStr = month.toString().padStart(2, '0');
        
        return `${dayStr}-${monthStr}-${year}`;
    } catch (error) {
        console.error('Error calculating due date:', error);
        return 'N/A';
    }
}

// --- BIẾN CỤC BỘ CHO MODULE ---
let billsCache_filtered = []; // Cache đã lọc
let selectedMobileBillIds = new Set(); // Checkbox mobile persistent

// Pagination variables
let currentPage = 1;
const ITEMS_PER_PAGE = 100;

// --- DOM ELEMENTS (Chỉ liên quan đến Hóa đơn) ---
const billsSection = document.getElementById('bills-section');
const billsListEl = document.getElementById('bills-list');

// Stats
const totalBillAmountEl = document.getElementById('total-bill-amount');
const collectedAmountEl = document.getElementById('collected-amount');
const pendingAmountEl = document.getElementById('pending-amount');

// Filters
const filterBuildingEl = document.getElementById('filter-bill-building');
const filterRoomEl = document.getElementById('filter-bill-room');
const filterMonthEl = document.getElementById('filter-bill-month');
const filterStatusEl = document.getElementById('filter-bill-status');
const filterApprovalEl = document.getElementById('filter-bill-approval');
const searchEl = document.getElementById('bill-search');
const selectAllCheckbox = document.getElementById('select-all-bills');

// Buttons
const bulkApproveBtn = document.getElementById('bulk-approve-bills-btn');
const bulkUnapproveBtn = document.getElementById('bulk-unapprove-bills-btn');
const bulkCollectBtn = document.getElementById('bulk-collect-bills-btn');
const bulkUncollectBtn = document.getElementById('bulk-uncollect-bills-btn');

// Modals
const billModal = document.getElementById('bill-modal');
const billModalTitle = document.getElementById('bill-modal-title');
const billForm = document.getElementById('bill-form');
const billBuildingSelect = document.getElementById('bill-building');
const billRoomSelect = document.getElementById('bill-room');
const billCustomerInput = document.getElementById('bill-customer');
const billCustomerIdInput = document.getElementById('bill-customer-id');
const billPeriodSelect = document.getElementById('bill-period');
const billServicesListEl = document.getElementById('bill-services-list');
const billTotalAmountEl = document.getElementById('bill-total-amount');

const billDetailModal = document.getElementById('bill-detail-modal');

const importBillsModal = document.getElementById('import-bills-modal');
const importBillMonthSelect = document.getElementById('import-bill-month');
const importBillYearSelect = document.getElementById('import-bill-year');
const importBillBuildingSelect = document.getElementById('import-bill-building');

// --- HÀM CHÍNH ---

/**
 * Hàm khởi tạo, được gọi 1 lần duy nhất từ main.js
 */
export function initBills() {
    // Lắng nghe sự kiện từ store
    document.addEventListener('store:bills:updated', () => {
        // Luôn reload bills data và cập nhật stats, không phụ thuộc vào UI visibility
        loadBills();
    });
    // Tải lại khi dữ liệu liên quan thay đổi - luôn cập nhật cho Smart Sync
    document.addEventListener('store:buildings:updated', () => {
        loadBillFilterOptions(); 
        applyBillFilters();
    });
    document.addEventListener('store:customers:updated', () => {
        applyBillFilters();
    });
    document.addEventListener('store:contracts:updated', () => {
        applyBillFilters();
    });

    // Lắng nghe sự kiện click trên toàn trang
    document.body.addEventListener('click', handleBodyClick);
    
    // Lắng nghe form
    billForm.addEventListener('submit', handleBillFormSubmit);
    
    // Lắng nghe nút bỏ chọn hàng loạt
    document.getElementById('clear-selection-bills-btn')?.addEventListener('click', () => {
        selectedMobileBillIds.clear();
        document.querySelectorAll('.bill-checkbox').forEach(cb => cb.checked = false);
        updateClearSelectionButton();
        updateBulkApprovalButtons();
        showToast('Bỏ chọn thành công!');
    });

    // Lắng nghe bộ lọc
    filterBuildingEl.addEventListener('change', handleBuildingFilterChange);
    filterRoomEl.addEventListener('change', applyBillFilters);
    filterMonthEl.addEventListener('change', applyBillFilters);
    filterStatusEl.addEventListener('change', applyBillFilters);
    filterApprovalEl.addEventListener('change', applyBillFilters);
    searchEl.addEventListener('input', applyBillFilters);

    // Lắng nghe select all
    selectAllCheckbox.addEventListener('change', (e) => {
        document.querySelectorAll('.bill-checkbox').forEach(cb => cb.checked = e.target.checked);
        updateBulkApprovalButtons();
    });
    
    // Lắng nghe các input trong modal hóa đơn
    billBuildingSelect.addEventListener('change', handleBillBuildingChange);
    billRoomSelect.addEventListener('change', handleBillRoomChange);
    billPeriodSelect.addEventListener('change', handleBillRoomChange); // Chọn kỳ cũng load lại dịch vụ
    
    // Lắng nghe thay đổi input dịch vụ (số lượng, chỉ số, ngày)
    billServicesListEl.addEventListener('input', handleServiceInputChange);
    billServicesListEl.addEventListener('change', handleServiceInputChange); // Thêm change để bắt khi blur ra ngoài
    
    // Lắng nghe click nút xóa dịch vụ
    billServicesListEl.addEventListener('click', handleRemoveServiceClick);

    // Khởi tạo modal import
    initImportModal();
}

/**
 * Tải, lọc, và chuẩn bị dữ liệu hóa đơn
 */
export function loadBills() {
    // Cập nhật dropdown bộ lọc
    loadBillFilterOptions();
    
    // Áp dụng bộ lọc và hiển thị
    applyBillFilters();
}

/**
 * Áp dụng bộ lọc và gọi hàm render
 */
function applyBillFilters() {
    let bills = getBills();

    const buildingFilter = filterBuildingEl.value;
    const roomFilter = filterRoomEl.value;
    const monthFilter = filterMonthEl.value;
    const statusFilter = filterStatusEl.value;
    const approvalFilter = filterApprovalEl.value;
    const searchText = searchEl.value.toLowerCase();

    if (buildingFilter) {
        bills = bills.filter(bill => bill.buildingId === buildingFilter);
    }
    if (roomFilter) {
        bills = bills.filter(bill => bill.room === roomFilter);
    }
    if (monthFilter) {
        bills = bills.filter(bill => bill.period == monthFilter);
    }
    if (statusFilter) {
        if (statusFilter === 'termination') {
            bills = bills.filter(bill => bill.isTerminationBill === true);
        } else {
            bills = bills.filter(bill => !bill.isTerminationBill && bill.status === statusFilter);
        }
    }
    if (approvalFilter) {
        if (approvalFilter === 'approved') {
            bills = bills.filter(bill => bill.approved === true);
        } else if (approvalFilter === 'unapproved') {
            bills = bills.filter(bill => bill.approved !== true);
        }
    }
    if (searchText) {
        const buildings = getBuildings();
        const customers = getCustomers();
        bills = bills.filter(bill => {
            const billNumber = `INV${bill.id.slice(-6).toUpperCase()}`;
            const customer = customers.find(c => c.id === bill.customerId);
            const building = buildings.find(b => b.id === bill.buildingId);
            
            return billNumber.toLowerCase().includes(searchText) ||
                   (customer && customer.name.toLowerCase().includes(searchText)) ||
                   (building && building.code.toLowerCase().includes(searchText)) ||
                   bill.room.toLowerCase().includes(searchText);
        });
    }

    // Kiểm tra xem có lọc theo tòa nhà cụ thể không
    const isFilteringByBuilding = filterBuildingEl && filterBuildingEl.value && filterBuildingEl.value !== 'all';
    
    billsCache_filtered = bills.sort((a, b) => {
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
            const getCreatedTime = (bill) => {
                if (bill.createdAt) {
                    // Sử dụng safeToDate để xử lý cả 2 trường hợp Firebase timestamp
                    return safeToDate(bill.createdAt).getTime();
                } else {
                }
                // Fallback về billDate nếu không có createdAt
                return parseDateInput(bill.billDate) || 0;
            };
            
            return getCreatedTime(b) - getCreatedTime(a);
        }
    });
    
    // Reset về trang 1 khi filter
    currentPage = 1;
    
    renderBillsTable(billsCache_filtered);
    
    // Cập nhật thống kê theo filter
    updateBillStats();
    
    // Cập nhật summary
    updateBillsSummary(billsCache_filtered);
}

/**
 * Hiển thị dữ liệu lên bảng với phân trang
 */
function renderBillsTable(bills) {
    billsListEl.innerHTML = '';
    const mobileListEl = document.getElementById('bills-mobile-list');
    if (mobileListEl) mobileListEl.innerHTML = '';
    
    if (bills.length === 0) {
        billsListEl.innerHTML = '<tr><td colspan="9" class="p-8 text-center text-gray-500">Không tìm thấy hóa đơn nào.</td></tr>';
        if (mobileListEl) {
            mobileListEl.innerHTML = '<div class="p-8 text-center text-gray-500">Không tìm thấy hóa đơn nào.</div>';
        }
        renderPagination(0, 0);
        return;
    }
    
    // Tính toán phân trang
    const totalItems = bills.length;
    const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const endIndex = startIndex + ITEMS_PER_PAGE;
    const billsToShow = bills.slice(startIndex, endIndex);
    
    const buildings = getBuildings();
    const customers = getCustomers();
    
    billsToShow.forEach(bill => {
        const building = buildings.find(b => b.id === bill.buildingId);
        const customer = customers.find(c => c.id === bill.customerId);
        const billNumber = `INV${(bill.id || '').slice(-6).toUpperCase()}`;
        const isApproved = bill.approved === true;
        
        const tr = document.createElement('tr');
        tr.className = 'border-b hover:bg-gray-50';
        tr.innerHTML = `
            <td class="py-4 px-4">
                <input type="checkbox" class="bill-checkbox w-4 h-4 cursor-pointer" data-id="${bill.id}" data-approved="${isApproved}" data-status="${bill.status || 'unpaid'}">
            </td>
            <td class="py-4 px-4">
                <div class="flex gap-3">
                    <button data-id="${bill.id}" class="toggle-bill-approve-btn w-8 h-8 rounded flex items-center justify-center ${isApproved ? (bill.status === 'paid' ? 'bg-gray-300 cursor-not-allowed' : 'bg-gray-400 hover:bg-gray-500') : 'bg-green-500 hover:bg-green-600'}" title="${isApproved ? (bill.status === 'paid' ? 'Không thể bỏ duyệt hóa đơn đã thu tiền' : 'Bỏ duyệt') : 'Duyệt hóa đơn'}" ${isApproved && bill.status === 'paid' ? 'disabled' : ''}>
                        ${isApproved ? '<svg class="w-5 h-5 text-white pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>' : '<svg class="w-5 h-5 text-white pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>'}
                    </button>
                    <button data-id="${bill.id}" class="toggle-bill-status-btn w-8 h-8 rounded flex items-center justify-center ${(!isApproved || bill.isTerminationBill) ? 'bg-gray-300 cursor-not-allowed' : (bill.status === 'paid' ? 'bg-green-500 hover:bg-green-600' : 'bg-orange-500 hover:bg-orange-600')}" title="${bill.isTerminationBill ? 'Không thể thu tiền hóa đơn thanh lý' : (!isApproved ? 'Phải duyệt hóa đơn trước khi thu tiền' : (bill.status === 'paid' ? 'Đã thanh toán' : 'Thu tiền'))}" ${(!isApproved || bill.isTerminationBill) ? 'disabled' : ''}>
                        ${bill.status === 'paid' ? '<svg class="w-5 h-5 text-white pointer-events-none" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/></svg>' : '<svg class="w-5 h-5 text-white pointer-events-none" fill="currentColor" viewBox="0 0 20 20"><path d="M8.433 7.418c.155-.103.346-.196.567-.267v1.698a2.305 2.305 0 01-.567-.267C8.07 8.34 8 8.114 8 8c0-.114.07-.34.433-.582zM11 12.849v-1.698c.22.071.412.164.567.267.364.243.433.468.433.582 0 .114-.07.34-.433.582a2.305 2.305 0 01-.567.267z"/><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-13a1 1 0 10-2 0v.092a4.535 4.535 0 00-1.676.662C6.602 6.234 6 7.009 6 8c0 .99.602 1.765 1.324 2.246.48.32 1.054.545 1.676.662v1.941c-.391-.127-.68-.317-.843-.504a1 1 0 10-1.51 1.31c.562.649 1.413 1.076 2.353 1.253V15a1 1 0 102 0v-.092a4.535 4.535 0 001.676-.662C13.398 13.766 14 12.991 14 12c0-.99-.602-1.765-1.324-2.246A4.535 4.535 0 0011 9.092V7.151c.391.127.68.317.843.504a1 1 0 101.511-1.31c-.563-.649-1.413-1.076-2.354-1.253V5z" clip-rule="evenodd"/></svg>'}
                    </button>
                    <button data-id="${bill.id}" class="edit-bill-btn w-8 h-8 rounded ${(isApproved || bill.isTerminationBill) ? 'bg-gray-300 cursor-not-allowed' : 'bg-gray-500 hover:bg-gray-600'} flex items-center justify-center" title="${bill.isTerminationBill ? 'Không thể sửa hóa đơn thanh lý' : (isApproved ? 'Không thể sửa hóa đơn đã duyệt' : 'Sửa')}" ${(isApproved || bill.isTerminationBill) ? 'disabled' : ''}>
                        <svg class="w-4 h-4 text-white pointer-events-none" fill="currentColor" viewBox="0 0 20 20"><path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z"/></svg>
                    </button>
                    <button data-id="${bill.id}" class="delete-bill-btn w-8 h-8 rounded ${isApproved ? 'bg-gray-300 cursor-not-allowed' : 'bg-red-500 hover:bg-red-600'} flex items-center justify-center" title="${isApproved ? 'Không thể xóa hóa đơn đã duyệt' : 'Xóa'}" ${isApproved ? 'disabled' : ''}>
                        <svg class="w-4 h-4 text-white pointer-events-none" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd"/></svg>
                    </button>
                </div>
            </td>
            <td class="py-4 px-4 font-medium text-blue-600 hover:text-blue-800 cursor-pointer view-bill-link" data-id="${bill.id}" title="Click để xem chi tiết">${billNumber}</td>
            <td class="py-4 px-4">
                <div>
                    <div class="font-medium">${customer ? customer.name : 'N/A'}</div>
                    <div class="text-sm text-gray-500">${building ? building.code : 'N/A'} - ${bill.room}</div>
                </div>
            </td>
            <td class="py-4 px-4">${bill.isTerminationBill ? '-' : `Tháng ${bill.period}`}</td>
            <td class="py-4 px-4">${bill.isTerminationBill ? '-' : formatMoney(bill.totalAmount)}</td>
            <td class="py-4 px-4">${bill.isTerminationBill ? '-' : formatMoney(bill.paidAmount || 0)}</td>
            <td class="py-4 px-4">
                <span class="px-2 py-1 rounded-full text-xs font-medium ${bill.isTerminationBill ? (bill.approved ? 'bg-gray-100 text-gray-800' : 'bg-orange-100 text-orange-800') : (bill.status === 'paid' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800')}">
                    ${bill.isTerminationBill ? (bill.approved ? 'Đã thanh lý' : 'Chờ thanh lý') : (bill.status === 'paid' ? 'Đã thanh toán' : 'Chưa thanh toán')}
                </span>
            </td>
        `;
        billsListEl.appendChild(tr);
        
        // 📱 RENDER MOBILE CARD
        if (mobileListEl) {
            const isChecked = selectedMobileBillIds.has(bill.id);
            const mobileCard = document.createElement('div');
            mobileCard.className = 'mobile-card';
            mobileCard.innerHTML = `
                <div class="flex items-center gap-3 mb-3 pb-3 border-b">
                    <input type="checkbox" class="bill-checkbox w-5 h-5 cursor-pointer" data-id="${bill.id}" data-approved="${isApproved}" data-status="${bill.status || 'unpaid'}" ${isChecked ? 'checked' : ''}>
                    <span class="text-xs text-gray-500 flex-1">Chọn để xóa nhiều</span>
                </div>
                <div class="mobile-card-row">
                    <span class="mobile-card-label">Mã hóa đơn:</span>
                    <span class="mobile-card-value font-semibold text-blue-600 view-bill-link cursor-pointer" data-id="${bill.id}">${billNumber}</span>
                </div>
                <div class="mobile-card-row">
                    <span class="mobile-card-label">Khách hàng:</span>
                    <span class="mobile-card-value font-medium">${customer ? customer.name : 'N/A'}</span>
                </div>
                <div class="mobile-card-row">
                    <span class="mobile-card-label">Phòng:</span>
                    <span class="mobile-card-value">${building ? building.code : 'N/A'} - ${bill.room}</span>
                </div>
                <div class="mobile-card-row">
                    <span class="mobile-card-label">Kỳ thanh toán:</span>
                    <span class="mobile-card-value">${bill.isTerminationBill ? '-' : `Tháng ${bill.period}`}</span>
                </div>
                <div class="mobile-card-row">
                    <span class="mobile-card-label">Tổng tiền:</span>
                    <span class="mobile-card-value font-bold ${bill.isTerminationBill ? 'text-gray-500' : 'text-green-600'}">${bill.isTerminationBill ? '-' : formatMoney(bill.totalAmount)}</span>
                </div>
                <div class="mobile-card-row">
                    <span class="mobile-card-label">Đã thanh toán:</span>
                    <span class="mobile-card-value">${bill.isTerminationBill ? '-' : formatMoney(bill.paidAmount || 0)}</span>
                </div>
                <div class="mobile-card-row">
                    <span class="mobile-card-label">Trạng thái:</span>
                    <span class="mobile-card-value">
                        <span class="px-2 py-1 rounded-full text-xs font-medium ${bill.isTerminationBill ? (bill.approved ? 'bg-gray-100 text-gray-800' : 'bg-orange-100 text-orange-800') : (bill.status === 'paid' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800')}">
                            ${bill.isTerminationBill ? (bill.approved ? 'Đã thanh lý' : 'Chờ thanh lý') : (bill.status === 'paid' ? 'Đã thanh toán' : 'Chưa thanh toán')}
                        </span>
                    </span>
                </div>
                <div class="mobile-card-actions">
                    <button data-id="${bill.id}" class="toggle-bill-approve-btn ${isApproved ? (bill.status === 'paid' ? 'bg-gray-300 cursor-not-allowed' : 'bg-gray-400 hover:bg-gray-500') : 'bg-green-500 hover:bg-green-600'} text-white" ${isApproved && bill.status === 'paid' ? 'disabled title="Không thể bỏ duyệt hóa đơn đã thu tiền"' : ''}>
                        ${isApproved ? '<svg class="w-4 h-4 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>' : '<svg class="w-4 h-4 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>'}
                        ${isApproved ? 'Bỏ duyệt' : 'Duyệt'}
                    </button>
                    <button data-id="${bill.id}" class="toggle-bill-status-btn ${(!isApproved || bill.isTerminationBill) ? 'bg-gray-300 cursor-not-allowed' : (bill.status === 'paid' ? 'bg-green-500 hover:bg-green-600' : 'bg-orange-500 hover:bg-orange-600')} text-white" ${(!isApproved || bill.isTerminationBill) ? 'disabled' : ''}>
                        ${bill.status === 'paid' ? '<svg class="w-4 h-4 pointer-events-none" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/></svg>' : '<svg class="w-4 h-4 pointer-events-none" fill="currentColor" viewBox="0 0 20 20"><path d="M8.433 7.418c.155-.103.346-.196.567-.267v1.698a2.305 2.305 0 01-.567-.267C8.07 8.34 8 8.114 8 8c0-.114.07-.34.433-.582zM11 12.849v-1.698c.22.071.412.164.567.267.364.243.433.468.433.582 0 .114-.07.34-.433.582a2.305 2.305 0 01-.567.267z"/><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-13a1 1 0 10-2 0v.092a4.535 4.535 0 00-1.676.662C6.602 6.234 6 7.009 6 8c0 .99.602 1.765 1.324 2.246.48.32 1.054.545 1.676.662v1.941c-.391-.127-.68-.317-.843-.504a1 1 0 10-1.51 1.31c.562.649 1.413 1.076 2.353 1.253V15a1 1 0 102 0v-.092a4.535 4.535 0 001.676-.662C13.398 13.766 14 12.991 14 12c0-.99-.602-1.765-1.324-2.246A4.535 4.535 0 0011 9.092V7.151c.391.127.68.317.843.504a1 1 0 101.511-1.31c-.563-.649-1.413-1.076-2.354-1.253V5z" clip-rule="evenodd"/></svg>'}
                        ${bill.status === 'paid' ? 'Đã thu' : 'Thu tiền'}
                    </button>
                    <button data-id="${bill.id}" class="edit-bill-btn ${(isApproved || bill.isTerminationBill) ? 'bg-gray-300 cursor-not-allowed' : 'bg-gray-500 hover:bg-gray-600'} text-white" ${(isApproved || bill.isTerminationBill) ? 'disabled' : ''}>
                        <svg class="w-4 h-4 pointer-events-none" fill="currentColor" viewBox="0 0 20 20"><path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z"/></svg>
                        Sửa
                    </button>
                    <button data-id="${bill.id}" class="delete-bill-btn ${isApproved ? 'bg-gray-300 cursor-not-allowed' : 'bg-red-500 hover:bg-red-600'} text-white" ${isApproved ? 'disabled' : ''}>
                        <svg class="w-4 h-4 pointer-events-none" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd"/></svg>
                        Xóa
                    </button>
                </div>
            `;
            mobileListEl.appendChild(mobileCard);
        }
    });
    
    // Ẩn nút action theo quyền (với timeout để đảm bảo DOM đã render)
    setTimeout(() => {
        if (window.hideActionButtons && typeof window.hideActionButtons === 'function') {
            window.hideActionButtons('bills');
        }
    }, 100);
    
    // Render pagination
    renderPagination(totalItems, totalPages);
}

/**
 * Hiển thị phân trang
 */
function renderPagination(totalItems, totalPages) {
    const paginationContainer = document.getElementById('bills-pagination');
    if (!paginationContainer) return;
    
    if (totalPages <= 1) {
        paginationContainer.innerHTML = '';
        return;
    }
    
    let paginationHTML = `
        <div class="flex items-center justify-between mt-6">
            <div class="text-sm text-gray-700">
                Hiển thị ${((currentPage - 1) * ITEMS_PER_PAGE) + 1}-${Math.min(currentPage * ITEMS_PER_PAGE, totalItems)} trong ${totalItems} hóa đơn
            </div>
            <div class="flex items-center gap-2">
    `;
    
    // Previous button
    paginationHTML += `
        <button onclick="changePage(${currentPage - 1})" 
                ${currentPage === 1 ? 'disabled' : ''} 
                class="px-3 py-2 text-sm border rounded-md ${currentPage === 1 ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-white text-gray-700 hover:bg-gray-50'}">
            Trước
        </button>
    `;
    
    // Page numbers
    const maxVisiblePages = 5;
    let startPage = Math.max(1, currentPage - Math.floor(maxVisiblePages / 2));
    let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);
    
    if (endPage - startPage + 1 < maxVisiblePages) {
        startPage = Math.max(1, endPage - maxVisiblePages + 1);
    }
    
    for (let i = startPage; i <= endPage; i++) {
        paginationHTML += `
            <button onclick="changePage(${i})" 
                    class="px-3 py-2 text-sm border rounded-md ${i === currentPage ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}">
                ${i}
            </button>
        `;
    }
    
    // Next button
    paginationHTML += `
        <button onclick="changePage(${currentPage + 1})" 
                ${currentPage === totalPages ? 'disabled' : ''} 
                class="px-3 py-2 text-sm border rounded-md ${currentPage === totalPages ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-white text-gray-700 hover:bg-gray-50'}">
            Sau
        </button>
    `;
    
    paginationHTML += '</div></div>';
    paginationContainer.innerHTML = paginationHTML;
}

/**
 * Thay đổi trang
 */
window.changePage = function(page) {
    const totalPages = Math.ceil(billsCache_filtered.length / ITEMS_PER_PAGE);
    if (page < 1 || page > totalPages) return;
    
    currentPage = page;
    renderBillsTable(billsCache_filtered);
}

/**
 * Cập nhật thống kê
 */
function updateBillStats() {
    // Sử dụng data đã được filter thay vì toàn bộ data
    const bills = billsCache_filtered;
    
    const totalAmount = bills.reduce((sum, bill) => sum + (bill.totalAmount || 0), 0);
    const collectedAmount = bills.filter(bill => bill.status === 'paid').reduce((sum, bill) => sum + (bill.totalAmount || 0), 0);
    const pendingAmount = totalAmount - collectedAmount;
    
    totalBillAmountEl.textContent = formatMoney(totalAmount) + ' VNĐ';
    collectedAmountEl.textContent = formatMoney(collectedAmount) + ' VNĐ';
    pendingAmountEl.textContent = formatMoney(pendingAmount) + ' VNĐ';
}

/**
 * Tải các dropdown bộ lọc
 */
function loadBillFilterOptions() {
    const buildings = getBuildings();
    const currentBuilding = filterBuildingEl.value;
    
    filterBuildingEl.innerHTML = '<option value="">Tất cả tòa nhà</option>';
    buildings.forEach(building => {
        filterBuildingEl.innerHTML += `<option value="${building.id}">${building.code}</option>`;
    });
    filterBuildingEl.value = currentBuilding;
    
    // Cập nhật phòng
    handleBuildingFilterChange();
}

/**
 * Xử lý khi thay đổi bộ lọc Tòa nhà
 */
function handleBuildingFilterChange() {
    const selectedBuildingId = filterBuildingEl.value;
    const currentRoom = filterRoomEl.value;
    filterRoomEl.innerHTML = '<option value="">Tất cả phòng</option>';
    
    if (selectedBuildingId) {
        const building = getBuildings().find(b => b.id === selectedBuildingId);
        if (building && building.rooms) {
            building.rooms.forEach(room => {
                filterRoomEl.innerHTML += `<option value="${room}">${room}</option>`;
            });
        }
    }
    filterRoomEl.value = currentRoom;
    applyBillFilters();
}

/**
 * Xử lý sự kiện click
 */
async function handleBodyClick(e) {
    const target = e.target.closest('button') || e.target;
    const id = target.dataset.id;

    // Nút "Thêm hóa đơn"
    if (target.id === 'add-bill-btn') {
        openBillModal();
    }
    // Nút "Sửa"
    else if (target.classList.contains('edit-bill-btn')) {
        // Kiểm tra xem hóa đơn đã duyệt chưa
        const bill = getBills().find(b => b.id === id);
        if (bill && bill.approved) {
            showToast('Không thể sửa hóa đơn đã duyệt!', 'error');
            return;
        }
        openBillModal({ billId: id });
    }
    // Nút "Xóa"
    else if (target.classList.contains('delete-bill-btn')) {
        // Kiểm tra xem hóa đơn đã duyệt chưa
        const bill = getBills().find(b => b.id === id);
        if (bill && bill.approved) {
            showToast('Không thể xóa hóa đơn đã duyệt!', 'error');
            return;
        }
        if (confirm('Bạn có chắc chắn muốn xóa hóa đơn này?')) {
            await deleteBill(id);
        }
    }
    // Nút "Duyệt/Bỏ duyệt"
    else if (target.classList.contains('toggle-bill-approve-btn')) {
        console.log('🖱️ Approve button clicked for bill ID:', id);
        await toggleBillApproval(id);
    }
    // Nút "Thu tiền/Hủy thu"
    else if (target.classList.contains('toggle-bill-status-btn')) {
        // Kiểm tra xem hóa đơn đã duyệt chưa
        const bill = getBills().find(b => b.id === id);
        if (bill && !bill.approved) {
            showToast('Phải duyệt hóa đơn trước khi thu tiền!', 'error');
            return;
        }
        
        if (bill.status === 'paid') {
            // Hủy thu tiền - xử lý trực tiếp
            await toggleBillStatus(id);
        } else {
            // Thu tiền - mở modal chọn ngày
            openPaymentModal(id);
        }
        
        // Nếu modal chi tiết đang mở, reload lại để cập nhật paidAmount
        const billDetailModal = document.getElementById('bill-detail-modal');
        if (billDetailModal && !billDetailModal.classList.contains('hidden')) {
            console.log('🔄 Reloading bill detail after toggle status');
            // Đợi 500ms để Firestore cập nhật xong
            setTimeout(() => {
                showBillDetail(id);
            }, 500);
        }
    }
    // Link xem chi tiết
    else if (target.classList.contains('view-bill-link')) {
        showBillDetail(id);
    }
    // Nút "In"
    else if (target.id === 'print-bill-btn') {
        window.print();
    }
    // Nút "Duyệt hàng loạt"
    else if (target.id === 'bulk-approve-bills-btn') {
        await bulkApprove(true);
    }
    // Nút "Bỏ duyệt hàng loạt"
    else if (target.id === 'bulk-unapprove-bills-btn') {
        await bulkApprove(false);
    }
    // Nút "Thu tiền hàng loạt"
    else if (target.id === 'bulk-collect-bills-btn') {
        openBulkPaymentModal();
    }
    // Nút "Hủy thu tiền hàng loạt"
    else if (target.id === 'bulk-uncollect-bills-btn') {
        await bulkUncollect();
    }
    // Nút "Xóa hàng loạt" (desktop hoặc mobile)
    else if (target.id === 'bulk-delete-bills-btn') {
        await bulkDelete();
    }
    // Nút "Xuất Excel"
    else if (target.id === 'export-bills-btn') {
        handleExport();
    }
    // Nút "Thêm dịch vụ tùy chỉnh"
    else if (target.id === 'add-custom-service-btn') {
        addCustomServiceRow();
    }
    // Nút "Xóa dịch vụ tùy chỉnh"
    else if (target.classList.contains('remove-custom-service-btn')) {
        target.closest('tr').remove();
        calculateBillTotal();
    }
    // Checkbox mobile
    else if (target.classList.contains('bill-checkbox')) {
        const billId = target.dataset.id;
        if (target.checked) {
            selectedMobileBillIds.add(billId);
        } else {
            selectedMobileBillIds.delete(billId);
        }
        updateClearSelectionButton();
        updateBulkApprovalButtons();
    }
    // Đóng modal
    else if (target.id === 'close-bill-modal' || target.id === 'cancel-bill-btn') {
        closeModal(billModal);
    }
    else if (target.id === 'close-bill-detail-modal') {
        // Restore body scroll khi đóng modal trên mobile
        if (window.innerWidth <= 768) {
            document.body.style.overflow = '';
            document.body.style.position = '';
            document.body.style.width = '';
            document.body.style.height = '';
        }
        closeModal(billDetailModal);
    }
    // Modal thu tiền
    else if (target.id === 'close-payment-modal' || target.id === 'cancel-payment-btn') {
        closeModal(document.getElementById('payment-modal'));
    }
    else if (target.id === 'confirm-payment-btn') {
        await handleSinglePaymentConfirm();
    }
    // Modal thu tiền hàng loạt
    else if (target.id === 'close-bulk-payment-modal' || target.id === 'cancel-bulk-payment-btn') {
        closeModal(document.getElementById('bulk-payment-modal'));
    }
    else if (target.id === 'confirm-bulk-payment-btn') {
        await handleBulkPaymentConfirm();
    }
}

/**
 * Mở modal Thêm/Sửa Hóa đơn
 */
function openBillModal(options = {}) {
    const { billId } = options;
    billForm.reset();
    loadBillModalBuildings();
    
    if (billId) {
        // Chế độ Sửa
        billModalTitle.textContent = "Sửa Hóa đơn";
        document.getElementById('bill-id').value = billId;
        
        const bill = getBills().find(b => b.id === billId);
        if (bill) {
            billBuildingSelect.value = bill.buildingId;
            loadBillModalRooms(bill.buildingId);
            billRoomSelect.value = bill.room;
            billPeriodSelect.value = bill.period;
            document.getElementById('bill-date').value = formatDateDisplay(bill.billDate);
            document.getElementById('bill-due-date').value = bill.dueDate || 3;

            const customer = getCustomers().find(c => c.id === bill.customerId);
            if (customer) {
                billCustomerInput.value = customer.name;
                billCustomerIdInput.value = customer.id;
            }
            
            // Tải lại dịch vụ đã lưu
            console.log('Editing bill - services data:', bill.services);
            
            // Trước khi render services, cần load building services và contract để có đầy đủ thông tin
            const building = getBuildings().find(b => b.id === bill.buildingId);
            const contract = getContracts().find(c => c.buildingId === bill.buildingId && c.room === bill.room);
            
            if (building && building.services) {
                // Merge dữ liệu từ building.services với bill.services
                const mergedServices = (bill.services || []).map(billService => {
                    const buildingService = building.services.find(bs => bs.id === billService.serviceId);
                    
                    let finalUnitPrice = billService.unitPrice ?? (buildingService ? buildingService.price : 0);
                    
                    // ĐẶC BIỆT với tiền nhà: luôn lấy giá từ hợp đồng
                    if (billService.type === 'rent' && contract) {
                        finalUnitPrice = contract.rentPrice || 0;
                    }
                    
                    // GIỮ NGUYÊN tất cả dữ liệu từ billService, chỉ bổ sung thiếu từ buildingService
                    return {
                        ...billService, // Giữ nguyên TẤT CẢ: quantity, fromDate, toDate, oldReading, newReading, amount, v.v.
                        // CHỈ bổ sung nếu thiếu
                        unitPrice: finalUnitPrice,
                        unit: billService.unit || (buildingService ? buildingService.unit : 'tháng'),
                        serviceId: billService.serviceId || (buildingService ? buildingService.id : ''),
                        type: billService.type || (buildingService ? buildingService.type : 'service')
                    };
                });
                renderSavedBillServices(mergedServices);
            } else {
                renderSavedBillServices(bill.services || []);
            }
        }
    } else {
        // Chế độ Thêm mới
        billModalTitle.textContent = "Tạo Hóa đơn";
        document.getElementById('bill-id').value = '';
        document.getElementById('bill-date').value = formatDateDisplay(new Date());
        billRoomSelect.innerHTML = '<option value="">-- Chọn phòng --</option>';
        clearBillServices();
    }
    
    openModal(billModal);
}

/**
 * Xử lý submit form Thêm/Sửa Hóa đơn
 */
async function handleBillFormSubmit(e) {
    e.preventDefault();
    
    const billId = document.getElementById('bill-id').value;
    const buildingId = billBuildingSelect.value;
    const room = billRoomSelect.value;
    const customerId = billCustomerIdInput.value;
    const period = billPeriodSelect.value;
    const billDate = document.getElementById('bill-date').value;
    const dueDate = parseInt(document.getElementById('bill-due-date').value) || 3;
    
    if (!buildingId || !room || !customerId || !period || !billDate) {
        return showToast('Vui lòng điền đầy đủ thông tin!', 'error');
    }
    
    const totalAmount = parseFormattedNumber(billTotalAmountEl.textContent);
    if (totalAmount <= 0) {
        return showToast('Tổng tiền phải lớn hơn 0!', 'error');
    }
    
    const services = [];
    document.querySelectorAll('#bill-services-list tr').forEach(row => {
        // Lấy tên dịch vụ: với dịch vụ tùy chỉnh thì lấy từ input, với dịch vụ thường thì lấy từ textContent
        const serviceNameEl = row.querySelector('td:first-child');
        const serviceNameInput = serviceNameEl?.querySelector('input.service-name');
        const serviceName = serviceNameInput ? serviceNameInput.value.trim() : (serviceNameEl ? serviceNameEl.textContent.trim() : 'Unknown Service');
        const totalText = row.querySelector('.service-total').textContent;
        const amount = parseFormattedNumber(totalText);
        
        console.log('Processing service row:', {
            serviceName,
            totalText,
            amount,
            unitPrice: parseFloat(row.dataset.price) || 0,
            rowDataset: row.dataset,
            rowHtml: row.outerHTML.substring(0, 200) + '...'
        });
        // Lấy input ngày tháng: ưu tiên từ class specific, fallback về querySelectorAll
        const fromDateEl = row.querySelector('.custom-from-date') || row.querySelectorAll('input[type="text"]')[0];
        const toDateEl = row.querySelector('.custom-to-date') || row.querySelectorAll('input[type="text"]')[1];
        
        const unitPrice = parseFloat(row.dataset.price) || parseFormattedNumber(row.querySelector('.custom-service-price')?.value) || 0;
        
        // Format ngày không bị ảnh hưởng timezone
        let formattedFromDate = null;
        let formattedToDate = null;
        if (fromDateEl && fromDateEl.value) {
            const fromDateObj = parseDateInput(fromDateEl.value);
            if (fromDateObj) {
                formattedFromDate = `${fromDateObj.getFullYear()}-${String(fromDateObj.getMonth() + 1).padStart(2, '0')}-${String(fromDateObj.getDate()).padStart(2, '0')}`;
            }
        }
        if (toDateEl && toDateEl.value) {
            const toDateObj = parseDateInput(toDateEl.value);
            if (toDateObj) {
                formattedToDate = `${toDateObj.getFullYear()}-${String(toDateObj.getMonth() + 1).padStart(2, '0')}-${String(toDateObj.getDate()).padStart(2, '0')}`;
            }
        }
        
        const serviceDetail = {
            name: serviceName, // Thêm trường name để lưu tên dịch vụ
            serviceName, // Giữ lại để tương thích
            amount,
            fromDate: formattedFromDate,
            toDate: formattedToDate,
            type: row.dataset.type || 'custom',
            serviceId: row.dataset.serviceId || null,
            unitPrice: unitPrice,
            unit: row.dataset.unit || '',
        };
        
        console.log('Service detail being saved:', serviceDetail);

        if (serviceDetail.type === 'electric' || serviceDetail.type === 'water_meter') {
            serviceDetail.oldReading = parseInt(row.querySelector('.electric-old-reading').value) || 0;
            serviceDetail.newReading = parseInt(row.querySelector('.electric-new-reading').value) || 0;
            serviceDetail.quantity = serviceDetail.newReading - serviceDetail.oldReading;
        } else {
            // LẤY SỐ LƯỢNG GỐC TỪ HỢP ĐỒNG, KHÔNG TỪ INPUT (có thể đã bị thay đổi)
            const buildingId = billBuildingSelect.value;
            const roomValue = billRoomSelect.value;
            const contract = getContracts().find(c => c.buildingId === buildingId && c.room === roomValue);
            
            let originalQuantity = parseInt(row.querySelector('.service-quantity')?.value) || 1; // Mặc định từ input
            
            // Nếu có hợp đồng, lấy số lượng từ hợp đồng
            if (contract && contract.services) {
                const serviceName = row.querySelector('.service-name')?.textContent?.trim() || '';
                const contractService = contract.services.find(s => 
                    s.id === serviceDetail.serviceId || 
                    s.serviceId === serviceDetail.serviceId ||
                    (s.name && s.name.toLowerCase() === serviceName.toLowerCase())
                );
                if (contractService && contractService.quantity) {
                    originalQuantity = contractService.quantity; // SỐ LƯỢNG TỪ HỢP ĐỒNG
                }
            }
            
            serviceDetail.quantity = originalQuantity;
            
            // Đặc biệt với tiền nhà, đảm bảo unitPrice đúng
            if (serviceDetail.type === 'rent' && serviceDetail.quantity > 0) {
                serviceDetail.unitPrice = serviceDetail.amount / serviceDetail.quantity;
            }
        }
        
        services.push(serviceDetail);
    });

    try {
        console.log('Bill form data:', {
            buildingId, room, customerId, period, 
            billDate, dueDate, services, totalAmount
        });
        
        // Format ngày về YYYY-MM-DD mà không bị ảnh hưởng timezone
        const billDateObj = parseDateInput(billDate);
        const formattedBillDate = `${billDateObj.getFullYear()}-${String(billDateObj.getMonth() + 1).padStart(2, '0')}-${String(billDateObj.getDate()).padStart(2, '0')}`;
        
        // Lấy tên khách hàng để lưu luôn vào hóa đơn
        const customer = getCustomers().find(c => c.id === customerId);
        const customerName = customer ? customer.name : '';
        
        const billData = {
            buildingId, room, customerId, customerName,
            period, 
            billDate: formattedBillDate, 
            dueDate,
            services,
            totalAmount,
            updatedAt: serverTimestamp()
        };
        
        console.log('Final bill data:', billData);

        if (billId) {
            // Update Firebase
            await setDoc(doc(db, 'bills', billId), billData, { merge: true });
            
            // Update localStorage
            updateInLocalStorage('bills', billId, billData);
            
            // Dispatch event để UI cập nhật ngay
            window.dispatchEvent(new CustomEvent('store:bills:updated'));
            
            showToast('Cập nhật Hóa đơn thành công!');
        } else {
            // Create Firebase
            billData.id = generateId(); // Tạo ID ở client
            billData.status = 'unpaid';
            billData.approved = false;
            billData.paidAmount = 0; // ĐẶT RÕ RÀNG = 0 KHI TẠO MỚI
            billData.createdAt = serverTimestamp();
            await setDoc(doc(db, 'bills', billData.id), billData);
            
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
            
            showToast('Tạo Hóa đơn thành công!');
        }
        
        closeModal(billModal);
        // Store listener sẽ tự động cập nhật
    } catch (error) {
        showToast('Lỗi lưu hóa đơn: ' + error.message, 'error');
    }
}

// ... (Các hàm khác: deleteBill, toggleBillApproval, toggleBillStatus, bulkApprove, bulkDelete, ... )
// ... (Các hàm modal: showBillDetail, loadBillModalBuildings, loadBillModalRooms, ...)
// ... (Các hàm tính toán dịch vụ: loadBillServices, addCustomServiceRow, calculateBillTotal, ...)
// ... (Các hàm import/export: initImportModal, downloadBillTemplate, handleImportSubmit, ...)

// --- HÀM XỬ LÝ LOGIC ---

async function deleteBill(billId) {
    try {
        const bill = getBills().find(b => b.id === billId);
        
        // Nếu là hóa đơn thanh lý, cập nhật lại hợp đồng
        if (bill && bill.isTerminationBill && bill.contractId) {
            const contract = getContracts().find(c => c.id === bill.contractId);
            if (contract) {
                // Tính toán trạng thái hợp đồng mới dựa trên ngày hết hạn
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                const endDate = new Date(contract.endDate);
                endDate.setHours(0, 0, 0, 0);
                
                let newStatus = 'active';
                const diffTime = endDate.getTime() - today.getTime();
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                
                if (diffDays < 0) newStatus = 'expired';
                else if (diffDays <= 30) newStatus = 'expiring';
                
                // Cập nhật hợp đồng về trạng thái chưa thanh lý
                await setDoc(doc(db, 'contracts', bill.contractId), {
                    status: newStatus,
                    terminatedAt: null,
                    terminationBillId: null,
                    updatedAt: serverTimestamp()
                }, { merge: true });
                
                // 🔥 Cập nhật localStorage cho hợp đồng
                updateInLocalStorage('contracts', bill.contractId, {
                    status: newStatus,
                    terminatedAt: null,
                    terminationBillId: null,
                    updatedAt: new Date()
                });
                
                console.log('✅ Đã khôi phục hợp đồng từ terminated sang:', newStatus);
            }
        }
        
        // Delete Firebase + localStorage
        await deleteDoc(doc(db, 'bills', billId));
        deleteFromLocalStorage('bills', billId);
        
        showToast(bill && bill.isTerminationBill ? 'Đã xóa hóa đơn thanh lý và khôi phục hợp đồng!' : 'Đã xóa hóa đơn thành công!');
        // Event đã được dispatch bởi deleteFromLocalStorage
    } catch (error) {
        showToast('Lỗi xóa hóa đơn: ' + error.message, 'error');
    }
}

async function toggleBillApproval(billId) {
    console.log('🔄 toggleBillApproval called with billId:', billId);
    const bill = getBills().find(b => b.id === billId);
    if (!bill) {
        console.error('❌ Bill not found:', billId);
        return;
    }
    console.log('📋 Found bill:', bill.id, 'current approved status:', bill.approved);
    
    // KIỂM TRA: Không cho phép bỏ duyệt hóa đơn đã thu tiền
    if (bill.approved && bill.status === 'paid') {
        showToast('Không thể bỏ duyệt hóa đơn đã thu tiền! Vui lòng hủy thu tiền trước.', 'error');
        return;
    }
    
    try {
        const newApproved = !bill.approved;
        console.log('🔄 Changing approved status to:', newApproved);
        // Update Firebase
        const updateData = {
            approved: newApproved,
            updatedAt: serverTimestamp()
        };
        
        // 🔥 Nếu là hóa đơn thanh lý và được duyệt → chuyển status thành 'terminated'
        if (bill.isTerminationBill && newApproved) {
            updateData.status = 'terminated';
        }
        
        await setDoc(doc(db, 'bills', billId), updateData, { merge: true });
        
        // Update localStorage
        const localUpdateData = {
            approved: newApproved,
            updatedAt: new Date()
        };
        
        // 🔥 Nếu là hóa đơn thanh lý và được duyệt → chuyển status thành 'terminated'
        if (bill.isTerminationBill && newApproved) {
            localUpdateData.status = 'terminated';
        }
        
        updateInLocalStorage('bills', billId, localUpdateData);
        
        // Dispatch event để UI cập nhật ngay
        window.dispatchEvent(new CustomEvent('store:bills:updated'));

        // Tạo thông báo admin khi duyệt hóa đơn
        if (newApproved) {
            console.log('✅ Bill approved! Creating admin notification...');
            const building = getBuildings().find(b => b.id === bill.buildingId);
            const customer = getCustomers().find(c => c.id === bill.customerId);
            console.log('🏢 Building found:', building?.code, '👤 Customer found:', customer?.name);
            
            if (customer && building) {
                // Tính năm từ ngày lập hóa đơn
                const billYear = new Date(bill.billDate).getFullYear();
                
                const adminNotificationData = {
                    type: 'bill_approved',
                    buildingId: bill.buildingId,
                    room: bill.room,
                    customerId: bill.customerId,
                    billId: bill.id,
                    title: 'Thông báo hóa đơn',
                    message: `Hóa đơn tháng ${bill.period}-${billYear} cho phòng ${building.code}-${bill.room} đã được duyệt`,
                    customerMessage: `Bạn có hóa đơn tiền nhà tháng ${bill.period}-${billYear} cần thanh toán. Vui lòng kiểm tra và thanh toán đúng hạn.`,
                    amount: bill.totalAmount,
                    isRead: true, // ĐÃ ĐỌC theo logic cũ của bạn
                    createdAt: serverTimestamp()
                };

                console.log('📤 Sending admin notification data:', adminNotificationData);
                console.log('🔑 Key data for matching - BuildingId:', bill.buildingId, 'Room:', bill.room);
                await addDoc(collection(db, 'adminNotifications'), adminNotificationData);
                console.log('✅ Đã tạo thông báo admin cho phòng:', building.code + '-' + bill.room);
            } else {
                console.log('❌ Missing customer or building data:', { customer: !!customer, building: !!building });
            }
        } else {
            // Bỏ duyệt hóa đơn - XÓA thông báo duyệt cũ thay vì tạo thông báo mới
            console.log('❌ Bill unapproved! Deleting old approved notification...');
            
            try {
                // Tìm và xóa thông báo duyệt cũ cho billId này từ Firebase
                console.log('🗑️ Tìm và xóa thông báo bill_approved cho bill:', bill.id);
                const notificationsQuery = query(
                    collection(db, 'adminNotifications'), 
                    where('billId', '==', bill.id),
                    where('type', '==', 'bill_approved')
                );
                const notificationsSnapshot = await getDocs(notificationsQuery);
                
                const deletePromises = notificationsSnapshot.docs.map(doc => 
                    deleteDoc(doc.ref)
                );
                
                if (deletePromises.length > 0) {
                    await Promise.all(deletePromises);
                    console.log(`✅ Đã xóa ${deletePromises.length} thông báo bill_approved từ Firebase cho bill ${bill.id}`);
                    
                    // 🗑️ XÓA KHỎI LOCALSTORAGE NGAY LẬP TỨC
                    notificationsSnapshot.docs.forEach(docSnapshot => {
                        deleteFromLocalStorage('notifications', docSnapshot.id);
                        console.log(`✅ Đã xóa thông báo bill_approved khỏi localStorage: ${docSnapshot.id}`);
                    });
                    
                    // 🔄 Dispatch event để UI notifications cập nhật ngay
                    window.dispatchEvent(new CustomEvent('store:notifications:updated'));
                    console.log(`🔄 Dispatched notifications update event`);
                } else {
                    console.log('ℹ️ Không tìm thấy thông báo bill_approved để xóa cho bill:', bill.id);
                }
                
            } catch (error) {
                console.error('❌ Lỗi khi xóa thông báo cũ:', error);
            }
        }
        
        showToast(newApproved ? 'Đã duyệt hóa đơn!' : 'Đã bỏ duyệt hóa đơn!');
        // Store listener tự động cập nhật
    } catch (error) {
        showToast('Lỗi: ' + error.message, 'error');
    }
}

async function toggleBillStatus(billId, paymentDate = null) {
    const bill = getBills().find(b => b.id === billId);
    if (!bill) {
        console.error('Không tìm thấy bill:', billId);
        return;
    }

    console.log('Bắt đầu toggleBillStatus cho bill:', billId, 'trạng thái hiện tại:', bill.status);
    
    try {
        const newStatus = bill.status === 'paid' ? 'unpaid' : 'paid';
        let message = '';

        if (newStatus === 'paid') {
            // Chuyển sang "Đã thanh toán" -> Tạo phiếu thu với tách hạng mục
            const building = getBuildings().find(b => b.id === bill.buildingId);
            const customer = getCustomers().find(c => c.id === bill.customerId);
            
            // Tạo các items theo hạng mục VỚI CATEGORY ID THỰC
            const items = await createTransactionItemsFromBillWithRealCategories(bill);
            
            // LẤY ACCOUNT TỪ TÒA NHÀ (đã gán sẵn trong tòa nhà)
            const accountId = building?.accountId || '';
            
            if (!accountId) {
                showToast('Tòa nhà chưa có sổ quỹ! Vui lòng gán sổ quỹ cho tòa nhà trước.', 'error');
                return;
            }
            
            const transactionCode = `PT${new Date().toISOString().replace(/\D/g, '').slice(0, 12)}`;
            // Sử dụng ngày thu tiền được chọn hoặc ngày hiện tại
            const transactionDate = paymentDate || getCurrentDateString();
            const transactionData = {
                type: 'income',
                code: transactionCode,
                buildingId: bill.buildingId,
                room: bill.room,
                customerId: bill.customerId,
                billId: bill.id,
                accountId: accountId, // LẤY TỪ TÒA NHÀ
                title: `Thu tiền phòng ${building?.code || ''} - ${bill.room} - Tháng ${bill.period}`,
                payer: customer?.name || 'Khách hàng',
                date: transactionDate,
                items: items,
                approved: true,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp()
            };
            // Create transaction Firebase + localStorage
            const transactionDocRef = await addDoc(collection(db, 'transactions'), transactionData);
            
            // Add to localStorage với Firebase ID
            const newTransactionItem = { 
                ...transactionData,
                id: transactionDocRef.id,
                createdAt: new Date(),
                updatedAt: new Date()
            };
            const state = getState();
            state.transactions.unshift(newTransactionItem);
            saveToCache();
            document.dispatchEvent(new CustomEvent('store:transactions:updated'));
            
            // 💰 CẬP NHẬT PAIDAMOUNT VÀO BILL - Firebase + localStorage
            const totalPaid = bill.totalAmount; // Thanh toán đủ
            const updateData = {
                status: newStatus,
                paidAmount: totalPaid,
                paidDate: transactionDate, // Lưu ngày thu tiền
                updatedAt: serverTimestamp()
            };
            await setDoc(doc(db, 'bills', billId), updateData, { merge: true });
            
            // Update localStorage
            updateInLocalStorage('bills', billId, {
                ...updateData,
                updatedAt: new Date()
            });
            
            // Dispatch event để UI cập nhật ngay
            window.dispatchEvent(new CustomEvent('store:bills:updated'));
            
            message = 'Đã thu tiền và tạo phiếu thu!';
            
            // 🔔 GỬI THÔNG BÁO ĐẨY KHI THANH TOÁN THÀNH CÔNG
            if (customer && building) {
                const billYear = new Date(bill.billDate).getFullYear();
                const { sendPushNotification } = await import('../utils.js');
                await sendPushNotification(
                    customer.id,
                    '✅ Thanh toán thành công',
                    `Cảm ơn bạn đã thanh toán hóa đơn tháng ${bill.period}-${billYear}. Số tiền: ${formatMoney(bill.totalAmount)}đ`,
                    {
                        type: 'payment_confirmed',
                        billId: bill.id,
                        buildingCode: building.code,
                        room: bill.room,
                        amount: bill.totalAmount
                    }
                );
                
                // 📋 TẠO THÔNG BÁO CHO WEB ADMIN KHI THU TIỀN THÀNH CÔNG
                console.log('📋 Tạo thông báo web admin - đã thu tiền từ khách hàng');
                const adminNotificationData = {
                    type: 'payment_collected',
                    buildingId: bill.buildingId,
                    room: bill.room,
                    customerId: bill.customerId,
                    billId: bill.id,
                    title: 'Thu tiền thành công',
                    message: `Đã thu tiền từ khách hàng ${customer.name} - Phòng ${building.code}-${bill.room} - Tháng ${bill.period}-${billYear}. Số tiền: ${formatMoney(bill.totalAmount)}đ`,
                    customerMessage: `Đã thu tiền từ khách hàng ${customer.name}`,
                    amount: bill.totalAmount,
                    isRead: false, // CHƯA ĐỌC để admin chú ý
                    createdAt: serverTimestamp()
                };

                console.log('📤 Gửi thông báo thu tiền cho web admin:', adminNotificationData);
                await addDoc(collection(db, 'adminNotifications'), adminNotificationData);
                console.log('✅ Đã tạo thông báo web admin - thu tiền từ:', customer.name);
            }
        } else {
            // Chuyển sang "Chưa thanh toán" -> Xóa phiếu thu liên quan
            console.log(`🗑️ Hủy thanh toán - Tìm và xóa transactions cho bill: ${billId}`);
            const q = query(collection(db, 'transactions'), where('billId', '==', billId));
            const querySnapshot = await getDocs(q);
            
            console.log(`🗑️ Tìm thấy ${querySnapshot.docs.length} transaction để xóa`);
            for (const docSnapshot of querySnapshot.docs) {
                await deleteDoc(doc(db, 'transactions', docSnapshot.id));
                console.log(`✅ Đã xóa transaction: ${docSnapshot.id}`);
                
                // 🗑️ XÓA KHỎI LOCALSTORAGE NGAY LẬP TỨC
                deleteFromLocalStorage('transactions', docSnapshot.id);
                console.log(`✅ [WEB-DEBUG] Đã xóa transaction khỏi localStorage: ${docSnapshot.id}`);
            }
            
            // 🔄 Dispatch event để UI transactions cập nhật ngay
            if (querySnapshot.docs.length > 0) {
                window.dispatchEvent(new CustomEvent('store:transactions:updated'));
                console.log(`🔄 [WEB-DEBUG] Dispatched transactions update event`);
            }
            
            // 🗑️ XÓA THÔNG BÁO WEB ADMIN KHI HỦY THU TIỀN
            console.log(`🔍 [WEB-DEBUG] Hủy thanh toán - Tìm thông báo payment_collected cho bill: ${billId}`);
            const adminNotifQuery = query(
                collection(db, 'adminNotifications'),
                where('billId', '==', billId),
                where('type', '==', 'payment_collected')
            );
            const adminNotifSnapshot = await getDocs(adminNotifQuery);
            
            console.log(`🔍 [WEB-DEBUG] Query result: ${adminNotifSnapshot.docs.length} thông báo tìm thấy`);
            
            if (adminNotifSnapshot.docs.length === 0) {
                console.log(`⚠️ [WEB-DEBUG] KHÔNG tìm thấy thông báo nào cho billId: ${billId}, type: payment_collected`);
                
                // DEBUG: Kiểm tra tất cả thông báo có billId này
                const allBillNotifQuery = query(
                    collection(db, 'adminNotifications'),
                    where('billId', '==', billId)
                );
                const allBillNotifSnapshot = await getDocs(allBillNotifQuery);
                console.log(`🔍 [WEB-DEBUG] Tất cả thông báo cho bill ${billId}:`, 
                    allBillNotifSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
                );
            } else {
                console.log(`🗑️ [WEB-DEBUG] Tìm thấy ${adminNotifSnapshot.docs.length} thông báo để xóa:`,
                    adminNotifSnapshot.docs.map(doc => ({ id: doc.id, type: doc.data().type, billId: doc.data().billId }))
                );
            }
            
            for (const notifDoc of adminNotifSnapshot.docs) {
                await deleteDoc(doc(db, 'adminNotifications', notifDoc.id));
                console.log(`✅ [WEB-DEBUG] Đã xóa thông báo: ${notifDoc.id} (type: ${notifDoc.data().type})`);
                
                // 🗑️ XÓA KHỎI LOCALSTORAGE NGAY LẬP TỨC
                deleteFromLocalStorage('notifications', notifDoc.id);
                console.log(`✅ [WEB-DEBUG] Đã xóa thông báo khỏi localStorage: ${notifDoc.id}`);
            }
            
            // 🔄 Dispatch event để UI notifications cập nhật ngay
            if (adminNotifSnapshot.docs.length > 0) {
                window.dispatchEvent(new CustomEvent('store:notifications:updated'));
                console.log(`🔄 [WEB-DEBUG] Dispatched notifications update event`);
            }
            
            // 💰 ĐẶT LẠI PAIDAMOUNT VỀ 0 - Firebase + localStorage
            const updateData = {
                status: newStatus,
                paidAmount: 0,
                updatedAt: serverTimestamp()
            };
            await setDoc(doc(db, 'bills', billId), updateData, { merge: true });
            
            // Update localStorage
            updateInLocalStorage('bills', billId, {
                ...updateData,
                updatedAt: new Date()
            });
            
            // Dispatch event để UI cập nhật ngay
            window.dispatchEvent(new CustomEvent('store:bills:updated'));
            
            // App sẽ tự động xóa thông báo payment thông qua transaction listener
            message = 'Đã hủy thanh toán và xóa phiếu thu!';
        }

        console.log('✅ Hoàn thành toggleBillStatus:', message);
        showToast(message);
        // Store listener sẽ tự động cập nhật
    } catch (error) {
        console.error('❌ Lỗi trong toggleBillStatus:', error);
        console.error('❌ Stack trace:', error.stack);
        showToast('Lỗi cập nhật: ' + error.message, 'error');
    }
}

/**
 * Thu tiền hóa đơn (support thu từng phần)
 * @param {string} billId - ID hóa đơn
 * @param {number} amount - Số tiền thu lần này
 * @param {string} paymentDate - Ngày thu tiền (dd-mm-yyyy)
 */
async function collectBillPayment(billId, amount, paymentDate) {
    try {
        const bill = getBills().find(b => b.id === billId);
        if (!bill) throw new Error('Không tìm thấy hóa đơn');
        
        const buildings = getBuildings();
        const customers = getCustomers();
        const building = buildings.find(b => b.id === bill.buildingId);
        const customer = customers.find(c => c.id === bill.customerId);
        
        // Tính toán số tiền
        const currentPaidAmount = bill.paidAmount || 0;
        const newPaidAmount = currentPaidAmount + amount;
        const totalAmount = bill.totalAmount;
        const isFullyPaid = newPaidAmount >= totalAmount;
        
        // Chuyển đổi ngày
        const transactionDate = parseDateInput(paymentDate);
        
        // 1. Tạo phiếu thu với số tiền thu lần này
        const items = await createTransactionItemsFromBillWithRealCategories(bill);
        
        // Điều chỉnh số tiền trong items theo số tiền thu thực tế lần này
        const ratio = amount / totalAmount;
        items.forEach(item => {
            item.amount = Math.round(item.amount * ratio);
        });
        
        // Đảm bảo tổng tiền items = số tiền thu lần này
        const itemsTotal = items.reduce((sum, item) => sum + item.amount, 0);
        if (itemsTotal !== amount) {
            // Điều chỉnh item đầu tiên để đúng tổng tiền
            const diff = amount - itemsTotal;
            if (items.length > 0) {
                items[0].amount += diff;
            }
        }
        
        const transactionCode = `PT${Date.now()}`;
        const transactionData = {
            type: 'income',
            code: transactionCode,
            buildingId: bill.buildingId,
            room: bill.room,
            customerId: bill.customerId,
            billId: bill.id,
            accountId: building?.accountId || '',
            title: `Thu tiền phòng ${building?.code || ''} - ${bill.room} - Tháng ${bill.period}`,
            payer: customer?.name || 'Khách hàng',
            date: transactionDate.toISOString().split('T')[0],
            items: items,
            approved: true,
            paymentMethod: 'cash',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        };
        
        const transactionDocRef = await addDoc(collection(db, 'transactions'), transactionData);
        
        // Add to localStorage
        const { getState, saveToCache } = await import('../store.js');
        const newTransactionItem = {
            ...transactionData,
            id: transactionDocRef.id,
            createdAt: transactionDate,
            updatedAt: new Date()
        };
        const state = getState();
        state.transactions.unshift(newTransactionItem);
        saveToCache();
        document.dispatchEvent(new CustomEvent('store:transactions:updated'));
        
        // 2. Cập nhật hóa đơn
        const updateData = {
            paidAmount: newPaidAmount,
            status: isFullyPaid ? 'paid' : 'unpaid',
            paidDate: transactionDate.toISOString().split('T')[0],
            updatedAt: serverTimestamp()
        };
        
        await setDoc(doc(db, 'bills', billId), updateData, { merge: true });
        
        // Update localStorage
        updateInLocalStorage('bills', billId, {
            ...updateData,
            updatedAt: new Date()
        });
        
        window.dispatchEvent(new CustomEvent('store:bills:updated'));
        
        // 3. Gửi thông báo nếu đã thanh toán đủ
        if (isFullyPaid && customer && building) {
            const billYear = new Date(bill.billDate).getFullYear();
            const { sendPushNotification } = await import('../utils.js');
            await sendPushNotification(
                customer.id,
                '✅ Thanh toán thành công',
                `Cảm ơn bạn đã thanh toán hóa đơn tháng ${bill.period}-${billYear}. Số tiền: ${formatMoney(totalAmount)}đ`,
                {
                    type: 'payment_confirmed',
                    billId: bill.id,
                    buildingCode: building.code,
                    room: bill.room,
                    amount: totalAmount
                }
            );
            
            // Thông báo cho web admin
            const adminNotificationData = {
                type: 'payment_collected',
                buildingId: bill.buildingId,
                room: bill.room,
                customerId: bill.customerId,
                billId: bill.id,
                title: 'Thu tiền thành công',
                message: `Đã thu tiền từ khách hàng ${customer.name} - Phòng ${building.code}-${bill.room} - Tháng ${bill.period}-${billYear}. Số tiền: ${formatMoney(totalAmount)}đ`,
                customerMessage: `Đã thu tiền từ khách hàng ${customer.name}`,
                amount: totalAmount,
                isRead: false,
                createdAt: serverTimestamp()
            };
            
            await addDoc(collection(db, 'adminNotifications'), adminNotificationData);
        }
        
        console.log(`✅ Thu tiền thành công: ${formatMoney(amount)}, tổng đã thu: ${formatMoney(newPaidAmount)}/${formatMoney(totalAmount)}`);
        
    } catch (error) {
        console.error('❌ Lỗi thu tiền:', error);
        throw error;
    }
}

async function bulkApprove(approve) {
    // Lấy từ Set mobile nếu có, không thì từ desktop checkboxes
    let selected;
    if (selectedMobileBillIds.size > 0) {
        const allBills = getBills();
        selected = Array.from(selectedMobileBillIds).filter(id => {
            const bill = allBills.find(b => b.id === id);
            return bill && bill.approved !== approve;
        });
    } else {
        selected = getSelectedBillIds(b => b.approved !== approve);
    }
    
    if (selected.length === 0) return;

    // KIỂM TRA: Nếu bỏ duyệt, không cho phép bỏ duyệt hóa đơn đã thu tiền
    if (!approve) {
        const allBills = getBills();
        const paidBills = selected.filter(billId => {
            const bill = allBills.find(b => b.id === billId);
            return bill && bill.status === 'paid';
        });
        
        if (paidBills.length > 0) {
            showToast(`Không thể bỏ duyệt ${paidBills.length} hóa đơn đã thu tiền! Vui lòng hủy thu tiền trước.`, 'error');
            return;
        }
    }

    const confirmed = await showConfirm(
        `Bạn có chắc muốn ${approve ? 'duyệt' : 'bỏ duyệt'} ${selected.length} hóa đơn đã chọn?`,
        'Xác nhận thao tác',
        approve ? 'Duyệt' : 'Bỏ duyệt',
        'Hủy'
    );
    if (!confirmed) return;

    try {
        for (const billId of selected) {
            // Update Firebase
            await setDoc(doc(db, 'bills', billId), {
                approved: approve,
                updatedAt: serverTimestamp()
            }, { merge: true });
            
            // Update localStorage
            updateInLocalStorage('bills', billId, {
                approved: approve,
                updatedAt: new Date()
            });
            
            // Dispatch event để UI cập nhật ngay
            window.dispatchEvent(new CustomEvent('store:bills:updated'));

            // Tạo/xóa thông báo admin
            if (approve) {
                // Duyệt: Tạo thông báo
                const bill = getBills().find(b => b.id === billId);
                if (bill) {
                    const building = getBuildings().find(b => b.id === bill.buildingId);
                    const customer = getCustomers().find(c => c.id === bill.customerId);
                    
                    if (customer && building) {
                        // Tính năm từ ngày lập hóa đơn
                        const billYear = new Date(bill.billDate).getFullYear();
                        
                        const adminNotificationData = {
                            type: 'bill_approved',
                            buildingId: bill.buildingId,
                            room: bill.room,
                            customerId: bill.customerId,
                            billId: bill.id,
                            title: 'Thông báo hóa đơn',
                            message: `Hóa đơn tháng ${bill.period}-${billYear} cho phòng ${building.code}-${bill.room} đã được duyệt`,
                            customerMessage: `Bạn có hóa đơn tiền nhà tháng ${bill.period}-${billYear} cần thanh toán. Vui lòng kiểm tra và thanh toán đúng hạn.`,
                            amount: bill.totalAmount,
                            isRead: true, // ĐÃ ĐỌC theo logic cũ của bạn
                            createdAt: serverTimestamp()
                        };

                        await addDoc(collection(db, 'adminNotifications'), adminNotificationData);
                        console.log('Đã tạo thông báo admin cho phòng:', building.code + '-' + bill.room);
                    }
                }
            } else {
                // Bỏ duyệt: Xóa thông báo duyệt cũ
                console.log('❌ [BULK] Bỏ duyệt - xóa thông báo duyệt cũ cho bill:', billId);
                
                try {
                    // Tìm và xóa thông báo duyệt cũ cho billId này từ Firebase
                    console.log('🗑️ [BULK] Tìm và xóa thông báo bill_approved cho bill:', billId);
                    const notificationsQuery = query(
                        collection(db, 'adminNotifications'),
                        where('billId', '==', billId),
                        where('type', '==', 'bill_approved')
                    );
                    const notificationsSnapshot = await getDocs(notificationsQuery);
                    const deletePromises = notificationsSnapshot.docs.map(doc => 
                        deleteDoc(doc.ref)
                    );
                    
                    if (deletePromises.length > 0) {
                        await Promise.all(deletePromises);
                        console.log(`✅ [BULK] Đã xóa ${deletePromises.length} thông báo bill_approved từ Firebase cho bill ${billId}`);
                        
                        // 🗑️ XÓA KHỎI LOCALSTORAGE NGAY LẬP TỨC
                        notificationsSnapshot.docs.forEach(docSnapshot => {
                            deleteFromLocalStorage('notifications', docSnapshot.id);
                            console.log(`✅ [BULK] Đã xóa thông báo bill_approved khỏi localStorage: ${docSnapshot.id}`);
                        });
                        
                        // 🔄 Dispatch event để UI notifications cập nhật ngay
                        window.dispatchEvent(new CustomEvent('store:notifications:updated'));
                        console.log(`🔄 [BULK] Dispatched notifications update event`);
                    } else {
                        console.log('ℹ️ [BULK] Không tìm thấy thông báo bill_approved để xóa cho bill:', billId);
                    }
                    
                } catch (error) {
                    console.error('❌ [BULK] Lỗi khi xóa thông báo cũ cho bill:', billId, error);
                }
            }
        }
        
        // Reset trạng thái checkbox và ẩn nút hàng loạt
        selectedMobileBillIds.clear();
        resetBulkSelection();
        updateBulkApprovalButtons();
        
        showToast(`Đã ${approve ? 'duyệt' : 'bỏ duyệt'} ${selected.length} hóa đơn!`);
        // Store listener tự động cập nhật
    } catch (error) {
        showToast('Lỗi: ' + error.message, 'error');
    }
}

async function bulkCollect(billIds = null, paymentDate = null) {
    // Nếu có billIds được truyền vào, sử dụng chúng (từ modal)
    // Nếu không, lấy từ Set mobile hoặc desktop checkboxes
    let selected;
    
    if (billIds) {
        // Từ modal - đã được filter trước đó
        selected = billIds;
    } else if (selectedMobileBillIds.size > 0) {
        const allBills = getBills();
        selected = Array.from(selectedMobileBillIds).filter(id => {
            const bill = allBills.find(b => b.id === id);
            return bill && bill.status !== 'paid';
        });
    } else {
        selected = getSelectedBillIds(b => b.status !== 'paid');
    }
    
    if (selected.length === 0) return;

    const confirmed = await showConfirm(
        `Bạn có chắc muốn đánh dấu đã thu tiền cho ${selected.length} hóa đơn đã chọn?`,
        'Xác nhận thu tiền',
        'Thu tiền',
        'Hủy'
    );
    if (!confirmed) return;

    try {
        const bills = getBills();
        const buildings = getBuildings();
        const customers = getCustomers();
        
        for (const billId of selected) {
            const bill = bills.find(b => b.id === billId);
            if (!bill) continue;
            
            const building = buildings.find(b => b.id === bill.buildingId);
            const customer = customers.find(c => c.id === bill.customerId);
            
            // Tạo phiếu thu với hạng mục "Tiền hóa đơn"
            const items = await createTransactionItemsFromBillWithRealCategories(bill);
            
            // LẤY ACCOUNT TỪ TÒA NHÀ
            const accountId = building?.accountId || '';
            
            if (accountId) {
                const transactionCode = `PT${new Date().toISOString().replace(/\D/g, '').slice(0, 12)}_${billId.slice(-4)}`;
                // Sử dụng ngày thu tiền được chọn hoặc ngày hiện tại
                const transactionDate = paymentDate || getCurrentDateString();
                const transactionData = {
                    type: 'income',
                    code: transactionCode,
                    buildingId: bill.buildingId,
                    room: bill.room,
                    customerId: bill.customerId,
                    billId: bill.id,
                    accountId: accountId,
                    title: `Thu tiền phòng ${building?.code || ''} - ${bill.room} - Tháng ${bill.period}`,
                    payer: customer?.name || 'Khách hàng',
                    date: transactionDate,
                    items: items,
                    approved: true,
                    createdAt: serverTimestamp(),
                    updatedAt: serverTimestamp()
                };
                // Create transaction Firebase + localStorage
                const transactionDocRef = await addDoc(collection(db, 'transactions'), transactionData);
                
                // Add to localStorage với Firebase ID
                const { getState, saveToCache } = await import('../store.js');
                const newTransactionItem = { 
                    ...transactionData,
                    id: transactionDocRef.id,
                    createdAt: new Date(),
                    updatedAt: new Date()
                };
                const state = getState();
                state.transactions.unshift(newTransactionItem);
                saveToCache();
                document.dispatchEvent(new CustomEvent('store:transactions:updated'));
            }
            
            // 🔔 GỬI THÔNG BÁO ĐẨY KHI THANH TOÁN THÀNH CÔNG (giống như thu tiền đơn lẻ)
            if (customer && building) {
                const billYear = new Date(bill.billDate).getFullYear();
                const { sendPushNotification } = await import('../utils.js');
                await sendPushNotification(
                    customer.id,
                    '✅ Thanh toán thành công',
                    `Cảm ơn bạn đã thanh toán hóa đơn tháng ${bill.period}-${billYear}. Số tiền: ${formatMoney(bill.totalAmount)}đ`,
                    {
                        type: 'payment_confirmed',
                        billId: bill.id,
                        buildingCode: building.code,
                        room: bill.room,
                        amount: bill.totalAmount
                    }
                );
                
                // 📋 TẠO THÔNG BÁO CHO WEB ADMIN KHI THU TIỀN THÀNH CÔNG (giống như thu tiền đơn lẻ)
                console.log('📋 [BULK] Tạo thông báo web admin - đã thu tiền từ khách hàng');
                const adminNotificationData = {
                    type: 'payment_collected',
                    buildingId: bill.buildingId,
                    room: bill.room,
                    customerId: bill.customerId,
                    billId: bill.id,
                    title: 'Thu tiền thành công',
                    message: `Đã thu tiền từ khách hàng ${customer.name} - Phòng ${building.code}-${bill.room} - Tháng ${bill.period}-${billYear}. Số tiền: ${formatMoney(bill.totalAmount)}đ`,
                    customerMessage: `Đã thu tiền từ khách hàng ${customer.name}`,
                    amount: bill.totalAmount,
                    isRead: false, // CHƯA ĐỌC để admin chú ý
                    createdAt: serverTimestamp()
                };

                console.log('📤 [BULK] Gửi thông báo thu tiền cho web admin:', adminNotificationData);
                await addDoc(collection(db, 'adminNotifications'), adminNotificationData);
                console.log('✅ [BULK] Đã tạo thông báo web admin - thu tiền từ:', customer.name);
            }
            
            // Cập nhật trạng thái hóa đơn
            const transactionDate = paymentDate || getCurrentDateString();
            await setDoc(doc(db, 'bills', billId), {
                status: 'paid',
                paidAmount: bill.totalAmount,
                paidDate: transactionDate, // Sử dụng ngày thu tiền đã chọn
                updatedAt: serverTimestamp()
            }, { merge: true });
            
            // ✅ CẬP NHẬT LOCALSTORAGE NGAY LẬP TỨC
            updateInLocalStorage('bills', billId, {
                status: 'paid',
                paidAmount: bill.totalAmount,
                paidDate: transactionDate
            });
            console.log(`✅ [BULK] Đã cập nhật bill ${billId} trong localStorage`);
        }
        
        // Chỉ reset khi không được gọi từ modal
        if (!billIds) {
            // Reset trạng thái checkbox và ẩn nút hàng loạt
            selectedMobileBillIds.clear();
            resetBulkSelection();
            updateBulkApprovalButtons();
        }
        
        showToast(`Đã thu tiền và tạo ${selected.length} phiếu thu!`);
        
        // ✅ REFRESH LẠI DANH SÁCH HÓA ĐƠN
        await loadBills();
    } catch (error) {
        showToast('Lỗi: ' + error.message, 'error');
    }
}

async function bulkUncollect() {
    console.log('🔄 bulkUncollect được gọi');
    
    // Lấy từ Set mobile nếu có, không thì từ desktop checkboxes
    let selected;
    if (selectedMobileBillIds.size > 0) {
        const allBills = getBills();
        selected = Array.from(selectedMobileBillIds).filter(id => {
            const bill = allBills.find(b => b.id === id);
            return bill && bill.status === 'paid';
        });
    } else {
        selected = getSelectedBillIds(b => b.status === 'paid');
    }
    
    console.log('📋 Selected bills:', selected);
    if (selected.length === 0) {
        console.log('❌ Không có hóa đơn nào được chọn hoặc không có hóa đơn đã thanh toán');
        showToast('Vui lòng chọn ít nhất một hóa đơn đã thanh toán!', 'warning');
        return;
    }

    const confirmed = await showConfirm(
        `Bạn có chắc muốn hủy thu tiền cho ${selected.length} hóa đơn đã chọn?`,
        'Xác nhận hủy thu tiền',
        'Hủy thu tiền',
        'Hủy'
    );
    if (!confirmed) return;

    try {
        console.log('💾 Bắt đầu cập nhật database...');
        for (const billId of selected) {
            console.log(`📝 Cập nhật hóa đơn ${billId}`);
            
            // 🗑️ XÓA TRANSACTION LIÊN QUAN
            console.log(`🗑️ [BULK] Hủy thanh toán - Tìm và xóa transactions cho bill: ${billId}`);
            const q = query(collection(db, 'transactions'), where('billId', '==', billId));
            const querySnapshot = await getDocs(q);
            
            console.log(`🗑️ [BULK] Tìm thấy ${querySnapshot.docs.length} transaction để xóa`);
            for (const docSnapshot of querySnapshot.docs) {
                await deleteDoc(doc(db, 'transactions', docSnapshot.id));
                console.log(`✅ [BULK] Đã xóa transaction: ${docSnapshot.id}`);
                
                // 🗑️ XÓA KHỎI LOCALSTORAGE NGAY LẬP TỨC
                deleteFromLocalStorage('transactions', docSnapshot.id);
                console.log(`✅ [BULK-DEBUG] Đã xóa transaction khỏi localStorage: ${docSnapshot.id}`);
            }
            
            // 🔄 Dispatch event để UI transactions cập nhật ngay
            if (querySnapshot.docs.length > 0) {
                window.dispatchEvent(new CustomEvent('store:transactions:updated'));
                console.log(`🔄 [BULK-DEBUG] Dispatched transactions update event`);
            }
            
            // 🗑️ XÓA THÔNG BÁO WEB ADMIN
            console.log(`🔍 [BULK-DEBUG] Hủy thanh toán - Tìm thông báo payment_collected cho bill: ${billId}`);
            const adminNotifQuery = query(
                collection(db, 'adminNotifications'),
                where('billId', '==', billId),
                where('type', '==', 'payment_collected')
            );
            const adminNotifSnapshot = await getDocs(adminNotifQuery);
            
            console.log(`🔍 [BULK-DEBUG] Query result: ${adminNotifSnapshot.docs.length} thông báo tìm thấy`);
            
            if (adminNotifSnapshot.docs.length === 0) {
                console.log(`⚠️ [BULK-DEBUG] KHÔNG tìm thấy thông báo nào cho billId: ${billId}, type: payment_collected`);
                
                // DEBUG: Kiểm tra tất cả thông báo có billId này
                const allBillNotifQuery = query(
                    collection(db, 'adminNotifications'),
                    where('billId', '==', billId)
                );
                const allBillNotifSnapshot = await getDocs(allBillNotifQuery);
                console.log(`🔍 [BULK-DEBUG] Tất cả thông báo cho bill ${billId}:`, 
                    allBillNotifSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
                );
            } else {
                console.log(`🗑️ [BULK-DEBUG] Tìm thấy ${adminNotifSnapshot.docs.length} thông báo để xóa:`,
                    adminNotifSnapshot.docs.map(doc => ({ id: doc.id, type: doc.data().type, billId: doc.data().billId }))
                );
            }
            
            for (const notifDoc of adminNotifSnapshot.docs) {
                await deleteDoc(doc(db, 'adminNotifications', notifDoc.id));
                console.log(`✅ [BULK-DEBUG] Đã xóa thông báo: ${notifDoc.id} (type: ${notifDoc.data().type})`);
                
                // 🗑️ XÓA KHỎI LOCALSTORAGE NGAY LẬP TỨC
                deleteFromLocalStorage('notifications', notifDoc.id);
                console.log(`✅ [BULK-DEBUG] Đã xóa thông báo khỏi localStorage: ${notifDoc.id}`);
            }
            
            // 🔄 Dispatch event để UI notifications cập nhật ngay
            if (adminNotifSnapshot.docs.length > 0) {
                window.dispatchEvent(new CustomEvent('store:notifications:updated'));
                console.log(`🔄 [BULK-DEBUG] Dispatched notifications update event`);
            }
            
            // Cập nhật trạng thái hóa đơn
            await setDoc(doc(db, 'bills', billId), {
                status: 'unpaid',
                paidDate: null, // Xóa ngày thu tiền
                paidAmount: 0, // Reset số tiền đã thu
                updatedAt: serverTimestamp()
            }, { merge: true });
            
            // ✅ CẬP NHẬT LOCALSTORAGE NGAY LẬP TỨC
            updateInLocalStorage('bills', billId, {
                status: 'unpaid',
                paidDate: null,
                paidAmount: 0
            });
            console.log(`✅ [BULK] Đã cập nhật bill ${billId} trong localStorage`);
        }
        
        // Reset trạng thái checkbox và ẩn nút hàng loạt
        selectedMobileBillIds.clear();
        resetBulkSelection();
        updateBulkApprovalButtons();
        
        console.log('✅ Hoàn thành cập nhật');
        showToast(`Đã hủy thu tiền cho ${selected.length} hóa đơn!`);
        
        // ✅ REFRESH LẠI DANH SÁCH HÓA ĐƠN
        await loadBills();
    } catch (error) {
        console.error('❌ Lỗi:', error);
        showToast('Lỗi: ' + error.message, 'error');
    }
}

async function bulkDelete() {
    // Lấy từ Set mobile nếu có, không thì lấy từ desktop checkboxes
    const selected = selectedMobileBillIds.size > 0
        ? Array.from(selectedMobileBillIds)
        : getSelectedBillIds();
    
    if (selected.length === 0) return showToast('Vui lòng chọn ít nhất một hóa đơn để xóa', 'error');
    
    const confirmed = await showConfirm(
        `Bạn có chắc muốn xóa ${selected.length} hóa đơn đã chọn?`,
        'Xác nhận xóa',
        'Xóa',
        'Hủy'
    );
    if (!confirmed) return;

    try {
        for (const billId of selected) {
            // Delete Firebase + localStorage
            await deleteDoc(doc(db, 'bills', billId));
            deleteFromLocalStorage('bills', billId);
        }
        
        // Reset trạng thái checkbox và ẩn nút hàng loạt
        selectedMobileBillIds.clear();
        resetBulkSelection();
        updateBulkApprovalButtons();
        
        showToast(`Đã xóa ${selected.length} hóa đơn thành công!`);
        // Store listener tự động cập nhật
    } catch (error) {
        showToast('Lỗi xóa hóa đơn: ' + error.message, 'error');
    }
}

function getSelectedBillIds(filterFunc = null) {
    // CHỈ lấy checkbox từ desktop table, KHÔNG lấy mobile card
    let checkboxes = document.querySelectorAll('#bills-list .bill-checkbox:checked');
    let bills = Array.from(checkboxes).map(cb => ({ 
        id: cb.dataset.id, 
        approved: cb.dataset.approved === 'true',
        status: cb.dataset.status
    }));
    
    if (filterFunc) {
        bills = bills.filter(filterFunc);
    }
    
    return bills.map(b => b.id);
}

function resetBulkSelection() {
    // Bỏ chọn tất cả checkbox
    const selectAllCheckbox = document.getElementById('select-all-bills');
    if (selectAllCheckbox) {
        selectAllCheckbox.checked = false;
    }
    
    // Bỏ chọn tất cả checkbox con
    const billCheckboxes = document.querySelectorAll('.bill-checkbox');
    billCheckboxes.forEach(checkbox => {
        checkbox.checked = false;
    });
    
    // Ẩn các nút hàng loạt
    const bulkApproveBtn = document.getElementById('bulk-approve-bills-btn');
    const bulkUnapproveBtn = document.getElementById('bulk-unapprove-bills-btn');
    const bulkCollectBtn = document.getElementById('bulk-collect-bills-btn');
    const bulkUncollectBtn = document.getElementById('bulk-uncollect-bills-btn');
    
    if (bulkApproveBtn) bulkApproveBtn.classList.add('hidden');
    if (bulkUnapproveBtn) bulkUnapproveBtn.classList.add('hidden');
    if (bulkCollectBtn) bulkCollectBtn.classList.add('hidden');
    if (bulkUncollectBtn) bulkUncollectBtn.classList.add('hidden');
}

/**
 * Cập nhật hiển/ẩn nút bỏ chọn hàng loạt (chỉ hiện khi chọn >= 2)
 */
function updateClearSelectionButton() {
    const btn = document.getElementById('clear-selection-bills-btn');
    if (btn) {
        if (selectedMobileBillIds.size >= 2) {
            btn.classList.remove('hidden');
        } else {
            btn.classList.add('hidden');
        }
    }
}

function updateBulkApprovalButtons() {
    // Lấy từ Set mobile nếu có, không thì từ desktop checkboxes
    let selectedIds, billsData;
    
    if (selectedMobileBillIds.size > 0) {
        // Mobile: Lấy từ Set
        selectedIds = Array.from(selectedMobileBillIds);
        const allBills = getBills();
        billsData = selectedIds.map(id => allBills.find(b => b.id === id)).filter(Boolean);
    } else {
        // Desktop: Lấy từ checkbox
        const checkedBoxes = document.querySelectorAll('.bill-checkbox:checked');
        if (checkedBoxes.length === 0) {
            bulkApproveBtn.classList.add('hidden');
            bulkUnapproveBtn.classList.add('hidden');
            bulkCollectBtn.classList.add('hidden');
            bulkUncollectBtn.classList.add('hidden');
            document.getElementById('bulk-delete-bills-btn')?.classList.add('hidden');
            return;
        }
        billsData = Array.from(checkedBoxes).map(cb => {
            return getBills().find(b => b.id === cb.dataset.id);
        }).filter(Boolean);
    }
    
    if (billsData.length === 0) {
        bulkApproveBtn.classList.add('hidden');
        bulkUnapproveBtn.classList.add('hidden');
        bulkCollectBtn.classList.add('hidden');
        bulkUncollectBtn.classList.add('hidden');
        document.getElementById('bulk-delete-bills-btn')?.classList.add('hidden');
        return;
    }
    
    // Kiểm tra trạng thái duyệt
    const allApproved = billsData.every(b => b.approved === true);
    const allUnapproved = billsData.every(b => !b.approved);
    const someApproved = billsData.some(b => b.approved === true);

    // Kiểm tra trạng thái thanh toán
    const allUnpaid = billsData.every(b => b.status !== 'paid');
    const allPaid = billsData.every(b => b.status === 'paid');
    
    // Kiểm tra hóa đơn đã thu tiền trong danh sách đã duyệt
    const hasPaidApprovedBills = billsData.some(b => b.approved && b.status === 'paid');

    // Hiện/ẩn nút theo logic
    bulkApproveBtn.classList.toggle('hidden', !allUnapproved);
    bulkUnapproveBtn.classList.toggle('hidden', !allApproved || hasPaidApprovedBills); // Ẩn nếu có hóa đơn đã thu tiền
    bulkCollectBtn.classList.toggle('hidden', !(allApproved && allUnpaid));
    bulkUncollectBtn.classList.toggle('hidden', !allPaid);
    
    // Nút xóa: chỉ hiện khi tất cả chưa duyệt
    const deleteBtn = document.getElementById('bulk-delete-bills-btn');
    if (deleteBtn) {
        deleteBtn.classList.toggle('hidden', someApproved);
    }
}

// --- HÀM MODAL HÓA ĐƠN ---

function loadBillModalBuildings() {
    const buildings = getBuildings();
    billBuildingSelect.innerHTML = '<option value="">-- Chọn tòa nhà --</option>';
    buildings.forEach(building => {
        billBuildingSelect.innerHTML += `<option value="${building.id}">${building.code}</option>`;
    });
}

function loadBillModalRooms(buildingId) {
    const building = getBuildings().find(b => b.id === buildingId);
    console.log('Building found:', building);
    console.log('Building rooms:', building ? building.rooms : 'No building');
    
    billRoomSelect.innerHTML = '<option value="">-- Chọn phòng --</option>';
    if (building && building.rooms) {
        building.rooms.forEach(room => {
            console.log('Adding room option:', room);
            billRoomSelect.innerHTML += `<option value="${room}">${room}</option>`;
        });
    }
}

function handleBillBuildingChange() {
    const buildingId = billBuildingSelect.value;
    
    loadBillModalRooms(buildingId);
    billCustomerInput.value = '';
    billCustomerIdInput.value = '';
    clearBillServices();
}

function handleBillRoomChange() {
    const buildingId = billBuildingSelect.value;
    const room = billRoomSelect.value;
    
    if (buildingId && room) {
        const contracts = getContracts();
        
        // Tìm hợp đồng còn hiệu lực
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        let contract = contracts.find(c => {
            if (c.buildingId !== buildingId) return false;
            
            // Loại bỏ hợp đồng đã thanh lý
            if (c.status === 'terminated') return false;
            
            // Kiểm tra ngày hết hạn - chỉ chấp nhận hợp đồng còn hiệu lực
            const endDate = parseDateInput(c.endDate);
            if (!endDate) return false;
            endDate.setHours(0, 0, 0, 0);
            if (endDate < today) return false; // Loại bỏ hợp đồng quá hạn
            
            // Kiểm tra room match
            const cRoom = c.room ? c.room.trim() : '';
            const sRoom = room ? room.trim() : '';
            
            // Thử match trực tiếp
            if (cRoom === sRoom) return true;
            if (cRoom.toLowerCase() === sRoom.toLowerCase()) return true;
            
            // Thử normalize: G01 <-> G1, A02 <-> A2
            const toShort = (r) => {
                if (/^[A-Za-z]0\d+$/i.test(r)) {
                    return r.replace(/^([A-Za-z])0+/i, '$1');
                }
                return r;
            };
            
            const toLong = (r) => {
                if (/^[A-Za-z]\d$/i.test(r)) {
                    return r.charAt(0) + '0' + r.charAt(1);
                }
                return r;
            };
            
            // Thử tất cả combinations
            const cShort = toShort(cRoom);
            const cLong = toLong(cRoom);
            const sShort = toShort(sRoom);
            const sLong = toLong(sRoom);
            
            return cShort === sRoom || cLong === sRoom || 
                   cRoom === sShort || cRoom === sLong ||
                   cShort.toLowerCase() === sRoom.toLowerCase() ||
                   cLong.toLowerCase() === sRoom.toLowerCase() ||
                   cRoom.toLowerCase() === sShort.toLowerCase() ||
                   cRoom.toLowerCase() === sLong.toLowerCase();
        });
        
        const building = getBuildings().find(b => b.id === buildingId);
        
        if (contract && building) {
            // Có hợp đồng active
            const customer = getCustomers().find(c => c.id === contract.representativeId);
            billCustomerInput.value = customer ? customer.name : 'Không tìm thấy khách hàng';
            billCustomerIdInput.value = customer ? customer.id : '';
            loadBillServices(contract, building);
        } else if (building) {
            // Không có hợp đồng active nhưng vẫn hiển thị dịch vụ
            billCustomerInput.value = 'Chưa có hợp đồng';
            billCustomerIdInput.value = '';
            // Tạo contract giả với rent = 0
            const dummyContract = { 
                rentPrice: 0, 
                serviceDetails: [],
                room: room,
                buildingId: buildingId
            };
            loadBillServices(dummyContract, building);
        }
        return;
    }
    
    billCustomerInput.value = '';
    billCustomerIdInput.value = '';
    clearBillServices();
}

function loadBillServices(contract, building) {
    const listEl = billServicesListEl;
    listEl.innerHTML = '';
    
    console.log('Loading services with contract:', {
        rentPrice: contract?.rentPrice,
        room: contract?.room,
        buildingId: contract?.buildingId,
        hasContract: !!contract
    });
    
    if (!building || !building.services || building.services.length === 0) {
        listEl.innerHTML = '<tr><td colspan="6" class="p-4 text-center text-gray-500">Tòa nhà chưa có dịch vụ nào</td></tr>';
        return;
    }

    // Không cần bắt buộc chọn period - sẽ dùng tháng hiện tại nếu chưa chọn
    const selectedPeriod = billPeriodSelect.value || (new Date().getMonth() + 1).toString();
    
    // Find previous month bill to get old readings
    const currentMonth = parseInt(selectedPeriod);
    const previousMonth = currentMonth === 1 ? 12 : currentMonth - 1;
    const previousBill = getBills().find(b => 
        b.buildingId === building.id && 
        b.room === contract.room && 
        b.period == previousMonth
    );
    
    const year = new Date().getFullYear();
    const monthNumber = parseInt(selectedPeriod); // 1-12
    
    // Create dates in local timezone to avoid timezone issues
    const firstDayOfMonth = new Date(year, monthNumber - 1, 1); // month - 1 for 0-based index
    const lastDayOfMonth = new Date(year, monthNumber, 0); // month + 0 gives last day of previous month = last day of current month
    
    // Format as YYYY-MM-DD without timezone conversion
    const formatDateLocal = (date) => {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    };
    
    const firstDay = formatDateLocal(firstDayOfMonth);
    const lastDay = formatDateLocal(lastDayOfMonth);
    
    // Add rent row first
    const rentRow = document.createElement('tr');
    rentRow.className = 'border-b';
    rentRow.dataset.price = contract.rentPrice || 0;
    rentRow.dataset.type = 'rent';
    rentRow.dataset.unit = 'tháng';
    rentRow.innerHTML = `
        <td class="py-2 px-3 font-medium">Tiền nhà</td>
        <td class="py-2 px-3">${formatMoney(contract.rentPrice || 0)}/tháng</td>
        <td class="py-2 px-3">
            <input type="text" value="${formatDateDisplay(firstDay)}" pattern="[0-9]{2}-[0-9]{2}-[0-9]{4}" placeholder="dd-mm-yyyy" class="w-28 text-xs p-1 border rounded date-input" title="Định dạng: dd-mm-yyyy">
        </td>
        <td class="py-2 px-3">
            <input type="text" value="${formatDateDisplay(lastDay)}" pattern="[0-9]{2}-[0-9]{2}-[0-9]{4}" placeholder="dd-mm-yyyy" class="w-28 text-xs p-1 border rounded date-input" title="Định dạng: dd-mm-yyyy">
        </td>
        <td class="py-2 px-3"><span class="text-sm text-gray-600 quantity-display">${lastDayOfMonth.getDate()} ngày</span></td>
        <td class="py-2 px-3 font-bold text-blue-600 service-total">${formatMoney(contract.rentPrice || 0)} VNĐ</td>
        <td class="py-2 px-3"></td>
    `;
    listEl.appendChild(rentRow);
    
    if (building.services && building.services.length > 0) {
        // Get service details from contract
        const serviceDetails = contract.serviceDetails || [];
        
        // Sort services: electric -> water -> other services
        const sortedServices = [...building.services].sort((a, b) => {
            const getOrder = (service) => {
                if (service.name && service.name.toLowerCase().includes('điện')) return 1;
                if (service.name && service.name.toLowerCase().includes('nước')) return 2;
                return 3; // other services
            };
            
            return getOrder(a) - getOrder(b);
        });

        sortedServices.forEach(buildingService => {
            // buildingService already has {id, name, price, unit}
            if (buildingService) {
                // Get detail from contract (quantity or initialReading)
                const detail = serviceDetails.find(d => d.serviceId === buildingService.id);
                let initialReading = detail?.initialReading || 0;
                let quantity = detail?.quantity || 1;
                
                // Check if this is electric or water meter service
                const isElectric = buildingService.name && buildingService.name.toLowerCase().includes('điện');
                const isWaterMeter = buildingService.name && buildingService.name.toLowerCase().includes('nước') && 
                                   (buildingService.unit === 'm³' || buildingService.unit === 'khối' || buildingService.unit.toLowerCase().includes('m3'));
                
                // If there's a previous bill, get old reading or quantity from it
                if (previousBill && previousBill.services) {
                    if (isElectric || isWaterMeter) {
                        const prevService = previousBill.services.find(s => 
                            s.serviceId === buildingService.id || 
                            (isElectric && (s.type === 'electric' || s.serviceName?.toLowerCase().includes('điện'))) ||
                            (isWaterMeter && s.serviceName?.toLowerCase().includes('nước'))
                        );
                        if (prevService) {
                            if (prevService.newReading !== undefined) {
                                initialReading = prevService.newReading;
                            } else if (prevService.quantity !== undefined) {
                                initialReading = prevService.quantity;
                            }
                        }
                    } else {
                        // For other services, get quantity from previous bill
                        const prevService = previousBill.services.find(s => s.serviceId === buildingService.id);
                        if (prevService && prevService.quantity !== undefined) {
                            quantity = prevService.quantity;
                        }
                    }
                }
                
                const serviceRow = document.createElement('tr');
                serviceRow.className = 'border-b';
                serviceRow.dataset.price = buildingService.price;
                serviceRow.dataset.serviceId = buildingService.id;
                serviceRow.dataset.unit = buildingService.unit;
                serviceRow.dataset.type = isElectric ? 'electric' : (isWaterMeter ? 'water_meter' : 'service');
                
                if (isElectric || isWaterMeter) {
                    // For electric/water meter: old reading, new reading input
                    serviceRow.innerHTML = `
                        <td class="py-2 px-3 font-medium">${buildingService.name}</td>
                        <td class="py-2 px-3">${formatMoney(buildingService.price)}/${buildingService.unit}</td>
                        <td class="py-2 px-3">
                            <input type="number" value="${initialReading}" class="w-20 text-xs p-1 border rounded electric-old-reading" placeholder="Số cũ">
                        </td>
                        <td class="py-2 px-3">
                            <input type="number" class="w-20 text-xs p-1 border rounded electric-new-reading" data-service-id="${buildingService.id}" data-price="${buildingService.price}" placeholder="Số mới">
                        </td>
                        <td class="py-2 px-3 text-gray-400">-</td>
                        <td class="py-2 px-3 font-bold text-blue-600 service-total">0 VNĐ</td>
                        <td class="py-2 px-3">
                            <button type="button" class="remove-service-btn text-red-600 hover:text-red-800 p-1 rounded">
                                <svg class="w-4 h-4 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
                                </svg>
                            </button>
                        </td>
                    `;
                } else {
                    // For other services: date range, quantity from contract
                    const totalAmount = buildingService.price * quantity;
                    // Also set dataset for other services
                    serviceRow.dataset.price = buildingService.price;
                    serviceRow.dataset.serviceId = buildingService.id;
                    serviceRow.dataset.unit = buildingService.unit;
                    serviceRow.dataset.type = 'service';
                    serviceRow.innerHTML = `
                        <td class="py-2 px-3 font-medium">${buildingService.name}</td>
                        <td class="py-2 px-3">${formatMoney(buildingService.price)}/${buildingService.unit}</td>
                        <td class="py-2 px-3">
                            <input type="text" value="${formatDateDisplay(firstDay)}" pattern="[0-9]{2}-[0-9]{2}-[0-9]{4}" placeholder="dd-mm-yyyy" class="w-28 text-xs p-1 border rounded date-input" title="Định dạng: dd-mm-yyyy">
                        </td>
                        <td class="py-2 px-3">
                            <input type="text" value="${formatDateDisplay(lastDay)}" pattern="[0-9]{2}-[0-9]{2}-[0-9]{4}" placeholder="dd-mm-yyyy" class="w-28 text-xs p-1 border rounded date-input" title="Định dạng: dd-mm-yyyy">
                        </td>
                        <td class="py-2 px-3">
                            <input type="number" value="${quantity}" class="w-20 text-xs p-1 border rounded service-quantity" data-service-id="${buildingService.id}" data-price="${buildingService.price}">
                        </td>
                        <td class="py-2 px-3 font-bold text-blue-600 service-total">${formatMoney(totalAmount)} VNĐ</td>
                        <td class="py-2 px-3">
                            <button type="button" class="remove-service-btn text-red-600 hover:text-red-800 p-1 rounded">
                                <svg class="w-4 h-4 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
                                </svg>
                            </button>
                        </td>
                    `;
                }
                listEl.appendChild(serviceRow);
            }
        });
    }
    
    // ĐẢM BẢO TÍNH TOÁN ĐÚNG SAU KHI RENDER XONG
    calculateBillTotal();
}

function renderSavedBillServices(services) {
    console.log('Rendering saved services:', services);
    billServicesListEl.innerHTML = '';
    services.forEach(item => {
        console.log('Adding service:', {
            name: item.serviceName,
            type: item.type, 
            fromDate: item.fromDate,
            toDate: item.toDate,
            quantity: item.quantity,
            amount: item.amount,
            unitPrice: item.unitPrice
        });
        addServiceRow(item);
    });
    calculateBillTotal();
}

function addServiceRow(item) {
    const row = document.createElement('tr');
    row.className = 'border-b';
    row.dataset.type = item.type;
    row.dataset.serviceId = item.serviceId || '';
    row.dataset.price = item.unitPrice || 0;
    row.dataset.unit = item.unit || '';

    let rowHTML = `
        <td class="py-2 px-3 font-medium service-name">${item.serviceName}</td>
        <td class="py-2 px-3">${formatMoney(item.unitPrice)}/${item.unit}</td>
    `;

    if (item.type === 'rent' || (item.type === 'service' && !item.oldReading)) {
        // Dịch vụ có ngày (Tiền nhà, Internet,...)
        rowHTML += `
            <td class="py-2 px-3">
                <input type="text" value="${item.fromDate ? formatDateDisplay(item.fromDate) : ''}" pattern="[0-9]{2}-[0-9]{2}-[0-9]{4}" class="w-28 text-xs p-1 border rounded date-input">
            </td>
            <td class="py-2 px-3">
                <input type="text" value="${item.toDate ? formatDateDisplay(item.toDate) : ''}" pattern="[0-9]{2}-[0-9]{2}-[0-9]{4}" class="w-28 text-xs p-1 border rounded date-input">
            </td>
            <td class="py-2 px-3">
                ${item.type === 'rent' ? `<span class="text-sm text-gray-600 quantity-display">${item.quantityDisplay || '...'}</span>` : 
                `<input type="number" value="${item.quantity !== undefined && item.quantity !== null ? item.quantity : 1}" class="w-20 text-xs p-1 border rounded service-quantity">`}
            </td>
        `;
    } else if (item.type === 'electric' || item.type === 'water_meter') {
        // Dịch vụ có đồng hồ (Điện, Nước khối)
        rowHTML += `
            <td class="py-2 px-3">
                <input type="number" value="${item.oldReading || 0}" class="w-20 text-xs p-1 border rounded electric-old-reading" placeholder="Số cũ">
            </td>
            <td class="py-2 px-3">
                <input type="number" value="${item.newReading || ''}" class="w-20 text-xs p-1 border rounded electric-new-reading" data-service-id="${item.serviceId || ''}" data-price="${item.unitPrice || 0}" placeholder="Số mới">
            </td>
            <td class="py-2 px-3 text-gray-400">-</td>
        `;
    } else { // Dịch vụ tùy chỉnh
        row.dataset.type = 'custom';
        row.classList.add('bg-yellow-50');
        rowHTML = `
            <td class="py-2 px-3"><input type="text" value="${item.serviceName}" class="w-full text-xs p-1 border rounded font-medium service-name" placeholder="Tên phí"></td>
            <td class="py-2 px-3"><input type="text" value="${formatMoney(item.unitPrice)}" class="w-20 text-xs p-1 border rounded custom-service-price money-input" data-original-price="${item.unitPrice}"></td>
            <td class="py-2 px-3"><input type="text" value="${item.fromDate ? formatDateDisplay(item.fromDate) : ''}" pattern="[0-9]{2}-[0-9]{2}-[0-9]{4}" class="w-28 text-xs p-1 border rounded date-input custom-from-date" placeholder="dd-mm-yyyy" title="Định dạng: dd-mm-yyyy"></td>
            <td class="py-2 px-3"><input type="text" value="${item.toDate ? formatDateDisplay(item.toDate) : ''}" pattern="[0-9]{2}-[0-9]{2}-[0-9]{4}" class="w-28 text-xs p-1 border rounded date-input custom-to-date" placeholder="dd-mm-yyyy" title="Định dạng: dd-mm-yyyy"></td>
            <td class="py-2 px-3"><input type="number" value="${item.quantity !== undefined && item.quantity !== null ? item.quantity : 1}" class="w-20 text-xs p-1 border rounded service-quantity"></td>
        `;
    }

    rowHTML += `
        <td class="py-2 px-3 font-bold text-blue-600 service-total">${formatMoney(item.amount)}</td>
        <td class="py-2 px-3">
            <button type="button" class="remove-service-btn text-red-600 hover:text-red-800 p-1 rounded">
                <svg class="w-4 h-4 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
                </svg>
            </button>
        </td>
    `;
    
    row.innerHTML = rowHTML;
    billServicesListEl.appendChild(row);
    
    // Với dịch vụ tùy chỉnh có ngày tháng, tự động tính toán lại amount
    if (item.type === 'custom' && item.fromDate && item.toDate) {
        // Trigger tính toán lại sau khi DOM được cập nhật
        setTimeout(() => {
            const fromDateInput = row.querySelector('.custom-from-date');
            if (fromDateInput) {
                // Trigger event để tính toán lại
                fromDateInput.dispatchEvent(new Event('input', { bubbles: true }));
            }
        }, 50);
    }
}

function addCustomServiceRow() {
    addServiceRow({
        serviceName: '', type: 'custom',
        unitPrice: 0, unit: 'lần',
        fromDate: null, toDate: null,
        quantity: 1, amount: 0
    });
}

function clearBillServices() {
    billServicesListEl.innerHTML = '';
    calculateBillTotal();
}

function calculateBillTotal() {
    let total = 0;
    document.querySelectorAll('#bill-services-list tr').forEach(row => {
        const totalEl = row.querySelector('.service-total');
        total += parseFormattedNumber(totalEl.textContent);
    });
    billTotalAmountEl.textContent = formatMoney(total) + ' VNĐ';
}

function handleRemoveServiceClick(e) {
    const target = e.target;
    if (target.closest('.remove-service-btn')) {
        const row = target.closest('tr');
        if (row && confirm('Bạn có chắc muốn xóa dịch vụ này?')) {
            row.remove();
            calculateBillTotal();
        }
    }
}

function handleServiceInputChange(e) {
    const target = e.target;
    const row = target.closest('tr');
    if (!row) return;

    const rowType = row.dataset.type;
    const unitPrice = parseFormattedNumber(row.querySelector('.custom-service-price')?.value) || parseFloat(row.dataset.price) || 0;
    let quantity = 1;
    let total = 0;

    console.log('Service input change:', {
        targetClass: target.className,
        rowType: rowType,
        unitPrice: unitPrice
    });

    if (target.classList.contains('electric-new-reading') || target.classList.contains('electric-old-reading')) {
        // Dịch vụ điện/nước có đồng hồ
        const oldReading = parseInt(row.querySelector('.electric-old-reading').value) || 0;
        const newReading = parseInt(row.querySelector('.electric-new-reading').value) || 0;
        quantity = Math.max(0, newReading - oldReading);
        total = quantity * unitPrice;
        
        console.log('Electric calculation:', {
            oldReading,
            newReading,
            quantity,
            unitPrice,
            total
        });
    } else if (target.classList.contains('date-input') || target.classList.contains('custom-from-date') || target.classList.contains('custom-to-date')) {
        // Thay đổi ngày - tính theo số ngày
        const fromDateInput = row.querySelector('.custom-from-date') || row.querySelectorAll('input[type="text"]')[0];
        const toDateInput = row.querySelector('.custom-to-date') || row.querySelectorAll('input[type="text"]')[1];
        
        if (fromDateInput && toDateInput && fromDateInput.value && toDateInput.value) {
            const fromDate = parseDateInput(fromDateInput.value);
            const toDate = parseDateInput(toDateInput.value);
            
            if (fromDate && toDate) {
                const daysDiff = Math.round((toDate - fromDate) / (1000 * 60 * 60 * 24)) + 1; // +1 để tính cả ngày cuối
                const actualDays = Math.max(0, daysDiff);
                
                // Tính số ngày thực tế của tháng (không hardcode 30)
                const daysInMonth = new Date(fromDate.getFullYear(), fromDate.getMonth() + 1, 0).getDate();
                
                if (rowType === 'rent') {
                    // Với tiền nhà, tính theo tỷ lệ ngày thực tế và làm tròn
                    total = Math.round((actualDays / daysInMonth) * unitPrice);
                    
                    // Cập nhật hiển thị số ngày
                    const quantityDisplay = row.querySelector('.quantity-display');
                    if (quantityDisplay) {
                        quantityDisplay.textContent = `${actualDays} ngày`;
                    }
                } else if (rowType === 'custom') {
                    // Dịch vụ tùy chỉnh: tính tổng tiền trước (đơn giá × số lượng), rồi mới áp dụng tỷ lệ ngày
                    const quantityInput = row.querySelector('.service-quantity');
                    const serviceQuantity = quantityInput ? (parseInt(quantityInput.value) || 1) : 1;
                    const totalServiceAmount = unitPrice * serviceQuantity; // Tổng tiền dịch vụ
                    total = Math.round((actualDays / daysInMonth) * totalServiceAmount); // Áp dụng tỷ lệ ngày và làm tròn
                    
                    console.log('Custom service date calculation:', {
                        serviceQuantity,
                        unitPrice,
                        totalServiceAmount,
                        daysUsed: actualDays,
                        daysInMonth,
                        ratio: actualDays / daysInMonth,
                        finalTotal: total
                    });
                } else {
                    // Dịch vụ khác: tính tổng tiền trước (đơn giá × số lượng), rồi mới áp dụng tỷ lệ ngày và làm tròn
                    const quantityInput = row.querySelector('.service-quantity');
                    const serviceQuantity = quantityInput ? (parseInt(quantityInput.value) || 1) : 1;
                    const totalServiceAmount = unitPrice * serviceQuantity; // Tổng tiền dịch vụ
                    total = Math.round((actualDays / daysInMonth) * totalServiceAmount); // Áp dụng tỷ lệ ngày và làm tròn
                }
                
                console.log('Date-based calculation:', {
                    fromDate: fromDateInput.value,
                    toDate: toDateInput.value,
                    actualDays,
                    unitPrice,
                    total,
                    type: rowType
                });
            } else {
                // Nếu ngày không hợp lệ, dùng quantity input
                const quantityInput = row.querySelector('.service-quantity');
                quantity = quantityInput ? (parseInt(quantityInput.value) || 1) : 1;
                total = quantity * unitPrice;
            }
        } else {
            // Không có ngày, dùng quantity input
            const quantityInput = row.querySelector('.service-quantity');
            quantity = quantityInput ? (parseInt(quantityInput.value) || 1) : 1;
            total = quantity * unitPrice;
        }
    } else if (target.classList.contains('service-quantity') || target.classList.contains('custom-service-price')) {
        // Thay đổi số lượng hoặc đơn giá
        const quantityInput = row.querySelector('.service-quantity');
        quantity = parseInt(quantityInput?.value) || 1;
        
        // Kiểm tra xem có ngày tháng không, nếu có thì tính theo ngày
        const fromDateInput = row.querySelector('.custom-from-date') || row.querySelectorAll('input[type="text"]')[0];
        const toDateInput = row.querySelector('.custom-to-date') || row.querySelectorAll('input[type="text"]')[1];
        
        if (fromDateInput && toDateInput && fromDateInput.value && toDateInput.value && rowType !== 'electric' && rowType !== 'water_meter') {
            // Có ngày tháng và không phải tiền điện/nước đồng hồ -> tính theo ngày
            const fromDate = parseDateInput(fromDateInput.value);
            const toDate = parseDateInput(toDateInput.value);
            
            if (fromDate && toDate) {
                const daysDiff = Math.round((toDate - fromDate) / (1000 * 60 * 60 * 24)) + 1;
                const actualDays = Math.max(0, daysDiff);
                const daysInMonth = new Date(fromDate.getFullYear(), fromDate.getMonth() + 1, 0).getDate();
                
                if (rowType === 'rent') {
                    // Tiền nhà: tính theo tỷ lệ ngày và làm tròn
                    total = Math.round((actualDays / daysInMonth) * unitPrice);
                } else if (rowType === 'custom') {
                    // Dịch vụ tùy chỉnh: tính tổng tiền trước, rồi áp dụng tỷ lệ ngày
                    const totalServiceAmount = unitPrice * quantity; // quantity từ input
                    total = Math.round((actualDays / daysInMonth) * totalServiceAmount);
                    
                    console.log('Custom service quantity/price change with dates:', {
                        quantity,
                        unitPrice,
                        totalServiceAmount,
                        actualDays,
                        daysInMonth,
                        ratio: actualDays / daysInMonth,
                        finalTotal: total
                    });
                } else {
                    // Dịch vụ khác: tính tổng tiền trước, rồi áp dụng tỷ lệ ngày và làm tròn
                    const totalServiceAmount = unitPrice * quantity; // quantity từ input
                    total = Math.round((actualDays / daysInMonth) * totalServiceAmount);
                }
            } else {
                // Ngày không hợp lệ, tính theo số lượng
                total = quantity * unitPrice;
            }
        } else {
            // Không có ngày hoặc là tiền điện/nước -> tính theo số lượng
            total = quantity * unitPrice;
        }
    } else {
        // Fallback - các trường hợp khác
        const quantityInput = row.querySelector('.service-quantity');
        quantity = quantityInput ? (parseInt(quantityInput.value) || 1) : 1;
        total = quantity * unitPrice;
    }
    
    row.querySelector('.service-total').textContent = formatMoney(total) + ' VNĐ';
    calculateBillTotal();
}

// --- HÀM MODAL CHI TIẾT HÓA ĐƠN ---

async function showBillDetail(billId) {
    const bill = getBills().find(b => b.id === billId);
    if (!bill) {
        console.error('Bill not found:', billId);
        return;
    }
    
    // 🚫 Không hiển thị chi tiết cho hóa đơn thanh lý (chờ hoặc đã thanh lý)
    if (bill.isTerminationBill) {
        showToast('Không thể xem chi tiết hóa đơn thanh lý', 'warning');
        return;
    }
    
    console.log('Showing bill detail:', bill);

    const building = getBuildings().find(b => b.id === bill.buildingId);
    const customer = getCustomers().find(c => c.id === bill.customerId);
    const contract = getContracts().find(c => c.buildingId === bill.buildingId && c.room === bill.room); // Tìm HĐ bất kỳ
    
    const setEl = (id, text) => {
        const element = document.getElementById(id);
        if (element) {
            element.textContent = text || 'N/A';
        } else {
            console.error('Element not found:', id);
        }
    };
    
    setEl('bill-detail-number', billNumber(bill));
    setEl('bill-detail-date', formatDateDisplay(bill.billDate));
    
    let dueDate = 'N/A';
    if(bill.dueDate && bill.period && bill.billDate) {
        const billYear = parseDateInput(bill.billDate).getFullYear();
        dueDate = `${String(bill.dueDate).padStart(2, '0')}-${String(bill.period).padStart(2, '0')}-${billYear}`;
    }
    setEl('bill-detail-due-date', dueDate);

    setEl('bill-detail-room', bill.room);
    setEl('bill-detail-customer-name', customer ? customer.name : 'N/A');
    setEl('bill-detail-address', building ? building.address : 'N/A');
    
    const billYear = parseDateInput(
        bill.createdAt ? safeToDate(bill.createdAt) : bill.billDate
    ).getFullYear();
    setEl('bill-detail-title', `Hóa Đơn Tiền Nhà Tháng ${String(bill.period).padStart(2, '0')}-${billYear}`);

    const tableBody = document.getElementById('bill-detail-services-table');
    const mobileServicesEl = document.getElementById('bill-detail-services-mobile');
    // Chỉ xóa nội dung tbody, không xóa header
    tableBody.innerHTML = '';
    if (mobileServicesEl) mobileServicesEl.innerHTML = '';
    
    (bill.services || []).forEach((item, index) => {
        const row = document.createElement('tr');
        row.className = 'border-b';
        
        // Sử dụng trường name hoặc serviceName để hiển thị tên dịch vụ
        let content = item.name || item.serviceName || 'Dịch vụ không xác định';
        let unitPrice = item.unitPrice || 0;
        let quantity = item.quantity;
        let extraInfo = '';
        
        // Fix unitPrice cho từng loại service
        if (item.type === 'electric' || item.type === 'water_meter') {
            extraInfo = `(SC: ${item.oldReading} - SM: ${item.newReading})`;
            content += `<br><span class="text-xs text-gray-500">${extraInfo}</span>`;
        } else if (item.type === 'rent') {
            quantity = item.quantityDisplay || 1;
            // Với tiền nhà, nếu unitPrice bằng 0 thì tính từ amount/quantity
            if (unitPrice === 0 && item.amount && quantity > 0) {
                unitPrice = item.amount / quantity;
            }
            // Thêm khoảng thời gian cho tiền nhà - LẤY TỪ FROMDATE/TODATE THỰC TẾ
            if (item.fromDate && item.toDate) {
                // Có ngày tháng cụ thể - ĐỊNH DẠNG NGẮN (DD-MM)
                const fromDateShort = formatDateDisplay(item.fromDate).substring(0, 5); // DD-MM
                const toDateShort = formatDateDisplay(item.toDate).substring(0, 5); // DD-MM
                extraInfo = `(Từ ${fromDateShort} đến ${toDateShort})`;
            } else {
                // Cả tháng
                const billDate = parseDateInput(bill.billDate);
                const startDay = 1;
                const endDay = new Date(billDate.getFullYear(), billDate.getMonth() + 1, 0).getDate();
                extraInfo = `(Từ ngày ${startDay}-${String(bill.period).padStart(2, '0')} đến ${endDay}-${String(bill.period).padStart(2, '0')})`;
            }
            content += `<br><span class="text-xs text-gray-500">${extraInfo}</span>`;
        } else if (item.type === 'custom' && item.fromDate && item.toDate) {
            // Dịch vụ tùy chỉnh có ngày tháng - ĐỊNH DẠNG NGẮN (DD-MM)
            const fromDateShort = formatDateDisplay(item.fromDate).substring(0, 5); // DD-MM
            const toDateShort = formatDateDisplay(item.toDate).substring(0, 5); // DD-MM
            extraInfo = `(Từ ${fromDateShort} đến ${toDateShort})`;
            content += `<br><span class="text-xs text-gray-500">${extraInfo}</span>`;
        }
        
        const formattedUnitPrice = formatMoney(unitPrice);

        row.innerHTML = `
            <td class="py-2 px-3 text-center border border-gray-800">${index + 1}</td>
            <td class="py-2 px-3 border border-gray-800">${content}</td>
            <td class="py-2 px-3 text-right border border-gray-800">${formattedUnitPrice}</td>
            <td class="py-2 px-3 text-right border border-gray-800">${quantity}</td>
            <td class="py-2 px-3 text-right font-medium border border-gray-800">${formatMoney(item.amount)}</td>
        `;
        tableBody.appendChild(row);
        
        // 📱 RENDER MOBILE CARD
        if (mobileServicesEl) {
            const mobileCard = document.createElement('div');
            mobileCard.className = 'mobile-card';
            mobileCard.innerHTML = `
                <div class="flex justify-between items-start mb-2">
                    <span class="font-semibold text-gray-900">${index + 1}. ${item.name || item.serviceName || 'Dịch vụ không xác định'}</span>
                    <span class="font-bold text-green-600">${formatMoney(item.amount)}</span>
                </div>
                ${extraInfo ? `<div class="text-xs text-gray-500 mb-2">${extraInfo}</div>` : ''}
                <div class="grid grid-cols-2 gap-2 text-sm">
                    <div>
                        <span class="text-gray-600">Đơn giá:</span>
                        <span class="font-medium ml-1">${formattedUnitPrice}</span>
                    </div>
                    <div class="text-right">
                        <span class="text-gray-600">Số lượng:</span>
                        <span class="font-medium ml-1">${quantity}</span>
                    </div>
                </div>
            `;
            mobileServicesEl.appendChild(mobileCard);
        }
    });
    
    // 💰 TÍNH TOÁN THANH TOÁN THỰC TẾ TỪ TRANSACTIONS
    // Lấy tất cả transactions liên kết với billId này
    const { getTransactions } = await import('../store.js');
    const allTransactions = getTransactions();
    const relatedTransactions = allTransactions.filter(t => 
        t.billId === billId && t.type === 'income' && t.approved
    );
    
    // Ưu tiên dùng paidAmount từ bill (đã được cập nhật khi thu tiền)
    // Chỉ tính lại từ transactions nếu bill.paidAmount không tồn tại
    let paidAmount = 0;
    if (bill.paidAmount !== undefined && bill.paidAmount !== null) {
        // Dùng paidAmount từ bill (đã được set khi thu tiền)
        paidAmount = bill.paidAmount;
        console.log('💰 Using paidAmount from bill:', paidAmount);
    } else if (relatedTransactions.length > 0) {
        // Fallback: Tính từ transactions (cho các bill cũ không có paidAmount)
        paidAmount = relatedTransactions.reduce((sum, transaction) => {
            const transactionTotal = transaction.items?.reduce((itemSum, item) => itemSum + (item.amount || 0), 0) || 0;
            return sum + transactionTotal;
        }, 0);
        console.log('💰 Calculated paidAmount from transactions:', paidAmount);
    }
    
    // Số tiền còn lại
    const remainingAmount = bill.totalAmount - paidAmount;
    
    console.log('💰 Payment calculation:', {
        billId,
        totalAmount: bill.totalAmount,
        paidAmount,
        remainingAmount,
        relatedTransactions: relatedTransactions.length
    });
    
    setEl('bill-detail-subtotal', formatMoney(bill.totalAmount) + ' VNĐ');
    setEl('bill-detail-paid', formatMoney(paidAmount) + ' VNĐ'); // Đã thanh toán
    setEl('bill-detail-due-amount', formatMoney(remainingAmount) + ' VNĐ'); // Còn lại
    
    // 🎯 TẠO QR - LOGIC ĐÚNG: 
    // - Hóa đơn ĐÃ THU: Dùng tài khoản từ phiếu thu (cố định)
    // - Hóa đơn CHƯA THU: Dùng tài khoản hiện tại của tòa nhà
    let qrContent = 'CHUYEN KHOAN';
    if (customer && customer.name) {
        // Chuyển tên thành chữ hoa, bỏ dấu để phù hợp với format ngân hàng
        const customerName = customer.name
            .toUpperCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '') // Bỏ dấu tiếng Việt
            .replace(/Đ/g, 'D')
            .replace(/đ/g, 'd');
        qrContent = `${customerName} CHUYEN KHOAN`;
    }
    const qrImg = document.getElementById('bill-detail-qr');
    
    // 🔍 Kiểm tra xem hóa đơn đã thu tiền chưa
    let targetAccountId = null;
    
    if (bill.status === 'paid' && relatedTransactions.length > 0) {
        // 🔒 HÓA ĐƠN ĐÃ THU: Dùng tài khoản từ phiếu thu đầu tiên (cố định)
        const firstTransaction = relatedTransactions[0];
        targetAccountId = firstTransaction.accountId;
        console.log(`🔒 Hóa đơn đã thu - dùng tài khoản từ phiếu thu: ${targetAccountId}`);
    } else {
        // 🔄 HÓA ĐƠN CHƯA THU: Dùng tài khoản hiện tại của tòa nhà  
        targetAccountId = building?.accountId;
        console.log(`🔄 Hóa đơn chưa thu - dùng tài khoản hiện tại: ${targetAccountId}`);
    }

    // Lấy thông tin tài khoản
    let qrUrl = '';
    let usingAssignedAccount = false;
    
    if (targetAccountId) {
        const accounts = getAccounts();
        if (accounts && accounts.length > 0) {
            const assignedAccount = accounts.find(acc => acc.id === targetAccountId);
            
            if (assignedAccount) {
                console.log('🔍 DEBUG assigned account:', assignedAccount);
                
                if (assignedAccount.bank === 'Cash') {
                    // Tiền mặt - chỉ ẩn QR thôi, không hiện gì thêm
                    qrImg.style.display = 'none';
                    
                    // Ẩn luôn thông báo nếu có
                    const cashDiv = document.getElementById('cash-payment-notice');
                    if (cashDiv) {
                        cashDiv.style.display = 'none';
                    }
                    
                    console.log('💵 Tiền mặt - ẩn QR code');
                    // KHÔNG return ở đây để modal vẫn mở được
                } else if (assignedAccount.accountNumber) {
                    // Reset - ẩn thông báo tiền mặt, hiện lại QR
                    const cashDiv = document.getElementById('cash-payment-notice');
                    if (cashDiv) cashDiv.style.display = 'none';
                    qrImg.style.display = 'block';
                    
                    // Có tài khoản ngân hàng được gán
                    const BANK_ID_MAP = {
                        'VietcomBank': '970436',
                        'BIDV': '970418', 
                        'VietinBank': '970415',
                        'Agribank': '970405',
                        'ACB': '970416',
                        'Techcombank': '970407',
                        'MBBank': '970422',
                        'TPBank': '970423',
                        'Sacombank': '970403',
                        'HDBank': '970437',
                        'VPBank': '970432',
                        'SHB': '970443',
                        'Eximbank': '970431',
                        'MSB': '970426',
                        'OCB': '970448',
                        'Nam A Bank': '970428'  // Nam A Bank
                    };
                    let bankId = BANK_ID_MAP[assignedAccount.bank] || assignedAccount.bankId || '970416';
                    
                    const accountNo = assignedAccount.accountNumber;
                    const accountName = assignedAccount.accountHolder || 'KHACH HANG';
                    
                    console.log('🏦 QR Info:', { bank: assignedAccount.bank, bankId, accountNo, accountName });
                    
                    qrUrl = `https://img.vietqr.io/image/${bankId}-${accountNo}-qr_only.jpg?amount=${bill.totalAmount}&addInfo=${encodeURIComponent(qrContent)}&accountName=${encodeURIComponent(accountName)}`;
                    usingAssignedAccount = true;
                    
                    console.log('✅ Using account:', assignedAccount.bank, accountNo, 'BankID:', bankId);
                }
            }
        }
    }
    
    // Chỉ hiển thị QR nếu có URL (không phải tiền mặt)
    if (qrUrl) {
        qrImg.src = qrUrl;
    } else if (!targetAccountId) {
        // Chỉ báo lỗi khi thực sự chưa có tài khoản gì cả
        console.error('❌ KHÔNG CÓ TÀI KHOẢN CHO HÓA ĐƠN NÀY!');
        qrImg.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgZmlsbD0iI2ZmMDAwMCIvPjx0ZXh0IHg9IjEwMCIgeT0iMTAwIiBmaWxsPSJ3aGl0ZSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZm9udC1zaXplPSIxNCI+Q2h1YSBnYW4gdGFpIGtob2FuPC90ZXh0Pjwvc3ZnPg==';
    }

    openModal(billDetailModal);
    
    // Fix scroll cho mobile sau khi modal mở
    setTimeout(() => {
        if (window.innerWidth <= 768) {
            const modal = document.getElementById('bill-detail-modal');
            const printableDiv = document.getElementById('bill-detail-printable');
            
            if (modal && printableDiv) {
                // Force modal position and size
                modal.style.position = 'fixed';
                modal.style.top = '0';
                modal.style.left = '0';
                modal.style.width = '100vw';
                modal.style.height = '100vh';
                modal.style.zIndex = '9999';
                
                // Reset và force scroll properties
                printableDiv.scrollTop = 0;
                printableDiv.style.overflowY = 'auto';
                printableDiv.style.webkitOverflowScrolling = 'touch';
                printableDiv.style.touchAction = 'pan-y';
                printableDiv.style.height = '100%';
                printableDiv.style.minHeight = '100%';
                
                // Prevent body scroll khi modal mở
                document.body.style.overflow = 'hidden';
                document.body.style.position = 'fixed';
                document.body.style.width = '100%';
                document.body.style.height = '100%';
            }
        }
    }, 150);
}

// --- HÀM IMPORT/EXPORT ---

function initImportModal() {
    document.getElementById('import-bills-btn').addEventListener('click', () => {
        const buildings = getBuildings();
        importBillBuildingSelect.innerHTML = '<option value="">-- Chọn tòa nhà --</option>';
        buildings.forEach(building => {
            importBillBuildingSelect.innerHTML += `<option value="${building.id}">${building.code}</option>`;
        });
        importBillMonthSelect.value = '';
        importBillYearSelect.value = new Date().getFullYear().toString(); // Mặc định là năm hiện tại
        document.getElementById('import-bills-file-name').textContent = '';
        document.getElementById('import-bills-file').value = '';
        openModal(importBillsModal);
    });

    document.getElementById('close-import-bills-modal').addEventListener('click', () => closeModal(importBillsModal));
    document.getElementById('cancel-import-bills-btn').addEventListener('click', () => closeModal(importBillsModal));
    document.getElementById('download-bill-template-link').addEventListener('click', () => {
        const month = importBillMonthSelect.value;
        const year = importBillYearSelect.value;
        const buildingId = importBillBuildingSelect.value;
        
        if (!month || !year || !buildingId) {
            showToast('Vui lòng chọn đầy đủ tháng, năm và tòa nhà trước!', 'error');
            return;
        }
        
        window.downloadBillTemplate(buildingId, month, year);
    });
    document.getElementById('import-bills-file').addEventListener('change', (e) => {
        document.getElementById('import-bills-file-name').textContent = e.target.files[0] ? `Đã chọn: ${e.target.files[0].name}` : '';
    });
    document.getElementById('submit-import-bills-btn').addEventListener('click', handleImportSubmit);
}

function downloadBillTemplate(buildingId, month, year) {
    // Nếu gọi từ event listener thì lấy từ select
    if (!buildingId) {
        month = parseInt(importBillMonthSelect.value);
        year = parseInt(importBillYearSelect.value);
        buildingId = importBillBuildingSelect.value;
    }
    
    if (!month || !year || !buildingId) {
        return showToast('Vui lòng chọn đầy đủ tháng, năm và tòa nhà trước!', 'error');
    }
    
    month = parseInt(month);
    year = parseInt(year);
    
    const building = getBuildings().find(b => b.id === buildingId);
    if (!building) return;

    const contracts = getContracts()
        .filter(c => c.buildingId === buildingId && getContractStatus(c) === 'active')
        .sort((a, b) => {
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
            }
            
            return valueA.toString().localeCompare(valueB.toString());
        });
    if (contracts.length === 0) return showToast('Không có hợp đồng nào đang hoạt động cho tòa nhà này!', 'warning');

    const customers = getCustomers();
    const services = building.services || [];
    
    // Tạo header động dựa trên các dịch vụ của tòa nhà
    const header = ['Mã tòa nhà', 'Phòng', 'Khách hàng', 'Ngày lập HĐ', 'Hạn thanh toán'];
    
    // Phân loại dịch vụ
    const electricService = services.find(s => s.name.toLowerCase().includes('điện'));
    const waterMeterServices = services.filter(s => 
        s.name.toLowerCase().includes('nước') && (s.unit === 'm³' || s.unit === 'khối')
    );
    const quantityServices = services.filter(s => {
        const isElectric = s.name.toLowerCase().includes('điện');
        const isWaterMeter = s.name.toLowerCase().includes('nước') && (s.unit === 'm³' || s.unit === 'khối');
        return !isElectric && !isWaterMeter;
    });
    
    // Thêm cột điện
    if (electricService) {
        header.push('Số điện cũ', 'Số điện mới');
    }
    
    // Thêm cột nước đồng hồ
    waterMeterServices.forEach(service => {
        header.push(`Số ${service.name.toLowerCase()} cũ`, `Số ${service.name.toLowerCase()} mới`);
    });
    
    // Thêm các dịch vụ tính theo số lượng
    quantityServices.forEach(service => {
        header.push(`${service.name} (${service.unit})`);
    });
    
    // Không thêm cột ghi chú
    
    const templateData = [header];
    
    const firstDay = `01-${String(month).padStart(2, '0')}-${year}`;

        // Tạo dữ liệu cho từng phòng
    contracts.forEach(contract => {
        const customer = customers.find(c => c.id === contract.representativeId);
        const prevBill = findPreviousBill(building.id, contract.room, month, year);
        
        // Tạo ngày lập HĐ (ngày đầu tháng)
        const billDateFormatted = `01-${String(month).padStart(2, '0')}-${year}`;
        
        // Tạo hạn thanh toán (ngày thanh toán từ hợp đồng)
        const dueDay = contract.paymentDay || 5;
        const dueDateFormatted = `${String(dueDay).padStart(2, '0')}-${String(month).padStart(2, '0')}-${year}`;
        
        const row = [
            building.code,
            contract.room,
            customer ? customer.name : '',
            billDateFormatted,
            dueDateFormatted
        ];
        
        // Xử lý số điện cũ
        if (electricService) {
            let oldElectric = 0;
            if (prevBill && prevBill.services) {
                // Lấy số điện mới từ hóa đơn tháng trước
                const electricServiceBill = prevBill.services.find(s => 
                    s.type === 'electric' || 
                    (s.serviceName && s.serviceName.toLowerCase().includes('điện'))
                );
                oldElectric = electricServiceBill?.newReading || 0;
            } else {
                // Nếu không có hóa đơn tháng trước, lấy số điện ban đầu từ hợp đồng
                const electricDetail = contract.serviceDetails?.find(d => {
                    const service = services.find(s => s.id === d.serviceId);
                    return service && service.name.toLowerCase().includes('điện');
                });
                oldElectric = electricDetail?.initialReading || 0;
            }
            row.push(oldElectric, ''); // Số điện cũ, số điện mới để trống
        }
        
        // Xử lý số nước đồng hồ
        waterMeterServices.forEach(waterService => {
            let oldWater = 0;
            if (prevBill && prevBill.services) {
                // Lấy số nước mới từ hóa đơn tháng trước
                const waterServiceBill = prevBill.services.find(s => 
                    s.type === 'water_meter' || 
                    (s.serviceName && s.serviceName.toLowerCase().includes(waterService.name.toLowerCase()) && s.newReading !== undefined)
                );
                oldWater = waterServiceBill?.newReading || 0;
            } else {
                // Nếu không có hóa đơn tháng trước, lấy số nước ban đầu từ hợp đồng
                const waterDetail = contract.serviceDetails?.find(d => d.serviceId === waterService.id);
                oldWater = waterDetail?.initialReading || 0;
            }
            row.push(oldWater, ''); // Số nước cũ, số nước mới để trống
        });
        
        // Xử lý các dịch vụ tính theo số lượng
        quantityServices.forEach(service => {
            const detail = contract.serviceDetails?.find(d => d.serviceId === service.id);
            row.push(detail?.quantity || ''); // Để trống để người dùng nhập
        });
        
        templateData.push(row);
    });

    const timestamp = new Date().getTime();
    exportToExcel(templateData, `Mau_Hoa_Don_Thang_${month}_Nam_${year}_${building.code}_${timestamp}`);
    showToast(`Đã tải file mẫu hoàn chỉnh cho tháng ${month}/${year}! (${contracts.length} phòng với ${services.length} dịch vụ)`);
}

async function handleImportSubmit() {
    const file = document.getElementById('import-bills-file').files[0];
    
    if (!file) return showToast('Vui lòng chọn file Excel!', 'error');
    
    try {
        showToast('Đang đọc file...', 'info');
        const data = await importFromExcel(file);
        if (!data || data.length === 0) return showToast('File Excel không có dữ liệu!', 'error');

        let successCount = 0, errorCount = 0;
        const buildings = getBuildings();
        
        // Lọc bỏ các dòng không hợp lệ
        const filteredData = data.filter(row => 
            row['Mã tòa nhà'] && 
            row['Phòng'] && 
            row['Ngày lập HĐ'] &&
            !row['Mã tòa nhà'].toString().includes('---')
        );
        
        for (const row of filteredData) {
            try {
                const buildingCode = row['Mã tòa nhà'];
                const room = row['Phòng']?.toString();
                const customerName = row['Khách hàng'];
                const billDateStr = row['Ngày lập HĐ'];
                const dueDateStr = row['Hạn thanh toán'];
                
                // Tìm tòa nhà theo mã
                const building = buildings.find(b => b.code === buildingCode);
                if (!building) {
                    console.log(`Không tìm thấy tòa nhà với mã: ${buildingCode}`);
                    errorCount++;
                    continue;
                }

                // Tìm hợp đồng theo tên khách hàng với debug chi tiết
                const allCustomers = getCustomers();
                let contract = null;
                
                console.log(`🔍 DEBUG Excel - Phòng: ${room}, Tên KH: "${customerName}"`);
                
                // Tìm tất cả hợp đồng của phòng này
                const roomContracts = getContracts().filter(c => 
                    c.buildingId === building.id && c.room === room
                );
                
                console.log(`🏠 Tìm thấy ${roomContracts.length} hợp đồng cho phòng ${room}:`);
                roomContracts.forEach((c, index) => {
                    const customer = allCustomers.find(cu => cu.id === c.representativeId);
                    const customerNameDB = customer ? customer.name : 'N/A';
                    console.log(`   ${index + 1}. HĐ ID: ${c.id} - KH: "${customerNameDB}" - Status: ${c.status}`);
                });
                
                if (customerName && roomContracts.length > 0) {
                    // So sánh tên chính xác
                    contract = roomContracts.find(c => {
                        const customer = allCustomers.find(cu => cu.id === c.representativeId);
                        if (!customer) return false;
                        
                        const dbName = customer.name.toLowerCase().trim();
                        const excelName = customerName.toLowerCase().trim();
                        const isMatch = dbName === excelName;
                        
                        console.log(`   📋 So sánh: DB="${dbName}" vs Excel="${excelName}" → ${isMatch ? '✅ MATCH' : '❌ NO MATCH'}`);
                        return isMatch;
                    });
                    
                    if (contract) {
                        const matchedCustomer = allCustomers.find(cu => cu.id === contract.representativeId);
                        console.log(`✅ FOUND MATCH: HĐ ID ${contract.id} - KH "${matchedCustomer.name}"`);
                    } else {
                        console.log(`❌ NO EXACT MATCH FOUND for "${customerName}"`);
                    }
                }
                
                // KHÔNG dùng fallback - chỉ tạo hóa đơn khi match chính xác tên
                if (!contract) {
                    console.log(`❌ SKIP: Không tìm thấy hợp đồng match chính xác cho phòng ${room} - khách hàng "${customerName}"`);
                    console.log(`   → Yêu cầu tên khách hàng trong Excel phải khớp 100% với tên trong hệ thống`);
                    errorCount++;
                    continue;
                }

                // Xử lý ngày tháng từ file
                let billDateObj, month, year, billDate, dueDate;
                
                // Parse ngày lập HĐ
                billDateObj = parseDateInput(billDateStr);
                
                if (billDateObj && !isNaN(billDateObj.getTime())) {
                    month = billDateObj.getMonth() + 1;
                    year = billDateObj.getFullYear();
                    // Sử dụng local date thay vì ISO để tránh lỗi múi giờ
                    const localYear = billDateObj.getFullYear();
                    const localMonth = String(billDateObj.getMonth() + 1).padStart(2, '0');
                    const localDay = String(billDateObj.getDate()).padStart(2, '0');
                    billDate = `${localYear}-${localMonth}-${localDay}`;
                } else {
                    console.error('Invalid bill date, using current date');
                    const currentDate = new Date();
                    month = currentDate.getMonth() + 1;
                    year = currentDate.getFullYear();
                    const localYear = currentDate.getFullYear();
                    const localMonth = String(currentDate.getMonth() + 1).padStart(2, '0');
                    const localDay = String(currentDate.getDate()).padStart(2, '0');
                    billDate = `${localYear}-${localMonth}-${localDay}`;
                }
                
                // Parse hạn thanh toán
                const dueDateObj = parseDateInput(dueDateStr);
                
                if (dueDateObj && !isNaN(dueDateObj.getTime())) {
                    dueDate = dueDateObj.getDate();
                } else {
                    dueDate = contract.paymentDay || 5;
                }

                const services = building.services || [];
                
                const billServices = [];
                let totalAmount = 0;

                // 1. Tiền nhà (luôn có)
                billServices.push({
                    serviceName: 'Tiền nhà', 
                    type: 'rent',
                    unitPrice: contract.rentPrice, 
                    unit: 'tháng',
                    quantity: 1, 
                    amount: contract.rentPrice,
                    ...getMonthDateRangeISO(month, year)
                });
                totalAmount += contract.rentPrice;

                // 2. Xử lý dịch vụ điện
                const electricService = services.find(s => s.name.toLowerCase().includes('điện'));
                if (electricService) {
                    const oldElectric = parseFloat(row['Số điện cũ']) || 0;
                    const newElectric = parseFloat(row['Số điện mới']) || 0;
                    if (newElectric >= oldElectric && newElectric > 0) {
                        const quantity = newElectric - oldElectric;
                        const amount = quantity * electricService.price;
                        billServices.push({
                            serviceName: electricService.name, 
                            type: 'electric',
                            serviceId: electricService.id, 
                            unitPrice: electricService.price, 
                            unit: electricService.unit,
                            oldReading: oldElectric, 
                            newReading: newElectric, 
                            quantity, 
                            amount
                        });
                        totalAmount += amount;
                    }
                }

                // 3. Xử lý các dịch vụ tính theo số lượng
                const quantityServices = services.filter(s => {
                    const isElectric = s.name.toLowerCase().includes('điện');
                    return !isElectric;
                });
                
                quantityServices.forEach(service => {
                    const serviceCol = `${service.name} (${service.unit})`;
                    const quantity = parseFloat(row[serviceCol]) || 0;
                    if (quantity > 0) {
                        const amount = quantity * service.price;
                        billServices.push({
                            serviceName: service.name, 
                            type: 'service',
                            serviceId: service.id, 
                            unitPrice: service.price, 
                            unit: service.unit,
                            quantity, 
                            amount, 
                            ...getMonthDateRangeISO(month, year)
                        });
                        totalAmount += amount;
                    }
                });

                const billData = {
                    id: generateId(),
                    buildingId: building.id,
                    room,
                    customerId: contract.representativeId,
                    period: month,
                    year: year,
                    billDate,
                    dueDate: dueDate,
                    services: billServices, 
                    totalAmount,
                    status: 'unpaid', 
                    approved: false,
                    createdAt: serverTimestamp(),
                    updatedAt: serverTimestamp()
                };
                
                // Import to Firebase + localStorage
                await setDoc(doc(db, 'bills', billData.id), billData);
                
                // Add to localStorage với Firebase ID
                const newItem = { 
                    ...billData,
                    createdAt: new Date(),
                    updatedAt: new Date()
                };
                const state = getState();
                state.bills.unshift(newItem);
                
                successCount++;
            } catch (err) {
                console.error('Lỗi import hóa đơn:', err);
                errorCount++;
            }
        }
        
        // Save cache và dispatch event sau khi import xong
        if (successCount > 0) {
            saveToCache();
            document.dispatchEvent(new CustomEvent('store:bills:updated'));
        }
        
        closeModal(importBillsModal);
        showToast(`Nhập thành công ${successCount} hóa đơn!${errorCount > 0 ? ` (${errorCount} lỗi)` : ''}`, 
                  successCount > 0 ? 'success' : 'error');
        
    } catch (error) {
        console.error('Lỗi nhập dữ liệu:', error);
        showToast('Lỗi nhập dữ liệu: ' + error.message, 'error');
    }
}


// --- HÀM TIỆN ÍCH CỦA MODULE ---

function billNumber(bill) {
    return `INV${(bill.id || '').slice(-6).toUpperCase()}`;
}

function findPreviousBill(buildingId, room, currentPeriod, currentYear = null) {
    if (!currentYear) currentYear = new Date().getFullYear();
    
    const currentMonth = parseInt(currentPeriod);
    let previousMonth, previousYear;
    
    if (currentMonth === 1) {
        previousMonth = 12;
        previousYear = currentYear - 1;
    } else {
        previousMonth = currentMonth - 1;
        previousYear = currentYear;
    }
    
    // Tìm hóa đơn tháng trước với cả tháng và năm
    return getBills().find(b => 
        b.buildingId === buildingId && 
        b.room === room && 
        parseInt(b.period) === previousMonth &&
        (parseInt(b.year) === previousYear || (!b.year && previousYear === new Date().getFullYear()))
    );
}

function getMonthDateRange(period, year = null) {
    if (!year) year = new Date().getFullYear();
    const month = parseInt(period) - 1;
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    return [firstDay, lastDay];
}

function getMonthDateRangeISO(period, year = null) {
    const [firstDay, lastDay] = getMonthDateRange(period, year);
    
    // Sử dụng local date thay vì ISO để tránh lỗi múi giờ
    const fromYear = firstDay.getFullYear();
    const fromMonth = String(firstDay.getMonth() + 1).padStart(2, '0');
    const fromDay = String(firstDay.getDate()).padStart(2, '0');
    
    const toYear = lastDay.getFullYear();
    const toMonth = String(lastDay.getMonth() + 1).padStart(2, '0');
    const toDay = String(lastDay.getDate()).padStart(2, '0');
    
    return {
        fromDate: `${fromYear}-${fromMonth}-${fromDay}`,
        toDate: `${toYear}-${toMonth}-${toDay}`
    };
}

function getContractStatus(contract) {
    if (contract.status === 'terminated') return 'terminated';
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const endDate = parseDateInput(contract.endDate);
    if (!endDate) return 'terminated';
    endDate.setHours(0, 0, 0, 0);
    return (endDate >= today) ? 'active' : 'expired';
}

/**
 * Xử lý xuất Excel
 */
function handleExport() {
    const selected = getSelectedBills();
    const billsToExport = selected.length > 0 ? selected : billsCache_filtered;
    
    if (billsToExport.length === 0) {
        showToast('Không có hóa đơn nào để xuất!', 'error');
        return;
    }
    
    const buildings = getBuildings();
    const customers = getCustomers();
    
    const data = billsToExport.map(bill => {
        const building = buildings.find(b => b.id === bill.buildingId);
        const customer = customers.find(c => c.id === bill.customerId);
        return {
            'Mã HĐ': `INV${bill.id.slice(-6).toUpperCase()}`,
            'Khách hàng': customer ? customer.name : 'N/A',
            'Tòa nhà': building ? building.code : 'N/A',
            'Phòng': bill.room,
            'Kỳ': `Tháng ${bill.period}`,
            'Ngày lập': formatDateDisplay(bill.billDate),
            'Tổng tiền': formatMoney(bill.totalAmount),
            'Trạng thái': bill.isTerminationBill ? (bill.approved ? 'Đã thanh lý' : 'Chờ thanh lý') : (bill.status === 'paid' ? 'Đã thanh toán' : 'Chưa thanh toán'),
            'Duyệt': bill.approved ? 'Đã duyệt' : 'Chưa duyệt'
        };
    });
    
    exportToExcel(data, 'Danh_sach_hoa_don');
    showToast(`Đã xuất ${billsToExport.length} hóa đơn!`);
}

/**
 * Lấy danh sách hóa đơn đã chọn
 */
function getSelectedBills() {
    const checkedBoxes = document.querySelectorAll('.bill-checkbox:checked');
    return Array.from(checkedBoxes).map(cb => {
        const billId = cb.dataset.id;
        return billsCache_filtered.find(b => b.id === billId);
    }).filter(Boolean);
}

// Hàm generateId (dùng cho billId)
function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

/**
 * Tạo các items transaction từ hóa đơn với phân loại hạng mục
 */
/**
 * Tạo transaction items từ bill với category ID thực từ database
 * KHI THU TIỀN TỪ HÓA ĐƠN → CHỈ TẠO 1 ITEM DUY NHẤT VỚI HẠNG MỤC "TIỀN HÓA ĐƠN"
 */
async function createTransactionItemsFromBillWithRealCategories(bill) {
    // ✅ Load categories từ store
    let categories = getTransactionCategories();
    
    // Tìm hạng mục "Tiền hóa đơn"
    let billCategory = categories.find(c => c.name === 'Tiền hóa đơn');
    if (!billCategory) {
        console.log(`[WARNING] Không tìm thấy hạng mục "Tiền hóa đơn", dùng hạng mục income đầu tiên`);
        // Dùng hạng mục income đầu tiên hoặc tạo ID giả
        billCategory = categories.find(c => c.type === 'income') || { id: 'default-income' };
    }
    
    const items = [];
    
    // TẠO 1 ITEM DUY NHẤT CHO TOÀN BỘ HÓA ĐƠN
    items.push({
        name: 'Tiền hóa đơn',
        amount: bill.totalAmount || 0,
        categoryId: billCategory.id
    });
    
    console.log('[BILL TRANSACTION] Items tạo ra:', items);
    return items;
}

/**
 * HÀM CŨ - GIỮ LẠI ĐỂ TƯƠNG THÍCH
 */
function createTransactionItemsFromBill(bill) {
    const items = [];
    let totalMainAmount = 0;
    
    if (bill.services && bill.services.length > 0) {
        bill.services.forEach(service => {
            const serviceName = service.name || service.serviceName || '';
            let categoryId = 'tien-hoa-don';
            
            if (serviceName.toLowerCase().includes('điện')) {
                categoryId = 'tien-dien';
                items.push({
                    name: `Tiền điện (${serviceName})`,
                    amount: service.amount || 0,
                    categoryId: categoryId
                });
            } else if (serviceName.toLowerCase().includes('nước')) {
                categoryId = 'tien-nuoc';
                items.push({
                    name: `Tiền nước (${serviceName})`,
                    amount: service.amount || 0,
                    categoryId: categoryId
                });
            } else {
                totalMainAmount += service.amount || 0;
            }
        });
    }
    
    if (totalMainAmount > 0) {
        items.unshift({
            name: 'Tiền thuê + phí dịch vụ',
            amount: totalMainAmount,
            categoryId: 'tien-hoa-don'
        });
    }
    
    if (items.length === 0) {
        items.push({
            name: 'Thu tiền hóa đơn',
            amount: bill.totalAmount || 0,
            categoryId: 'tien-hoa-don'
        });
    }
    
    return items;
}

// --- HÀM XỬ LÝ MODAL THU TIỀN ---

/**
 * Mở modal thu tiền cho hóa đơn đơn lẻ
 */
function openPaymentModal(billId) {
    const bill = getBills().find(b => b.id === billId);
    if (!bill) return;
    
    const paidAmount = bill.paidAmount || 0;
    const totalAmount = bill.totalAmount;
    const remainingAmount = totalAmount - paidAmount;
    
    // Hiển thị thông tin hóa đơn
    document.getElementById('payment-total-amount').textContent = formatMoney(totalAmount);
    document.getElementById('payment-paid-amount').textContent = formatMoney(paidAmount);
    document.getElementById('payment-remaining-amount').textContent = formatMoney(remainingAmount);
    
    // Set ngày mặc định là hôm nay
    const today = formatDateDisplay(new Date());
    document.getElementById('payment-date').value = today;
    
    // Reset về thu đủ
    document.getElementById('payment-type-full').checked = true;
    document.getElementById('partial-amount-container').classList.add('hidden');
    document.getElementById('partial-payment-amount').value = '';
    
    // Lưu billId để sử dụng khi confirm
    document.getElementById('payment-modal').dataset.billId = billId;
    
    // Setup event listeners cho radio buttons (chỉ 1 lần)
    if (!window.paymentModalInitialized) {
        document.getElementById('payment-type-full').addEventListener('change', () => {
            document.getElementById('partial-amount-container').classList.add('hidden');
        });
        document.getElementById('payment-type-partial').addEventListener('change', () => {
            document.getElementById('partial-amount-container').classList.remove('hidden');
            document.getElementById('partial-payment-amount').focus();
        });
        
        // Format số tiền khi nhập
        const amountInput = document.getElementById('partial-payment-amount');
        amountInput.addEventListener('input', (e) => {
            let value = e.target.value.replace(/\./g, ''); // Xóa dấu chấm cũ
            if (value && !isNaN(value)) {
                e.target.value = parseInt(value).toLocaleString('vi-VN');
            }
        });
        
        window.paymentModalInitialized = true;
    }
    
    openModal(document.getElementById('payment-modal'));
}

/**
 * Mở modal thu tiền hàng loạt
 */
function openBulkPaymentModal() {
    // Lấy danh sách hóa đơn được chọn
    let selectedBills = [];
    
    if (selectedMobileBillIds.size > 0) {
        // Mobile: từ Set
        const allBills = getBills();
        selectedBills = Array.from(selectedMobileBillIds)
            .map(id => allBills.find(b => b.id === id))
            .filter(bill => bill && bill.status !== 'paid' && bill.approved);
    } else {
        // Desktop: từ checkbox (CHỈ LẤY TỪ DESKTOP TABLE, KHÔNG LẤY MOBILE)
        const checkboxes = document.querySelectorAll('#bills-list .bill-checkbox:checked');
        selectedBills = Array.from(checkboxes)
            .map(cb => getBills().find(b => b.id === cb.dataset.id))
            .filter(bill => bill && bill.status !== 'paid' && bill.approved);
    }
    
    if (selectedBills.length === 0) {
        showToast('Vui lòng chọn ít nhất một hóa đơn đã duyệt và chưa thu tiền!', 'warning');
        return;
    }
    
    // Hiển thị số lượng hóa đơn
    document.getElementById('bulk-payment-count').textContent = selectedBills.length;
    
    // Set ngày mặc định là hôm nay
    const today = formatDateDisplay(new Date());
    document.getElementById('bulk-payment-date').value = today;
    
    // Lưu danh sách billIds để sử dụng khi confirm
    document.getElementById('bulk-payment-modal').dataset.billIds = JSON.stringify(selectedBills.map(b => b.id));
    
    openModal(document.getElementById('bulk-payment-modal'));
}

/**
 * Xử lý xác nhận thu tiền đơn lẻ
 */
let isProcessingPayment = false;

async function handleSinglePaymentConfirm() {
    // Tránh double-click
    if (isProcessingPayment) {
        console.log('Payment already in progress...');
        return;
    }
    
    isProcessingPayment = true;
    
    const modal = document.getElementById('payment-modal');
    const billId = modal.dataset.billId;
    const paymentDateStr = document.getElementById('payment-date').value;
    const paymentDate = parseDateInput(paymentDateStr);
    
    if (!paymentDate) {
        showToast('Vui lòng chọn ngày thu tiền!', 'error');
        return;
    }
    
    const bill = getBills().find(b => b.id === billId);
    if (!bill) return;
    
    const paymentType = document.querySelector('input[name="payment-type"]:checked').value;
    const remainingAmount = (bill.totalAmount || 0) - (bill.paidAmount || 0);
    
    let amountToCollect = remainingAmount;
    
    if (paymentType === 'partial') {
        const partialAmountStr = document.getElementById('partial-payment-amount').value.replace(/\./g, ''); // Xóa dấu chấm
        const partialAmount = parseFloat(partialAmountStr);
        
        if (!partialAmount || partialAmount <= 0) {
            showToast('Vui lòng nhập số tiền thu!', 'error');
            return;
        }
        
        if (partialAmount < 1000) {
            showToast('Số tiền tối thiểu là 1,000 VNĐ!', 'error');
            return;
        }
        
        if (partialAmount > remainingAmount) {
            showToast(`Số tiền không được vượt quá số còn lại (${formatMoney(remainingAmount)})!`, 'error');
            return;
        }
        
        amountToCollect = partialAmount;
    }
    
    try {
        // Disable button để tránh click nhiều lần
        const confirmBtn = document.getElementById('confirm-payment-btn');
        confirmBtn.disabled = true;
        confirmBtn.innerHTML = 'Đang xử lý...';
        
        const paymentDateFormatted = paymentDate ? formatDateDisplay(paymentDate) : null;
        
        // Gọi function mới xử lý partial payment
        await collectBillPayment(billId, amountToCollect, paymentDateFormatted);
        
        closeModal(modal);
        showToast(`Thu tiền thành công ${formatMoney(amountToCollect)}!`);
        
        // Nếu modal chi tiết đang mở, reload lại
        const billDetailModal = document.getElementById('bill-detail-modal');
        if (billDetailModal && !billDetailModal.classList.contains('hidden')) {
            setTimeout(() => {
                showBillDetail(billId);
            }, 500);
        }
        
    } catch (error) {
        showToast('Lỗi thu tiền: ' + error.message, 'error');
    } finally {
        // Reset processing flag
        isProcessingPayment = false;
        
        // Restore button
        const confirmBtn = document.getElementById('confirm-payment-btn');
        confirmBtn.disabled = false;
        confirmBtn.innerHTML = `
            <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1"></path>
            </svg>
            Xác nhận thu tiền
        `;
    }
}

/**
 * Xử lý xác nhận thu tiền hàng loạt
 */
async function handleBulkPaymentConfirm() {
    const modal = document.getElementById('bulk-payment-modal');
    const billIds = JSON.parse(modal.dataset.billIds || '[]');
    const paymentDateStr = document.getElementById('bulk-payment-date').value;
    const paymentDate = parseDateInput(paymentDateStr);
    
    if (!paymentDate) {
        showToast('Vui lòng chọn ngày thu tiền!', 'error');
        return;
    }
    
    if (billIds.length === 0) {
        showToast('Không có hóa đơn nào để thu tiền!', 'error');
        return;
    }
    
    try {
        // Disable button để tránh click nhiều lần
        const confirmBtn = document.getElementById('confirm-bulk-payment-btn');
        confirmBtn.disabled = true;
        confirmBtn.innerHTML = 'Đang xử lý...';
        
        const paymentDateFormatted = paymentDate ? formatDateDisplay(paymentDate) : null;
        await bulkCollect(billIds, paymentDateFormatted);
        closeModal(modal);
        
        // Reset trạng thái checkbox và ẩn nút hàng loạt
        selectedMobileBillIds.clear();
        resetBulkSelection();
        updateBulkApprovalButtons();
        
        showToast(`Đã thu tiền ${billIds.length} hóa đơn thành công!`);
        
    } catch (error) {
        showToast('Lỗi thu tiền: ' + error.message, 'error');
    } finally {
        // Restore button
        const confirmBtn = document.getElementById('confirm-bulk-payment-btn');
        confirmBtn.disabled = false;
        confirmBtn.innerHTML = `
            <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1"></path>
            </svg>
            Xác nhận thu tiền
        `;
    }
}

/**
 * Cập nhật summary thống kê hóa đơn
 */
function updateBillsSummary(bills) {
    // Header stats
    const headerTotalEl = document.getElementById('header-bills-total');
    const headerUnpaidEl = document.getElementById('header-bills-unpaid');
    const headerPartialEl = document.getElementById('header-bills-partial');
    const headerTerminationEl = document.getElementById('header-bills-termination');
    
    // Money stats
    const totalAmountEl = document.getElementById('total-bill-amount');
    const collectedAmountEl = document.getElementById('collected-amount');
    const pendingAmountEl = document.getElementById('pending-amount');
    
    if (!headerTotalEl) {
        console.log('❌ Header elements not found!');
        return; 
    }
    
    const total = bills.length;
    let unpaid = 0;
    let partial = 0;
    let paid = 0;
    let termination = 0;
    let totalAmount = 0;
    let collectedAmount = 0;
    
    console.log('🔍 updateBillsSummary called with', bills.length, 'bills');
    
    bills.forEach(bill => {
        const billTotal = bill.totalAmount || 0;
        const billPaid = bill.paidAmount || 0;
        
        // Hóa đơn thanh lý tính riêng
        if (bill.isTerminationBill) {
            termination++;
            return; // Không tính vào tổng tiền
        }
        
        totalAmount += billTotal;
        collectedAmount += billPaid; // Cộng số tiền đã thu (bao gồm cả thanh toán một phần)
        
        if (billPaid === 0) {
            unpaid++;
        } else if (billPaid >= billTotal) {
            paid++;
        } else {
            partial++;
        }
    });
    
    const pendingAmount = totalAmount - collectedAmount;
    
    console.log('💰 Summary:', { total, unpaid, partial, paid, termination, totalAmount, collectedAmount, pendingAmount });
    
    // Update header stats
    if (headerTotalEl) headerTotalEl.textContent = total;
    if (headerUnpaidEl) headerUnpaidEl.textContent = unpaid;
    if (headerPartialEl) headerPartialEl.textContent = partial;
    if (headerTerminationEl) headerTerminationEl.textContent = termination;
    
    // Update money stats
    if (totalAmountEl) totalAmountEl.textContent = `${totalAmount.toLocaleString('vi-VN')} VNĐ`;
    if (collectedAmountEl) collectedAmountEl.textContent = `${collectedAmount.toLocaleString('vi-VN')} VNĐ`;
    if (pendingAmountEl) pendingAmountEl.textContent = `${pendingAmount.toLocaleString('vi-VN')} VNĐ`;
}

// Export hàm để có thể gọi từ event listener
window.downloadBillTemplate = downloadBillTemplate;