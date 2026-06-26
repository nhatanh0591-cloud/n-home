/**
 * Sync UI Controller - Quản lý giao diện đồng bộ dữ liệu
 */

import { syncSelectedCollections, smartSync } from './modules/sync-manager.js';
import { showToast, formatDateDisplay, parseDateInput } from './utils.js';
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
    
    // Confirm sync với debounce
    confirmBtn.addEventListener('click', handleConfirmSync);
    
    // Prevent form submission on Enter
    syncDataModal.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !isSyncing) {
            e.preventDefault();
            handleConfirmSync();
        }
    });
    
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
    const today = formatDateDisplay(new Date());
    dateToInput.value = today;
    
    // Set from date to 3 days ago
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
    dateFromInput.value = formatDateDisplay(threeDaysAgo);
    
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
        // 'buildings',        // Bỏ comment - viewer cần buildings để load dropdown
        'services',           // 1. Phí dịch vụ
        // 'transactionCategories', // Viewer cần hạng mục để chọn khi thêm thu chi
        // 'accounts',           // Viewer cần sổ quỹ để chọn khi thêm thu chi
        // 'contracts'        // Viewer được phép đồng bộ hợp đồng thuê
        // 'transactions'     // Viewer được phép đồng bộ thu chi của mình
        'notifications'       // 4. Thông báo
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
let isSyncing = false; // Prevent double-click
async function handleConfirmSync() {
    // Prevent double execution
    if (isSyncing) {
        console.log('🚫 Already syncing, ignoring...');
        return;
    }
    
    try {
        isSyncing = true;
        console.log('🔄 Starting sync...');
        
        // Validate selections
        const selectedModules = Array.from(moduleCheckboxes)
            .filter(cb => cb.checked)
            .map(cb => cb.value);
            
        // Nếu không chọn module nào -> dùng Smart Sync
        if (selectedModules.length === 0) {
            console.log('⚡ No modules selected, using Smart Sync...');
            await handleSmartSyncIntegrated();
            return;
        }
        
        // Get date range
        const dateOption = document.querySelector('input[name="dateOption"]:checked').value;
        let dateFrom = null;
        let dateTo = null;
        
        if (dateOption === 'range') {
            const dateFromStr = dateFromInput.value || null;
            const dateToStr = dateToInput.value || null;
            
            dateFrom = dateFromStr ? parseDateInput(dateFromStr) : null;
            dateTo = dateToStr ? parseDateInput(dateToStr) : null;
            
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
        isSyncing = false; // Reset flag
        console.log('✅ Sync process completed');
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
            Cập Nhật
        `;
    }
}

/**
 * Hiển thị popup thành công gọn đẹp và dễ hiểu
 */
function showSyncSuccessModal(moduleCount, totalReads, dateRangeText) {
    // Xóa modal cũ nếu có
    const existingModal = document.querySelector('.sync-success-modal');
    if (existingModal) {
        existingModal.remove();
    }
    
    // Tạo modal success mới với animation
    const successModal = document.createElement('div');
    successModal.className = 'sync-success-modal fixed inset-0 bg-black bg-opacity-40 z-[9999] flex items-center justify-center p-4';
    
    // Tạo content với design đẹp hơn
    const content = document.createElement('div');
    content.className = 'bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 text-center transform scale-95 opacity-0 transition-all duration-300';
    
    // Tạo nội dung rõ ràng và gọn gàng
    const formatModuleText = (count) => {
        if (count === 1) return '1 hạng mục';
        return `${count} hạng mục`;
    };
    
    const formatRecordText = (count) => {
        if (count === 0) return 'Không có dữ liệu mới';
        if (count === 1) return '1 dữ liệu';
        return `${count.toLocaleString('vi-VN')} dữ liệu`;
    };

    content.innerHTML = `
        <div class="mb-6">
            <div class="w-20 h-20 bg-gradient-to-br from-green-400 to-green-600 rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg">
                <svg class="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/>
                </svg>
            </div>
            <h3 class="text-2xl font-bold text-gray-800 mb-3">✅ Đồng bộ thành công!</h3>
            <div class="space-y-2 text-gray-600">
                <p class="text-lg font-semibold text-green-600">${formatModuleText(moduleCount)}</p>
                <p class="text-sm">${formatRecordText(totalReads)}</p>
            </div>
        </div>
        <button id="sync-success-ok-btn" class="w-full py-3 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-xl hover:from-blue-600 hover:to-blue-700 font-semibold text-lg transition-all duration-200 shadow-lg hover:shadow-xl transform hover:scale-105">
            Đóng
        </button>
    `;
    
    successModal.appendChild(content);
    document.body.appendChild(successModal);
    
    // Animate in
    requestAnimationFrame(() => {
        content.classList.remove('scale-95', 'opacity-0');
        content.classList.add('scale-100', 'opacity-100');
    });
    
    // Add click handlers
    const okBtn = document.getElementById('sync-success-ok-btn');
    
    const closeModal = () => {
        content.classList.add('scale-95', 'opacity-0');
        setTimeout(() => {
            if (document.body.contains(successModal)) {
                successModal.remove();
            }
        }, 300);
    };
    
    okBtn.addEventListener('click', closeModal);
    
    // Click outside to close
    successModal.addEventListener('click', (e) => {
        if (e.target === successModal) {
            closeModal();
        }
    });
    
    // ESC key to close
    const handleEscape = (e) => {
        if (e.key === 'Escape') {
            closeModal();
            document.removeEventListener('keydown', handleEscape);
        }
    };
    document.addEventListener('keydown', handleEscape);
    
    // Auto close after 8 seconds
    setTimeout(() => {
        if (document.body.contains(successModal)) {
            closeModal();
        }
    }, 8000);
}

/**
 * Xử lý Smart Sync tích hợp vào nút chính
 */
async function handleSmartSyncIntegrated() {
    try {
        console.log('⚡ Starting Smart Sync (Integrated)...');
        
        // Show loading state cho nút chính
        confirmBtn.disabled = true;
        confirmBtn.innerHTML = `
            <svg class="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            Đang cập nhật...
        `;
        
        await smartSync();
        closeSyncModal();
        
    } catch (error) {
        console.error('❌ Smart Sync Error:', error);
        showToast('Lỗi smart sync: ' + error.message, 'error');
    } finally {
        // Reset nút về trạng thái ban đầu
        confirmBtn.disabled = false;
        confirmBtn.innerHTML = `
            Cập Nhật
        `;
        isSyncing = false;
    }
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