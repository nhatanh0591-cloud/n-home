// js/modules/transactions.js

import { db, addDoc, setDoc, doc, deleteDoc, collection, serverTimestamp, query, where, getDocs, orderBy } from '../firebase.js';
import { getTransactions, getBuildings, getCustomers, getContracts, getAccounts, getState, saveToCache, updateInLocalStorage, deleteFromLocalStorage } from '../store.js';
import { 
    showToast, openModal, closeModal, 
    formatDateDisplay, convertToDateInputFormat, parseDateInput, parseFormattedNumber, formatMoney, 
    exportToExcel, formatFileSize, importFromExcel, showConfirm, safeToDate
} from '../utils.js';

// --- BIẾN CỤC BỘ CHO MODULE ---
let transactionsCache_filtered = []; // Cache đã lọc
let transactionCategoriesCache = []; // Cache cho loại thu chi
let currentTransactionItems = []; // Hạng mục tạm thời cho modal
let skipSortAfterEdit = false; // Flag để không sort sau khi edit
const selectedMobileTransactionIds = new Set(); // Set lưu trạng thái checkbox mobile

// Pagination variables
let currentPage = 1;
const ITEMS_PER_PAGE = 100;

// --- DOM ELEMENTS (Chỉ liên quan đến Thu Chi) ---
const transactionsSection = document.getElementById('transactions-section');
const transactionsListEl = document.getElementById('transactions-list');

// Stats
const totalIncomeEl = document.getElementById('total-income');
const totalExpenseEl = document.getElementById('total-expense');
const profitAmountEl = document.getElementById('profit-amount');

// Filters
const filterBuildingEl = document.getElementById('filter-transaction-building');
const filterRoomEl = document.getElementById('filter-transaction-room');
const filterTypeEl = document.getElementById('filter-transaction-type');
const filterAccountEl = document.getElementById('filter-transaction-account');
const filterStartDateEl = document.getElementById('filter-transaction-start-date');
const filterEndDateEl = document.getElementById('filter-transaction-end-date');
const filterCategoryEl = document.getElementById('filter-transaction-category');
const filterApprovalEl = document.getElementById('filter-transaction-approval');
const searchEl = document.getElementById('transaction-search');
const selectAllCheckbox = document.getElementById('select-all-transactions');

// Modals
const transactionModal = document.getElementById('transaction-modal');
const transactionModalTitle = document.getElementById('transaction-modal-title');
const transactionForm = document.getElementById('transaction-form');
const transactionTypeIncome = document.getElementById('transaction-type-income');
const transactionTypeExpense = document.getElementById('transaction-type-expense');
const transactionBuildingSelect = document.getElementById('transaction-building');
const transactionRoomSelect = document.getElementById('transaction-room');
const transactionCustomerSelect = document.getElementById('transaction-customer');
const transactionItemsListEl = document.getElementById('transaction-items-list');

// Modals (Loại thu chi)
// const transactionCategoryModal = document.getElementById('transaction-category-modal'); // Removed
const transactionCategoryForm = document.getElementById('transaction-category-form');
const selectTransactionCategoryModal = document.getElementById('select-transaction-category-modal');
const transactionCategoriesListEl = document.getElementById('transaction-categories-list');

// Modal thêm mới loại thu/chi
const addTransactionCategoryModal = document.getElementById('add-transaction-category-modal');
const addTransactionCategoryForm = document.getElementById('add-transaction-category-form');

// Pagination elements
const transactionsPagination = document.getElementById('transactions-pagination');
const transactionsShowingFrom = document.getElementById('transactions-showing-from');
const transactionsShowingTo = document.getElementById('transactions-showing-to');
const transactionsTotalCount = document.getElementById('transactions-total-count');
const transactionsPrevBtn = document.getElementById('transactions-prev-btn');
const transactionsNextBtn = document.getElementById('transactions-next-btn');
const transactionsPageInfo = document.getElementById('transactions-page-info');

// Bulk action buttons
const bulkApproveTransactionsBtn = document.getElementById('bulk-approve-transactions-btn');
const bulkUnapproveTransactionsBtn = document.getElementById('bulk-unapprove-transactions-btn');

// --- HÀM CHÍNH ---

/**
 * Hàm khởi tạo, được gọi 1 lần duy nhất từ main.js
 */
export function initTransactions() {
    // Lắng nghe sự kiện từ store
    document.addEventListener('store:transactions:updated', () => {
        if (!transactionsSection.classList.contains('hidden')) {
            loadTransactions();
        }
    });
    // Tải lại khi dữ liệu liên quan thay đổi
    document.addEventListener('store:buildings:updated', () => {
        if (!transactionsSection.classList.contains('hidden')) { loadTransactionFilters(); applyTransactionFilters(); }
    });
    document.addEventListener('store:customers:updated', () => {
        if (!transactionsSection.classList.contains('hidden')) { applyTransactionFilters(); }
    });
    document.addEventListener('store:contracts:updated', () => {
        if (!transactionsSection.classList.contains('hidden')) { applyTransactionFilters(); }
    });
    document.addEventListener('store:accounts:updated', () => {
        if (!transactionsSection.classList.contains('hidden')) { loadTransactionFilters(); applyTransactionFilters(); }
    });
    document.addEventListener('store:transactionCategories:updated', () => {
        if (!transactionsSection.classList.contains('hidden')) { loadTransactionCategories(); }
    });

    // Lắng nghe sự kiện click trên toàn trang
    document.body.addEventListener('click', handleBodyClick);
    
    // Lắng nghe form
    transactionForm.addEventListener('submit', handleTransactionFormSubmit);
    if (transactionCategoryForm) {
        transactionCategoryForm.addEventListener('submit', handleCategoryFormSubmit);
    }
    if (addTransactionCategoryForm) {
        addTransactionCategoryForm.addEventListener('submit', handleAddCategoryFormSubmit);
    }

    // Lắng nghe sự kiện lọc
    [filterRoomEl, filterTypeEl, filterAccountEl, 
     filterStartDateEl, filterEndDateEl, filterCategoryEl, filterApprovalEl]
    .filter(el => el) // Loại bỏ các element null
    .forEach(el => {
        el.addEventListener('input', applyTransactionFilters);
        // Date inputs cũng cần listen 'change' event từ calendar picker
        if (el === filterStartDateEl || el === filterEndDateEl) {
            el.addEventListener('change', applyTransactionFilters);
        }
    });
    
    // Lắng nghe riêng search để reset page
    console.log('🔍 searchEl:', searchEl);
    if (searchEl) {
        searchEl.addEventListener('input', (e) => {
            console.log('🔍 Search input triggered:', e.target.value);
            currentPage = 1;
            applyTransactionFilters();
        });
    } else {
        console.error('❌ searchEl is NULL!');
    }

    // Lắng nghe riêng filter building để cập nhật rooms
    filterBuildingEl.addEventListener('change', handleFilterBuildingChange);

    // Lắng nghe select all
    selectAllCheckbox.addEventListener('change', (e) => {
        document.querySelectorAll('.transaction-checkbox').forEach(cb => {
            cb.checked = e.target.checked;
        });
        updateBulkApprovalButtons();
    });
    
    // Checkbox mobile events
    document.addEventListener('click', (e) => {
        if (e.target.classList.contains('transaction-checkbox-mobile')) {
            const transactionId = e.target.dataset.id;
            if (e.target.checked) {
                selectedMobileTransactionIds.add(transactionId);
            } else {
                selectedMobileTransactionIds.delete(transactionId);
            }
            updateBulkApprovalButtons();
        }
    });
    
    // Clear selection button
    document.getElementById('clear-selection-transactions-btn')?.addEventListener('click', () => {
        selectedMobileTransactionIds.clear();
        document.querySelectorAll('.transaction-checkbox-mobile').forEach(cb => cb.checked = false);
        updateBulkApprovalButtons();
        showToast('Bỏ chọn thành công!');
    });
    
    // Lắng nghe các input trong modal thu chi
    transactionTypeIncome.addEventListener('change', () => updateTransactionLabels(true));
    transactionTypeExpense.addEventListener('change', () => updateTransactionLabels(false));
    transactionBuildingSelect.addEventListener('change', handleTransactionBuildingChange);
    transactionRoomSelect.addEventListener('change', handleTransactionRoomChange);

    // Pagination events
    transactionsPrevBtn?.addEventListener('click', () => {
        if (currentPage > 1) {
            currentPage--;
            renderTransactionsWithPagination();
        }
    });
    
    transactionsNextBtn?.addEventListener('click', () => {
        const totalPages = Math.ceil(transactionsCache_filtered.length / itemsPerPage);
        if (currentPage < totalPages) {
            currentPage++;
            renderTransactionsWithPagination();
        }
    });

    // Tải loại thu chi (chạy 1 lần)
    if (filterCategoryEl) {
        loadTransactionCategories();
    }

    // Import events
    setupImportEvents();
}

/**
 * Tải, lọc, và chuẩn bị dữ liệu thu chi
 */
export function loadTransactions() {
    loadTransactionFilters();
    applyTransactionFilters();
}

/**
 * Tải danh sách loại thu chi
 */
async function loadTransactionCategories() {
    try {
        // Load từ localStorage thay vì Firebase
        const { getTransactionCategories } = await import('../store.js');
        transactionCategoriesCache = getTransactionCategories();
        
        // Cập nhật dropdown lọc loại thu chi
        const currentCategory = filterCategoryEl.value;
        filterCategoryEl.innerHTML = '<option value="">Loại thu/chi</option>';
        transactionCategoriesCache.forEach(cat => {
            filterCategoryEl.innerHTML += `<option value="${cat.id}">${cat.name}</option>`;
        });
        filterCategoryEl.value = currentCategory;

        // Cập nhật bảng chọn loại thu chi trong modal
        renderTransactionCategories();

    } catch (error) {
        console.error('Error loading transaction categories:', error);
    }
}

/**
 * Áp dụng bộ lọc và gọi hàm render
 */
function applyTransactionFilters() {
    let transactions = getTransactions();

    // Lấy giá trị bộ lọc
    const building = filterBuildingEl?.value || '';
    const room = filterRoomEl?.value || '';
    const type = filterTypeEl?.value || '';
    const account = filterAccountEl?.value || '';
    const startDate = parseDateInput(filterStartDateEl?.value);
    const endDate = parseDateInput(filterEndDateEl?.value);
    const category = filterCategoryEl?.value || '';
    const approval = filterApprovalEl?.value || '';
    const search = searchEl?.value?.toLowerCase() || '';

    console.log('🔍 Filter dates - INPUT VALUES:', 
        'FROM:', filterStartDateEl?.value, 
        'TO:', filterEndDateEl?.value
    );
    console.log('🔍 Filter dates - PARSED:', 
        'startDate:', startDate, 
        'endDate:', endDate
    );
    if (startDate && endDate) {
        console.log('🔍 COMPARISON:', 
            'startDate > endDate?', startDate > endDate,
            'Start:', startDate.toISOString(),
            'End:', endDate.toISOString()
        );
    }

    // ⚠️ VALIDATE: Nếu startDate > endDate thì KHÔNG HIỂN THỊ GÌ HẾT
    if (startDate && endDate && startDate > endDate) {
        console.log('🚨 VALIDATION FAILED! startDate > endDate:', {
            startDate: startDate.toISOString(),
            endDate: endDate.toISOString()
        });
        
        // FORCE CLEAR cache trước
        transactionsCache_filtered = [];
        
        // Reset về trang 1
        currentPage = 1;
        
        console.log('🚨 Rendering EMPTY table...');
        
        // Render empty state NGAY LẬP TỨC - PHẢI TRUYỀN EMPTY ARRAY
        renderTransactionsTable([]);
        updateTransactionStats([]);
        
        console.log('🚨 Validation complete - showing toast');
        
        // Show error
        showToast('Lỗi: "Từ ngày" phải nhỏ hơn "Đến ngày"', 'error');
        
        // STOP execution - không chạy filter nữa
        return;
    }
    
    console.log('✅ Date validation passed or no dates:', { startDate, endDate });

    // Lọc
    transactionsCache_filtered = transactions.filter(t => {
        if (building && t.buildingId !== building) return false;
        if (room && t.room !== room) return false;
        if (type && t.type !== type) return false;
        if (account && t.accountId !== account) return false; // ✅ SỬA: t.accountId thay vì t.account
        if (approval) {
            if (approval === 'approved' && !t.approved) return false;
            if (approval === 'pending' && t.approved) return false;
        }
        
        const tDate = parseDateInput(t.date);
        if (startDate && (!tDate || tDate < startDate)) return false;
        if (endDate && (!tDate || tDate > endDate)) return false;

        if (category && (!t.items || !t.items.some(item => item.categoryId === category))) return false;

        if (search) {
            const customer = getCustomers().find(c => c.id === t.customerId);
            const account = getAccounts().find(a => a.id === t.accountId);
            const accountName = account ? (account.bank === 'Cash' ? 'Tiền mặt' : `${account.bank} - ${account.accountHolder || account.accountNumber || ''}`) : '';
            
            const code = (t.code || '').toString().toLowerCase();
            const title = (t.title || '').toString().toLowerCase();
            const payer = (t.payer || '').toString().toLowerCase();
            const customerName = customer ? customer.name.toLowerCase() : '';
            
            return (code.includes(search) ||
                    title.includes(search) ||
                    payer.includes(search) ||
                    accountName.toLowerCase().includes(search) ||
                    customerName.includes(search));
        }
        return true;
    });
    
    // Sắp xếp theo thời gian tạo phiếu (chỉ khi không phải sau edit)
    if (!skipSortAfterEdit) {
        transactionsCache_filtered.sort((a, b) => {
            // Handle cả Firebase Timestamp và JavaScript Date
            let aTime, bTime;
            
            if (a.createdAt?.seconds) {
                aTime = a.createdAt.seconds * 1000; // Convert Firebase Timestamp to milliseconds
            } else if (a.createdAt instanceof Date) {
                aTime = a.createdAt.getTime();
            } else {
                aTime = 0;
            }
            
            if (b.createdAt?.seconds) {
                bTime = b.createdAt.seconds * 1000; // Convert Firebase Timestamp to milliseconds
            } else if (b.createdAt instanceof Date) {
                bTime = b.createdAt.getTime();
            } else {
                bTime = 0;
            }
            
            return bTime - aTime; // Phiếu tạo sau hiện trước (mới nhất ở đầu)
        });
        // Reset to first page when filter changes (chỉ khi sort lại)
        currentPage = 1;
    }
    
    // Reset flag
    skipSortAfterEdit = false;
    
    renderTransactionsTable(transactionsCache_filtered);
    updateTransactionStats(transactionsCache_filtered); // Cập nhật stats theo bộ lọc
}

