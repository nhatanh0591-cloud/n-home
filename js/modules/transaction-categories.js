// js/modules/transaction-categories.js

import { db, addDoc, setDoc, doc, deleteDoc, collection, serverTimestamp, query, where, getDocs, orderBy } from '../firebase.js';
import { getTransactions, getTransactionCategories, updateInLocalStorage, deleteFromLocalStorage, getState, saveToCache } from '../store.js';
import { showToast, openModal, closeModal, formatMoney, showConfirm } from '../utils.js';

// --- DOM ELEMENTS ---
const transactionCategoriesSection = document.getElementById('transaction-categories-section');
const transactionCategoriesListEl = document.getElementById('transaction-categories-management-list');
const selectAllCheckbox = document.getElementById('select-all-transaction-categories');

// Modal elements
const modal = document.getElementById('transaction-category-management-modal');
const modalTitle = document.getElementById('transaction-category-management-modal-title');
const form = document.getElementById('transaction-category-management-form');
const closeModalBtn = document.getElementById('close-transaction-category-management-modal');
const cancelBtn = document.getElementById('cancel-transaction-category-management');

// Form inputs
const idInput = document.getElementById('transaction-category-management-id');
const nameInput = document.getElementById('transaction-category-management-name');

// --- BIẾN TOÀN CỤC ---
let transactionCategoriesCache = [];
const selectedMobileCategoryIds = new Set();

// --- HÀM CHÍNH ---

/**
 * Khởi tạo module
 */
export function initTransactionCategories() {
    // Lắng nghe sự kiện
    document.body.addEventListener('click', handleBodyClick);
    form?.addEventListener('submit', handleFormSubmit);
    
    // Gắn trực tiếp event cho button
    const addBtn = document.getElementById('add-transaction-category-btn');
    if (addBtn) {
        addBtn.addEventListener('click', (e) => {
            console.log('Direct button click!');
            e.preventDefault();
            e.stopPropagation();
            openCategoryModal();
        });
    } else {
        console.error('Add button not found!');
    }
    
    // Gắn trực tiếp event cho bulk delete button
    const bulkDeleteBtn = document.getElementById('bulk-delete-transaction-categories-btn');
    if (bulkDeleteBtn) {
        bulkDeleteBtn.addEventListener('click', (e) => {
            console.log('Direct bulk delete button click!');
            e.preventDefault();
            e.stopPropagation();
            bulkDeleteCategories();
        });
    } else {
        console.error('Bulk delete button not found!');
    }
    
    // Modal events
    [closeModalBtn, cancelBtn].forEach(btn => {
        btn?.addEventListener('click', () => closeModal(modal));
    });

    // Select all checkbox
    selectAllCheckbox?.addEventListener('change', (e) => {
        document.querySelectorAll('.transaction-category-checkbox').forEach(cb => {
            cb.checked = e.target.checked;
        });
    });
    
    // Lắng nghe nút bỏ chọn hàng loạt
    document.getElementById('clear-selection-categories-btn')?.addEventListener('click', () => {
        selectedMobileCategoryIds.clear();
        document.querySelectorAll('.category-checkbox-mobile').forEach(cb => cb.checked = false);
        updateClearSelectionButton();
        showToast('Bỏ chọn thành công!');
    });

    // Load data when section becomes visible
    document.addEventListener('store:transactions:updated', () => {
        if (!transactionCategoriesSection?.classList.contains('hidden')) {
            loadTransactionCategories();
        }
    });
}

/**
 * Load dữ liệu khi chuyển đến section
 */
export function loadTransactionCategories() {
    loadTransactionCategoriesData();
}

/**
 * Tải danh sách hạng mục từ Firebase
 */
