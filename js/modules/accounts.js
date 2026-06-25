// js/modules/accounts.js

import { db, addDoc, setDoc, doc, deleteDoc, collection, serverTimestamp, query, orderBy, getDocs } from '../firebase.js';
import { getAccounts, getState, saveToCache, updateInLocalStorage, deleteFromLocalStorage } from '../store.js';
import { showToast, openModal, closeModal, showConfirm } from '../utils.js';

// --- MAPPING NGÂN HÀNG VÀ MÃ BIN ---
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
    'HSBC': '970442',
    'StandardChartered': '970410',
    'ANZ': '970409',
    'UOB': '970458',
    'Shinhan': '970424',
    'CIMB': '970444',
    'VIB': '970441',
    'LienVietPostBank': '970449',
    'OCB': '970448',
    'BacABank': '970409',
    'Kienlongbank': '970452',
    'DongABank': '970406',
    'VietABank': '970427',
    'NCB': '970419',
    'SaigonBank': '970400',
    'ABBank': '970425',
    'VietCapitalBank': '970454',
    'SeABank': '970440',
    'COOPBANK': '970446',
    'PGBank': '970430',
    'Nam A Bank': '970428'
};

// --- BIẾN CỤC BỘ CHO MODULE ---
let accountsCache = []; // Cache tài khoản
const selectedMobileAccountIds = new Set();

// --- DOM ELEMENTS ---
const accountsSection = document.getElementById('accounts-section');
const accountsListEl = document.getElementById('accounts-list');

// Modal elements
const accountModal = document.getElementById('account-modal');
const accountModalTitle = document.getElementById('account-modal-title');
const accountForm = document.getElementById('account-form');

// --- HÀM CHÍNH ---

/**
 * Hàm khởi tạo, được gọi 1 lần duy nhất từ main.js
 */
export function initAccounts() {
    // Lắng nghe sự kiện click
    document.body.addEventListener('click', handleBodyClick);
    
    // Lắng nghe form submit
    if (accountForm) {
        accountForm.addEventListener('submit', handleAccountFormSubmit);
    }

    // Lắng nghe select all
    const selectAllCheckbox = document.getElementById('select-all-accounts');
    if (selectAllCheckbox) {
        selectAllCheckbox.addEventListener('change', (e) => {
            document.querySelectorAll('.account-checkbox').forEach(cb => cb.checked = e.target.checked);
        });
    }
    
    // Lắng nghe nút bỏ chọn hàng loạt
    document.getElementById('clear-selection-accounts-btn')?.addEventListener('click', () => {
        selectedMobileAccountIds.clear();
        document.querySelectorAll('.account-checkbox-mobile').forEach(cb => cb.checked = false);
        updateClearSelectionButton();
        showToast('Bỏ chọn thành công!');
    });
}

/**
 * Hàm load dữ liệu accounts, được gọi từ navigation.js
 */
export async function loadAccounts() {
    if (accountsSection.classList.contains('hidden')) return;

    try {
        // Dùng data từ store thay vì Firebase
        accountsCache = getAccounts();
        renderAccounts();
        
    } catch (error) {
        console.error('Error loading accounts:', error);
        showToast('Lỗi khi tải danh sách sổ quỹ!', 'error');
    }
}

/**
 * Render danh sách tài khoản
 */
