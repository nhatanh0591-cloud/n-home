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
    'transactions': document.getElementById('finance-btn'), // 'finance-btn' là ID của mục "Thu chi"
    'tasks': document.getElementById('tasks-btn'),
    'notifications': document.getElementById('notifications-btn'),
    'reports': document.getElementById('reports-btn')
};

// Các menu cha (dropdown)
const dropdownToggles = {
    'data': document.getElementById('data-menu-toggle'),
    'customers': document.getElementById('customers-menu-toggle'),
    'finance': document.getElementById('finance-menu-toggle')
};

const dropdownContents = {
    'data': document.getElementById('data-menu-content'),
    'customers': document.getElementById('customers-menu-content'),
    'finance': document.getElementById('finance-menu-content')
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
    document.querySelectorAll('.sidebar-submenu-item').forEach(item => {
        item.classList.remove('active');
    });

    // 2. KHÔNG đóng menu con nữa - giữ menu mở khi click vào item
    // Object.values(dropdownContents).forEach(content => {
    //     if (content) content.classList.remove('show');
    // });
    // document.querySelectorAll('.dropdown-arrow').forEach(arrow => {
    //     if (arrow) arrow.classList.remove('rotated');
    // });

    // 3. Xác định mục và menu cha cần kích hoạt
    let parentMenuToggle, parentMenuContent, activeSubMenu;

    switch (activeSection) {
        case 'buildings':
        case 'services':
        case 'transaction-categories':
        case 'accounts':
            parentMenuToggle = dropdownToggles['data'];
            parentMenuContent = dropdownContents['data'];
            activeSubMenu = navButtons[activeSection];
            break;
        case 'contracts':
        case 'customers':
            parentMenuToggle = dropdownToggles['customers'];
            parentMenuContent = dropdownContents['customers'];
            activeSubMenu = navButtons[activeSection];
            break;
        case 'bills':
        case 'transactions':
            parentMenuToggle = dropdownToggles['finance'];
            parentMenuContent = dropdownContents['finance'];
            activeSubMenu = navButtons[activeSection];
            break;
        case 'dashboard':
        case 'tasks':
        case 'notifications':
        case 'reports':
            // Các menu item độc lập (không có submenu)
            activeSubMenu = navButtons[activeSection];
            break;
    }

    // 4. Kích hoạt mục và menu cha (nếu có)
    if (parentMenuToggle && parentMenuContent && activeSubMenu) {
        parentMenuToggle.classList.add('active'); // Kích hoạt menu cha
        parentMenuContent.classList.add('show'); // Bung menu con
        parentMenuToggle.querySelector('.dropdown-arrow')?.classList.add('rotated'); // Xoay mũi tên
        activeSubMenu.classList.add('active'); // Kích hoạt mục con
    } else if (activeSubMenu) {
        // Trường hợp là mục cha (như Bảng tin)
        activeSubMenu.classList.add('active');
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
                // (loadCallback sẽ là một object chứa các hàm load, ví dụ: loadCallback.loadBills)
                showSection(sectionName, loadCallback[sectionName]);
            });
        }
    });

    // Lắng nghe click vào các menu cha (dropdown)
    Object.values(dropdownToggles).forEach(toggle => {
        if (toggle) {
            toggle.addEventListener('click', (e) => {
                const dropdown = e.target.closest('.dropdown-menu');
                const content = dropdown.querySelector('.dropdown-content');
                const arrow = dropdown.querySelector('.dropdown-arrow');

                // Đóng các menu khác
                Object.values(dropdownContents).forEach(dc => {
                    if (dc && dc !== content) dc.classList.remove('show');
                });
                document.querySelectorAll('.dropdown-arrow').forEach(da => {
                    if (da && da !== arrow) da.classList.remove('rotated');
                });

                // Mở/đóng menu hiện tại
                if (content) content.classList.toggle('show');
                if (arrow) arrow.classList.toggle('rotated');
            });
        }
    });
}