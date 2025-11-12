// js/modules/accounts.js

import { db, addDoc, setDoc, doc, deleteDoc, collection, serverTimestamp, query, orderBy, getDocs } from '../firebase.js';
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
}

/**
 * Hàm load dữ liệu accounts, được gọi từ navigation.js
 */
export async function loadAccounts() {
    if (accountsSection.classList.contains('hidden')) return;
    
    try {
        const q = query(collection(db, 'accounts'), orderBy('createdAt', 'desc'));
        const snapshot = await getDocs(q);
        accountsCache = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
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
    
    if (accountsCache.length === 0) {
        accountsListEl.innerHTML = '<tr class="text-center text-gray-400"><td colspan="6" class="py-8">Chưa có sổ quỹ nào!</td></tr>';
        return;
    }
    
    accountsCache.forEach((account, index) => {
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-gray-50 border-b border-gray-100';
        
        // Auto generate code if not exists
        const code = account.code || `TK${(index + 1).toString().padStart(6, '0')}`;
        
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
            // Cập nhật
            await setDoc(doc(db, 'accounts', id), accountData, { merge: true });
            showToast('Cập nhật sổ quỹ thành công!');
        } else {
            // Thêm mới
            accountData.createdAt = serverTimestamp();
            await addDoc(collection(db, 'accounts'), accountData);
            showToast('Thêm sổ quỹ thành công!');
        }
        
        closeModal(accountModal);
        loadAccounts(); // Tải lại danh sách
        
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
        await deleteDoc(doc(db, 'accounts', id));
        showToast('Đã xóa sổ quỹ!');
        loadAccounts(); // Tải lại danh sách
    } catch (error) {
        console.error('Error deleting account:', error);
        showToast('Lỗi khi xóa sổ quỹ: ' + error.message, 'error');
    }
}

/**
 * Xóa nhiều sổ quỹ
 */
async function bulkDeleteAccounts() {
    const selectedCheckboxes = document.querySelectorAll('.account-checkbox:checked');
    if (selectedCheckboxes.length === 0) {
        showToast('Vui lòng chọn ít nhất một sổ quỹ để xóa!', 'error');
        return;
    }
    
    const confirmed = await showConfirm(`Bạn có chắc muốn xóa ${selectedCheckboxes.length} sổ quỹ đã chọn?`, 'Xác nhận xóa');
    if (!confirmed) {
        return;
    }
    
    try {
        const promises = Array.from(selectedCheckboxes).map(cb => {
            const id = cb.dataset.id;
            return deleteDoc(doc(db, 'accounts', id));
        });
        
        await Promise.all(promises);
        showToast(`Đã xóa ${selectedCheckboxes.length} sổ quỹ!`);
        loadAccounts(); // Tải lại danh sách
        
        // Bỏ chọn "select all"
        const selectAllCheckbox = document.getElementById('select-all-accounts');
        if (selectAllCheckbox) {
            selectAllCheckbox.checked = false;
        }
        
    } catch (error) {
        console.error('Error bulk deleting accounts:', error);
        showToast('Lỗi khi xóa sổ quỹ: ' + error.message, 'error');
    }
}