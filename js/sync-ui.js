/**
 * Sync UI Controller - Quản lý giao diện đồng bộ dữ liệu
 */

import { syncSelectedCollections } from './modules/sync-manager.js';
import { showToast } from './utils.js';
import { getCurrentUserRole } from './auth.js';

// DOM Elements
let syncDataBtn = null;
let syncDataModal = null;
let modalCloseBtn = null;
let cancelBtn = null;
let confirmBtn = null;
let selectAllCheckbox = null;
let moduleCheckboxes = null;
let dateOptionRadios = null;
let dateRangeInputs = null;
let dateFromInput = null;
let dateToInput = null;

/**
 * Khởi tạo Sync UI Controller
 */
export function initSyncUI() {
    console.log('🔄 Initializing Sync UI...');
    
    // Get DOM elements
    syncDataBtn = document.getElementById('sync-data-btn');
    syncDataModal = document.getElementById('sync-data-modal');
    modalCloseBtn = document.getElementById('sync-data-modal-close');
    cancelBtn = document.getElementById('sync-data-cancel');
    confirmBtn = document.getElementById('sync-data-confirm');
    selectAllCheckbox = document.getElementById('select-all-modules');
    moduleCheckboxes = document.querySelectorAll('.sync-module-checkbox');
    dateOptionRadios = document.querySelectorAll('input[name="dateOption"]');
    dateRangeInputs = document.getElementById('date-range-inputs');
    dateFromInput = document.getElementById('sync-date-from');
    dateToInput = document.getElementById('sync-date-to');
    
    // Debug DOM elements
    console.log('🔍 DEBUG - DOM Elements Check:');
    console.log('syncDataBtn:', syncDataBtn);
    console.log('syncDataModal:', syncDataModal);
    console.log('moduleCheckboxes count:', moduleCheckboxes.length);
    
    if (!syncDataBtn || !syncDataModal) {
        console.error('❌ Sync UI elements not found');
        console.error('syncDataBtn:', syncDataBtn);
        console.error('syncDataModal:', syncDataModal);
        return;
    }
    
    // Bind events
    bindEvents();
    
    console.log('✅ Sync UI initialized');
}

/**
 * Bind các event listeners
 */
function bindEvents() {
    // Open modal
    console.log('🔗 Binding click event to sync button:', syncDataBtn);
    syncDataBtn.addEventListener('click', (e) => {
        console.log('🔥 SYNC BUTTON CLICKED!', e);
        openSyncModal();
    });
    
    // Close modal
    modalCloseBtn.addEventListener('click', closeSyncModal);
    cancelBtn.addEventListener('click', closeSyncModal);
    
    // Click outside modal to close
    syncDataModal.addEventListener('click', (e) => {
        if (e.target === syncDataModal) {
            closeSyncModal();
        }
    });
    
    // Select all checkbox
    selectAllCheckbox.addEventListener('change', handleSelectAll);
    
    // Individual module checkboxes
    moduleCheckboxes.forEach(checkbox => {
        checkbox.addEventListener('change', handleModuleCheckboxChange);
    });
    
    // Date option radios
    dateOptionRadios.forEach(radio => {
        radio.addEventListener('change', handleDateOptionChange);
    });
    
    // Confirm sync
    confirmBtn.addEventListener('click', handleConfirmSync);
    
    // ESC key to close
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !syncDataModal.classList.contains('hidden')) {
            closeSyncModal();
        }
    });
}

/**
 * Mở modal sync
 */
function openSyncModal() {
    console.log('🔓 Opening sync modal...');
    syncDataModal.style.display = 'flex';
    syncDataModal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    
    // Set default date to today
    const today = new Date().toISOString().split('T')[0];
    dateToInput.value = today;
    
    // Set from date to 30 days ago
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    dateFromInput.value = thirtyDaysAgo.toISOString().split('T')[0];
    
    // Ẩn các module bị hạn chế cho viewer
    hideRestrictedModulesForViewer();
    
    console.log('✅ Sync modal opened');
}

/**
 * Ẩn các module bị hạn chế cho viewer (quanly@gmail.com)
 */