function renderAccounts() {
    if (!accountsListEl) return;
    
    accountsListEl.innerHTML = '';
    const mobileListEl = document.getElementById('accounts-mobile-list');
    if (mobileListEl) mobileListEl.innerHTML = '';
    
    if (accountsCache.length === 0) {
        accountsListEl.innerHTML = '<tr class="text-center text-gray-400"><td colspan="6" class="py-8">Chưa có sổ quỹ nào!</td></tr>';
        if (mobileListEl) {
            mobileListEl.innerHTML = '<div class="text-center py-8 text-gray-500">Chưa có sổ quỹ nào!</div>';
        }
        return;
    }
    
    accountsCache.forEach((account, index) => {
        // Auto generate code if not exists
        const code = account.code || `TK${(index + 1).toString().padStart(6, '0')}`;
        
        // 🖥️ RENDER DESKTOP ROW
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-gray-50 border-b border-gray-100';
        
        tr.innerHTML = `
            <td class="py-3 px-4">
                <input type="checkbox" class="account-checkbox w-4 h-4 cursor-pointer" data-id="${account.id}">
            </td>
            <td class="py-3 px-4">
                <div class="flex gap-2">
                    <button data-id="${account.id}" class="edit-account-btn w-8 h-8 rounded bg-gray-500 hover:bg-gray-600 flex items-center justify-center" title="Sửa">
                        <svg class="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
                        </svg>
                    </button>
                    <button data-id="${account.id}" class="delete-account-btn w-8 h-8 rounded bg-red-500 hover:bg-red-600 flex items-center justify-center" title="Xóa">
                        <svg class="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                        </svg>
                    </button>
                </div>
            </td>
            <td class="py-3 px-4 font-medium text-green-600">${code}</td>
            <td class="py-3 px-4">${account.bank || '-'}</td>
            <td class="py-3 px-4">${account.accountNumber || '-'}</td>
            <td class="py-3 px-4">${account.accountHolder || '-'}</td>
        `;
        
        accountsListEl.appendChild(tr);
        
        // 📱 RENDER MOBILE CARD
        if (mobileListEl) {
            const isChecked = selectedMobileAccountIds.has(account.id);
            const mobileCard = document.createElement('div');
            mobileCard.className = 'mobile-card';
            mobileCard.innerHTML = `
                <div class="flex items-center gap-3 mb-3 pb-3 border-b">
                    <input type="checkbox" class="account-checkbox-mobile w-5 h-5 cursor-pointer" data-id="${account.id}" ${isChecked ? 'checked' : ''}>
                    <span class="text-xs text-gray-500 flex-1">Chọn để xóa nhiều</span>
                </div>
                <div class="mobile-card-row">
                    <span class="mobile-card-label">Mã:</span>
                    <span class="mobile-card-value font-bold text-green-600">${code}</span>
                </div>
                <div class="mobile-card-row">
                    <span class="mobile-card-label">Ngân hàng:</span>
                    <span class="mobile-card-value font-semibold">${account.bank || '-'}</span>
                </div>
                <div class="mobile-card-row">
                    <span class="mobile-card-label">Số tài khoản:</span>
                    <span class="mobile-card-value">${account.accountNumber || '-'}</span>
                </div>
                <div class="mobile-card-row">
                    <span class="mobile-card-label">Chủ tài khoản:</span>
                    <span class="mobile-card-value">${account.accountHolder || '-'}</span>
                </div>
                <div class="mobile-card-actions">
                    <button data-id="${account.id}" class="edit-account-btn bg-gray-500 hover:bg-gray-600 text-white">
                        <svg class="w-4 h-4 pointer-events-none" fill="currentColor" viewBox="0 0 20 20"><path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z"/></svg>
                        Sửa
                    </button>
                    <button data-id="${account.id}" class="delete-account-btn bg-red-500 hover:bg-red-600 text-white">
                        <svg class="w-4 h-4 pointer-events-none" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd"/></svg>
                        Xóa
                    </button>
                </div>
            `;
            mobileListEl.appendChild(mobileCard);
        }
    });
}

/**
 * Xử lý sự kiện click
 */
async function handleBodyClick(e) {
    const target = e.target.closest('button') || e.target;
    const id = target.dataset.id;
    
    // Nút "Thêm sổ quỹ"
    if (target.id === 'add-account-btn') {
        openAccountModal();
    }
    // Nút "Sửa"
    else if (target.classList.contains('edit-account-btn')) {
        const account = accountsCache.find(s => s.id === id);
        if (account) {
            openAccountModal(account);
        }
    }
    // Nút "Xóa"
    else if (target.classList.contains('delete-account-btn')) {
        const confirmed = await showConfirm('Bạn có chắc muốn xóa sổ quỹ này?', 'Xác nhận xóa');
        if (confirmed) {
            await deleteAccount(id);
        }
    }
    // Nút "Xóa nhiều"
    else if (target.id === 'bulk-delete-accounts-btn') {
        await bulkDeleteAccounts();
    }
    // Đóng modal
    else if (target.id === 'close-account-modal' || target.id === 'cancel-account-btn') {
        closeModal(accountModal);
    }
    // Xử lý checkbox mobile
    else if (e.target.classList.contains('account-checkbox-mobile')) {
        const accountId = e.target.dataset.id;
        if (e.target.checked) {
            selectedMobileAccountIds.add(accountId);
        } else {
            selectedMobileAccountIds.delete(accountId);
        }
        updateClearSelectionButton();
    }
}

/**
 * Mở modal thêm/sửa sổ quỹ
 */
function openAccountModal(account = null) {
    if (!accountModal || !accountForm) return;
    
    // Reset form
    accountForm.reset();
    document.getElementById('account-id').value = '';
    
    if (account) {
        // Chế độ sửa
        accountModalTitle.textContent = 'Sửa Tài khoản ngân hàng';
        document.getElementById('account-id').value = account.id;
        document.getElementById('account-bank').value = account.bank || '';
        document.getElementById('account-holder').value = account.accountHolder || '';
        document.getElementById('account-number').value = account.accountNumber || '';
        
        // Gọi toggleCashFields để ẩn/hiện field đúng
        if (typeof window.toggleCashFields === 'function') {
            window.toggleCashFields();
        }
    } else {
        // Chế độ thêm
        accountModalTitle.textContent = 'Tài khoản ngân hàng';
        // Reset hiển thị fields
        document.getElementById('account-holder-field').style.display = 'block';
        document.getElementById('account-number-field').style.display = 'block';
    }
    
    openModal(accountModal);
}

/**
 * Xử lý submit form
 */