async function loadTransactionCategoriesData() {
    if (transactionCategoriesSection?.classList.contains('hidden')) return;
    
    try {
        console.log('📝 DEBUG: loadTransactionCategoriesData() starting...');
        
        // Debug store state
        console.log('📝 DEBUG: Checking store data...');
        const storeData = getTransactionCategories();
        console.log('📝 DEBUG: getTransactionCategories() returned:', storeData);
        
        // Dùng data từ store thay vì Firebase
        transactionCategoriesCache = storeData;
        console.log('📝 DEBUG: transactionCategoriesCache set to:', transactionCategoriesCache.length, 'items');
        
        renderTransactionCategories();
        console.log('📝 DEBUG: renderTransactionCategories() called');
        
    } catch (error) {
        console.error('Error loading transaction categories:', error);
        showToast('Lỗi tải danh sách hạng mục: ' + error.message, 'error');
    }
}

/**
 * Render bảng hạng mục
 */
function renderTransactionCategories() {
    if (!transactionCategoriesListEl) return;

    if (transactionCategoriesCache.length === 0) {
        transactionCategoriesListEl.innerHTML = `
            <tr>
                <td colspan="3" class="text-center py-8 text-gray-500">
                    Chưa có hạng mục nào. Nhấn nút "+" để thêm mới.
                </td>
            </tr>
        `;
        const mobileCategoriesList = document.getElementById('categories-mobile-list');
        if (mobileCategoriesList) {
            mobileCategoriesList.innerHTML = `
                <div class="text-center py-8 text-gray-500">
                    Chưa có hạng mục nào. Nhấn nút "+" để thêm mới.
                </div>
            `;
        }
        return;
    }

    // Desktop table rows
    transactionCategoriesListEl.innerHTML = transactionCategoriesCache.map(category => {        
        return `
            <tr class="border-b hover:bg-gray-50">
                <td class="py-3 px-4">
                    <input type="checkbox" class="transaction-category-checkbox w-4 h-4 cursor-pointer" data-id="${category.id}">
                </td>
                <td class="py-3 px-4">
                    <div class="flex gap-2">
                        <button data-id="${category.id}" class="edit-transaction-category-btn w-8 h-8 rounded bg-gray-500 hover:bg-gray-600 flex items-center justify-center" title="Sửa">
                            <svg class="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
                            </svg>
                        </button>
                        <button data-id="${category.id}" class="delete-transaction-category-btn w-8 h-8 rounded bg-red-500 hover:bg-red-600 flex items-center justify-center" title="Xóa">
                            <svg class="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                            </svg>
                        </button>
                    </div>
                </td>
                <td class="py-3 px-4 font-medium">${category.name}</td>
            </tr>
        `;
    }).join('');
    
    // Mobile cards
    const mobileCategoriesList = document.getElementById('categories-mobile-list');
    if (mobileCategoriesList) {
        mobileCategoriesList.innerHTML = '';
        transactionCategoriesCache.forEach(category => {
            const isChecked = selectedMobileCategoryIds.has(category.id);
            const mobileCard = document.createElement('div');
            mobileCard.className = 'mobile-card';
            mobileCard.innerHTML = `
                <div class="flex items-center gap-3 mb-3 pb-3 border-b">
                    <input type="checkbox" 
                        class="category-checkbox-mobile w-5 h-5 cursor-pointer" 
                        data-id="${category.id}"
                        ${isChecked ? 'checked' : ''}>
                    <span class="text-xs text-gray-500 flex-1">Chọn để xóa nhiều</span>
                </div>
                <div class="mobile-card-row">
                    <span class="mobile-card-label">Tên hạng mục:</span>
                    <span class="mobile-card-value font-bold text-lg">${category.name}</span>
                </div>
                <div class="mobile-card-actions">
                    <button data-id="${category.id}" class="edit-transaction-category-btn bg-gray-500 hover:bg-gray-600 text-white">
                        <svg class="w-4 h-4 pointer-events-none" fill="currentColor" viewBox="0 0 20 20"><path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z"/></svg>
                        Sửa
                    </button>
                    <button data-id="${category.id}" class="delete-transaction-category-btn bg-red-500 hover:bg-red-600 text-white">
                        <svg class="w-4 h-4 pointer-events-none" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd"/></svg>
                        Xóa
                    </button>
                </div>
            `;
            mobileCategoriesList.appendChild(mobileCard);
        });
    }
}

/**
 * Xử lý sự kiện click
 */