function hideRestrictedModulesForViewer() {
    const userRole = getCurrentUserRole();
    
    // Chỉ áp dụng cho viewer role
    if (!userRole || userRole.role !== 'viewer') {
        console.log('👑 Admin - hiển thị tất cả modules');
        return;
    }
    
    console.log('🔒 Viewer detected - hiding restricted modules...');
    
    // Danh sách các module bị cấm cho viewer
    const restrictedModules = [
        'buildings',           // 1. Tòa nhà
        'services',           // 2. Phí dịch vụ
        'transactionCategories', // 3. Hạng mục thu chi
        'accounts',           // 4. Sổ quỹ
        'contracts',          // 5. Hợp đồng thuê
        'transactions',       // 6. Thu chi
        'notifications'       // 7. Thông báo
    ];
    
    // Ẩn từng module
    restrictedModules.forEach(moduleValue => {
        const checkbox = document.querySelector(`input[value="${moduleValue}"].sync-module-checkbox`);
        if (checkbox) {
            const label = checkbox.closest('label');
            if (label) {
                label.style.display = 'none';
                console.log(`🚫 Đã ẩn module: ${moduleValue}`);
            }
        }
    });
    
    // Cập nhật logic "Chọn tất cả" để chỉ apply cho các module được phép
    const selectAllCheckbox = document.getElementById('select-all-modules');
    if (selectAllCheckbox) {
        const selectAllLabel = selectAllCheckbox.closest('label');
        if (selectAllLabel) {
            // Thay đổi text để rõ ràng hơn
            const spanElement = selectAllLabel.querySelector('span');
            if (spanElement) {
                spanElement.textContent = '✨ Chọn tất cả (modules được phép)';
            }
        }
    }
    
    console.log('✅ Đã ẩn tất cả modules bị hạn chế cho viewer');
}

/**
 * Đóng modal sync
 */
function closeSyncModal() {
    syncDataModal.style.display = 'none';
    syncDataModal.classList.add('hidden');
    document.body.style.overflow = '';
    
    // Reset lại hiển thị tất cả modules để admin có thể thấy đầy đủ lần sau
    resetModuleVisibility();
}

/**
 * Reset hiển thị tất cả modules (để admin thấy đầy đủ)
 */
function resetModuleVisibility() {
    moduleCheckboxes.forEach(checkbox => {
        const label = checkbox.closest('label');
        if (label) {
            label.style.display = ''; // Hiển thị lại
        }
    });
    
    // Reset lại text "Chọn tất cả"
    const selectAllCheckbox = document.getElementById('select-all-modules');
    if (selectAllCheckbox) {
        const selectAllLabel = selectAllCheckbox.closest('label');
        if (selectAllLabel) {
            const spanElement = selectAllLabel.querySelector('span');
            if (spanElement) {
                spanElement.textContent = '✨ Chọn tất cả modules';
            }
        }
    }
}

/**
 * Xử lý select all checkbox
 */
function handleSelectAll() {
    const isChecked = selectAllCheckbox.checked;
    moduleCheckboxes.forEach(checkbox => {
        // Chỉ chọn/bỏ chọn các checkbox của module KHÔNG bị ẩn
        const label = checkbox.closest('label');
        if (label && label.style.display !== 'none') {
            checkbox.checked = isChecked;
        }
    });
}

/**
 * Xử lý khi thay đổi module checkbox
 */
function handleModuleCheckboxChange() {
    // Chỉ tính toán trên các checkbox ĐƯỢC HIỂN THỊ (không bị ẩn)
    const visibleCheckboxes = Array.from(moduleCheckboxes).filter(cb => {
        const label = cb.closest('label');
        return label && label.style.display !== 'none';
    });
    
    const allChecked = visibleCheckboxes.every(cb => cb.checked);
    const noneChecked = visibleCheckboxes.every(cb => !cb.checked);
    
    if (allChecked) {
        selectAllCheckbox.checked = true;
        selectAllCheckbox.indeterminate = false;
    } else if (noneChecked) {
        selectAllCheckbox.checked = false;
        selectAllCheckbox.indeterminate = false;
    } else {
        selectAllCheckbox.checked = false;
        selectAllCheckbox.indeterminate = true;
    }
}

/**
 * Xử lý thay đổi date option
 */
