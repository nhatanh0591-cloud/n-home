// js/main.js

// --- 1. NHẬP CÁC MODULE CỐT LỖI ---
// import { auth, signInAnonymously } from './firebase.js'; // DISABLED - không cần Firebase auth
import { initializeStore, getBuildings, refreshStore } from './store.js';
import { initNavigation, showSection } from './navigation.js';
import { showToast } from './utils.js';
import { initAuth, addLogoutButton, getCurrentUser, getCurrentUserRole, hideUnauthorizedMenus, logoutAdmin } from './auth.js';
import { initSyncUI } from './sync-ui.js';

// --- 2. NHẬP CÁC MODULE CHỨC NĂNG ---
// Nhập cả hàm init (để cài đặt) và hàm load (để điều hướng)
import { initBuildings, loadBuildings } from './modules/buildings.js';
import { initDocuments, loadDocuments } from './modules/documents.js';
import { initServices, loadServices } from './modules/services.js';
import { initAccounts, loadAccounts } from './modules/accounts.js';
import { initTransactionCategories, loadTransactionCategories } from './modules/transaction-categories.js';
import { initCustomers, loadCustomers } from './modules/customers.js';
import { initContracts, loadContracts } from './modules/contracts.js';
import { initBills, loadBills } from './modules/bills.js';
import { initTransactions, loadTransactions } from './modules/transactions.js';
import { initTasks, loadTasks } from './modules/tasks.js';
import { initNotifications, loadNotifications } from './modules/notifications.js?v=8.3';
import { initReports, loadReportData } from './modules/reports.js';
import { initDashboard, loadDashboard } from './modules/dashboard.js';

// --- 3. GLOBAL FUNCTIONS - Sẵn sàng ngay ---
// Global logout function for HTML onclick - PHẢI CÓ NGAY KHI LOAD
window.logout = async function() {
    try {
        if (confirm('Bạn có chắc muốn đăng xuất?')) {
            await logoutAdmin();
        }
    } catch (error) {
        console.error('Lỗi đăng xuất:', error);
        window.location.reload();
    }
};

