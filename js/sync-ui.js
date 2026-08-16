/**
 * Sync UI Controller - Nút "Đồng bộ dữ liệu" bấm là chạy thẳng, không cần chọn gì
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

    syncDataBtn.addEventListener('click', handleSyncClick);
    console.log('✅ Sync UI initialized');
}

async function handleSyncClick() {
    if (isSyncing) return;

    isSyncing = true;
    setButtonLoading(true);

    try {
        const result = await autoSync();
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