function handleDateOptionChange() {
    const selectedOption = document.querySelector('input[name="dateOption"]:checked').value;
    
    if (selectedOption === 'range') {
        dateRangeInputs.classList.remove('hidden');
    } else {
        dateRangeInputs.classList.add('hidden');
    }
}

/**
 * Xử lý confirm sync
 */
async function handleConfirmSync() {
    try {
        // Validate selections
        const selectedModules = Array.from(moduleCheckboxes)
            .filter(cb => cb.checked)
            .map(cb => cb.value);
            
        if (selectedModules.length === 0) {
            showToast('Vui lòng chọn ít nhất một module để cập nhật', 'error');
            return;
        }
        
        // Get date range
        const dateOption = document.querySelector('input[name="dateOption"]:checked').value;
        let dateFrom = null;
        let dateTo = null;
        
        if (dateOption === 'range') {
            dateFrom = dateFromInput.value || null;
            dateTo = dateToInput.value || null;
            
            if (dateFrom && dateTo && dateFrom > dateTo) {
                showToast('Ngày bắt đầu không thể lớn hơn ngày kết thúc', 'error');
                return;
            }
        }
        
        // Show loading state
        showSyncLoading(true);
        
        // Start sync
        const result = await syncSelectedCollections(selectedModules, dateFrom, dateTo);
        
        // Show success
        const moduleNames = selectedModules.length;
        const dateRangeText = dateOption === 'all' ? 'tất cả' : 
                             `từ ${dateFrom || 'đầu'} đến ${dateTo || 'hôm nay'}`;
        
        // Show custom success modal instead of toast
        showSyncSuccessModal(moduleNames, result.totalReads, dateRangeText);
        
        // Close modal
        closeSyncModal();
        
    } catch (error) {
        console.error('❌ Sync error:', error);
        showToast('Lỗi cập nhật dữ liệu: ' + error.message, 'error');
    } finally {
        showSyncLoading(false);
    }
}

/**
 * Hiển thị trạng thái loading
 */
function showSyncLoading(isLoading) {
    if (isLoading) {
        confirmBtn.disabled = true;
        confirmBtn.innerHTML = `
            <svg class="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            Đang cập nhật...
        `;
    } else {
        confirmBtn.disabled = false;
        confirmBtn.innerHTML = `
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
            </svg>
            Bắt đầu cập nhật
        `;
    }
}

/**
 * Hiển thị popup thành công tùy chỉnh
 */
function showSyncSuccessModal(moduleCount, totalReads, dateRangeText) {
    // Tạo modal success
    const successModal = document.createElement('div');
    successModal.className = 'fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4';
    successModal.style.backdropFilter = 'blur(4px)';
    
    successModal.innerHTML = `
        <div class="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 text-center">
            <div class="mb-4">
                <div class="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg class="w-8 h-8 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
                    </svg>
                </div>
                <h3 class="text-xl font-bold text-gray-800 mb-2">🎉 Cập nhật thành công!</h3>
                <p class="text-gray-600">
                    Đã cập nhật <strong>${moduleCount} module</strong><br>
                    <span class="text-sm text-gray-500">${totalReads} records - ${dateRangeText}</span>
                </p>
            </div>
            <div class="flex gap-3 justify-center">
                <button onclick="this.closest('.fixed').remove()" class="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors">
                    Đóng
                </button>
            </div>
        </div>
    `;
    
    document.body.appendChild(successModal);
    
    // Auto remove after 10 seconds
    setTimeout(() => {
        if (successModal.parentNode) {
            successModal.remove();
        }
    }, 10000);
}

// Auto-initialize when DOM is ready
document.addEventListener('DOMContentLoaded', initSyncUI);

// Fallback initialization
window.addEventListener('load', () => {
    if (!syncDataBtn) {
        console.log('🔄 Fallback: Re-initializing Sync UI on window load...');
        initSyncUI();
    }
});

// Debug function for manual testing
window.testSyncUI = () => {
    console.log('🧪 Testing Sync UI...');
    console.log('syncDataBtn:', document.getElementById('sync-data-btn'));
    console.log('syncDataModal:', document.getElementById('sync-data-modal'));
    initSyncUI();
};