// --- 4. KHỞI ĐỘNG ỨNG DỤNG ---
document.addEventListener('DOMContentLoaded', async () => {
    const loadingOverlay = document.getElementById('loading-overlay');
    loadingOverlay.classList.remove('hidden');

    try {
        // ⚡ BƯỚC 1: KHỞI TẠO STORE (CHỈ LOCALSTORAGE)
        console.log("Main: 🚀 Khởi tạo store - CHỈ DÙNG LOCALSTORAGE...");
        initializeStore();
        
        // 🔄 BƯỚC 2: Kiểm tra đăng nhập admin SONG SONG với cache loading
        const authPromise = initAuth();
        
        // ⚡ BƯỚC 3: Chờ cache load xong (nhanh hơn auth)
        const cacheLoadedPromise = new Promise((resolve) => {
            document.addEventListener('store:ready', resolve, { once: true });
            // Fallback nếu store ready quá lâu
            setTimeout(resolve, 2000);
        });
        
        // Load cache trước, hiển thị ngay
        await cacheLoadedPromise;
        console.log("Main: ⚡ Cache loaded! Hiển thị web ngay...");
        
        // Hiển thị web ngay với data cache VÀ LOAD DỮ LIỆU DASHBOARD
        showSection('dashboard');
        loadDashboard(); // ← Thêm dòng này để load dữ liệu dashboard ngay
        loadingOverlay.classList.add('hidden');
        
        // 🔄 BƯỚC 4: Kiểm tra auth sau (không block UI)
        const isAuthenticated = await authPromise;
        if (!isAuthenticated) {
            return; // Dừng lại nếu chưa đăng nhập, nhưng UI đã hiển thị
        }

        // 🔄 BƯỚC 5: SKIP Firebase auth - hoàn toàn offline
        // await signInAnonymously(auth);
        console.log("Main: 🚫 SKIP Firebase auth - hoàn toàn LOCAL-ONLY MODE!");
        
        // 🛠️ BƯỚC 6: Tạo "bản đồ" các hàm load dữ liệu
        // navigation.js sẽ dùng bản đồ này để biết cần gọi hàm nào khi bạn click
        const loaders = {
            'dashboard': loadDashboard,
            'buildings': loadBuildings,
            'documents': loadDocuments,
            'services': loadServices,
            'accounts': loadAccounts,
            'transaction-categories': loadTransactionCategories,
            'customers': loadCustomers,
            'contracts': loadContracts,
            'bills': loadBills,
            'transactions': loadTransactions,
            'tasks': loadTasks,
            'notifications': loadNotifications,
            'reports': loadReportData
        };

        // 🛠️ BƯỚC 7: Khởi tạo tất cả các module (gắn các event listener)
        initNavigation(loaders); // Quan trọng: Truyền bản đồ loaders vào
        initDashboard();
        initBuildings();
        initDocuments();
        initServices();
        initAccounts();
        initTransactionCategories();
        initCustomers();
        initContracts();
        initBills();
        initTransactions();
        initTasks();
        initNotifications();
        initReports();
        
        console.log("Main: 🛠️ Đã khởi tạo tất cả module.");
        
        // 🔐 BƯỚC 8: Thêm nút đăng xuất và ẩn menu không có quyền
        addLogoutButton();
        hideUnauthorizedMenus();

        // Viewer mặc định vào trang Sự cố/Công việc thay vì Bảng tin
        const _roleAfterAuth = getCurrentUserRole();
        if (_roleAfterAuth && _roleAfterAuth.role === 'viewer') {
            showSection('tasks', loaders['tasks']);
        }

        // 🔄 BƯỚC 9: Khởi tạo Sync UI
        initSyncUI();
        
        console.log("Main: ✅ HOÀN TẤT! Web chỉ dùng localStorage - KHÔNG tự động load Firebase!");
        
        // 💾 Thông báo về chế độ localStorage-only
        console.log(`
🔧 HỆ THỐNG CHỈ DÙNG LOCALSTORAGE:
   📱 Dữ liệu chỉ lưu trên máy này (localStorage)
   🚫 KHÔNG tự động sync với Firebase
   🚫 KHÔNG tự động load từ Firebase
   🔄 Muốn load mới: window.refreshStore() (thủ công)
   🗑️ Xóa cache: window.clearCache()
   ℹ️ Xem thông tin: window.getCacheInfo()
   🚫 KHÔNG kết nối Firebase - hoàn toàn offline
        `);
        
    } catch (error) {
        console.error("Main: Lỗi khởi động:", error);
        // Vẫn cố gắng hiển thị web với cache nếu có lỗi
        loadingOverlay.classList.add('hidden');
        showSection('dashboard');
        loadDashboard(); // ← Thêm dòng này để load dashboard ngay cả khi có lỗi
        console.log("Main: 🚨 Có lỗi nhưng vẫn hiển thị web từ localStorage");
    }
    
    // 🔄 WIRE REFRESH BUTTON
    const refreshBtn = document.getElementById('refresh-data-btn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', async () => {
            try {
                // Disable button và thêm animation
                refreshBtn.disabled = true;
                refreshBtn.querySelector('svg').classList.add('animate-spin');
                
                showToast('Đang tải mới từ Firebase...', 'info');
                
                const totalReads = await refreshStore();
                
                showToast(`Đã tải mới từ Firebase và lưu vào máy! (${totalReads} reads)`, 'success');
                
            } catch (error) {
                console.error('Refresh error:', error);
                showToast('Lỗi khi làm mới dữ liệu: ' + error.message, 'error');
            } finally {
                // Re-enable button và remove animation
                refreshBtn.disabled = false;
                refreshBtn.querySelector('svg').classList.remove('animate-spin');
            }
        });
    }
});

