// js/auth.js - Quản lý đăng nhập web admin Firebase

import { auth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from './firebase.js';

// Thông tin các tài khoản và quyền
const USER_ROLES = {
    "nhatanh0591@gmail.com": {
        password: "Nhatanh@2030",
        role: "admin",
        name: "Nhật Anh - Admin"
    },
    "quanly@gmail.com": {
        password: "123321",
        role: "viewer",
        name: "Quản Lý"
    }
};

// Quyền truy cập cho từng role
const PERMISSIONS = {
    admin: {
        // Admin có tất cả quyền
        dashboard: true,
        buildings: { view: true, add: true, edit: true, delete: true },
        services: { view: true, add: true, edit: true, delete: true },
        accounts: { view: true, add: true, edit: true, delete: true },
        transactionCategories: { view: true, add: true, edit: true, delete: true },
        customers: { view: true, add: true, edit: true, delete: true },
        contracts: { view: true, add: true, edit: true, delete: true },
        bills: { view: true, add: true, edit: true, delete: true, approve: true },
        transactions: { view: true, add: true, edit: true, delete: true },
        tasks: { view: true, add: true, edit: true, delete: true },
        notifications: { view: true, add: true, edit: true, delete: true },
        reports: { view: true, export: true }
    },
    viewer: {
        // Quản lý chỉ được XEM 3 thứ
        dashboard: true, // Được xem dashboard
        buildings: false, // Không xem tòa nhà
        services: false, // Không xem dịch vụ
        accounts: false, // Không xem sổ quỹ
        transactionCategories: false, // Không xem hạng mục
        customers: { view: true, add: false, edit: false, delete: false }, // CHỈ XEM khách hàng
        contracts: false, // Không xem hợp đồng
        bills: { view: true, add: false, edit: false, delete: false, approve: false }, // CHỈ XEM hóa đơn
        transactions: false, // Không xem phiếu thu chi
        tasks: { view: true, add: false, edit: false, delete: false }, // CHỈ XEM sự cố
        notifications: false, // Không xem thông báo
        reports: false // Không xem báo cáo
    }
};

let currentUser = null;
let authInitialized = false;

/**
 * Kiểm tra trạng thái đăng nhập Firebase
 */
export function initAuth() {
    return new Promise((resolve) => {
        // Kiểm tra trạng thái đăng nhập đã lưu (để duy trì khi F5)
        const isLoggedIn = localStorage.getItem('n-home-logged-in');
        const savedEmail = localStorage.getItem('n-home-user-email');
        
        if (authInitialized) {
            // Đã khởi tạo rồi, check current user
            const user = auth.currentUser;
            if (user && USER_ROLES[user.email]) {
                currentUser = user;
                showMainApp();
                resolve(true);
            } else if (isLoggedIn && savedEmail && USER_ROLES[savedEmail]) {
                // Có trạng thái đăng nhập đã lưu, duy trì session
                console.log("✅ Duy trì trạng thái đăng nhập từ localStorage:", savedEmail);
                
                // 🔥 SỬA: Tạo mock currentUser object để các hàm khác hoạt động
                currentUser = {
                    email: savedEmail,
                    uid: 'local-' + savedEmail,
                    fromLocalStorage: true
                };
                
                showMainApp();
                resolve(true);
            } else {
                showLoginForm();
                resolve(false);
            }
            return;
        }

        // Lần đầu khởi tạo - đợi Firebase load xong
        const unsubscribe = onAuthStateChanged(auth, (user) => {
            console.log("Auth state changed:", user ? user.email : "null");
            authInitialized = true;
            currentUser = user;
            
            if (user && USER_ROLES[user.email]) {
                const userRole = USER_ROLES[user.email];
                console.log("✅ User đã đăng nhập:", user.email, "- Role:", userRole.role);
                
                currentUser = user;
                showMainApp();
                unsubscribe(); // Dừng lắng nghe
                resolve(true);
            } else if (isLoggedIn && savedEmail && USER_ROLES[savedEmail]) {
                // Firebase chưa ready nhưng có trạng thái đã lưu
                console.log("✅ Duy trì session từ localStorage:", savedEmail);
                
                // 🔥 SỬA: Tạo mock currentUser object để các hàm khác hoạt động
                currentUser = {
                    email: savedEmail,
                    uid: 'local-' + savedEmail,
                    fromLocalStorage: true
                };
                
                showMainApp();
                unsubscribe(); // Dừng lắng nghe
                resolve(true);
            } else {
                console.log("❌ User chưa đăng nhập hoặc không có quyền");
                // Xóa trạng thái cũ nếu không hợp lệ
                localStorage.removeItem('n-home-logged-in');
                localStorage.removeItem('n-home-user-email');
                unsubscribe(); // Dừng lắng nghe
                showLoginForm();
                resolve(false);
            }
        });
    });
}

/**
 * Tạo device fingerprint đơn giản
 */
function getDeviceFingerprint() {
    const nav = window.navigator;
    const screen = window.screen;
    
    // Tạo fingerprint từ thông tin thiết bị
    const fingerprint = [
        nav.userAgent,
        nav.language,
        screen.colorDepth,
        screen.width + 'x' + screen.height,
        new Date().getTimezoneOffset(),
        !!window.sessionStorage,
        !!window.localStorage
    ].join('|');
    
    // Hash đơn giản
    let hash = 0;
    for (let i = 0; i < fingerprint.length; i++) {
        const char = fingerprint.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    
    return 'device_' + Math.abs(hash).toString(36);
}

/**
 * Đăng nhập admin Firebase
 */
export async function loginAdmin(email, password, rememberMe = false) {
    try {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        
        // Kiểm tra có trong danh sách không
        if (!USER_ROLES[userCredential.user.email]) {
            await signOut(auth);
            throw new Error("Tài khoản không có quyền truy cập!");
        }
        
        currentUser = userCredential.user;
        console.log("✅ Đăng nhập thành công!");
        
        // Lưu trạng thái đăng nhập để duy trì khi F5
        localStorage.setItem('n-home-logged-in', 'true');
        localStorage.setItem('n-home-user-email', userCredential.user.email);
        
        // Chỉ lưu thông tin "ghi nhớ" nếu user chọn
        if (rememberMe) {
            localStorage.setItem('n-home-last-login', JSON.stringify({
                email: userCredential.user.email,
                timestamp: Date.now(),
                deviceId: getDeviceFingerprint()
            }));
        } else {
            localStorage.removeItem('n-home-last-login');
        }
        
        // Reload ngay lập tức để load lại HTML gốc
        window.location.reload();
        
        return true;
    } catch (error) {
        console.error("Lỗi đăng nhập:", error);
        if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
            throw new Error("Email hoặc mật khẩu không đúng!");
        }
        throw error;
    }
}

/**
 * Đăng xuất admin
 */
export async function logoutAdmin() {
    try {
        // Xóa tất cả thông tin đăng nhập
        localStorage.removeItem('n-home-logged-in');
        localStorage.removeItem('n-home-user-email');
        localStorage.removeItem('n-home-last-login');
        
        await signOut(auth);
        currentUser = null;
        window.location.reload();
    } catch (error) {
        console.error("Lỗi đăng xuất:", error);
        window.location.reload();
    }
}

/**
 * Hiển thị form đăng nhập
 */
function showLoginForm() {
    // Kiểm tra xem có thông tin đăng nhập trước đó không
    let savedEmail = '';
    let showRememberMessage = false;
    
    const lastLogin = localStorage.getItem('n-home-last-login');
    if (lastLogin) {
        try {
            const loginData = JSON.parse(lastLogin);
            const currentDevice = getDeviceFingerprint();
            
            // Nếu cùng thiết bị và trong vòng 30 ngày
            if (loginData.deviceId === currentDevice && 
                (Date.now() - loginData.timestamp) < 30 * 24 * 60 * 60 * 1000) {
                savedEmail = loginData.email;
                showRememberMessage = true;
            }
        } catch (e) {
            console.error('Lỗi parse last login:', e);
        }
    }
    
    document.body.innerHTML = `
        <div class="min-h-screen bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
            <div class="bg-white p-8 rounded-xl shadow-2xl w-96">
                <div class="text-center mb-8">
                    <h1 class="text-4xl font-bold text-green-600 mb-2">N-Home</h1>
                    ${showRememberMessage ? '<p class="text-sm text-gray-600 mt-2">🔐 Thiết bị đã đăng nhập trước đó</p>' : ''}
                </div>
                
                <form id="login-form" class="space-y-6">
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-2">Email</label>
                        <input type="email" id="email" required 
                               class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                               placeholder="nhatanh0591@gmail.com"
                               value="${savedEmail}">
                    </div>
                    
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-2">Mật khẩu</label>
                        <input type="password" id="password" required
                               class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                               placeholder="Nhập mật khẩu">
                    </div>
                    
                    <div class="flex items-center">
                        <input type="checkbox" id="remember-me" checked
                               class="w-4 h-4 text-green-600 border-gray-300 rounded focus:ring-green-500">
                        <label for="remember-me" class="ml-2 text-sm text-gray-700">
                            Ghi nhớ đăng nhập trên thiết bị này
                        </label>
                    </div>
                    
                    <button type="submit" id="login-btn"
                            class="w-full bg-green-600 text-white py-3 rounded-lg font-semibold hover:bg-green-700 transition-colors">
                        Đăng nhập
                    </button>
                </form>
                
                <div id="login-error" class="mt-4 text-red-600 text-sm hidden"></div>
            </div>
        </div>
    `;

    // Xử lý form đăng nhập
    document.getElementById('login-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;
        const rememberMe = document.getElementById('remember-me').checked;
        const loginBtn = document.getElementById('login-btn');
        const errorEl = document.getElementById('login-error');
        
        try {
            loginBtn.textContent = 'Đang đăng nhập...';
            loginBtn.disabled = true;
            errorEl.classList.add('hidden');
            
            await loginAdmin(email, password, rememberMe);
            
        } catch (error) {
            errorEl.textContent = error.message;
            errorEl.classList.remove('hidden');
        } finally {
            loginBtn.textContent = 'Đăng nhập';
            loginBtn.disabled = false;
        }
    });
}