/**
 * Lấy tên hiển thị của tài khoản
 */
function getAccountDisplayName(accountId) {
    if (!accountId) return '-';
    
    const accounts = getAccounts();
    const account = accounts.find(acc => acc.id === accountId);
    
    if (!account) return 'Không xác định';
    
    if (account.bank === 'Cash') {
        return 'Tiền mặt';
    } else {
        const name = account.accountHolder || account.accountNumber || 'Chưa rõ';
        return `${account.bank} - ${name}`;
    }
}

/**
 * Hiển thị dữ liệu với phân trang
 */
function renderTransactionsWithPagination() {
    const totalItems = transactionsCache_filtered.length;
    const totalPages = Math.ceil(totalItems / itemsPerPage);
    
    // Tính toán chỉ số bắt đầu và kết thúc
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = Math.min(startIndex + itemsPerPage, totalItems);
    
    // Lấy dữ liệu cho trang hiện tại
    const displayTransactions = transactionsCache_filtered.slice(startIndex, endIndex);
    
    // Render bảng
    renderTransactionsTable(displayTransactions);
    
    // Cập nhật pagination UI
    updatePaginationUI(totalItems, totalPages, startIndex, endIndex);
}

/**
 * Cập nhật giao diện phân trang
 */
function updatePaginationUI(totalItems, totalPages, startIndex, endIndex) {
    // Cập nhật thông tin hiển thị
    transactionsShowingFrom.textContent = totalItems > 0 ? startIndex + 1 : 0;
    transactionsShowingTo.textContent = endIndex;
    transactionsTotalCount.textContent = totalItems;
    
    // Cập nhật thông tin trang
    transactionsPageInfo.textContent = `Trang ${currentPage} / ${totalPages}`;
    
    // Cập nhật trạng thái nút
    transactionsPrevBtn.disabled = currentPage <= 1;
    transactionsNextBtn.disabled = currentPage >= totalPages;
    
    // Hiển thị/ẩn pagination
    if (totalPages <= 1) {
        transactionsPagination.style.display = 'none';
    } else {
        transactionsPagination.style.display = 'flex';
    }
}

/**
 * Hiển thị dữ liệu lên bảng
 */
function renderTransactionsTable(transactions) {
    transactionsListEl.innerHTML = '';
    
    if (transactions.length === 0) {
        transactionsListEl.innerHTML = '<tr><td colspan="8" class="p-8 text-center text-gray-500">Không tìm thấy phiếu thu chi nào.</td></tr>';
        renderTransactionsPagination(0, 0);
        return;
    }
    
    // Tính toán phân trang
    const totalItems = transactions.length;
    const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const endIndex = startIndex + ITEMS_PER_PAGE;
    const transactionsToShow = transactions.slice(startIndex, endIndex);
    
    const buildings = getBuildings();
    const customers = getCustomers();
    const accounts = getAccounts();
    const categories = transactionCategoriesCache;
    
    transactionsToShow.forEach(t => {
        const building = buildings.find(b => b.id === t.buildingId);
        const customer = customers.find(c => c.id === t.customerId);
        
        // Lấy category từ items (vì mỗi transaction có thể có nhiều items với các category khác nhau)
        // Hiển thị tất cả categories của các items, hoặc category đầu tiên
        let categoryDisplay = '-';
        if (t.items && t.items.length > 0) {
            const itemCategories = t.items
                .map(item => {
                    const cat = categories.find(c => c.id === item.categoryId);
                    return cat ? cat.name : null;
                })
                .filter(name => name !== null);
            
            if (itemCategories.length > 0) {
                // Lấy unique categories
                const uniqueCategories = [...new Set(itemCategories)];
                categoryDisplay = uniqueCategories.join(', ');
            }
        }
        
        // TÍNH TỔNG SỐ TIỀN TỪ ITEMS
        const totalAmount = t.items && t.items.length > 0 
            ? t.items.reduce((sum, item) => sum + (item.amount || 0), 0)
            : 0;
        
        // TÌM ACCOUNT TỪ accountId
        const account = accounts.find(a => a.id === t.accountId);
        const accountDisplay = account 
            ? (account.bank && account.accountHolder 
                ? `${account.bank} - ${account.accountHolder}`
                : (account.bank || account.accountHolder || '-'))
            : '-';
        
        const tr = document.createElement('tr');
        tr.className = 'border-b hover:bg-gray-50';
        tr.innerHTML = `
            <td class="py-4 px-4">
                <input type="checkbox" class="transaction-checkbox w-4 h-4 cursor-pointer" data-id="${t.id}" data-approved="${t.approved || false}">
            </td>
            <td class="py-4 px-4">
                <div class="flex gap-3">
                    <button data-id="${t.id}" class="toggle-transaction-approve-btn w-8 h-8 rounded flex items-center justify-center ${t.approved ? 'bg-gray-400' : 'bg-green-500'}" title="${t.approved ? 'Bỏ duyệt' : 'Duyệt'}">
                        ${t.approved ? 
                            '<svg class="w-4 h-4 text-white pointer-events-none" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"/></svg>' :
                            '<svg class="w-4 h-4 text-white pointer-events-none" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/></svg>'
                        }
                    </button>
                    ${t.approved ? 
                        '<button data-id="' + t.id + '" class="w-8 h-8 rounded bg-gray-300 flex items-center justify-center cursor-not-allowed" title="Không thể sửa phiếu đã duyệt" disabled>' +
                            '<svg class="w-4 h-4 text-gray-500 pointer-events-none" fill="currentColor" viewBox="0 0 20 20"><path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z"/></svg>' +
                        '</button>' :
                        '<button data-id="' + t.id + '" class="edit-transaction-btn w-8 h-8 rounded bg-gray-500 hover:bg-gray-600 flex items-center justify-center" title="Sửa">' +
                            '<svg class="w-4 h-4 text-white pointer-events-none" fill="currentColor" viewBox="0 0 20 20"><path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z"/></svg>' +
                        '</button>'
                    }
                    ${t.approved ? 
                        '<button data-id="' + t.id + '" class="w-8 h-8 rounded bg-gray-300 flex items-center justify-center cursor-not-allowed" title="Không thể xóa phiếu đã duyệt" disabled>' +
                            '<svg class="w-4 h-4 text-gray-500 pointer-events-none" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd"/></svg>' +
                        '</button>' :
                        '<button data-id="' + t.id + '" class="delete-transaction-btn w-8 h-8 rounded bg-red-500 hover:bg-red-600 flex items-center justify-center" title="Xóa">' +
                            '<svg class="w-4 h-4 text-white pointer-events-none" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd"/></svg>' +
                        '</button>'
                    }
                </div>
            </td>
            <td class="py-4 px-4 font-medium">${t.title || 'N/A'}</td>
            <td class="py-4 px-4 ${t.type === 'income' ? 'text-green-600' : 'text-red-600'}">${t.type === 'income' ? 'Thu' : 'Chi'}</td>
            <td class="py-4 px-4">${building ? building.code : '-'}</td>
            <td class="py-4 px-4">${t.payer || (customer ? customer.name : '-')}</td>
            <td class="py-4 px-4">${categoryDisplay}</td>
            <td class="py-4 px-4 font-medium">${formatMoney(totalAmount)}</td>
            <td class="py-4 px-4">${accountDisplay}</td>
        `;
            // Thêm event listener cho checkbox để cập nhật bulk buttons
            const checkbox = tr.querySelector('.transaction-checkbox');
            checkbox.addEventListener('change', updateBulkApprovalButtons);
            
            transactionsListEl.appendChild(tr);
        });
        
        // 📱 RENDER MOBILE CARDS
        const mobileListEl = document.getElementById('transactions-mobile-list');
        if (mobileListEl) {
            mobileListEl.innerHTML = '';
            transactionsToShow.forEach(t => {
                const building = buildings.find(b => b.id === t.buildingId);
                const customer = customers.find(c => c.id === t.customerId);
                const account = accounts.find(a => a.id === t.accountId);
                const accountDisplay = account 
                    ? (account.bank && account.accountHolder 
                        ? `${account.bank} - ${account.accountHolder}`
                        : (account.bank || account.accountHolder || '-'))
                    : '-';
                
                const totalAmount = t.items && t.items.length > 0 
                    ? t.items.reduce((sum, item) => sum + (item.amount || 0), 0)
                    : 0;
                
                const isChecked = selectedMobileTransactionIds.has(t.id);
                
                const mobileCard = document.createElement('div');
                mobileCard.className = 'mobile-card';
                mobileCard.innerHTML = `
                    <div class="flex items-center gap-3 mb-3 pb-3 border-b">
                        <input type="checkbox" class="transaction-checkbox-mobile w-5 h-5 cursor-pointer" data-id="${t.id}" data-approved="${t.approved || false}" ${isChecked ? 'checked' : ''}>
                        <span class="text-xs text-gray-500 flex-1">Chọn để xóa nhiều</span>
                    </div>
                    <div class="mobile-card-row">
                        <span class="mobile-card-label">Tên phiếu:</span>
                        <span class="mobile-card-value font-bold text-lg">${t.title || 'N/A'}</span>
                    </div>
                    <div class="mobile-card-row">
                        <span class="mobile-card-label">Loại:</span>
                        <span class="mobile-card-value font-semibold ${t.type === 'income' ? 'text-green-600' : 'text-red-600'}">${t.type === 'income' ? 'Thu' : 'Chi'}</span>
                    </div>
                    <div class="mobile-card-row">
                        <span class="mobile-card-label">Tòa nhà:</span>
                        <span class="mobile-card-value">${building ? building.code : '-'}</span>
                    </div>
                    <div class="mobile-card-row">
                        <span class="mobile-card-label">Người ${t.type === 'income' ? 'nộp' : 'nhận'}:</span>
                        <span class="mobile-card-value">${t.payer || (customer ? customer.name : '-')}</span>
                    </div>
                    <div class="mobile-card-row">
                        <span class="mobile-card-label">Ngày thực ${t.type === 'income' ? 'thu' : 'chi'}:</span>
                        <span class="mobile-card-value">${formatDateForDisplay(t.date)}</span>
                    </div>
                    <div class="mobile-card-row">
                        <span class="mobile-card-label">Số tiền:</span>
                        <span class="mobile-card-value font-bold text-green-600">${formatMoney(totalAmount)}</span>
                    </div>
                    <div class="mobile-card-row">
                        <span class="mobile-card-label">Sổ quỹ:</span>
                        <span class="mobile-card-value text-sm">${accountDisplay}</span>
                    </div>
                    <div class="mobile-card-row">
                        <span class="mobile-card-label">Trạng thái:</span>
                        <span class="px-2 py-1 text-xs rounded-full ${t.approved ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}">
                            ${t.approved ? 'Đã duyệt' : 'Chưa duyệt'}
                        </span>
                    </div>
                    <div class="mobile-card-actions">
                        <button data-id="${t.id}" class="toggle-transaction-approve-btn ${t.approved ? 'bg-gray-400' : 'bg-green-500'} hover:opacity-90 text-white">
                            ${t.approved ? 
                                '<svg class="w-4 h-4 pointer-events-none" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"/></svg>' :
                                '<svg class="w-4 h-4 pointer-events-none" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/></svg>'
                            }
                            ${t.approved ? 'Bỏ duyệt' : 'Duyệt'}
                        </button>
                        ${t.approved ? 
                            '<button class="bg-gray-300 text-gray-500 cursor-not-allowed" disabled>Sửa</button>' :
                            '<button data-id="' + t.id + '" class="edit-transaction-btn bg-gray-500 hover:bg-gray-600 text-white">' +
                                '<svg class="w-4 h-4 pointer-events-none" fill="currentColor" viewBox="0 0 20 20"><path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z"/></svg>' +
                                'Sửa' +
                            '</button>'
                        }
                        ${t.approved ? 
                            '<button class="bg-gray-300 text-gray-500 cursor-not-allowed" disabled>Xóa</button>' :
                            '<button data-id="' + t.id + '" class="delete-transaction-btn bg-red-500 hover:bg-red-600 text-white">' +
                                '<svg class="w-4 h-4 pointer-events-none" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd"/></svg>' +
                                'Xóa' +
                            '</button>'
                        }
                    </div>
                `;
                mobileListEl.appendChild(mobileCard);
            });
        }
        
        // Cập nhật bulk buttons sau khi render xong
        updateBulkApprovalButtons();
        
        // Render pagination
        renderTransactionsPagination(totalItems, totalPages);
    }