// ESC hint functionality removed - keeping ESC key functionality only

// ESC hint removed - ESC key functionality is handled in individual modules

// --- CUSTOM CALENDAR INTEGRATION ---
let currentCalendar = null;
let currentDateInput = null;
let calendarDropdown = null;

// Function to show calendar dropdown
function showCalendarDropdown(inputElement) {
    // Hide any existing dropdown
    hideCalendarDropdown();
    
    currentDateInput = inputElement;
    
    // Parse current value or use today's date
    let initialDate = new Date();
    const currentValue = inputElement.value.trim();
    if (currentValue && currentValue.match(/^\d{2}-\d{2}-\d{4}$/)) {
        const [day, month, year] = currentValue.split('-').map(v => parseInt(v, 10));
        // Validate parsed date
        const parsedDate = new Date(year, month - 1, day);
        // Check if date is valid (not Invalid Date or out of range)
        if (!isNaN(parsedDate.getTime()) && 
            parsedDate.getFullYear() === year && 
            parsedDate.getMonth() === month - 1 && 
            parsedDate.getDate() === day) {
            initialDate = parsedDate;
        }
    }
    
    // Create dropdown container
    calendarDropdown = document.createElement('div');
    calendarDropdown.className = 'calendar-dropdown-container';
    calendarDropdown.innerHTML = '<div id="dropdown-calendar"></div>';
    
    // Get input position relative to viewport
    const inputRect = inputElement.getBoundingClientRect();
    
    // Check if input is in a modal
    const isInModal = inputElement.closest('.modal-content');
    const isSyncModal = inputElement.closest('#sync-data-modal');
    const dropdownHeight = 320; // Approximate calendar height
    const dropdownWidth = 280;
    
    let top, left;
    
    if (isSyncModal) {
        // Position ABOVE the input for sync modal
        top = inputRect.top - dropdownHeight - 3;
    } else {
        // Position BELOW the input for all other cases
        top = inputRect.bottom + 3;
    }
    
    left = inputRect.left;
    
    // Adjust left position if dropdown would go outside viewport
    const viewportWidth = window.innerWidth;
    if (left + dropdownWidth > viewportWidth) {
        left = viewportWidth - dropdownWidth - 10;
    }
    if (left < 0) {
        left = 10;
    }
    
    // Always use fixed positioning and append to body for modals
    calendarDropdown.style.cssText = `
        position: fixed !important;
        top: ${top}px !important;
        left: ${left}px !important;
        bottom: auto !important;
        z-index: 1100 !important;
        transform: translateY(0) !important;
        margin-top: 0 !important;
    `;
    
    // Always append to body to avoid overflow issues with modals
    document.body.appendChild(calendarDropdown);
    
    // Create calendar instance with validated date
    currentCalendar = new CustomCalendar('dropdown-calendar', {
        selectedDate: initialDate,
        isDropdown: true,
        onDateSelect: (date, dateStr) => {
            // Validate selected date before setting
            if (!isNaN(date.getTime())) {
                currentDateInput.value = dateStr;
                
                // Trigger change event
                const changeEvent = new Event('change', { bubbles: true });
                currentDateInput.dispatchEvent(changeEvent);
            }
            
            // Close dropdown after short delay
            setTimeout(() => {
                hideCalendarDropdown();
            }, 150);
        }
    });
    
    // Update position on scroll/resize - check if sync modal for positioning
    const updatePosition = () => {
        if (!calendarDropdown || !currentDateInput) return;
        
        const rect = currentDateInput.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        
        // Check if input is in sync modal
        const isSyncModal = currentDateInput.closest('#sync-data-modal');
        const dropdownHeight = 320;
        let newTop;
        
        if (isSyncModal) {
            // Position ABOVE the input for sync modal
            newTop = rect.top - containerRect.top - dropdownHeight - 3;
        } else {
            // Position BELOW the input for all other cases
            newTop = rect.bottom - containerRect.top + 3;
        }
        
        let newLeft = rect.left - containerRect.left;
        
        // Keep dropdown within container bounds
        const dropdownWidth = 280;
        const containerWidth = containerRect.width;
        if (newLeft + dropdownWidth > containerWidth) {
            newLeft = containerWidth - dropdownWidth - 10;
        }
        if (newLeft < 0) {
            newLeft = 10;
        }
        
        calendarDropdown.style.top = `${newTop}px`;
        calendarDropdown.style.left = `${newLeft}px`;
    };
    
    // Store the update function for later cleanup
    calendarDropdown._updatePosition = updatePosition;
    
    // Close calendar on scroll (don't follow scroll)
    const closeOnScroll = () => {
        hideCalendarDropdown();
    };
    
    calendarDropdown._closeOnScroll = closeOnScroll;
    
    // Add listeners: close on scroll, update position on resize only
    window.addEventListener('scroll', closeOnScroll, { passive: true, capture: true });
    window.addEventListener('resize', updatePosition, { passive: true });
    
    // Also close on scroll inside modal/container
    const scrollableParent = inputElement.closest('.overflow-x-auto, .overflow-y-auto, .overflow-auto') || document.querySelector('.modal-content');
    if (scrollableParent) {
        scrollableParent.addEventListener('scroll', closeOnScroll, { passive: true });
        calendarDropdown._scrollableParent = scrollableParent;
    }
}