/**
 * Hiển thị ứng dụng chính
 */
function showMainApp() {
    // App sẽ hiển thị bình thường, không cần sessionStorage
    console.log("✅ Hiển thị app chính");
}

/**
 * Cập nhật thông tin user ở header và thêm chức năng đăng xuất
 */
export function addLogoutButton() {
    // Tìm phần user-info trong header
    const userInfoDiv = document.querySelector('.user-info');
    if (!userInfoDiv) return;
    
    const userRole = getCurrentUserRole();
    if (!userRole) return;
    
    // Cập nhật tên user
    const userNameSpan = userInfoDiv.querySelector('span');
    if (userNameSpan) {
        if (userRole.role === 'admin') {
            userNameSpan.textContent = 'Đặng Nhật Anh';
        } else if (userRole.role === 'viewer') {
            userNameSpan.textContent = 'Quản lý';
        } else {
            userNameSpan.textContent = getUserDisplayName();
        }
    }
    
    // Thay đổi avatar thành icon logout
    const avatarImg = userInfoDiv.querySelector('img');
    if (avatarImg) {
        // Tạo div chứa icon logout
        const logoutIcon = document.createElement('div');
        logoutIcon.className = 'w-10 h-10 bg-red-500 hover:bg-red-600 rounded-full flex items-center justify-center cursor-pointer transition-colors';
        logoutIcon.innerHTML = `
            <svg class="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
                <path fill-rule="evenodd" d="M3 3a1 1 0 00-1 1v12a1 1 0 102 0V4a1 1 0 00-1-1zm10.293 9.293a1 1 0 001.414 1.414l3-3a1 1 0 000-1.414l-3-3a1 1 0 10-1.414 1.414L14.586 9H7a1 1 0 100 2h7.586l-1.293 1.293z" clip-rule="evenodd"></path>
            </svg>
        `;
        logoutIcon.title = 'Đăng xuất';
        
        // Thay thế avatar bằng icon logout
        avatarImg.replaceWith(logoutIcon);
        
        // Thêm sự kiện click cho icon logout
        logoutIcon.addEventListener('click', async (e) => {
            e.stopPropagation(); // Ngăn event bubble
            if (confirm('Bạn có chắc muốn đăng xuất?')) {
                try {
                    await signOut(auth);
                    currentUser = null;
                    sessionStorage.removeItem('appLoaded');
                    window.location.reload();
                } catch (error) {
                    console.error("Lỗi đăng xuất:", error);
                    sessionStorage.removeItem('appLoaded');
                    window.location.reload();
                }
            }
        });
    }
    
    // Thêm hiệu ứng hover cho phần tên
    userNameSpan.style.cursor = 'pointer';
    userNameSpan.style.transition = 'color 0.3s';
    userNameSpan.addEventListener('mouseenter', () => {
        userNameSpan.style.color = '#dc2626'; // text-red-600
    });
    userNameSpan.addEventListener('mouseleave', () => {
        userNameSpan.style.color = ''; // reset về màu gốc
    });
}