/**
 * Hiển thị phân trang cho transactions
 */
function renderTransactionsPagination(totalItems, totalPages) {
    const paginationContainer = document.getElementById('transactions-pagination');
    if (!paginationContainer) return;
    
    if (totalPages <= 1) {
        paginationContainer.innerHTML = '';
        return;
    }
    
    let paginationHTML = `
        <div class="flex items-center justify-between mt-6">
            <div class="text-sm text-gray-700">
                Hiển thị ${((currentPage - 1) * ITEMS_PER_PAGE) + 1}-${Math.min(currentPage * ITEMS_PER_PAGE, totalItems)} trong ${totalItems} phiếu thu chi
            </div>
            <div class="flex items-center gap-2">
    `;
    
    // Previous button
    paginationHTML += `
        <button onclick="changeTransactionPage(${currentPage - 1})" 
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
            <button onclick="changeTransactionPage(${i})" 
                    class="px-3 py-2 text-sm border rounded-md ${i === currentPage ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}">
                ${i}
            </button>
        `;
    }
    
    // Next button
    paginationHTML += `
        <button onclick="changeTransactionPage(${currentPage + 1})" 
                ${currentPage === totalPages ? 'disabled' : ''} 
                class="px-3 py-2 text-sm border rounded-md ${currentPage === totalPages ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-white text-gray-700 hover:bg-gray-50'}">
            Sau
        </button>
    `;
    
    paginationHTML += '</div></div>';
    paginationContainer.innerHTML = paginationHTML;
}

/**
 * Thay đổi trang cho transactions
 */
window.changeTransactionPage = function(page) {
    const totalPages = Math.ceil(transactionsCache_filtered.length / ITEMS_PER_PAGE);
    if (page < 1 || page > totalPages) return;
    
    currentPage = page;
    renderTransactionsTable(transactionsCache_filtered);
}

/**
 * Cập nhật thống kê (có thể lọc hoặc không)
 */
function updateTransactionStats(transactions = null) {
    if (transactions === null) transactions = getTransactions(); // Lấy tất cả nếu không lọc
    
    // TÍNH TỔNG TỪ ITEMS
    const income = transactions.filter(t => t.type === 'income').reduce((sum, t) => {
        const total = t.items && t.items.length > 0 ? t.items.reduce((s, item) => s + (item.amount || 0), 0) : 0;
        return sum + total;
    }, 0);
    const expense = transactions.filter(t => t.type === 'expense').reduce((sum, t) => {
        const total = t.items && t.items.length > 0 ? t.items.reduce((s, item) => s + (item.amount || 0), 0) : 0;
        return sum + total;
    }, 0);
    const profit = income - expense;
    
    totalIncomeEl.textContent = formatMoney(income) + ' VNĐ';
    totalExpenseEl.textContent = formatMoney(expense) + ' VNĐ';
    profitAmountEl.textContent = formatMoney(profit) + ' VNĐ';
    
    // Đổi màu theo giá trị lợi nhuận
    if (profit > 0) {
        profitAmountEl.className = 'text-2xl font-bold text-green-600'; // Lợi nhuận dương - màu xanh
    } else if (profit < 0) {
        profitAmountEl.className = 'text-2xl font-bold text-red-600';   // Lỗ - màu đỏ
    } else {
        profitAmountEl.className = 'text-2xl font-bold text-gray-800';  // Hòa vốn - màu xám
    }
}

/**
 * Tải các dropdown bộ lọc
 */
function loadTransactionFilters() {
    const buildings = getBuildings();
    const currentBuilding = filterBuildingEl.value;
    
    filterBuildingEl.innerHTML = '<option value="">Tòa nhà</option>';
    buildings.forEach(building => {
        filterBuildingEl.innerHTML += `<option value="${building.id}">${building.code}</option>`;
    });
    filterBuildingEl.value = currentBuilding;
    handleFilterBuildingChange(); // Tải phòng
    
    // Load accounts vào filter
    const accounts = getAccounts();
    const currentAccount = filterAccountEl.value;
    filterAccountEl.innerHTML = '<option value="">Sổ quỹ</option>';
    accounts.forEach(account => {
        let displayText = account.bank === 'Cash' ? 'Tiền mặt' : `${account.bank} - ${account.accountHolder || account.accountNumber || 'Chưa rõ'}`;
        filterAccountEl.innerHTML += `<option value="${account.id}">${displayText}</option>`;
    });
    filterAccountEl.value = currentAccount;
    
    // Không set filter ngày mặc định - để trống cho user tự chọn
}

/**
 * Xử lý sự kiện click
 */
async function handleBodyClick(e) {
    const target = e.target.closest('button') || e.target;
    const id = target.dataset.id;

    // Nút "Thêm thu chi"
    if (target.id === 'add-transaction-btn') {
        openTransactionModal();
    }
    // Nút "Sửa"
    else if (target.classList.contains('edit-transaction-btn')) {
        // Kiểm tra phiếu đã duyệt chưa
        const transaction = getTransactions().find(t => t.id === id);
        if (transaction && transaction.approved) {
            return showToast('Không thể sửa phiếu đã duyệt!', 'error');
        }
        openTransactionModal({ transactionId: id });
    }
    // Nút "Xóa"
    else if (target.classList.contains('delete-transaction-btn')) {
        // Kiểm tra phiếu đã duyệt chưa
        const transaction = getTransactions().find(t => t.id === id);
        if (transaction && transaction.approved) {
            return showToast('Không thể xóa phiếu đã duyệt!', 'error');
        }
        const confirmed = await showConfirm('Bạn có chắc muốn xóa phiếu này?', 'Xác nhận xóa');
        if (confirmed) {
            await deleteTransaction(id);
        }
    }
    // Nút "Duyệt/Bỏ duyệt"
    else if (target.classList.contains('toggle-transaction-approve-btn')) {
        await toggleTransactionApproval(id);
    }
    // Nút "Xóa nhiều"
    else if (target.id === 'bulk-delete-transactions-btn') {
        await bulkDelete();
    }
    // Nút "Duyệt hàng loạt"
    else if (target.id === 'bulk-approve-transactions-btn') {
        await bulkApproveTransactions(true);
    }
    // Nút "Bỏ duyệt hàng loạt"
    else if (target.id === 'bulk-unapprove-transactions-btn') {
        await bulkApproveTransactions(false);
    }
    // Nút "Xuất Excel"
    else if (target.id === 'export-transactions-btn') {
        handleExport();
    }
    // Đóng modal
    else if (target.id === 'close-transaction-modal' || target.id === 'cancel-transaction-btn') {
        closeModal(transactionModal);
    }
    
    // --- Xử lý trong Modal Thu Chi ---
    
    // Nút "Thêm hạng mục"
    else if (target.id === 'add-transaction-item-btn') {
        renderTransactionCategories(); // Tải lại danh sách
        // Đặt z-index rất cao
        selectTransactionCategoryModal.style.zIndex = '999999';
        selectTransactionCategoryModal.style.position = 'fixed';
        openModal(selectTransactionCategoryModal);
    }
    // Nút "Xóa hạng mục"
    else if (target.classList.contains('remove-item-btn')) {
        const index = parseInt(target.dataset.index);
        currentTransactionItems.splice(index, 1);
        renderTransactionItems();
    }
    
    // --- Xử lý Modal Loại Thu Chi ---
    
    // Nút "Thêm" (trong modal chọn loại) - thêm inline 1 hàng để nhập tên nhanh
    else if (target.id === 'add-new-transaction-category-btn') {
        addInlineCategoryRow();
    }
    // Nút đóng modal chọn
    else if (target.id === 'close-select-transaction-category-modal' || target.id === 'close-select-category-btn') {
        closeModal(selectTransactionCategoryModal);
    }
    // Nút đóng modal thêm mới
    else if (target.id === 'close-add-category-modal' || target.id === 'cancel-add-category-btn') {
        closeModal(addTransactionCategoryModal);
    }
    // Nút "Xóa" loại thu chi
    else if (target.classList.contains('delete-category-btn')) {
        const confirmed = await showConfirm('Bạn có chắc muốn xóa loại thu chi này?', 'Xác nhận xóa');
        if (confirmed) {
            await deleteDoc(doc(db, 'transactionCategories', id));
            showToast('Đã xóa loại thu chi!');
            loadTransactionCategories(); // Tải lại
        }
    }
    // Click chọn 1 loại thu chi
    else if (target.classList.contains('select-category-btn')) {
        const category = transactionCategoriesCache.find(c => c.id === id);
        if (category) {
            currentTransactionItems.push({
                categoryId: category.id,
                name: category.name,
                amount: 0
            });
            renderTransactionItems();
            closeModal(selectTransactionCategoryModal);
        }
    }

    // Save inline new category
    else if (target.classList && target.classList.contains('save-inline-category-btn')) {
        const input = document.getElementById('inline-new-category-name');
        if (!input) return;
        const name = input.value.trim();
        if (!name) { showToast('Vui lòng nhập tên hạng mục!', 'error'); input.focus(); return; }

        try {
            // generate a simple code
            const code = 'LTC' + (Date.now() % 1000000).toString().padStart(6, '0');
            const categoryData = {
                code,
                name,
                description: '',
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp()
            };
            // Create Firebase + localStorage
            const docRef = await addDoc(collection(db, 'transactionCategories'), categoryData);
            
            // Add to localStorage với Firebase ID
            const newItem = { 
                ...categoryData, 
                id: docRef.id,
                createdAt: new Date(),
                updatedAt: new Date()
            };
            const state = getState();
            state.transactionCategories.unshift(newItem);
            saveToCache();
            document.dispatchEvent(new CustomEvent('store:transactionCategories:updated'));
            
            showToast('Thêm loại thu/chi thành công!', 'success');
            // remove inline row if still present
            const row = document.getElementById('inline-add-category-row');
            if (row && row.parentNode) row.parentNode.removeChild(row);
            // Tự động tải lại danh sách thông qua event
        } catch (err) {
            console.error('Error saving inline category', err);
            showToast('Lỗi khi thêm loại: ' + err.message, 'error');
        }
    }
    // Cancel inline add
    else if (target.classList && target.classList.contains('cancel-inline-category-btn')) {
        const row = document.getElementById('inline-add-category-row');
        if (row && row.parentNode) row.parentNode.removeChild(row);
    }
}

/**
 * Mở modal Thêm/Sửa Thu Chi
 */
