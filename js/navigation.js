// js/navigation.js

// js/navigation.js

// --- Lấy các DOM element cần thiết ---
const mainHeaderTitle = document.getElementById('main-header-title');

// Các "khu vực" (section) nội dung chính
const sections = {
    'dashboard': document.getElementById('dashboard-section'),
    'buildings': document.getElementById('buildings-section'),
    'services': document.getElementById('services-section'),
    'accounts': document.getElementById('accounts-section'),
    'transaction-categories': document.getElementById('transaction-categories-section'),
    'contracts': document.getElementById('contracts-section'),
    'customers': document.getElementById('customers-section'),
    'bills': document.getElementById('bills-section'),
    'transactions': document.getElementById('transactions-section'),
    'tasks': document.getElementById('tasks-section'),
    'notifications': document.getElementById('notifications-section'),
    'reports': document.getElementById('reports-section'),
    'main': document.getElementById('main-section') // Bảng tin (nếu có)
};

// Các nút bấm trên sidebar
const navButtons = {
    'dashboard': document.getElementById('dashboard-btn'),
    'buildings': document.getElementById('buildings-btn'),
    'services': document.getElementById('services-btn'),
    'accounts': document.getElementById('accounts-btn'),
    'transaction-categories': document.getElementById('transaction-categories-btn'),
    'contracts': document.getElementById('contracts-btn'),
    'customers': document.getElementById('customers-btn'),
    'bills': document.getElementById('bills-btn'),
    'transactions': document.getElementById('finance-btn'),
    'tasks': document.getElementById('tasks-btn'),
    'notifications': document.getElementById('notifications-btn'),
    'reports': document.getElementById('reports-btn')
};

/**
 * Hiển thị một khu vực nội dung (section) và ẩn tất cả các khu vực khác.
 * @param {string} sectionName - Tên của khu vực (ví dụ: 'bills', 'buildings')
 * @param {function} [loader] - (Tùy chọn) Một hàm để tải dữ liệu cho khu vực đó.
 */
export function showSection(sectionName, loader) {
    const titles = {
        'dashboard': 'Bảng tin',
        'buildings': 'Quản lý Tòa nhà',
        'services': 'Danh sách Dịch vụ',
        'accounts': 'Quản lý Sổ quỹ',
        'contracts': 'Hợp đồng',
        'customers': 'Khách hàng',
        'bills': 'Danh sách Hóa đơn',
        'transactions': 'Thu chi',
        'tasks': 'Sự cố/Công việc',
        'notifications': 'Danh sách Thông báo',
        'reports': 'Báo cáo tài chính',
        'main': 'Bảng tin'
    };

    // 1. Ẩn tất cả các khu vực
    Object.values(sections).forEach(section => {
        if (section) section.classList.add('hidden');
    });

    // 2. Hiển thị khu vực được chọn
    const selectedSection = sections[sectionName] || sections['bills']; // Mặc định là 'bills'
    if (selectedSection) {
        selectedSection.classList.remove('hidden');
    }

    // 3. Cập nhật tiêu đề chính
    if (mainHeaderTitle) {
        mainHeaderTitle.textContent = titles[sectionName] || titles['bills'];
    }

    // 4. Cập nhật trạng thái active của sidebar
    updateSidebarActiveState(sectionName);

    // 5. (Tùy chọn) Chạy hàm tải dữ liệu
    if (loader && typeof loader === 'function') {
        loader();
    }
}

/**
 * Cập nhật thanh sidebar để làm nổi bật mục đang được chọn.
 * @param {string} activeSection - Tên của khu vực đang kích hoạt (ví dụ: 'bills')
 */
function updateSidebarActiveState(activeSection) {
    // 1. Xóa tất cả trạng thái 'active' cũ
    document.querySelectorAll('.sidebar-item').forEach(item => {
        item.classList.remove('active');
    });

    // 2. Kích hoạt mục được chọn
    const activeButton = navButtons[activeSection];
    if (activeButton) {
        activeButton.classList.add('active');
    }
}

// Hàm sẽ được gọi từ main.js sau khi auth xong

/**
 * Khởi tạo các trình lắng nghe sự kiện cho thanh sidebar.
 * Hàm này sẽ được gọi 1 lần duy nhất trong main.js.
 */
export function initNavigation(loadCallback) {
    // Lắng nghe click vào các nút điều hướng
    Object.keys(navButtons).forEach(sectionName => {
        const button = navButtons[sectionName];
        if (button) {
            button.addEventListener('click', (e) => {
                e.preventDefault();
                // Khi click, gọi hàm showSection và truyền vào hàm tải dữ liệu tương ứng
                showSection(sectionName, loadCallback[sectionName]);
            });
        }
    });
}