// Function to hide calendar dropdown
function hideCalendarDropdown() {
    if (calendarDropdown) {
        // Remove scroll and resize listeners
        if (calendarDropdown._updatePosition) {
            window.removeEventListener('resize', calendarDropdown._updatePosition);
        }
        if (calendarDropdown._closeOnScroll) {
            window.removeEventListener('scroll', calendarDropdown._closeOnScroll, { capture: true });
        }
        if (calendarDropdown._scrollableParent && calendarDropdown._closeOnScroll) {
            calendarDropdown._scrollableParent.removeEventListener('scroll', calendarDropdown._closeOnScroll);
        }
        
        // Remove dropdown from DOM
        if (calendarDropdown.parentNode) {
            calendarDropdown.parentNode.removeChild(calendarDropdown);
        }
        
        calendarDropdown = null;
        currentCalendar = null;
        currentDateInput = null;
    }
}

// Close dropdown when clicking outside
document.addEventListener('click', (e) => {
    if (calendarDropdown && currentDateInput) {
        const isClickInsideDropdown = calendarDropdown.contains(e.target);
        const isClickOnInput = currentDateInput.contains ? currentDateInput.contains(e.target) : currentDateInput === e.target;
        
        if (!isClickInsideDropdown && !isClickOnInput) {
            hideCalendarDropdown();
        }
    }
});

// Note: Position update listeners are now handled per dropdown instance

// --- ESC KEY HANDLER - Close modals/forms with ESC ---
document.addEventListener('keydown', function(e) {
    // Check if ESC key was pressed
    if (e.key === 'Escape' || e.keyCode === 27) {
        e.preventDefault();
        
        // Priority order: Calendar dropdown > Modals > Other
        
        // 1. Close calendar dropdown first if open
        if (calendarDropdown && currentDateInput) {
            hideCalendarDropdown();
            return;
        }
        
        // 2. Find and close any visible modal
        const visibleModals = document.querySelectorAll('.modal-backdrop:not(.hidden), .fixed:not(.hidden)');
        let modalClosed = false;
        
        visibleModals.forEach(modal => {
            // Skip if not actually a modal
            if (!modal.id || !modal.id.includes('modal')) return;
            
            // Find the close button and click it
            const closeBtn = modal.querySelector('[id*="close-"], .close, [data-dismiss="modal"], button[onclick*="hide"], button[onclick*="close"]');
            if (closeBtn) {
                closeBtn.click();
                modalClosed = true;
                return;
            }
            
            // Or hide modal directly
            modal.classList.add('hidden');
            modal.style.display = 'none';
            modalClosed = true;
        });
        
        if (modalClosed) {
            // Re-enable body scroll
            document.body.style.overflow = '';
            return;
        }
        
        // 3. Close any visible dropdown menus
        const openDropdowns = document.querySelectorAll('.dropdown-content.show, .show');
        openDropdowns.forEach(dropdown => {
            dropdown.classList.remove('show');
        });
        
        // 4. Clear any form focus if nothing else to close
        if (document.activeElement && document.activeElement.tagName !== 'BODY') {
            document.activeElement.blur();
        }
    }
});