function openTransactionModal(options = {}) {
    const { transactionId } = options;
    transactionForm.reset();
    currentTransactionItems = [];
    
    // LOAD DROPDOWN TRƯỚC (tòa nhà + sổ quỹ)
    const buildings = getBuildings();
    transactionBuildingSelect.innerHTML = '<option value="">Tòa nhà</option>';
    buildings.forEach(b => {
        transactionBuildingSelect.innerHTML += `<option value="${b.id}">${b.code}</option>`;
    });
    
    loadAccountsToTransactionDropdown(); // Load sổ quỹ trước
    
    if (transactionId) {
        // Chế độ Sửa
        transactionModalTitle.textContent = 'Sửa Phiếu Thu/Chi';
        document.getElementById('transaction-id').value = transactionId;
        
        const t = getTransactions().find(t => t.id === transactionId);
        if (t) {
            // Load các field cơ bản
            document.getElementById(t.type === 'income' ? 'transaction-type-income' : 'transaction-type-expense').checked = true;
            updateTransactionLabels(t.type === 'income');
            
            document.getElementById('transaction-title').value = t.title || '';
            document.getElementById('transaction-payer').value = t.payer || '';
            
            // Xử lý ngày: chuyển đổi sang format DD-MM-YYYY cho input text
            let dateForInput = '';
            if (t.date) {
                if (typeof t.date === 'string') {
                    // Nếu là YYYY-MM-DD thì chuyển sang DD-MM-YYYY
                    if (/^\d{4}-\d{2}-\d{2}$/.test(t.date)) {
                        const [year, month, day] = t.date.split('-');
                        dateForInput = `${day}-${month}-${year}`;
                    } 
                    // Nếu đã là DD-MM-YYYY thì dùng luôn
                    else if (/^\d{2}-\d{2}-\d{4}$/.test(t.date)) {
                        dateForInput = t.date;
                    }
                } else if (t.date.toDate || t.date.seconds) {
                    // Firestore Timestamp - sử dụng safeToDate
                    const date = safeToDate(t.date);
                    const day = date.getDate().toString().padStart(2, '0');
                    const month = (date.getMonth() + 1).toString().padStart(2, '0');
                    const year = date.getFullYear();
                    dateForInput = `${day}-${month}-${year}`;
                } else {
                    // Date object
                    const date = new Date(t.date);
                    if (!isNaN(date.getTime())) {
                        const day = date.getDate().toString().padStart(2, '0');
                        const month = (date.getMonth() + 1).toString().padStart(2, '0');
                        const year = date.getFullYear();
                        dateForInput = `${day}-${month}-${year}`;
                    }
                }
            }
            document.getElementById('transaction-date').value = dateForInput;
            
            // Load building, room, customer
            transactionBuildingSelect.value = t.buildingId || '';
            handleTransactionBuildingChange(false, t.room || '');
            handleTransactionRoomChange(false, t.customerId || '');
            
            // Load account
            document.getElementById('transaction-account').value = t.accountId || '';
            
            // Load items
            currentTransactionItems = t.items || [];
        }
    } else {
        // Chế độ Thêm mới
        transactionModalTitle.textContent = 'Tạo Phiếu Thu/Chi';
        document.getElementById('transaction-id').value = '';
        document.getElementById('transaction-type-income').checked = true;
        updateTransactionLabels(true);
        
        // Set ngày hiện tại với format DD-MM-YYYY
        const today = new Date();
        const day = today.getDate().toString().padStart(2, '0');
        const month = (today.getMonth() + 1).toString().padStart(2, '0');
        const year = today.getFullYear();
        const todayString = `${day}-${month}-${year}`;
        document.getElementById('transaction-date').value = todayString;
    }
    
    renderTransactionItems();
    openModal(transactionModal);
}

/**
 * Load danh sách tài khoản vào dropdown
 */
function loadAccountsToTransactionDropdown() {
    const accountSelect = document.getElementById('transaction-account');
    if (!accountSelect) return;
    
    const accounts = getAccounts();
    accountSelect.innerHTML = '<option value="">Sổ quỹ</option>';
    
    accounts.forEach(account => {
        const option = document.createElement('option');
        option.value = account.id;
        
        // Hiển thị tên ngân hàng - Tên chủ TK (hoặc số TK nếu không có tên)
        let displayText = account.bank;
        if (account.bank === 'Cash') {
            displayText = 'Tiền mặt';
        } else {
            const name = account.accountHolder || account.accountNumber || 'Chưa rõ';
            displayText = `${account.bank} - ${name}`;
        }
        
        option.textContent = displayText;
        accountSelect.appendChild(option);
    });
}

/**
 * Xử lý submit form Thu Chi
 */
async function handleTransactionFormSubmit(e) {
    e.preventDefault();
    
    const id = document.getElementById('transaction-id').value;
    const type = document.querySelector('input[name="transaction-type"]:checked').value;
    const title = document.getElementById('transaction-title').value;
    const payer = document.getElementById('transaction-payer').value;
    const dateInput = document.getElementById('transaction-date').value; // YYYY-MM-DD từ input
    const account = document.getElementById('transaction-account').value;
    const buildingId = transactionBuildingSelect.value;
    const room = transactionRoomSelect.value;
    const customerId = transactionCustomerSelect.value;
    
    // Cập nhật lại amount từ các item
    updateItemAmountsFromInputs();
    const totalAmount = currentTransactionItems.reduce((sum, item) => sum + item.amount, 0);
    
    if (!type || !title || !payer || !dateInput || !account || totalAmount <= 0) {
        return showToast('Vui lòng nhập đầy đủ thông tin (Hạng mục phải có số tiền > 0)!', 'error');
    }

    try {
        // Validate và convert ngày từ DD-MM-YYYY sang YYYY-MM-DD
        if (!dateInput) {
            return showToast('Vui lòng chọn ngày!', 'error');
        }
        
        let finalDate = dateInput;
        
        // Nếu là DD-MM-YYYY thì convert sang YYYY-MM-DD để lưu
        if (/^\d{2}-\d{2}-\d{4}$/.test(dateInput)) {
            const [day, month, year] = dateInput.split('-');
            finalDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
        }
        
        // Lưu date dưới dạng YYYY-MM-DD string (chuẩn ISO)
        const transactionData = {
            type, 
            title, 
            payer, 
            accountId: account,
            buildingId, 
            room, 
            customerId,
            date: finalDate, // Lưu dạng YYYY-MM-DD
            items: currentTransactionItems,
            updatedAt: serverTimestamp()
        };
        
        // Nếu sửa transaction, lấy approved từ transaction cũ
        if (id) {
            const oldTransaction = getTransactions().find(t => t.id === id);
            if (oldTransaction) {
                transactionData.approved = oldTransaction.approved; // Giữ nguyên trạng thái duyệt
            }
        } else {
            // Transaction mới mặc định đã duyệt
            transactionData.approved = true;
            transactionData.createdAt = serverTimestamp();
            transactionData.code = `P${type === 'income' ? 'T' : 'C'}${Date.now().toString().slice(-8)}`;
        }

        if (id) {
            // Update Firebase
            await setDoc(doc(db, 'transactions', id), transactionData, { merge: true });
            
            // Update localStorage
            updateInLocalStorage('transactions', id, transactionData);
            showToast('Cập nhật phiếu thành công!');
        } else {
            // Create Firebase
            const docRef = await addDoc(collection(db, 'transactions'), transactionData);
            
            // Add to localStorage với Firebase ID
            const newItem = { 
                ...transactionData, 
                id: docRef.id,
                createdAt: new Date(),
                updatedAt: new Date()
            };
            const state = getState();
            state.transactions.unshift(newItem);
            saveToCache();
            document.dispatchEvent(new CustomEvent('store:transactions:updated'));
            
            showToast('Tạo phiếu thành công!');
        }
        
        closeModal(transactionModal);
        
        // Reset sort flag
        skipSortAfterEdit = false;
    } catch (error) {
        showToast('Lỗi lưu phiếu: ' + error.message, 'error');
    }
}

/**
 * Xử lý submit form Loại Thu Chi
 */
async function handleCategoryFormSubmit(e) {
    e.preventDefault();
    
    // Kiểm tra xem các element có tồn tại không
    const idEl = document.getElementById('transaction-category-id');
    const nameEl = document.getElementById('transaction-category-name');
    const typeEl = document.getElementById('transaction-category-type');
    
    if (!idEl || !nameEl || !typeEl) {
        console.warn('Transaction category form elements not found');
        return;
    }
    
    const id = idEl.value;
    const name = nameEl.value;
    const type = typeEl.value;

    if (!name || !type) return showToast('Vui lòng nhập Tên và Phân loại!', 'error');

    const codeEl = document.getElementById('transaction-category-code');
    const descEl = document.getElementById('transaction-category-description');
    
    const categoryData = {
        name,
        type,
        code: codeEl ? codeEl.value : '',
        description: descEl ? descEl.value : '',
        updatedAt: serverTimestamp()
    };

    try {
        if (id) {
            // Update Firebase
            await setDoc(doc(db, 'transactionCategories', id), categoryData, { merge: true });
            
            // Update localStorage
            const { updateInLocalStorage } = await import('../store.js');
            updateInLocalStorage('transactionCategories', id, categoryData);
            
            showToast('Cập nhật loại thu chi thành công!');
        } else {
            // Create Firebase
            categoryData.createdAt = serverTimestamp();
            const docRef = await addDoc(collection(db, 'transactionCategories'), categoryData);
            
            // Add to localStorage với Firebase ID
            const newItem = { 
                ...categoryData, 
                id: docRef.id,
                createdAt: new Date(),
                updatedAt: new Date()
            };
            const state = getState();
            state.transactionCategories.unshift(newItem);
            saveToCache();
            document.dispatchEvent(new CustomEvent('store:transactionCategories:updated'));
            
            showToast('Thêm loại thu chi thành công!');
        }
        // closeModal(transactionCategoryModal); // Modal removed
        // Tự động tải lại danh sách thông qua event
    } catch (error) {
        showToast('Lỗi: ' + error.message, 'error');
    }
}

// ... (Các hàm xóa, duyệt, ...)
async function deleteTransaction(id) {
    const t = getTransactions().find(t => t.id === id);
    if (!t) return;

    // Kiểm tra phiếu đã duyệt chưa
    if (t.approved) {
        return showToast('Không thể xóa phiếu đã duyệt! Vui lòng bỏ duyệt trước.', 'error');
    }

    try {
        // Xóa thông báo liên quan đến transaction này
        console.log(`🗑️ Xóa phiếu ${t.type === 'income' ? 'thu' : 'chi'} - tìm và xóa thông báo liên quan`);
        try {
            const { query, where, getDocs, deleteDoc, doc, collection } = await import('../firebase.js');
            let deletedNotifications = 0;
            
            if (t.type === 'income') {
                // LOGIC CHO PHIẾU THU
                // 1. Nếu có billId, xóa thông báo payment_collected
                if (t.billId) {
                    console.log('🔍 Tìm thông báo payment_collected cho bill:', t.billId);
                    const billNotificationsQuery = query(
                        collection(db, 'adminNotifications'),
                        where('billId', '==', t.billId),
                        where('type', '==', 'payment_collected')
                    );
                    const billNotificationsSnapshot = await getDocs(billNotificationsQuery);
                    
                    const billDeletePromises = billNotificationsSnapshot.docs.map(notifDoc => 
                        deleteDoc(doc(db, 'adminNotifications', notifDoc.id))
                    );
                    
                    if (billDeletePromises.length > 0) {
                        await Promise.all(billDeletePromises);
                        deletedNotifications += billDeletePromises.length;
                        console.log(`✅ Đã xóa ${billDeletePromises.length} thông báo payment_collected cho bill ${t.billId}`);
                    }
                }
                
                // 2. Nếu có code (từ Casso), xóa thông báo unverified_payment
                if (t.code) {
                    console.log('🔍 Tìm thông báo unverified_payment cho transactionCode:', t.code);
                    const codeNotificationsQuery = query(
                        collection(db, 'adminNotifications'),
                        where('transactionCode', '==', t.code),
                        where('type', '==', 'unverified_payment')
                    );
                    const codeNotificationsSnapshot = await getDocs(codeNotificationsQuery);
                    
                    const codeDeletePromises = codeNotificationsSnapshot.docs.map(notifDoc => 
                        deleteDoc(doc(db, 'adminNotifications', notifDoc.id))
                    );
                    
                    if (codeDeletePromises.length > 0) {
                        await Promise.all(codeDeletePromises);
                        deletedNotifications += codeDeletePromises.length;
                        console.log(`✅ Đã xóa ${codeDeletePromises.length} thông báo unverified_payment cho transactionCode ${t.code}`);
                    }
                }
            } else if (t.type === 'expense') {
                // 🔥 LOGIC CHO PHIẾU CHI - XÓA THÔNG BÁO expense_draft_created
                console.log('🔍 Tìm thông báo expense_draft_created cho transactionId:', id);
                const expenseNotificationsQuery = query(
                    collection(db, 'adminNotifications'),
                    where('transactionId', '==', id),
                    where('type', '==', 'expense_draft_created')
                );
                const expenseNotificationsSnapshot = await getDocs(expenseNotificationsQuery);
                
                const expenseDeletePromises = expenseNotificationsSnapshot.docs.map(notifDoc => 
                    deleteDoc(doc(db, 'adminNotifications', notifDoc.id))
                );
                
                if (expenseDeletePromises.length > 0) {
                    await Promise.all(expenseDeletePromises);
                    deletedNotifications += expenseDeletePromises.length;
                    console.log(`✅ Đã xóa ${expenseDeletePromises.length} thông báo expense_draft_created cho transaction ${id}`);
                }
            }
            
            if (deletedNotifications === 0) {
                console.log('ℹ️ Không tìm thấy thông báo nào để xóa');
            } else {
                console.log(`✅ Đã xóa tổng cộng ${deletedNotifications} thông báo từ Firebase`);
            }
            
        } catch (error) {
            console.error('❌ Lỗi khi xóa thông báo:', error);
        }
        
        // Nếu phiếu thu liên kết với hóa đơn, cập nhật trạng thái hóa đơn
        if (t.type === 'income' && t.billId) {
            await setDoc(doc(db, 'bills', t.billId), {
                status: 'unpaid',
                paidAmount: 0,
                paidDate: null,
                updatedAt: serverTimestamp()
            }, { merge: true });
            
            // ✅ CẬP NHẬT LOCALSTORAGE CHO BILL
            updateInLocalStorage('bills', t.billId, {
                status: 'unpaid',
                paidAmount: 0,
                paidDate: null
            });
            console.log(`✅ Đã cập nhật bill ${t.billId} trong localStorage về unpaid`);
            
            // ✅ DISPATCH EVENT ĐỂ UI BILLS CẬP NHẬT
            window.dispatchEvent(new CustomEvent('store:bills:updated'));
            
            showToast('Đã xóa phiếu thu, cập nhật hóa đơn và xóa thông báo!');
        } else {
            showToast(`Đã xóa phiếu ${t.type === 'income' ? 'thu' : 'chi'} và thông báo liên quan!`);
        }
        
        // Delete Firebase + localStorage
        await deleteDoc(doc(db, 'transactions', id));
        deleteFromLocalStorage('transactions', id);
        
        // Event đã được dispatch bởi deleteFromLocalStorage
    } catch (error) {
        showToast('Lỗi xóa: ' + error.message, 'error');
    }
}