function handleBodyClick(e) {
    if (transactionCategoriesSection?.classList.contains('hidden')) return;

    console.log('Clicked element ID:', e.target.id);
    console.log('Target element:', e.target);

    if (e.target.id === 'add-transaction-category-btn') {
        console.log('Add button clicked!');
        e.preventDefault();
        e.stopPropagation();
        openCategoryModal();
    } else if (e.target.closest('.edit-transaction-category-btn')) {
        const id = e.target.closest('.edit-transaction-category-btn').dataset.id;
        editCategory(id);
    } else if (e.target.closest('.delete-transaction-category-btn')) {
        const id = e.target.closest('.delete-transaction-category-btn').dataset.id;
        deleteCategory(id);
    } else if (e.target.id === 'bulk-delete-transaction-categories-btn' || e.target.closest('#bulk-delete-transaction-categories-btn')) {
        console.log('Bulk delete button clicked!');
        bulkDeleteCategories();
    } else if (e.target.classList.contains('category-checkbox-mobile')) {
        // Xử lý checkbox mobile
        const categoryId = e.target.dataset.id;
        if (e.target.checked) {
            selectedMobileCategoryIds.add(categoryId);
        } else {
            selectedMobileCategoryIds.delete(categoryId);
        }
        updateClearSelectionButton();
    }
}

/**
 * Mở modal thêm hạng mục
 */
function openCategoryModal(categoryData = null) {
    if (!modal || !form || !nameInput) {
        console.error('Modal elements not found:', { modal, form, nameInput });
        showToast('Lỗi: Không tìm thấy modal', 'error');
        return;
    }
    
    modalTitle.textContent = categoryData ? 'Sửa Hạng mục' : 'Thêm Hạng mục';
    
    // Reset form
    form.reset();
    idInput.value = categoryData?.id || '';
    nameInput.value = categoryData?.name || '';
    
    openModal(modal);
    nameInput.focus();
}

/**
 * Sửa hạng mục
 */
function editCategory(id) {
    const category = transactionCategoriesCache.find(c => c.id === id);
    if (category) {
        openCategoryModal(category);
    }
}

/**
 * Xử lý submit form
 */
async function handleFormSubmit(e) {
    e.preventDefault();
    
    const formData = new FormData(form);
    const categoryData = {
        name: nameInput.value.trim()
    };
    
    if (!categoryData.name) {
        showToast('Vui lòng nhập tên hạng mục', 'error');
        return;
    }
    
    try {
        const id = idInput.value;
        
        if (id) {
            // Update Firebase
            await setDoc(doc(db, 'transactionCategories', id), {
                ...categoryData,
                updatedAt: serverTimestamp()
            });
            
            // Update localStorage
            updateInLocalStorage('transactionCategories', id, categoryData);
            showToast('Cập nhật hạng mục thành công', 'success');
        } else {
            // Create Firebase
            const docRef = await addDoc(collection(db, 'transactionCategories'), {
                ...categoryData,
                createdAt: serverTimestamp()
            });
            
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
            
            showToast('Thêm hạng mục thành công', 'success'); 
        }
        
        closeModal(modal);
        
    } catch (error) {
        console.error('Error saving category:', error);
        showToast('Lỗi lưu hạng mục: ' + error.message, 'error');
    }
}

/**
 * Xóa hạng mục
 */
async function deleteCategory(id) {
    const category = transactionCategoriesCache.find(c => c.id === id);
    if (!category) return;
    
    const confirmed = await showConfirm(`Bạn có chắc muốn xóa hạng mục "${category.name}"?\n\nLưu ý: Các phiếu thu chi đã sử dụng hạng mục này sẽ không bị ảnh hưởng.`, 'Xác nhận xóa');
    if (!confirmed) return;
    
    try {
        // Delete Firebase
        await deleteDoc(doc(db, 'transactionCategories', id));
        
        // Delete localStorage
        deleteFromLocalStorage('transactionCategories', id);
        showToast('Xóa hạng mục thành công', 'success');
    } catch (error) {
        console.error('Error deleting category:', error);
        showToast('Lỗi xóa hạng mục: ' + error.message, 'error');
    }
}