/**
 * Kiểm tra quyền truy cập
 */
export function checkAuth() {
    const isLoggedIn = localStorage.getItem('adminLoggedIn');
    const adminEmail = localStorage.getItem('adminEmail');
    
    if (!isLoggedIn || !adminEmail) {
        showLoginForm();
        return false;
    }
    
    return true;
}

/**
 * Lấy thông tin user hiện tại
 */
export function getCurrentUser() {
    return currentUser;
}

/**
 * Lấy thông tin role của user hiện tại
 */
export function getCurrentUserRole() {
    // 🔥 SỬA: Nếu currentUser null (PWA mode), fallback sang localStorage
    let email = null;
    
    if (currentUser && currentUser.email) {
        email = currentUser.email;
    } else {
        // Fallback: lấy từ localStorage
        const savedEmail = localStorage.getItem('n-home-user-email');
        const isLoggedIn = localStorage.getItem('n-home-logged-in');
        
        if (isLoggedIn && savedEmail) {
            email = savedEmail;
            console.log('⚠️ getCurrentUserRole: Fallback to localStorage:', savedEmail);
        }
    }
    
    if (!email) return null;
    return USER_ROLES[email] || null;
}

/**
 * Kiểm tra quyền truy cập module
 */
export function hasPermission(module, action = 'view') {
    const userRole = getCurrentUserRole();
    if (!userRole || !userRole.role) return false;
    
    const permissions = PERMISSIONS[userRole.role];
    if (!permissions) return false;
    
    const modulePermission = permissions[module];
    if (modulePermission === false) return false;
    if (modulePermission === true) return true;
    if (typeof modulePermission === 'object') {
        return modulePermission[action] === true;
    }
    
    return false;
}