// Enhanced modal detection for common modal patterns
function findAndCloseActiveModal() {
    // Common modal selectors
    const modalSelectors = [
        '#contract-modal',
        '#bill-modal', 
        '#customer-modal',
        '#building-modal',
        '#service-modal',
        '#account-modal',
        '#transaction-modal',
        '#task-modal',
        '#notification-modal',
        '#sync-data-modal',
        '#payment-modal',
        '#bulk-payment-modal',
        '.modal:not(.hidden)',
        '.modal-backdrop:not(.hidden)'
    ];
    
    for (const selector of modalSelectors) {
        const modal = document.querySelector(selector);
        if (modal && !modal.classList.contains('hidden') && modal.style.display !== 'none') {
            // Try to find close button
            const closeBtn = modal.querySelector('button[id*="close"], .modal-close, [data-dismiss="modal"]');
            if (closeBtn) {
                closeBtn.click();
                return true;
            }
            
            // Manually hide modal
            modal.classList.add('hidden');
            modal.style.display = 'none';
            document.body.style.overflow = '';
            return true;
        }
    }
    
    return false;
}

// --- DATE INPUT HANDLERS - Updated to use Custom Calendar Dropdown ---
document.addEventListener('click', function(e) {
    // Check if clicked element is a date input (has date-related pattern)
    if (e.target.type === 'text' && e.target.pattern === '[0-9]{2}-[0-9]{2}-[0-9]{4}') {
        // Show calendar dropdown when clicking anywhere on the input
        // But allow focusing for text input after calendar is shown
        
        // Check if CustomCalendar is available
        if (typeof CustomCalendar !== 'undefined') {
            // Don't prevent default - allow focus and text input
            showCalendarDropdown(e.target);
        } else {
            // Fallback to original date picker behavior
            const currentValue = e.target.value;
            const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth <= 768;
            
            e.target.type = 'date';
            
            if (currentValue && currentValue.match(/^\d{2}-\d{2}-\d{4}$/)) {
                const [day, month, year] = currentValue.split('-');
                e.target.value = `${year}-${month}-${day}`;
            }
            
            if (!isMobile && typeof e.target.showPicker === 'function') {
                try {
                    setTimeout(() => e.target.showPicker(), 10);
                } catch (error) {
                    console.log('showPicker not supported, falling back to normal date input');
                }
            }
            
            const handleDateChange = function() {
                const dateValue = this.value;
                this.type = 'text';
                this.pattern = '[0-9]{2}-[0-9]{2}-[0-9]{4}';
                this.placeholder = 'dd-mm-yyyy';
                
                if (dateValue) {
                    const [year, month, day] = dateValue.split('-');
                    this.value = `${day}-${month}-${year}`;
                } else {
                    this.value = currentValue;
                }
                
                this.removeEventListener('blur', handleDateChange);
                this.removeEventListener('change', handleDateChange);
            };
            
            e.target.addEventListener('blur', handleDateChange, { once: true });
            e.target.addEventListener('change', handleDateChange, { once: true });
        }
    }
});

// Add keyboard shortcut to open calendar with F2 or Down arrow
document.addEventListener('keydown', function(e) {
    if (e.target.type === 'text' && e.target.pattern === '[0-9]{2}-[0-9]{2}-[0-9]{4}') {
        // F2 key or Down arrow to open calendar
        if ((e.key === 'F2' || e.key === 'ArrowDown') && typeof CustomCalendar !== 'undefined') {
            e.preventDefault();
            showCalendarDropdown(e.target);
        }
    }
});