async function toggleTransactionApproval(id) {
    const t = getTransactions().find(t => t.id === id);
    if (!t) return;
    
    const newApproved = !t.approved;
    try {
        // Nếu duyệt phiếu liên kết với HĐ, cập nhật HĐ
        if (t.billId) {
            await setDoc(doc(db, 'bills', t.billId), {
                status: newApproved ? 'paid' : 'unpaid',
                updatedAt: serverTimestamp()
            }, { merge: true });
        }
        
        // Update Firebase
        await setDoc(doc(db, 'transactions', id), {
            approved: newApproved,
            updatedAt: serverTimestamp()
        }, { merge: true });
        
        // Update localStorage
        updateInLocalStorage('transactions', id, {
            approved: newApproved,
            updatedAt: new Date()
        });
        
        showToast(newApproved ? 'Đã duyệt phiếu!' : 'Đã bỏ duyệt phiếu!');
        
        // Set flag để không sort lại sau khi approve/unapprove
        skipSortAfterEdit = true;
        
        // Store listener tự động cập nhật
    } catch (error) {
        showToast('Lỗi: ' + error.message, 'error');
    }
}

async function bulkDelete() {
    const selected = Array.from(document.querySelectorAll('.transaction-checkbox:checked'))
        .map(cb => cb.dataset.id);
    if (selected.length === 0) return showToast('Vui lòng chọn phiếu để xóa!', 'warning');

    // Kiểm tra có phiếu nào đã duyệt không
    const allTransactions = getTransactions();
    const approvedTransactions = selected.filter(id => {
        const transaction = allTransactions.find(t => t.id === id);
        return transaction && transaction.approved;
    });
    
    if (approvedTransactions.length > 0) {
        return showToast(`Không thể xóa ${approvedTransactions.length} phiếu đã duyệt! Vui lòng bỏ duyệt trước.`, 'error');
    }

    const confirmed = await showConfirm(`Bạn có chắc muốn xóa ${selected.length} phiếu đã chọn?`, 'Xác nhận xóa');
    if (confirmed) {
        for (const id of selected) {
            await deleteTransaction(id); // Gọi hàm xóa lẻ để xử lý logic billId
        }
        
        // Reset bulk selection
        resetBulkSelection();
    }
}

function handleExport() {
    if (transactionsCache_filtered.length === 0) return showToast('Không có dữ liệu để xuất!', 'error');
    
    const buildings = getBuildings();
    const data = transactionsCache_filtered.map(t => ({
        'Mã phiếu': t.code,
        'Loại': t.type === 'income' ? 'Thu' : 'Chi',
        'Tên phiếu': t.title,
        'Số tiền': t.amount,
        'Ngày': formatDateForDisplay(t.date),
        'Người nộp/nhận': t.payer,
        'Tòa nhà': buildings.find(b => b.id === t.buildingId)?.code || '',
        'Phòng': t.room,
        'Trạng thái': t.approved ? 'Đã duyệt' : 'Chưa duyệt'
    }));
    
    exportToExcel(data, 'Danh_sach_thu_chi');
    showToast('Xuất dữ liệu thành công!');
}

// --- HÀM XỬ LÝ MODAL ---

function handleTransactionBuildingChange() {
    const buildingId = transactionBuildingSelect.value;
    
    // Load phòng - copy từ Bills
    transactionRoomSelect.innerHTML = '<option value="">Phòng</option>';
    if (buildingId) {
        const building = getBuildings().find(b => b.id === buildingId);
        if (building && building.rooms) {
            building.rooms.forEach(room => {
                transactionRoomSelect.innerHTML += `<option value="${room}">${room}</option>`;
            });
        }
    }
    
    // Clear customer
    transactionCustomerSelect.innerHTML = '<option value="">Hợp đồng</option>';
}

function handleTransactionRoomChange() {
    const buildingId = transactionBuildingSelect.value;
    const room = transactionRoomSelect.value;
    
    transactionCustomerSelect.innerHTML = '<option value="">Hợp đồng</option>';
    
    if (buildingId && room) {
        const contracts = getContracts();
        console.log('All contracts:', contracts);
        console.log('Looking for:', { buildingId, room });
        
        // Normalize room name - copy từ Bills
        function normalizeRoomName(roomName) {
            if (/^[A-Za-z]\d+$/.test(roomName) && roomName.match(/^[A-Za-z]0(\d+)$/)) {
                return roomName.replace(/^([A-Za-z])0+/, '$1');
            }
            return roomName;
        }
        
        const normalizedRoom = normalizeRoomName(room);
        console.log(`Normalized room: ${room} -> ${normalizedRoom}`);
        
        // Tìm hợp đồng - thử cả room gốc và normalized
        let contract = contracts.find(c => 
            c.buildingId === buildingId && 
            (c.room === room || c.room === normalizedRoom)
        );
        
        console.log('Found contract:', contract);
        
        if (contract) {
            const customers = getCustomers();
            const customer = customers.find(c => c.id === contract.representativeId);
            
            if (customer) {
                console.log('Found customer:', customer);
                transactionCustomerSelect.innerHTML += `<option value="${customer.id}" selected>${customer.name}</option>`;
            }
        }
    }
}

function renderTransactionCategories() {
    if (!transactionCategoriesListEl) return;
    
    transactionCategoriesListEl.innerHTML = '';
    transactionCategoriesCache.forEach(cat => {
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-gray-50';
        tr.innerHTML = `
            <td class="py-3 px-3">${cat.name}</td>
            <td class="py-3 px-3">
                <button type="button" class="select-category-btn bg-green-500 text-white px-3 py-1 rounded" data-id="${cat.id}">Chọn</button>
                <button type="button" class="delete-category-btn bg-red-500 text-white px-3 py-1 rounded" data-id="${cat.id}">Xóa</button>
            </td>
        `;
        transactionCategoriesListEl.appendChild(tr);
    });
}

function renderTransactionItems() {
    transactionItemsListEl.innerHTML = '';
    if (currentTransactionItems.length === 0) {
        transactionItemsListEl.innerHTML = '<tr class="text-center text-gray-400"><td colspan="3" class="py-6">Không có bản ghi nào!</td></tr>';
        return;
    }
    
    currentTransactionItems.forEach((item, index) => {
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-gray-50 border-b border-gray-100';
        tr.innerHTML = `
            <td class="py-3 px-4 font-medium text-gray-700">${item.name}</td>
            <td class="py-3 px-4">
                <input type="text" value="${formatMoney(item.amount)}" class="w-full p-2 border border-gray-300 rounded-lg money-input item-amount focus:ring-2 focus:ring-blue-500 focus:border-transparent" data-index="${index}" placeholder="0">
            </td>
            <td class="py-3 px-4 text-center">
                <button type="button" class="remove-item-btn text-red-600 hover:text-red-800 p-1 rounded" data-index="${index}">
                    <svg class="w-4 h-4 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
                    </svg>
                </button>
            </td>
        `;
        transactionItemsListEl.appendChild(tr);
    });
}

function updateItemAmountsFromInputs() {
    document.querySelectorAll('.item-amount').forEach(input => {
        const index = input.dataset.index;
        currentTransactionItems[index].amount = parseFormattedNumber(input.value);
    });
}

// Hàm xử lý thay đổi filter tòa nhà
function handleFilterBuildingChange() {
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
    applyTransactionFilters();
}

// Hàm tiện ích nội bộ
function getContractStatus(contract) {
    if (contract.status === 'terminated') return 'terminated';
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const endDate = parseDateInput(contract.endDate);
    if (!endDate) return 'terminated';
    endDate.setHours(0, 0, 0, 0);
    return (endDate >= today) ? 'active' : 'expired';
}

// Cập nhật label và màu sắc theo loại phiếu
function updateTransactionLabels(isIncome) {
    const sectionTitle = document.getElementById('transaction-section-title');
    const titleLabel = document.getElementById('transaction-title-label');
    const payerLabel = document.getElementById('transaction-payer-label');
    const dateLabel = document.getElementById('transaction-date-label');
    
    if (isIncome) {
        // Phiếu thu - màu xanh lá
        sectionTitle.className = 'text-md font-semibold mb-4 text-green-600';
        titleLabel.innerHTML = 'Tên phiếu thu <span class="text-red-500">*</span>';
        payerLabel.innerHTML = 'Người thu <span class="text-red-500">*</span>';
        dateLabel.innerHTML = 'Ngày thực thu <span class="text-red-500">*</span>';
    } else {
        // Phiếu chi - màu đỏ
        sectionTitle.className = 'text-md font-semibold mb-4 text-red-600';
        titleLabel.innerHTML = 'Tên phiếu chi <span class="text-red-500">*</span>';
        payerLabel.innerHTML = 'Người nhận <span class="text-red-500">*</span>';
        dateLabel.innerHTML = 'Ngày thực chi <span class="text-red-500">*</span>';
    }
}

/**
 * Mở modal thêm loại thu/chi mới
 */
function openAddCategoryModal() {
    // Reset form
    if (addTransactionCategoryForm) {
        addTransactionCategoryForm.reset();
    }
    
    // Mở modal
    if (addTransactionCategoryModal) {
        addTransactionCategoryModal.style.zIndex = '1000000';
        addTransactionCategoryModal.style.position = 'fixed';
        openModal(addTransactionCategoryModal);
    }
}

/**
 * Xử lý submit form thêm loại thu/chi mới
 */
async function handleAddCategoryFormSubmit(e) {
    e.preventDefault();
    
    // Lấy dữ liệu từ form
    const code = document.getElementById('new-category-code').value.trim();
    const name = document.getElementById('new-category-name').value.trim();
    const type = document.getElementById('new-category-type').value;
    const description = document.getElementById('new-category-description').value.trim();
    
    // Kiểm tra dữ liệu
    if (!code || !name || !type) {
        showToast('Vui lòng nhập đầy đủ thông tin bắt buộc!', 'error');
        return;
    }
    
    try {
        // Kiểm tra mã đã tồn tại chưa
        const existingQuery = query(collection(db, 'transactionCategories'), where('code', '==', code));
        // const existingSnapshot = await getDocs(existingQuery);
        // SKIP - không kiểm tra existing categories từ Firebase
        
        if (!existingSnapshot.empty) {
            showToast('Mã loại thu/chi đã tồn tại!', 'error');
            return;
        }
        
        // Tạo dữ liệu mới
        const categoryData = {
            code,
            name,
            type,
            description: description || '',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        };
        
        // Create Firebase + localStorage
        const docRef = await addDoc(collection(db, 'transactionCategories'), categoryData);
        
        // Add to localStorage với Firebase ID
        const newItem = { 
            ...categoryData, 
            id: docRef.id,
            createdAt: new Date(),
            updatedAt: new Date()
        };
        const state = getState();
        state.transactionCategories.unshift(newItem);
        saveToCache();
        document.dispatchEvent(new CustomEvent('store:transactionCategories:updated'));
        
        showToast('Thêm loại thu/chi thành công!', 'success');
        
        // Đóng modal
        closeModal(addTransactionCategoryModal);
        
        // Tự động tải lại danh sách thông qua event
        
    } catch (error) {
        console.error('Error adding transaction category:', error);
        showToast('Lỗi khi thêm loại thu/chi: ' + error.message, 'error');
    }
}