/**
 * Kiểm tra có phải admin không
 */
export function isAdmin() {
    const userRole = getCurrentUserRole();
    return userRole && userRole.role === 'admin';
}

/**
 * Lấy tên hiển thị của user
 */
export function getUserDisplayName() {
    const userRole = getCurrentUserRole();
    return userRole ? userRole.name : 'User';
}

/**
 * Ẩn các menu không có quyền truy cập
 */
export function hideUnauthorizedMenus() {
    console.log("🔍 BẮT ĐẦU hideUnauthorizedMenus");
    
    // ĐẢNG BẢO LOGO N-HOME LUÔN HIỂN THỊ TRƯỚC
    const logoDiv = document.querySelector('aside .bg-green-600');
    const sidebar = document.querySelector('aside');
    
    console.log("🔍 Logo div found:", !!logoDiv);
    console.log("🔍 Sidebar found:", !!sidebar);
    
    if (logoDiv) {
        logoDiv.style.cssText = 'display: block !important; visibility: visible !important; opacity: 1 !important; position: relative !important; z-index: 999 !important;';
        console.log("✅ Logo N-Home được force hiển thị với cssText");
    } else {
        console.log("❌ KHÔNG TÌM THẤY LOGO N-HOME!");
        // Thử tìm bằng ID
        const logoById = document.getElementById('n-home-logo');
        if (logoById) {
            logoById.style.cssText = 'display: block !important; visibility: visible !important; opacity: 1 !important; position: relative !important; z-index: 999 !important;';
            console.log("✅ Logo N-Home được tìm thấy bằng ID và force hiển thị");
        }
    }
    
    if (sidebar) {
        sidebar.style.display = 'block !important';
        sidebar.style.visibility = 'visible !important';
        console.log("✅ Sidebar được force hiển thị");
    } else {
        console.log("❌ KHÔNG TÌM THẤY SIDEBAR!");
    }

    const userRole = getCurrentUserRole();
    if (!userRole) {
        console.log("❌ Không có userRole");
        return;
    }
    
    console.log("🔍 User role:", userRole.role);

    // CHỈ ẨN MENU CỤ THỂ CHO VIEWER
    if (userRole.role === 'viewer') {
        console.log("🔍 Đang ẩn menu cho viewer...");
        
        // Dashboard được phép cho viewer
        const dashboardBtn = document.getElementById('dashboard-btn');
        if (dashboardBtn) {
            dashboardBtn.style.display = 'block';
            console.log("✅ Dashboard được hiển thị cho viewer");
        }
        
        // Ẩn toàn bộ menu "Danh mục dữ liệu" 
        const dataMenuContainer = document.querySelector('.dropdown-menu:first-of-type');
        if (dataMenuContainer) {
            dataMenuContainer.style.display = 'none';
            console.log("✅ Đã ẩn menu Danh mục dữ liệu");
        }
        
        // Ẩn menu "Hợp đồng thuê" (id="contracts-btn")
        const contractsBtn = document.getElementById('contracts-btn');
        if (contractsBtn) {
            contractsBtn.style.display = 'none';
            console.log("✅ Đã ẩn menu Hợp đồng thuê");
        }
        
        // Ẩn menu "Thu chi" (id="finance-btn") 
        const financeBtn = document.getElementById('finance-btn');
        if (financeBtn) {
            financeBtn.style.display = 'none';
            console.log("✅ Đã ẩn menu Thu chi");
        } else {
            console.log("❌ KHÔNG TÌM THẤY menu Thu chi (finance-btn)!");
        }
        
        // Ẩn notifications và reports
        const notificationBtn = document.getElementById('notifications-btn');
        const reportBtn = document.getElementById('reports-btn');
        if (notificationBtn) {
            notificationBtn.style.display = 'none';
            console.log("✅ Đã ẩn notifications");
        }
        if (reportBtn) {
            reportBtn.style.display = 'none';
            console.log("✅ Đã ẩn reports");
        }
        
        console.log("✅ Đã ẩn tất cả menu cho viewer");
    }

    console.log('🔍 Hoàn tất hideUnauthorizedMenus cho role:', userRole.role);
}