/**
 * Xóa nhiều hạng mục
 */
async function bulkDeleteCategories() {
    // Lấy từ Set mobile nếu có, không thì từ desktop checkboxes
    let selectedIds;
    if (selectedMobileCategoryIds.size > 0) {
        selectedIds = Array.from(selectedMobileCategoryIds);
    } else {
        selectedIds = Array.from(document.querySelectorAll('.transaction-category-checkbox:checked'))
            .map(cb => cb.dataset.id);
    }
    
    if (selectedIds.length === 0) {
        showToast('Vui lòng chọn ít nhất một hạng mục để xóa', 'error');
        return;
    }
    
    const confirmed = await showConfirm(`Bạn có chắc muốn xóa ${selectedIds.length} hạng mục đã chọn?`, 'Xác nhận xóa');
    if (!confirmed) return;
    
    try {
        // Bulk delete Firebase
        await Promise.all(selectedIds.map(id => deleteDoc(doc(db, 'transactionCategories', id))));
        
        // Bulk delete localStorage
        selectedIds.forEach(id => deleteFromLocalStorage('transactionCategories', id));
        
        // Reset trạng thái checkbox sau khi xóa thành công
        selectedMobileCategoryIds.clear();
        resetBulkSelection();
        updateClearSelectionButton();
        
        showToast(`Xóa thành công ${selectedIds.length} hạng mục`, 'success');
    } catch (error) {
        console.error('Error bulk deleting categories:', error);
        showToast('Lỗi xóa hạng mục: ' + error.message, 'error');
    }
}

/**
 * Reset trạng thái bulk selection
 */
function resetBulkSelection() {
    // Bỏ chọn checkbox "select all"
    const selectAllCheckbox = document.getElementById('select-all-transaction-categories');
    if (selectAllCheckbox) {
        selectAllCheckbox.checked = false;
    }
    
    // Bỏ chọn tất cả checkbox con
    const categoryCheckboxes = document.querySelectorAll('.transaction-category-checkbox');
    categoryCheckboxes.forEach(checkbox => {
        checkbox.checked = false;
    });
}

/**
 * Cập nhật trạng thái hiển thị nút bỏ chọn hàng loạt
 */
function updateClearSelectionButton() {
    const clearBtn = document.getElementById('clear-selection-categories-btn');
    if (clearBtn) {
        if (selectedMobileCategoryIds.size >= 2) {
            clearBtn.classList.remove('hidden');
        } else {
            clearBtn.classList.add('hidden');
        }
    }
}

/**
 * Tạo các hạng mục mặc định
 */
async function createDefaultCategories() {
    try {
        const defaultCategories = [
            { name: 'Tiền hóa đơn', id: 'tien-hoa-don' },
            { name: 'Tiền điện', id: 'tien-dien' },
            { name: 'Tiền nước', id: 'tien-nuoc' },
            { name: 'Tiền vệ sinh', id: 'tien-ve-sinh' },
            { name: 'Chi phí cố định', id: 'chi-phi-co-dinh' },
            { name: 'Tiền hoa hồng', id: 'tien-hoa-hong' },
            { name: 'Chi phí khác', id: 'chi-phi-khac' }
        ];

        for (const category of defaultCategories) {
            try {
                // KHÔNG kiểm tra Firebase - skip tạo default categories
                console.log('🚫 Skip creating default category:', category.name);
                continue;
            } catch (error) {
                console.log(`Category ${category.name} may already exist or error:`, error.message);
            }
        }
    } catch (error) {
        console.error('Error creating default categories:', error);
    }
}

/**
 * Listen for store updates để reload data
 */
document.addEventListener('store:transactionCategories:updated', () => {
    console.log('📝 TransactionCategories: Store updated, reloading data...');
    console.log('📝 DEBUG: About to call loadTransactionCategories()');
    loadTransactionCategories();
    console.log('📝 DEBUG: loadTransactionCategories() called');
});

console.log('📝 DEBUG: TransactionCategories event listener registered for store:transactionCategories:updated');