/**
 * Format ngày để hiển thị trong bảng (DD-MM-YYYY)
 */
function formatDateForDisplay(dateValue) {
    if (!dateValue) return '';
    
    let date;
    
    // Xử lý các format khác nhau
    if (typeof dateValue === 'string') {
        if (/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) {
            // YYYY-MM-DD
            const [year, month, day] = dateValue.split('-');
            return `${day}-${month}-${year}`;
        } else if (/^\d{2}-\d{2}-\d{4}$/.test(dateValue)) {
            // DD-MM-YYYY (đã đúng format)
            return dateValue;
        } else {
            date = new Date(dateValue);
        }
    } else if (dateValue.toDate || dateValue.seconds) {
        // Firestore Timestamp - sử dụng safeToDate
        date = safeToDate(dateValue);
    } else {
        // Date object
        date = new Date(dateValue);
    }
    
    // Convert Date object to DD-MM-YYYY
    if (date && !isNaN(date.getTime())) {
        const day = date.getDate().toString().padStart(2, '0');
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        const year = date.getFullYear();
        return `${day}-${month}-${year}`;
    }
    
    return '';
}

/**
 * Duyệt/bỏ duyệt hàng loạt transactions
 */
async function bulkApproveTransactions(approve) {
    const selected = getSelectedTransactionIds(t => t.approved !== approve); // Chỉ chọn phiếu chưa đúng trạng thái
    if (selected.length === 0) {
        showToast(`Không có phiếu nào cần ${approve ? 'duyệt' : 'bỏ duyệt'}!`, 'warning');
        return;
    }

    const confirmed = await showConfirm(`Bạn có chắc muốn ${approve ? 'duyệt' : 'bỏ duyệt'} ${selected.length} phiếu đã chọn?`, `Xác nhận ${approve ? 'duyệt' : 'bỏ duyệt'}`);
    if (!confirmed) return;

    try {
        for (const transactionId of selected) {
            const transaction = getTransactions().find(t => t.id === transactionId);
            
            // Update Firebase
            await setDoc(doc(db, 'transactions', transactionId), {
                approved: approve,
                updatedAt: serverTimestamp()
            }, { merge: true });
            
            // Update localStorage
            updateInLocalStorage('transactions', transactionId, {
                approved: approve,
                updatedAt: new Date()
            });
            
            // Nếu transaction liên kết với hóa đơn, cập nhật hóa đơn
            if (transaction && transaction.billId) {
                await setDoc(doc(db, 'bills', transaction.billId), {
                    status: approve ? 'paid' : 'unpaid',
                    updatedAt: serverTimestamp()
                }, { merge: true });
            }
        }
        
        // Reset trạng thái
        selectedMobileTransactionIds.clear();
        resetBulkSelection();
        updateBulkApprovalButtons();
        
        // Set flag để không sort lại sau khi bulk approve
        skipSortAfterEdit = true;
        
        showToast(`Đã ${approve ? 'duyệt' : 'bỏ duyệt'} ${selected.length} phiếu!`);
        
    } catch (error) {
        showToast('Lỗi: ' + error.message, 'error');
    }
}

/**
 * Lấy danh sách ID các transaction được chọn
 */
function getSelectedTransactionIds(filter = null) {
    const allTransactions = getTransactions();
    
    // Lấy từ Set mobile nếu có, không thì từ desktop checkboxes
    let selectedIds;
    if (selectedMobileTransactionIds.size > 0) {
        selectedIds = Array.from(selectedMobileTransactionIds);
    } else {
        const checkboxes = document.querySelectorAll('.transaction-checkbox:checked');
        selectedIds = Array.from(checkboxes).map(cb => cb.dataset.id);
    }
    
    return selectedIds.filter(id => {
        if (!filter) return true;
        const transaction = allTransactions.find(t => t.id === id);
        return transaction && filter(transaction);
    });
}

/**
 * Reset trạng thái bulk selection
 */
function resetBulkSelection() {
    // Bỏ tick tất cả checkbox
    document.querySelectorAll('.transaction-checkbox').forEach(cb => {
        cb.checked = false;
    });
    
    // Bỏ tick select all
    if (selectAllCheckbox) {
        selectAllCheckbox.checked = false;
    }
    
    // Ẩn các nút hàng loạt
    if (bulkApproveTransactionsBtn) bulkApproveTransactionsBtn.classList.add('hidden');
    if (bulkUnapproveTransactionsBtn) bulkUnapproveTransactionsBtn.classList.add('hidden');
}

/**
 * Cập nhật hiển thị nút bulk approval
 */
function updateBulkApprovalButtons() {
    // Kiểm tra cả Set mobile và desktop checkboxes
    const mobileCount = selectedMobileTransactionIds.size;
    const desktopChecked = document.querySelectorAll('.transaction-checkbox:checked').length;
    const totalSelected = Math.max(mobileCount, desktopChecked);
    
    if (totalSelected === 0) {
        if (bulkApproveTransactionsBtn) bulkApproveTransactionsBtn.classList.add('hidden');
        if (bulkUnapproveTransactionsBtn) bulkUnapproveTransactionsBtn.classList.add('hidden');
        updateClearSelectionButton();
        return;
    }
    
    // Lấy trạng thái approved của các transaction được chọn
    const allTransactions = getTransactions();
    let selectedIds;
    if (selectedMobileTransactionIds.size > 0) {
        selectedIds = Array.from(selectedMobileTransactionIds);
    } else {
        selectedIds = Array.from(document.querySelectorAll('.transaction-checkbox:checked')).map(cb => cb.dataset.id);
    }
    
    const states = selectedIds.map(transactionId => {
        const transaction = allTransactions.find(t => t.id === transactionId);
        return transaction ? transaction.approved : false;
    });
    
    const allApproved = states.every(s => s === true);
    const allUnapproved = states.every(s => s === false);

    // Hiển thị nút phù hợp
    if (bulkApproveTransactionsBtn) {
        bulkApproveTransactionsBtn.classList.toggle('hidden', !allUnapproved);
    }
    if (bulkUnapproveTransactionsBtn) {
        bulkUnapproveTransactionsBtn.classList.toggle('hidden', !allApproved);
    }
    
    // Cập nhật clear button
    updateClearSelectionButton();
}

/**
 * Cập nhật trạng thái hiển thị nút bỏ chọn hàng loạt
 */
function updateClearSelectionButton() {
    const clearBtn = document.getElementById('clear-selection-transactions-btn');
    if (clearBtn) {
        if (selectedMobileTransactionIds.size >= 2) {
            clearBtn.classList.remove('hidden');
        } else {
            clearBtn.classList.add('hidden');
        }
    }
}

/**
 * Thêm 1 hàng inline ở đầu bảng để nhập nhanh Tên hạng mục (không mở modal)
 */
function addInlineCategoryRow() {
    if (!transactionCategoriesListEl) return;
    // tránh thêm nhiều hàng cùng lúc
    if (document.getElementById('inline-add-category-row')) {
        const existing = document.getElementById('inline-new-category-name');
        if (existing) existing.focus();
        return;
    }

    const tr = document.createElement('tr');
    tr.id = 'inline-add-category-row';
    tr.innerHTML = `
        <td class="py-3 px-3"></td>
        <td class="py-3 px-3"><input id="inline-new-category-name" class="w-full p-2 border border-gray-300 rounded" placeholder="Tên hạng mục"></td>
        <td class="py-3 px-3">
            <button type="button" class="save-inline-category-btn bg-green-500 text-white px-3 py-1 rounded mr-2">Lưu</button>
            <button type="button" class="cancel-inline-category-btn bg-gray-200 text-gray-800 px-3 py-1 rounded">Hủy</button>
        </td>
    `;

    // thêm lên đầu
    if (transactionCategoriesListEl.firstChild) {
        transactionCategoriesListEl.insertBefore(tr, transactionCategoriesListEl.firstChild);
    } else {
        transactionCategoriesListEl.appendChild(tr);
    }

    const input = document.getElementById('inline-new-category-name');
    if (input) input.focus();
}

// === IMPORT EXCEL ===

/**
 * Thiết lập events cho import
 */
function setupImportEvents() {
    // Mở modal
    const importBtn = document.getElementById('import-transactions-btn');
    const importModal = document.getElementById('import-transactions-modal');
    
    importBtn?.addEventListener('click', () => {
        importModal?.classList.remove('hidden');
    });
    
    // Đóng modal  
    const closeBtn = document.getElementById('close-import-transactions-modal');
    const cancelBtn = document.getElementById('cancel-import-transactions');
    
    closeBtn?.addEventListener('click', () => {
        importModal?.classList.add('hidden');
    });
    
    cancelBtn?.addEventListener('click', () => {
        importModal?.classList.add('hidden');
    });
    
    // File change
    document.getElementById('import-transactions-file').addEventListener('change', (e) => {
        document.getElementById('import-transactions-file-name').textContent = e.target.files[0] ? `Đã chọn: ${e.target.files[0].name}` : '';
    });
    
    // Import button
    document.getElementById('confirm-import-transactions').addEventListener('click', handleImport);
    
    // Download template
    document.getElementById('download-transaction-template-btn').addEventListener('click', downloadTransactionTemplate);
}

/**
 * Xử lý import file
 */
async function handleImport() {
    const file = document.getElementById('import-transactions-file').files[0];
    
    if (!file) return showToast('Vui lòng chọn file Excel!', 'error');
    
    try {
        showToast('Đang đọc file...', 'info');
        const data = await importFromExcel(file);
        if (!data || data.length === 0) return showToast('File Excel không có dữ liệu!', 'error');

        // DEBUG: Xem dữ liệu thực tế từ Excel
        console.log('🔍 === DEBUG IMPORT DATA ===');
        console.log('📊 Tổng số dòng:', data.length);
        console.log('📋 Dòng đầu tiên (sample):', data[0]);
        console.log('🔑 Tất cả keys của dòng đầu:', Object.keys(data[0]));
        console.log('📊 3 dòng đầu:', data.slice(0, 3));

        let successCount = 0, errorCount = 0;
        
        // BỎ LỌC - LẤY TẤT CẢ DỮ LIỆU
        const filteredData = data;
        
        for (const row of filteredData) {
            try {
                // DEBUG: In ra từng dòng
                console.log('📊 === XỬ LÝ DÒNG ===');
                console.log('Raw row:', row);
                console.log('Row keys:', Object.keys(row));
                
                // COPY Y CHANG CÁCH BILLS LẤY DỮ LIỆU
                const buildingCode = row['Mã tòa nhà'];
                const type = row['Loại'];
                const title = row['Tên phiếu'];
                const payer = row['Người nộp/nhận'];
                const accountName = row['Tên sổ quỹ'];
                const dateStr = row['Ngày (dd-mm-yyyy)'] || row['Ngày'];
                const categoryName = row['Hạng mục'];
                const amountStr = row['Số tiền'];
                
                console.log('[DEBUG] buildingCode:', buildingCode, 'type:', type, 'accountName:', accountName, 'amountStr:', amountStr);
                
                // Validate
                if (!type || !['Thu', 'Chi'].includes(type)) {
                    errorCount++;
                    continue;
                }
                
                if (!title || !payer || !categoryName) {
                    errorCount++;
                    continue;
                }
                
                // Parse amount - ĐƠN GIẢN
                let amount = parseFloat(amountStr);
                if (isNaN(amount) || amount <= 0) {
                    amount = parseFormattedNumber(amountStr);
                    if (isNaN(amount) || amount <= 0) {
                        errorCount++;
                        continue;
                    }
                }
                
                // Parse date - ĐƠN GIẢN  
                const date = parseDateInput(dateStr) || new Date();
                
                // TÌM BUILDING ID THỰC TỪ CODE
                const buildings = getBuildings();
                const building = buildings.find(b => b.code === buildingCode || b.name === buildingCode);
                const realBuildingId = building ? building.id : '';
                
                // TÌM ACCOUNT ID THỰC TỪ TÊN
                const accounts = getAccounts();
                const account = accounts.find(a => {
                    const displayName = a.bank && a.accountHolder 
                        ? `${a.bank} - ${a.accountHolder}`
                        : (a.bank || a.accountHolder || '');
                    return displayName === accountName;
                });
                const realAccountId = account ? account.id : '';
                
                console.log('[MAPPING] buildingCode:', buildingCode, '-> buildingId:', realBuildingId);
                console.log('[MAPPING] accountName:', accountName, '-> accountId:', realAccountId);
                
                // TÌM CATEGORY ID THỰC TỪ TÊN
                const category = transactionCategoriesCache.find(c => c.name === categoryName);
                const realCategoryId = category ? category.id : '';
                
                console.log('[MAPPING] categoryName:', categoryName, '-> categoryId:', realCategoryId);
                
                // Tạo transaction - DÙNG ID THỰC
                const transactionData = {
                    type: type === 'Thu' ? 'income' : 'expense',
                    title: title,
                    payer: payer,
                    date: convertToDateInputFormat(date),
                    buildingId: realBuildingId,
                    room: '',
                    customerId: '',
                    accountId: realAccountId,
                    items: [{
                        name: categoryName,
                        amount: amount,
                        categoryId: realCategoryId
                    }],
                    approved: true,
                    createdAt: serverTimestamp()
                };
                
                console.log('💾 SAVING:', transactionData);
                
                // Import to Firebase + localStorage
                const docRef = await addDoc(collection(db, 'transactions'), transactionData);
                
                // Add to localStorage với Firebase ID
                const newItem = { 
                    ...transactionData,
                    id: docRef.id,
                    createdAt: new Date()
                };
                const state = getState();
                state.transactions.unshift(newItem);
                
                successCount++;
                
            } catch (error) {
                console.error('Lỗi import dòng:', error);
                errorCount++;
            }
        }
        
        // Save cache và dispatch event sau khi import xong
        if (successCount > 0) {
            saveToCache();
            document.dispatchEvent(new CustomEvent('store:transactions:updated'));
        }
        
        // Đóng modal
        document.getElementById('import-transactions-file').value = '';
        const modal = document.getElementById('import-transactions-modal');
        modal?.classList.add('hidden');
        
        showToast(`Import hoàn thành: ${successCount} thành công, ${errorCount} lỗi`, 
            errorCount > 0 ? 'warning' : 'success');
        
    } catch (error) {
        console.error('Lỗi import:', error);
        showToast('Lỗi import: ' + error.message, 'error');
    }
}