/**
 * Ẩn các nút action (thêm/sửa/xóa) dựa trên quyền
 */
export function hideActionButtons(module) {
    try {
        const userRole = getCurrentUserRole();
        if (!userRole) return;
        
        // Nếu là admin thì hiển thị tất cả
        if (userRole.role === 'admin') return;
    
    // Nếu là viewer, ẩn hầu hết mọi thứ trừ xem và tải file mẫu
    if (userRole.role === 'viewer') {
        // TRƯỚC TIÊN: BẢO VỆ LOGO N-HOME
        const logoElement = document.getElementById('n-home-logo') || document.querySelector('aside .bg-green-600');
        if (logoElement && logoElement.textContent?.includes('N-Home')) {
            logoElement.style.cssText = 'display: block !important; visibility: visible !important; opacity: 1 !important; position: relative !important; z-index: 9999 !important;';
            console.log("🛡️ LOGO N-HOME ĐÃ ĐƯỢC BẢO VỆ!");
        }
        
        // Ẩn tất cả nút thêm (màu xanh lá) - NHƯNG KHÔNG ẢNH HƯỞNG LOGO VÀ NÚT THÊM TASK
        const addButtons = document.querySelectorAll('.bg-green-500, .bg-green-600, [title*="Thêm"], [title*="thêm"]');
        addButtons.forEach(btn => {
            // LOẠI TRỪ LOGO N-HOME VÀ NÚT THÊM TASK
            const isLogo = btn.id === 'n-home-logo' || 
                           btn.textContent?.trim() === 'N-Home' ||
                           (btn.classList.contains('bg-green-600') && btn.textContent?.includes('N-Home'));
            
            const isAddTaskBtn = btn.id === 'add-task-btn' || btn.textContent?.includes('Thêm sự cố');
            
            if (!isLogo && !isAddTaskBtn && (btn.textContent.includes('+') || btn.title?.includes('Thêm') || btn.title?.includes('thêm'))) {
                btn.style.display = 'none';
                console.log("🚫 Đã ẩn nút:", btn.textContent || btn.title);
            }
        });
        
        // Ẩn tất cả nút sửa (màu xám)  
        const editButtons = document.querySelectorAll('.bg-gray-500, .bg-gray-600, [title="Sửa"], [title*="sửa"], .edit-customer-btn');
        editButtons.forEach(btn => btn.style.display = 'none');
        
        // Ẩn tất cả nút xóa (màu đỏ) - NHƯNG KHÔNG ẩn nút đăng xuất và KHÔNG ẩn status badge
        const deleteButtons = document.querySelectorAll('.bg-red-500, .bg-red-600, [title="Xóa"], [title*="xóa"], .delete-customer-btn');
        deleteButtons.forEach(btn => {
            // Kiểm tra xem có phải nút đăng xuất không (có icon logout)
            const isLogoutButton = btn.innerHTML.includes('M3 3a1 1 0') || // SVG logout path
                                   btn.classList.contains('user-info') ||
                                   btn.closest('.user-info');
            
            // CHỈ ẨN NẾU LÀ BUTTON hoặc có onclick (KHÔNG ẨN span/badge status)
            const isButton = btn.tagName === 'BUTTON' || btn.hasAttribute('onclick') || btn.classList.contains('delete-customer-btn');
            
            if (!isLogoutButton && isButton) {
                btn.style.display = 'none';
            }
        });
        
        // Ẩn các nút bulk actions
        const bulkButtons = document.querySelectorAll(
            '#bulk-delete-customers-btn, #bulk-delete-bills-btn, #bulk-delete-tasks-btn, ' +
            '[id*="bulk-"], [class*="bulk-"], [title*="Xóa hàng loạt"], [title*="bulk"]'
        );
        bulkButtons.forEach(btn => btn.style.display = 'none');
        
        // Xử lý các nút import/export theo module
        if (module === 'bills') {
            // Hóa đơn: GIỮ nút import, ẨN nút export
            const exportBtn = document.getElementById('export-bills-btn');
            if (exportBtn) exportBtn.style.display = 'none';
            
            // GIỮ NGUYÊN nút import - không ẩn gì cả!
            const importBtn = document.getElementById('import-bills-btn');
            if (importBtn) {
                importBtn.style.display = 'flex'; // Đảm bảo hiển thị
                importBtn.style.visibility = 'visible';
            }
            
            // Ẩn phần upload trong modal import bills bằng CSS
            const styleElement = document.createElement('style');
            styleElement.id = 'hide-upload-for-viewer';
            styleElement.textContent = `
                #import-bills-modal .border-dashed,
                #import-bills-file,
                #submit-import-bills-btn,
                #cancel-import-bills-btn {
                    display: none !important;
                }
            `;
            document.head.appendChild(styleElement);
            
            // Ẩn heading "UPLOAD DỮ LIỆU" bằng JavaScript
            setTimeout(() => {
                const headings = document.querySelectorAll('#import-bills-modal h4');
                headings.forEach(h => {
                    if (h.textContent.includes('UPLOAD')) {
                        h.style.display = 'none';
                    }
                });
            }, 500);
            
        } else {
            // Các module khác: ẩn tất cả nút import/export 
            const importExportButtons = document.querySelectorAll(
                '[title*="Import"], [title*="Export"], [title*="Nhập"], [title*="Xuất"]'
            );
            importExportButtons.forEach(btn => btn.style.display = 'none');
        }
        
        // Ẩn nút duyệt hóa đơn và các nút thao tác khác trong bills
        if (module === 'bills') {
            // Ẩn nút Duyệt/Bỏ duyệt (cả desktop và mobile)
            const approveButtons = document.querySelectorAll(
                '[title*="Duyệt"], [title*="duyệt"], ' +
                '.toggle-bill-approve-btn, ' +
                'button:has(svg):not(.toggle-bill-status-btn):not(.edit-bill-btn):not(.delete-bill-btn)'
            );
            approveButtons.forEach(btn => {
                if (btn.classList.contains('toggle-bill-approve-btn') || 
                    btn.title?.includes('Duyệt') || 
                    btn.title?.includes('duyệt') ||
                    btn.textContent?.includes('Duyệt') ||
                    btn.textContent?.includes('Bỏ duyệt')) {
                    btn.style.display = 'none';
                }
            });
            
            // Ẩn nút Thu tiền/Đã thu (cả desktop và mobile)
            const collectButtons = document.querySelectorAll('.toggle-bill-status-btn');
            collectButtons.forEach(btn => btn.style.display = 'none');
            
            // Ẩn phần mobile-card-actions hoàn toàn
            const mobileCardActions = document.querySelectorAll('.mobile-card-actions');
            mobileCardActions.forEach(actions => actions.style.display = 'none');
            
            // Ẩn các nút bulk actions cho bills
            const billBulkButtons = document.querySelectorAll(
                '#bulk-approve-bills-btn, #bulk-unapprove-bills-btn, ' +
                '#bulk-collect-bills-btn, #bulk-uncollect-bills-btn'
            );
            billBulkButtons.forEach(btn => btn.style.display = 'none');
        }
        
        // ẨN NÚT NGHIỆM THU TRONG TASKS CHO MANAGER (KHÔNG ẨN NÚT BÁNH RĂNG)
        // Chỉ ẩn nút có onclick="toggleTaskApproval" - KHÔNG phải toggleTaskStatus
        setTimeout(() => {
            // Tìm tất cả button trong tasks section
            const tasksSection = document.getElementById('tasks-section');
            if (tasksSection) {
                const allTaskButtons = tasksSection.querySelectorAll('button[onclick]');
                allTaskButtons.forEach(btn => {
                    const onclickAttr = btn.getAttribute('onclick');
                    // CHỈ ẨN nút nghiệm thu, KHÔNG ẨN nút bánh răng (toggleTaskStatus)
                    if (onclickAttr && onclickAttr.includes('toggleTaskApproval')) {
                        btn.style.display = 'none';
                        console.log('🚫 ẨN NÚT NGHIỆM THU');
                    } else if (onclickAttr && onclickAttr.includes('toggleTaskStatus')) {
                        btn.style.display = ''; // Đảm bảo nút bánh răng luôn hiện
                        console.log('✅ GIỮ NÚT BÁNH RĂNG');
                    }
                });
                
                // ẨN CHECKBOX TRONG TASKS CHO VIEWER (quanly@gmail.com)
                // Ẩn checkbox header "select-all-tasks"
                const selectAllTasksCheckbox = document.getElementById('select-all-tasks');
                if (selectAllTasksCheckbox) {
                    const headerCell = selectAllTasksCheckbox.closest('th');
                    if (headerCell) {
                        headerCell.style.display = 'none';
                    }
                }
                
                // Ẩn tất cả checkbox trong desktop table rows
                const taskCheckboxes = tasksSection.querySelectorAll('.task-checkbox');
                taskCheckboxes.forEach(cb => {
                    const cell = cb.closest('td');
                    if (cell) {
                        cell.style.display = 'none';
                    }
                });
                
                // Ẩn tất cả checkbox trong mobile cards
                const mobileCheckboxContainers = tasksSection.querySelectorAll('.task-checkbox-mobile');
                mobileCheckboxContainers.forEach(cb => {
                    const container = cb.closest('.flex.items-center.gap-3');
                    if (container && container.classList.contains('border-b')) {
                        container.style.display = 'none';
                    }
                });
            }
        }, 100); // Giảm delay
        
        // Ẩn checkbox "Chọn tất cả" (trừ tasks)
        const selectAllCheckboxes = document.querySelectorAll('#select-all-customers, #select-all-bills, [id*="select-all"]:not(#select-all-tasks)');
        selectAllCheckboxes.forEach(cb => cb.style.display = 'none');
        
        // Ẩn các checkbox trong từng row (trừ tasks để manager có thể chọn tasks)
        const rowCheckboxes = document.querySelectorAll('.customer-checkbox, .bill-checkbox');
        rowCheckboxes.forEach(cb => cb.style.display = 'none');
        
        // Sẽ ẩn phần upload khi modal được mở (xử lý trong event listener)
        
        // Ẩn cột "Thao tác" header và toàn bộ cột (trừ tasks table)
        const tables = document.querySelectorAll('table');
        tables.forEach(table => {
            // Bỏ qua tasks table - manager được phép thao tác tasks
            if (table.closest('#tasks-section')) return;
            
            const headers = table.querySelectorAll('th');
            headers.forEach((th, index) => {
                if (th.textContent?.includes('Thao tác') || th.textContent?.includes('Action')) {
                    // Ẩn header
                    th.style.display = 'none';
                    
                    // Ẩn tất cả cell trong cột đó
                    const rows = table.querySelectorAll('tr');
                    rows.forEach(row => {
                        const cells = row.querySelectorAll('td, th');
                        if (cells[index]) {
                            cells[index].style.display = 'none';
                        }
                    });
                }
            });
        });
    }
    } catch (error) {
        console.error('Lỗi khi ẩn nút action:', error);
    }
}

// Expose function to window for global access
window.hideActionButtons = hideActionButtons;

/**
 * Ẩn phần upload trong modal import (chỉ giữ phần tải file mẫu)
 */
export function hideUploadSectionInModal(modalId) {
    const userRole = getCurrentUserRole();
    if (!userRole || userRole.role !== 'viewer') return;
    
    setTimeout(() => {
        const modal = document.getElementById(modalId);
        if (!modal) return;
        
        // Ẩn section "2. UPLOAD DỮ LIỆU"
        const sections = modal.querySelectorAll('.border');
        sections.forEach(section => {
            const heading = section.querySelector('h4');
            if (heading && (heading.textContent.includes('UPLOAD') || heading.textContent.includes('2.'))) {
                section.style.display = 'none';
            }
        });
        
        // Ẩn nút "Nhập dữ liệu"
        const submitBtn = modal.querySelector('[id*="submit-import"]');
        if (submitBtn) {
            submitBtn.style.display = 'none';
        }
    }, 100);
}

// Expose to window
window.hideUploadSectionInModal = hideUploadSectionInModal;