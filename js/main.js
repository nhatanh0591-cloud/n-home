// js/main.js

// --- 1. NHẬP CÁC MODULE CỐT LỖI ---
// import { auth, signInAnonymously } from './firebase.js'; // DISABLED - không cần Firebase auth
import { initializeStore, getBuildings, refreshStore } from './store.js';
import { initNavigation, showSection } from './navigation.js';
import { showToast } from './utils.js';
import { initAuth, addLogoutButton, getCurrentUser, hideUnauthorizedMenus, logoutAdmin } from './auth.js';

// --- 2. NHẬP CÁC MODULE CHỨC NĂNG ---
// Nhập cả hàm init (để cài đặt) và hàm load (để điều hướng)
import { initBuildings, loadBuildings } from './modules/buildings.js';
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

// --- 3. KHỞI ĐỘNG ỨNG DỤNG ---
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

// --- DATE INPUT HANDLERS (copy từ index1.html) ---
document.addEventListener('click', function(e) {
    // Check if clicked element is a date input (has date-related pattern)
    if (e.target.type === 'text' && e.target.pattern === '[0-9]{2}-[0-9]{2}-[0-9]{4}') {
        const currentValue = e.target.value;
        
        // Kiểm tra xem có phải mobile không
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth <= 768;
        
        // Temporarily change to date type to show picker
        e.target.type = 'date';
        
        // Convert dd-mm-yyyy to yyyy-mm-dd for date input
        if (currentValue && currentValue.match(/^\d{2}-\d{2}-\d{4}$/)) {
            const [day, month, year] = currentValue.split('-');
            e.target.value = `${year}-${month}-${day}`;
        }
        
        // Chỉ sử dụng showPicker() trên desktop, không dùng trên mobile
        if (!isMobile && typeof e.target.showPicker === 'function') {
            try {
                setTimeout(() => e.target.showPicker(), 10);
            } catch (error) {
                console.log('showPicker not supported, falling back to normal date input');
            }
        }
        // Trên mobile sẽ tự động hiển thị date picker khi focus vào input type="date"
        
        // Handle when user selects a date or closes picker
        const handleDateChange = function() {
            const dateValue = this.value;
            this.type = 'text';
            this.pattern = '[0-9]{2}-[0-9]{2}-[0-9]{4}';
            this.placeholder = 'dd-mm-yyyy';
            
            // Convert yyyy-mm-dd back to dd-mm-yyyy
            if (dateValue) {
                const [year, month, day] = dateValue.split('-');
                this.value = `${day}-${month}-${year}`;
            } else {
                this.value = currentValue; // Restore original value if cancelled
            }
            
            this.removeEventListener('blur', handleDateChange);
            this.removeEventListener('change', handleDateChange);
        };
        
        e.target.addEventListener('blur', handleDateChange, { once: true });
        e.target.addEventListener('change', handleDateChange, { once: true });
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

// Global logout function for HTML onclick
window.logout = async function() {
    try {
        await logoutAdmin();
    } catch (error) {
        console.error('Lỗi đăng xuất:', error);
        // Force reload nếu có lỗi
        window.location.reload();
    }
};