async function handleAccountFormSubmit(e) {
    e.preventDefault();
    
    const id = document.getElementById('account-id').value;
    const bank = document.getElementById('account-bank').value;
    const accountHolder = document.getElementById('account-holder').value;
    const accountNumber = document.getElementById('account-number').value;
    
    // Validation khác nhau cho tiền mặt và ngân hàng
    if (!bank) {
        showToast('Vui lòng chọn ngân hàng!', 'error');
        return;
    }
    
    if (bank !== 'Cash' && (!accountHolder || !accountNumber)) {
        showToast('Vui lòng nhập đầy đủ thông tin!', 'error');
        return;
    }
    
    try {
        const accountData = {
            bank,
            bankId: BANK_ID_MAP[bank] || '970416', // Mã BIN cho VietQR
            accountHolder: bank === 'Cash' ? 'Quỹ tiền mặt' : accountHolder,
            accountNumber: bank === 'Cash' ? 'CASH' : accountNumber,
            code: id ? accountsCache.find(a => a.id === id)?.code : `TK${Date.now().toString().slice(-6)}`,
            updatedAt: serverTimestamp()
        };
        
        if (id) {
            // Update Firebase
            await setDoc(doc(db, 'accounts', id), accountData, { merge: true });
            
            // Update localStorage
            updateInLocalStorage('accounts', id, accountData);
            showToast('Cập nhật sổ quỹ thành công!');
        } else {
            // Create Firebase
            accountData.createdAt = serverTimestamp();
            const docRef = await addDoc(collection(db, 'accounts'), accountData);
            
            // Add to localStorage với Firebase ID
            const newItem = { 
                ...accountData, 
                id: docRef.id,
                createdAt: new Date(),
                updatedAt: new Date()
            };
            const state = getState();
            state.accounts.unshift(newItem);
            saveToCache();
            document.dispatchEvent(new CustomEvent('store:accounts:updated'));
            
            showToast('Thêm sổ quỹ thành công!');
        }
        
        closeModal(accountModal);
        
    } catch (error) {
        console.error('Error saving account:', error);
        showToast('Lỗi khi lưu sổ quỹ: ' + error.message, 'error');
    }
}

/**
 * Xóa sổ quỹ
 */
async function deleteAccount(id) {
    try {
        // Delete Firebase
        await deleteDoc(doc(db, 'accounts', id));
        
        // Delete localStorage
        deleteFromLocalStorage('accounts', id);
        showToast('Đã xóa sổ quỹ!');
    } catch (error) {
        console.error('Error deleting account:', error);
        showToast('Lỗi khi xóa sổ quỹ: ' + error.message, 'error');
    }
}

/**
 * Xóa nhiều sổ quỹ
 */
async function bulkDeleteAccounts() {
    // Lấy từ Set mobile nếu có, không thì từ desktop checkboxes
    let selectedIds;
    if (selectedMobileAccountIds.size > 0) {
        selectedIds = Array.from(selectedMobileAccountIds);
    } else {
        const selectedCheckboxes = document.querySelectorAll('.account-checkbox:checked');
        selectedIds = Array.from(selectedCheckboxes).map(cb => cb.dataset.id);
    }
    
    if (selectedIds.length === 0) {
        showToast('Vui lòng chọn ít nhất một sổ quỹ để xóa!', 'error');
        return;
    }
    
    const confirmed = await showConfirm(`Bạn có chắc muốn xóa ${selectedIds.length} sổ quỹ đã chọn?`, 'Xác nhận xóa');
    if (!confirmed) {
        return;
    }
    
    try {
        // Bulk delete Firebase + localStorage
        const promises = selectedIds.map(id => deleteDoc(doc(db, 'accounts', id)));
        await Promise.all(promises);
        
        // Delete from localStorage
        selectedIds.forEach(id => deleteFromLocalStorage('accounts', id));
        
        // Reset trạng thái
        selectedMobileAccountIds.clear();
        const selectAllCheckbox = document.getElementById('select-all-accounts');
        if (selectAllCheckbox) {
            selectAllCheckbox.checked = false;
        }
        document.querySelectorAll('.account-checkbox').forEach(cb => cb.checked = false);
        updateClearSelectionButton();
        
        showToast(`Đã xóa ${selectedIds.length} sổ quỹ!`);
        
    } catch (error) {
        console.error('Error bulk deleting accounts:', error);
        showToast('Lỗi khi xóa sổ quỹ: ' + error.message, 'error');
    }
}

/**
 * Cập nhật trạng thái hiển thị nút bỏ chọn hàng loạt
 */
function updateClearSelectionButton() {
    const clearBtn = document.getElementById('clear-selection-accounts-btn');
    if (clearBtn) {
        if (selectedMobileAccountIds.size >= 2) {
            clearBtn.classList.remove('hidden');
        } else {
            clearBtn.classList.add('hidden');
        }
    }
}

/**
 * Listen for store updates để reload data
 */
document.addEventListener('store:accounts:updated', () => {
    console.log('👤 Accounts: Store updated, reloading data...');
    loadAccounts();
});