// --- MONEY INPUT FORMATTING (copy từ index1.html) ---
document.addEventListener('input', (e) => {
    if (e.target.classList.contains('money-input')) {
        let value = e.target.value.replace(/\./g, '');
        if (value && !isNaN(value)) {
            e.target.value = Number(value).toLocaleString('vi-VN');
        }
    }
});

// --- IMPORT EXCEL FUNCTIONS (copy từ index1.html) ---

// Import data from Excel
async function importFromExcel(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        
        reader.onload = (e) => {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                
                // Get first sheet
                const firstSheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[firstSheetName];
                
                // Convert to JSON
                const jsonData = XLSX.utils.sheet_to_json(worksheet);
                
                console.log(`✅ Imported ${jsonData.length} rows from Excel`);
                resolve(jsonData);
            } catch (error) {
                console.error('❌ Import error:', error);
                reject(error);
            }
        };
        
        reader.onerror = (error) => {
            console.error('❌ File read error:', error);
            reject(error);
        };
        
        reader.readAsArrayBuffer(file);
    });
}

// Download Buildings Template
function downloadBuildingsTemplate() {
    console.log('downloadBuildingsTemplate called');
    console.log('XLSX available:', typeof XLSX !== 'undefined');
    
    if (typeof XLSX === 'undefined') {
        showToast('Lỗi: Thư viện XLSX chưa được tải!', 'error');
        return;
    }
    
    const data = [
        ['Mã', 'Địa chỉ', 'Danh sách phòng'],
        ['12/5NVD', 'Số 12/5 Nguyễn Văn Dậu, Phường 6, Bình Thạnh', '101, 102, 103, 201, 202, 203, 301, 302, 303'],
        ['360NX', 'Số 360 Nguyễn Xiển, Phường Long Thạnh Mỹ, Quận 9', 'G01, G02, G03, M01, M02, M03'],
        ['', '', ''],
        ['', '', '']
    ];
    
    const ws = XLSX.utils.aoa_to_sheet(data);
    
    // Set column widths
    ws['!cols'] = [
        { wch: 12 },  // Mã
        { wch: 50 },  // Địa chỉ
        { wch: 40 }   // Danh sách phòng
    ];
    
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Tòa nhà');
    XLSX.writeFile(wb, 'mau-toa-nha.xlsx');
    
    showToast('Đã tải file mẫu Excel!');
}

// Download Customers Template
function downloadCustomersTemplate() {
    if (typeof XLSX === 'undefined') {
        showToast('Lỗi: Thư viện XLSX chưa được tải!', 'error');
        return;
    }
    
    const data = [
        ['Họ tên', 'Số điện thoại'],
        ['Nguyễn Văn A', '0901234567'],
        ['Trần Thị B', '0912345678'],
        ['', ''],
        ['', '']
    ];
    
    const ws = XLSX.utils.aoa_to_sheet(data);
    ws['!cols'] = [
        { wch: 25 },  // Họ tên
        { wch: 15 }   // Số điện thoại
    ];
    
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Khách hàng');
    XLSX.writeFile(wb, 'mau-khach-hang.xlsx');
    showToast('Đã tải file mẫu thành công!');
}

