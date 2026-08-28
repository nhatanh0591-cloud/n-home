/**
 * Sync UI Controller - Nút "Đồng bộ dữ liệu" mở popup cho chọn kiểu đồng bộ rồi mới chạy
 */

import { autoSync } from './modules/sync-manager.js';
import { showToast } from './utils.js';

let syncDataBtn = null;
let isSyncing = false;

const MODULE_LABELS = {
    buildings: 'Tòa nhà',
    services: 'Phí dịch vụ',
    transactionCategories: 'Hạng mục thu chi',
    accounts: 'Sổ quỹ',
    customers: 'Khách hàng',
    contracts: 'Hợp đồng thuê',
    bills: 'Hóa đơn',
    transactions: 'Thu chi',
    tasks: 'Sự cố/Công việc',
    notifications: 'Thông báo',
    materials: 'Vật tư',
    materialCategories: 'Loại vật tư'
};

/**
 * Khởi tạo Sync UI Controller
 */
export function initSyncUI() {
    syncDataBtn = document.getElementById('sync-data-btn');

    if (!syncDataBtn) {
        console.error('❌ Sync UI: không tìm thấy nút sync-data-btn');
        return;
    }

    syncDataBtn.addEventListener('click', showSyncChoiceModal);
    console.log('✅ Sync UI initialized');
}

async function handleSyncClick({ forceFull = false } = {}) {
    if (isSyncing) return;

    isSyncing = true;
    setButtonLoading(true);

    try {
        const result = await autoSync({ forceFull });
        showSyncSuccessModal(result);
    } catch (error) {
        console.error('❌ Sync error:', error);
        showToast('Lỗi cập nhật dữ liệu: ' + error.message, 'error');
    } finally {
        setButtonLoading(false);
        isSyncing = false;
    }
}

function setButtonLoading(isLoading) {
    if (!syncDataBtn) return;
    syncDataBtn.disabled = isLoading;
    syncDataBtn.classList.toggle('animate-spin', isLoading);
}

/**
 * Popup cho chọn kiểu đồng bộ: nhanh (mặc định) hoặc toàn bộ
 */
function showSyncChoiceModal() {
    const existingModal = document.querySelector('.sync-choice-modal');
    if (existingModal) existingModal.remove();

    let selectedMode = 'quick';

    const choiceModal = document.createElement('div');
    choiceModal.className = 'sync-choice-modal fixed inset-0 bg-black bg-opacity-40 z-[9999] flex items-center justify-center p-4';

    const content = document.createElement('div');
    content.className = 'bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 transform scale-95 opacity-0 transition-all duration-300';

    content.innerHTML = `
        <div class="text-center mb-5">
            <div class="w-16 h-16 bg-gradient-to-br from-blue-400 to-blue-600 rounded-full flex items-center justify-center mx-auto mb-3 shadow-lg">
                <svg class="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
                </svg>
            </div>
            <h3 class="text-xl font-bold text-gray-800">Chọn kiểu đồng bộ</h3>
        </div>

        <div class="space-y-3 mb-6">
            <label class="sync-option-card block cursor-pointer border-2 border-blue-500 bg-blue-50 rounded-xl p-4 transition-colors" data-mode="quick">
                <div class="flex items-center gap-3">
                    <input type="radio" name="sync-mode" value="quick" checked class="accent-blue-600">
                    <div class="font-semibold text-gray-800">Đồng bộ nhanh</div>
                </div>
            </label>
            <label class="sync-option-card block cursor-pointer border-2 border-gray-200 rounded-xl p-4 transition-colors" data-mode="full">
                <div class="flex items-center gap-3">
                    <input type="radio" name="sync-mode" value="full" class="accent-blue-600">
                    <div class="font-semibold text-gray-800">Đồng bộ toàn bộ</div>
                </div>
            </label>
        </div>

        <div class="flex gap-3">
            <button id="sync-choice-cancel-btn" class="flex-1 py-3 bg-gray-100 text-gray-600 rounded-xl hover:bg-gray-200 font-semibold transition-colors">
                Hủy
            </button>
            <button id="sync-choice-confirm-btn" class="flex-1 py-3 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-xl hover:from-blue-600 hover:to-blue-700 font-semibold shadow-lg hover:shadow-xl transition-all">
                Bắt đầu
            </button>
        </div>
    `;

    choiceModal.appendChild(content);
    document.body.appendChild(choiceModal);

    requestAnimationFrame(() => {
        content.classList.remove('scale-95', 'opacity-0');
        content.classList.add('scale-100', 'opacity-100');
    });

    const closeModal = () => {
        content.classList.add('scale-95', 'opacity-0');
        setTimeout(() => {
            if (document.body.contains(choiceModal)) choiceModal.remove();
        }, 300);
    };

    content.querySelectorAll('.sync-option-card').forEach(card => {
        card.addEventListener('click', () => {
            selectedMode = card.dataset.mode;
            content.querySelectorAll('.sync-option-card').forEach(c => {
                const isSelected = c === card;
                c.classList.toggle('border-blue-500', isSelected);
                c.classList.toggle('bg-blue-50', isSelected);
                c.classList.toggle('border-gray-200', !isSelected);
                c.querySelector('input').checked = isSelected;
            });
        });
    });

    document.getElementById('sync-choice-cancel-btn').addEventListener('click', closeModal);
    document.getElementById('sync-choice-confirm-btn').addEventListener('click', () => {
        closeModal();
        handleSyncClick({ forceFull: selectedMode === 'full' });
    });

    choiceModal.addEventListener('click', (e) => {
        if (e.target === choiceModal) closeModal();
    });

    const handleEscape = (e) => {
        if (e.key === 'Escape') {
            closeModal();
            document.removeEventListener('keydown', handleEscape);
        }
    };
    document.addEventListener('keydown', handleEscape);
}