/**
 * Import phiếu thu chi từ file Excel/CSV
 */
export function importTransactions(file) {
    return new Promise((resolve, reject) => {
        console.log('📂 importTransactions started với file:', file.name);
        const fileName = file.name.toLowerCase();
        
        if (fileName.endsWith('.csv')) {
            console.log('📄 Detected CSV file');
            // Xử lý file CSV
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const text = e.target.result;
                    const jsonData = parseCSV(text);
                    const transactions = processTransactionData(jsonData);
                    resolve(transactions);
                } catch (error) {
                    reject('Lỗi đọc file CSV: ' + error.message);
                }
            };
            reader.onerror = () => reject('Lỗi đọc file');
            reader.readAsText(file, 'utf-8');
        } else if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
            console.log('📊 Detected Excel file');
            // Xử lý file Excel
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    console.log('📖 Đang đọc file Excel...');
                    const data = new Uint8Array(e.target.result);
                    const workbook = XLSX.read(data, { type: 'array' });
                    
                    console.log('📋 Workbook sheets:', workbook.SheetNames);
                    
                    // Lấy sheet đầu tiên (sheet dữ liệu)
                    const firstSheetName = workbook.SheetNames[0];
                    const worksheet = workbook.Sheets[firstSheetName];
                    const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
                    
                    console.log('📊 Raw data từ Excel:', jsonData);
                    console.log('📊 Số dòng dữ liệu:', jsonData.length);
                    
                    const transactions = processTransactionData(jsonData);
                    console.log('✅ Processed transactions:', transactions.length);
                    resolve(transactions);
                } catch (error) {
                    console.error('❌ Lỗi đọc Excel:', error);
                    reject('Lỗi đọc file Excel: ' + error.message);
                }
            };
            reader.onerror = () => reject('Lỗi đọc file');
            reader.readAsArrayBuffer(file);
        } else {
            reject('Định dạng file không được hỗ trợ. Chỉ chấp nhận .xlsx, .xls, .csv');
        }
    });
}

/**
 * Parse CSV text thành mảng 2 chiều
 */
function parseCSV(text) {
    const lines = text.split('\n');
    return lines.map(line => line.split(',').map(cell => cell.trim()));
}

/**
 * Xử lý dữ liệu transaction từ mảng 2 chiều
 */
function processTransactionData(jsonData) {
    console.log('🔄 processTransactionData started');
    console.log('📊 Input jsonData:', jsonData);
    
    if (!jsonData || jsonData.length <= 1) {
        console.error('❌ File rỗng hoặc không có dữ liệu');
        throw new Error('File rỗng hoặc không có dữ liệu');
    }

    console.log('📋 Header row:', jsonData[0]);
    
    // Bỏ qua header (dòng đầu tiên)
    const dataRows = jsonData.slice(1).filter(row => 
        row && row.length > 0 && row.some(cell => cell !== null && cell !== undefined && cell.toString().trim() !== '')
    );
    
    console.log('📊 Data rows after filter:', dataRows.length);
    console.log('📊 Sample data rows:', dataRows.slice(0, 3));
    
    const transactions = [];
    const errors = [];

    dataRows.forEach((row, index) => {
        // Convert tất cả cells thành string và trim
        const cleanRow = row.map(cell => (cell === null || cell === undefined) ? '' : cell.toString().trim());
        
        // Validate số cột tối thiểu (8 cột theo cấu trúc mới)
        if (cleanRow.length < 8) {
            errors.push(`Dòng ${index + 2}: Thiếu dữ liệu (cần đúng 8 cột: Mã tòa nhà, Loại, Tên phiếu, Người nộp/nhận, Sổ quỹ, Ngày, Hạng mục, Số tiền)`);
            return;
        }

        try {
            const transaction = parseTransactionRow(cleanRow, index + 2);
            if (transaction) {
                transactions.push(transaction);
            }
        } catch (error) {
            errors.push(`Dòng ${index + 2}: ${error.message}`);
        }
    });

    console.log('📊 Kết quả xử lý:');
    console.log('✅ Transactions thành công:', transactions.length);
    console.log('❌ Errors:', errors.length);
    
    if (errors.length > 0) {
        console.error('❌ Chi tiết errors:', errors);
        throw new Error(`Có lỗi trong file:\n${errors.slice(0, 10).join('\n')}${errors.length > 10 ? `\n... và ${errors.length - 10} lỗi khác` : ''}`);
    }

    console.log('🎉 processTransactionData hoàn thành thành công');
    return transactions;
}

/**
 * Parse 1 dòng dữ liệu thành transaction object
 * Cấu trúc cột mới: Mã tòa nhà, Loại, Tên phiếu, Người nộp/nhận, Sổ quỹ, Ngày, Hạng mục, Số tiền
 */
function parseTransactionRow(row, rowNumber) {
    console.log(`🔍 Đang parse dòng ${rowNumber}:`, row);
    const [buildingCode, type, title, payer, accountName, dateStr, itemName, amountStr] = row;
    console.log(`📋 Dữ liệu parsed:`, {buildingCode, type, title, payer, accountName, dateStr, itemName, amountStr});

    // Validate loại thu/chi
    const cleanType = type?.toString().trim();
    if (!['Thu', 'Chi'].includes(cleanType)) {
        throw new Error(`Loại phải là "Thu" hoặc "Chi", nhận được: "${type}" (${typeof type})`);
    }

    // Validate tên phiếu
    const cleanTitle = title?.toString().trim();
    if (!cleanTitle) {
        throw new Error('Tên phiếu không được trống');
    }

    // Validate người nộp/nhận
    const cleanPayer = payer?.toString().trim();
    if (!cleanPayer) {
        throw new Error('Người nộp/nhận không được trống');
    }

    // Validate tên sổ quỹ
    const cleanAccountName = accountName?.toString().trim();
    if (!cleanAccountName) {
        throw new Error('Tên sổ quỹ không được trống');
    }

    // Parse ngày
    let date;
    try {
        if (!dateStr?.trim()) {
            throw new Error('Ngày không được trống');
        }
        date = parseDateInput(dateStr.trim());
        if (!date) {
            throw new Error(`Ngày không hợp lệ: ${dateStr}`);
        }
    } catch (error) {
        throw new Error(`Ngày không hợp lệ: ${dateStr}`);
    }

    // Tìm tòa nhà (optional)
    const buildings = getBuildings();
    let building = null;
    if (buildingCode?.trim()) {
        building = buildings.find(b => 
            b.code === buildingCode.trim() || 
            b.name === buildingCode.trim() ||
            b.address === buildingCode.trim()
        );
        // Nếu có nhập mã tòa nhà nhưng không tìm thấy thì báo lỗi
        if (buildingCode.trim() && !building) {
            throw new Error(`Không tìm thấy tòa nhà với mã: "${buildingCode}"`);
        }
    }

    // Tìm tài khoản (bắt buộc) - khớp với format web (dùng tên chủ tài khoản)
    let accounts = getAccounts();
    console.log(`🔍 Tìm tài khoản cho: "${cleanAccountName}"`);
    console.log(`📋 Danh sách accounts có:`, accounts.length);
    
    // FALLBACK: Nếu không có accounts từ Firebase
    if (!accounts || accounts.length === 0) {
        console.warn(`⚠️ Không có accounts từ Firebase, tạo account mặc định cho: "${cleanAccountName}"`);
        accounts = [{
            id: 'fallback-account',
            bank: cleanAccountName,
            accountHolder: '',
            code: cleanAccountName
        }];
    }
    
    let account = accounts.find(a => {
        const accountDisplayName = a.bank && a.accountHolder 
            ? `${a.bank} - ${a.accountHolder}`
            : (a.bank || a.accountHolder || a.code || a.id || 'Tài khoản không tên');
        console.log(`🔎 So sánh: "${accountDisplayName}" === "${cleanAccountName}"`);
        return accountDisplayName === cleanAccountName;
    });
    
    // Nếu vẫn không tìm thấy, tạo account mới
    if (!account) {
        console.warn(`⚠️ Không tìm thấy account, tạo mới cho: "${cleanAccountName}"`);
        account = {
            id: `fallback-${Date.now()}`,
            bank: cleanAccountName,
            accountHolder: '',
            code: cleanAccountName
        };
        console.log(`✅ Đã tạo account mới:`, account);
    }
    
    console.log(`✅ Tìm thấy tài khoản:`, account);
    // Parse số tiền với xử lý đặc biệt cho Excel
    let amount;
    try {
        console.log(`💰 Đang parse số tiền:`, amountStr, typeof amountStr);
        
        if (amountStr === null || amountStr === undefined || amountStr === '') {
            throw new Error('Số tiền không được trống');
        }
        
        // Xử lý nếu Excel trả về số
        if (typeof amountStr === 'number') {
            amount = amountStr;
        } else {
            // Xử lý nếu là string
            const cleanStr = amountStr.toString().trim();
            if (!cleanStr) {
                throw new Error('Số tiền không được trống');
            }
            amount = parseFormattedNumber(cleanStr);
        }
        
        console.log(`💰 Số tiền sau khi parse:`, amount);
        
        if (isNaN(amount) || amount <= 0) {
            throw new Error(`Số tiền không hợp lệ: ${amountStr} → ${amount}`);
        }
    } catch (error) {
        console.error(`❌ Lỗi parse số tiền:`, error);
        throw new Error(`Số tiền không hợp lệ: "${amountStr}" (${typeof amountStr})`);
    }

    // Validate hạng mục (bắt buộc và phải khớp chính xác)
    const cleanItemName = itemName?.toString().trim();
    if (!cleanItemName) {
        throw new Error('Tên hạng mục không được trống');
    }

    // Tìm category (bắt buộc - phải khớp chính xác) 
    let category = transactionCategoriesCache.find(c => c.name === cleanItemName);
    
    // FALLBACK: Nếu không tìm thấy category, tạo mới
    if (!category) {
        console.warn(`⚠️ Không tìm thấy category "${cleanItemName}", tạo mới`);
        category = {
            id: `fallback-cat-${Date.now()}`,
            name: cleanItemName,
            type: cleanType === 'Thu' ? 'income' : 'expense'
        };
        transactionCategoriesCache.push(category);
        console.log(`✅ Đã tạo category mới:`, category);
    }

    console.log(`✅ Parse thành công dòng ${rowNumber}`);

    return {
        type: cleanType === 'Thu' ? 'income' : 'expense',
        title: cleanTitle,
        payer: cleanPayer,
        date: date,
        buildingId: building?.id || '',
        room: '', // Bỏ cột phòng
        customerId: '', // Bỏ cột khách hàng
        accountId: account.id,
        items: [{
            name: cleanItemName,
            amount: amount,
            categoryId: category.id
        }],
        approved: true, // Mặc định đã duyệt
        createdAt: new Date()
    };
}

/**
 * Lưu danh sách transactions vào Firebase
 */