// Download Contract Template based on building
function downloadContractTemplate(buildingId) {
    try {
        if (typeof XLSX === 'undefined') {
            showToast('Lỗi: Thư viện XLSX chưa được tải!', 'error');
            return;
        }
        
        const buildings = getBuildings();
        const building = buildings.find(b => b.id === buildingId);
        
        if (!building) {
            showToast('Vui lòng chọn tòa nhà trước!', 'warning');
            return;
        }
        
        // Lấy danh sách dịch vụ của tòa nhà
        const services = building && building.services ? building.services : [];
        
        // Tạo header với các cột dịch vụ
        const header = ['Tòa nhà', 'Phòng', 'Tên khách hàng', 'SĐT khách hàng', 'Ngày bắt đầu', 'Ngày kết thúc', 'Hạn thanh toán (ngày)', 'Giá thuê', 'Tiền cọc', 'Chỉ số điện ban đầu'];
        
        // Thêm cột cho từng dịch vụ (trừ điện vì đã có chỉ số điện ban đầu)
        services.forEach(service => {
            const serviceName = service.name.toLowerCase();
            if (!serviceName.includes('điện')) {
                header.push(`${service.name} (số lượng)`);
            }
        });
        
        // Tạo dữ liệu mẫu - tất cả dưới dạng string để tránh auto-format
        const buildingCode = building.code || building.id || 'DEFAULT';
        const sampleRow1 = [buildingCode, '101', 'Nguyễn Văn A', '0901234567', '01-01-2025', '31-12-2025', '3', '3.500.000', '7.000.000', '100'];
        const sampleRow2 = [buildingCode, '102', 'Trần Thị B', '0912345678', '01-02-2025', '31-01-2026', '5', '4.000.000', '8.000.000', '150'];
        
        // Thêm số lượng mặc định cho dịch vụ (trừ điện) - dưới dạng string
        services.forEach(service => {
            const serviceName = service.name.toLowerCase();
            if (!serviceName.includes('điện')) {
                sampleRow1.push('1');
                sampleRow2.push('1');
            }
        });
        
        const emptyRow1 = [buildingCode];
        const emptyRow2 = [buildingCode];
        for (let i = 1; i < header.length; i++) {
            emptyRow1.push('');
            emptyRow2.push('');
        }
        
        const data = [header, sampleRow1, sampleRow2, emptyRow1, emptyRow2];
        
        const ws = XLSX.utils.aoa_to_sheet(data);
        
        // Mở rộng range để cover thêm nhiều hàng cho user nhập sau này (200 hàng)
        const extendedRange = 'A1:' + XLSX.utils.encode_col(header.length - 1) + '200';
        ws['!ref'] = extendedRange;
        
        // Set tất cả các cell trong range mở rộng thành TEXT format
        const range = XLSX.utils.decode_range(extendedRange);
        for (let row = range.s.r; row <= range.e.r; row++) {
            for (let col = range.s.c; col <= range.e.c; col++) {
                const cellAddress = XLSX.utils.encode_cell({ r: row, c: col });
                
                // Tạo cell nếu chưa tồn tại
                if (!ws[cellAddress]) {
                    ws[cellAddress] = { t: 's', v: '' };
                }
                
                // Set format TEXT cho tất cả cell (kể cả cell trống)
                ws[cellAddress].z = '@';
                
                // Đảm bảo cell có data thì convert thành string
                if (ws[cellAddress].v !== undefined && ws[cellAddress].v !== '') {
                    ws[cellAddress].v = String(ws[cellAddress].v);
                    ws[cellAddress].t = 's';
                }
            }
        }
        
        ws['!cols'] = [
            { wch: 15 }, { wch: 10 }, { wch: 25 }, { wch: 15 },
            { wch: 15 }, { wch: 15 }, { wch: 22 }, { wch: 15 }, { wch: 15 }
        ];
        
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Hợp đồng');
        XLSX.writeFile(wb, `mau-hop-dong-${buildingCode}.xlsx`);
        
        showToast('Đã tải file mẫu Excel!');
    } catch (error) {
        console.error('Error downloading contract template:', error);
        showToast('Lỗi tải file mẫu: ' + error.message, 'error');
    }
}

// Make functions global so modules can access them
window.downloadBuildingsTemplate = downloadBuildingsTemplate;
window.downloadCustomersTemplate = downloadCustomersTemplate;
window.downloadContractTemplate = downloadContractTemplate;
window.importFromExcel = importFromExcel;