/**
 * Hiển thị popup kết quả đồng bộ
 */
function showSyncSuccessModal(result) {
    const existingModal = document.querySelector('.sync-success-modal');
    if (existingModal) existingModal.remove();

    const successModal = document.createElement('div');
    successModal.className = 'sync-success-modal fixed inset-0 bg-black bg-opacity-40 z-[9999] flex items-center justify-center p-4';

    const content = document.createElement('div');
    content.className = 'bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 text-center transform scale-95 opacity-0 transition-all duration-300';

    const changedEntries = Object.entries(result.changedByModule || {});
    const detailHtml = changedEntries.length > 0
        ? `<ul class="text-sm text-gray-600 text-left mt-3 space-y-1">${changedEntries
            .map(([key, count]) => `<li>• ${MODULE_LABELS[key] || key}: ${count.toLocaleString('vi-VN')}</li>`)
            .join('')}</ul>`
        : '';

    const summaryText = result.totalChanged === 0
        ? 'Dữ liệu đã đầy đủ, không có gì mới'
        : `${result.totalChanged.toLocaleString('vi-VN')} dữ liệu mới/thay đổi`;

    content.innerHTML = `
        <div class="mb-6">
            <div class="w-20 h-20 bg-gradient-to-br from-green-400 to-green-600 rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg">
                <svg class="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/>
                </svg>
            </div>
            <h3 class="text-2xl font-bold text-gray-800 mb-3">✅ Đồng bộ thành công!</h3>
            <div class="space-y-1 text-gray-600">
                <p class="text-lg font-semibold text-green-600">${summaryText}</p>
                <p class="text-sm">${result.totalReads.toLocaleString('vi-VN')} lượt đọc từ Firebase</p>
                ${result.didFullReconcile ? '<p class="text-xs text-gray-400">Đã quét lại toàn bộ để dọn dữ liệu đã xóa</p>' : ''}
            </div>
            ${detailHtml}
        </div>
        <button id="sync-success-ok-btn" class="w-full py-3 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-xl hover:from-blue-600 hover:to-blue-700 font-semibold text-lg transition-all duration-200 shadow-lg hover:shadow-xl transform hover:scale-105">
            Đóng
        </button>
    `;

    successModal.appendChild(content);
    document.body.appendChild(successModal);

    requestAnimationFrame(() => {
        content.classList.remove('scale-95', 'opacity-0');
        content.classList.add('scale-100', 'opacity-100');
    });

    const closeModal = () => {
        content.classList.add('scale-95', 'opacity-0');
        setTimeout(() => {
            if (document.body.contains(successModal)) successModal.remove();
        }, 300);
    };

    document.getElementById('sync-success-ok-btn').addEventListener('click', closeModal);
    successModal.addEventListener('click', (e) => {
        if (e.target === successModal) closeModal();
    });

    const handleEscape = (e) => {
        if (e.key === 'Escape') {
            closeModal();
            document.removeEventListener('keydown', handleEscape);
        }
    };
    document.addEventListener('keydown', handleEscape);

    setTimeout(() => {
        if (document.body.contains(successModal)) closeModal();
    }, 8000);
}

document.addEventListener('DOMContentLoaded', initSyncUI);

window.addEventListener('load', () => {
    if (!syncDataBtn) {
        console.log('🔄 Fallback: Re-initializing Sync UI on window load...');
        initSyncUI();
    }
});