export async function saveImportedTransactions(transactions) {
    const errors = [];
    const saved = [];

    for (let i = 0; i < transactions.length; i++) {
        try {
            const transaction = transactions[i];
            // Save to Firebase + localStorage
            const docRef = await addDoc(collection(db, 'transactions'), {
                ...transaction,
                createdAt: serverTimestamp()
            });
            
            // Add to localStorage với Firebase ID
            const newItem = { 
                ...transaction,
                id: docRef.id,
                createdAt: new Date()
            };
            const state = getState();
            state.transactions.unshift(newItem);
            
            saved.push(newItem);
        } catch (error) {
            errors.push(`Phiếu ${i + 1}: ${error.message}`);
        }
    }

    // Save cache và dispatch event sau khi import xong
    if (saved.length > 0) {
        saveToCache();
        document.dispatchEvent(new CustomEvent('store:transactions:updated'));
    }
    
    return { saved, errors };
}

/**
 * Tải file mẫu Excel cho phiếu thu chi
 */
async function downloadTransactionTemplate() {
    try {
        // Lấy dữ liệu từ store trước
        let buildings = getBuildings();
        let accounts = getAccounts();
        
        console.log('=== DEBUG TEMPLATE DOWNLOAD ===');
        console.log('Store - Buildings:', buildings.length, buildings);
        console.log('Store - Accounts:', accounts.length, accounts);
        console.log('Cache - Transaction Categories:', transactionCategoriesCache.length, transactionCategoriesCache);
        
        // KHÔNG load accounts từ Firebase
        if (accounts.length === 0) {
            console.log('🚫 Store accounts trống - KHÔNG load từ Firebase');
            // try {
            //     const q = query(collection(db, 'accounts'), orderBy('createdAt', 'desc'));
            //     const snapshot = await getDocs(q);
            //     accounts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            //     console.log('✅ Loaded từ Firebase - Accounts:', accounts.length, accounts);
            // } catch (firebaseError) {
            //     console.error('❌ Lỗi load từ Firebase:', firebaseError);
            // }
        }
        
        // KHÔNG load categories từ Firebase
        let categories = transactionCategoriesCache;
        if (categories.length === 0) {
            console.log('🚫 Categories cache trống - KHÔNG load từ Firebase');
            // try {
            //     const q = query(collection(db, 'transactionCategories'), orderBy('createdAt', 'desc'));
            //     const snapshot = await getDocs(q);
            //     categories = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            //     console.log('✅ Loaded từ Firebase - Categories:', categories.length, categories);
            // } catch (firebaseError) {
            //     console.error('❌ Lỗi load categories từ Firebase:', firebaseError);
            // }
        }
        
        // Hiển thị chi tiết để debug
        console.log('📊 Kiểm tra dữ liệu cuối cùng:');
        console.log('- Accounts RAW:', accounts);
        console.log('- Accounts processed:', accounts.map(acc => {
            // Tạo tên sổ quỹ khớp với web (dùng tên chủ tài khoản)
            if (acc.bank && acc.accountHolder) {
                return `${acc.bank} - ${acc.accountHolder}`;
            } else if (acc.bank) {
                return acc.bank;
            } else if (acc.accountHolder) {
                return acc.accountHolder;
            } else {
                return acc.code || acc.id || 'Tài khoản không tên';
            }
        }));
        console.log('- Categories:', categories.length, categories.map(cat => cat.name || cat.id));
        console.log('- Buildings:', buildings.length, buildings.map(b => b.code || b.name || b.id));
        
        // Nếu không có dữ liệu, sử dụng fallback data cho demo
        if (accounts.length === 0) {
            console.warn('⚠️ Không có accounts từ Firebase, dùng fallback data');
            accounts = [
                {id: 'acc1', bank: 'Nam A Bank', accountHolder: 'DANG NHAT ANH'},
                {id: 'acc2', bank: 'OCB', accountHolder: 'DANG NHAT ANH'},
                {id: 'acc3', bank: 'OCB', accountHolder: 'DANG VAN TAO'},
                {id: 'acc4', bank: 'Cash', accountHolder: ''},
                {id: 'acc5', bank: 'Tiền mặt', accountHolder: ''}
            ];
        }
        
        if (categories.length === 0) {
            console.warn('⚠️ Không có categories từ Firebase, dùng fallback data');
            categories = [
                {id: 'cat1', name: 'Tiền điện'},
                {id: 'cat2', name: 'Chi phí khác'},
                {id: 'cat3', name: 'Tiền hoa hồng'},
                {id: 'cat4', name: 'Chi phí cố định'},
                {id: 'cat5', name: 'Tiền vệ sinh'},
                {id: 'cat6', name: 'Tiền nước'},
                {id: 'cat7', name: 'Tiền hóa đơn'},
                {id: 'cat8', name: 'Thu chi khác'}
            ];
        }
        
        // Lấy dữ liệu thực tế từ database
        const validCategories = categories.map(cat => cat.name);
        
        // Tạo tên sổ quỹ khớp với web (dùng tên chủ tài khoản)
        const validAccounts = accounts.map(acc => {
            if (acc.bank && acc.accountHolder) {
                return `${acc.bank} - ${acc.accountHolder}`;
            } else if (acc.bank) {
                return acc.bank;
            } else if (acc.accountHolder) {
                return acc.accountHolder;
            } else {
                return acc.code || acc.id || 'Tài khoản không tên';
            }
        });
        
        const validBuildings = buildings.map(building => building.code || building.name);
        
        console.log('✅ DANH SÁCH CUỐI CÙNG SẼ THÊM VÀO EXCEL:');
        console.log('📂 Hạng mục:', validCategories);
        console.log('💰 Sổ quỹ:', validAccounts);
        console.log('🏢 Mã tòa nhà:', validBuildings);

    // Tạo workbook
    const wb = XLSX.utils.book_new();

    // ===== SHEET 1: DỮ LIỆU MẪU =====
    const templateData = [
        // Header với tên tiếng Việt
        ['Mã tòa nhà', 'Loại', 'Tên phiếu', 'Người nộp/nhận', 'Tên sổ quỹ', 'Ngày (dd-mm-yyyy)', 'Hạng mục', 'Số tiền'],
        
        // Sample data (sử dụng format tên chủ tài khoản như trong web)
        ['12/5NVD', 'Thu', 'Thu tiền thuê phòng tháng 11', 'Nguyễn Văn A', 'Nam A Bank - DANG NHAT ANH', '05-11-2025', 'Tiền hóa đơn', 8000000],
        ['12/5NVD', 'Thu', 'Thu tiền điện tháng 11', 'Nguyễn Văn A', 'OCB - DANG NHAT ANH', '05-11-2025', 'Tiền điện', 500000],
        ['360NX', 'Thu', 'Thu tiền nước tháng 11', 'Trần Thị B', 'OCB - DANG VAN TAO', '04-11-2025', 'Tiền nước', 150000],
        ['12/5NVD', 'Thu', 'Thu tiền vệ sinh', 'Lê Văn C', 'Tiền mặt', '03-11-2025', 'Tiền vệ sinh', 50000],
        ['12/5NVD', 'Chi', 'Trả tiền thuê nhà cho chủ', 'Chủ nhà ABC', 'Nam A Bank - DANG NHAT ANH', '05-11-2025', 'Tiền hóa đơn', 7500000],
        ['', 'Chi', 'Trả tiền điện EVN', 'Điện lực miền Nam', 'OCB - DANG NHAT ANH', '05-11-2025', 'Tiền điện', 450000],
        ['', 'Chi', 'Lương nhân viên tháng 11', 'Nhân viên XYZ', 'Tiền mặt', '01-11-2025', 'Chi phí cố định', 5000000],
        ['', 'Chi', 'Hoa hồng môi giới', 'Nhân viên ABC', 'OCB - DANG VAN TAO', '05-11-2025', 'Tiền hoa hồng', 800000]
    ];

    const ws1 = XLSX.utils.aoa_to_sheet(templateData);
    
    // Thiết lập độ rộng cột cho sheet 1
    ws1['!cols'] = [
        { wch: 15 },  // Mã tòa nhà
        { wch: 8 },   // Loại
        { wch: 35 },  // Tên phiếu
        { wch: 25 },  // Người nộp/nhận
        { wch: 25 },  // Tên sổ quỹ (tăng độ rộng)
        { wch: 18 },  // Ngày
        { wch: 20 },  // Hạng mục
        { wch: 18 }   // Số tiền (tăng độ rộng)
    ];
    
    // Format số tiền cho cột H (cột thứ 8 - Số tiền)
    const range = XLSX.utils.decode_range(ws1['!ref']);
    for (let row = 1; row <= range.e.r; row++) { // Bắt đầu từ row 1 (bỏ qua header)
        const cellAddress = XLSX.utils.encode_cell({ c: 7, r: row }); // Cột H (index 7)
        if (ws1[cellAddress] && typeof ws1[cellAddress].v === 'number') {
            ws1[cellAddress].z = '#,##0'; // Format số với dấu phân cách hàng nghìn
        }
    }
    
    // Thiết lập format mặc định cho cột số tiền
    if (!ws1['!cols']) ws1['!cols'] = [];
    ws1['!cols'][7] = { ...ws1['!cols'][7], numFmt: '#,##0' };
    
    XLSX.utils.book_append_sheet(wb, ws1, "Dữ liệu mẫu");

    // ===== SHEET 2: HƯỚNG DẪN =====
    const instructionData = [
        ['HƯỚNG DẪN NHẬP DỮ LIỆU PHIẾU THU CHI'],
        [''],
        ['CÁC CỘT BẮT BUỘC:'],
        [''],
        ['1. Mã tòa nhà:', 'Mã tòa nhà (có thể để trống nếu không liên quan)'],
        ['2. Loại:', '"Thu" hoặc "Chi" (bắt buộc)'],
        ['3. Tên phiếu:', 'Mô tả phiếu thu/chi (bắt buộc)'],
        ['4. Người nộp/nhận:', 'Tên người nộp hoặc nhận tiền (bắt buộc)'],
        ['5. Tên sổ quỹ:', 'Tên tài khoản ngân hàng hoặc quỹ tiền mặt (bắt buộc)'],
        ['6. Ngày:', 'Định dạng dd-mm-yyyy (ví dụ: 05-11-2025) (bắt buộc)'],
        ['7. Hạng mục:', 'Phải chọn đúng tên hạng mục có sẵn trên hệ thống (bắt buộc)'],
        ['8. Số tiền:', 'Nhập số không có dấu chấm, Excel sẽ tự động format (bắt buộc)'],
        ['', 'VD: Nhập "8000000" → Excel hiển thị "8,000,000"'],
        [''],
        ['💰 HƯỚNG DẪN NHẬP SỐ TIỀN:'],
        ['• Chỉ nhập số nguyên, không có dấu phân cách'],
        ['• VD đúng: 8000000, 150000, 50000'],
        ['• VD sai: 8,000,000 hoặc 8.000.000'],
        ['• Excel sẽ tự động thêm dấu phân cách khi bạn nhập xong'],
        [''],
        ['⚠️ LƯU Ý QUAN TRỌNG:'],
        ['• Nếu nhập sai tên hạng mục hoặc sổ quỹ mà chưa có trên hệ thống sẽ báo lỗi!'],
        ['• Vui lòng kiểm tra chính xác tên từ danh sách bên dưới'],
        ['• Tên phải khớp chính xác, không được viết tắt hoặc sai chính tả'],
        ['• Copy-paste tên từ danh sách để đảm bảo chính xác'],
        [''],
        ['=== DANH SÁCH HẠNG MUC HỢP LỆ ===']
    ];

    // Thêm danh sách hạng mục
    validCategories.forEach((cat, index) => {
        instructionData.push([`${index + 1}.`, cat]);
    });

    instructionData.push(['']);
    instructionData.push(['=== DANH SÁCH SỔ QUỸ HỢP LỆ ===']);
    
    // Thêm danh sách sổ quỹ
    validAccounts.forEach((acc, index) => {
        instructionData.push([`${index + 1}.`, acc]);
    });

    instructionData.push(['']);
    instructionData.push(['=== DANH SÁCH MÃ TÒA NHÀ HỢP LỆ ===']);
    
    // Thêm danh sách mã tòa nhà
    validBuildings.forEach((code, index) => {
        instructionData.push([`${index + 1}.`, code]);
    });

    const ws2 = XLSX.utils.aoa_to_sheet(instructionData);
    
    // Thiết lập độ rộng cột cho sheet 2
    ws2['!cols'] = [
        { wch: 25 },  // Cột 1
        { wch: 50 }   // Cột 2
    ];
    
    XLSX.utils.book_append_sheet(wb, ws2, "Hướng dẫn");

        // Tạo file và tải về
        const timestamp = new Date().getTime();
        XLSX.writeFile(wb, `Mau_Phieu_Thu_Chi_${timestamp}.xlsx`);
        
        showToast('Đã tải file mẫu Excel chuyên nghiệp với hướng dẫn chi tiết!', 'success');
        
    } catch (error) {
        console.error('Lỗi tạo file mẫu:', error);
        showToast('Lỗi tạo file mẫu: ' + error.message, 'error');
    }
}