// js/modules/notifications.js

import { db, collection, query, where, getDocs, orderBy, onSnapshot, addDoc, setDoc, doc, deleteDoc, serverTimestamp, updateDoc } from '../firebase.js';
import { getCustomers, getTasks, getNotifications, getBuildings, getState, saveToCache, updateInLocalStorage, deleteFromLocalStorage } from '../store.js';
import { showToast, formatDate, formatTime, showConfirm, safeToDate } from '../utils.js';

// --- BIẾN CỤC BỘ CHO MODULE ---
let notificationsCache = [];
let notificationsCache_filtered = [];
const selectedMobileNotificationIds = new Set();

// Pagination variables
const ITEMS_PER_PAGE = 20;
let currentNotificationsPage = 1;

// --- DOM ELEMENTS ---
const notificationsSection = document.getElementById('notifications-section');
const notificationsListEl = document.getElementById('notifications-list');

// Filters
const buildingFilterEl = document.getElementById('notification-building-filter');
const roomFilterEl = document.getElementById('notification-room-filter');
const customerFilterEl = document.getElementById('notification-customer-filter');
const typeFilterEl = document.getElementById('notification-type-filter');
const statusFilterEl = document.getElementById('notification-status-filter');
const searchEl = document.getElementById('notification-search');
const selectAllCheckbox = document.getElementById('select-all-notifications');

// Badge
const notificationBadge = document.getElementById('notification-badge');

// Bulk buttons
const bulkDeleteNotificationsBtn = document.getElementById('bulk-delete-notifications-btn');
const markAllReadBtn = document.getElementById('mark-all-read-btn');

// --- HÀM CHÍNH ---

/**
 * Hàm khởi tạo, được gọi 1 lần duy nhất từ main.js
 */
export function initNotifications() {
    // Lắng nghe sự kiện click
    document.body.addEventListener('click', handleBodyClick);
    
    // Lắng nghe sự kiện lọc
    [buildingFilterEl, roomFilterEl, customerFilterEl, typeFilterEl, statusFilterEl, searchEl].forEach(el => {
        el?.addEventListener('input', applyNotificationFilters);
    });
    
    // Lắng nghe sự thay đổi của building filter để cập nhật room filter
    buildingFilterEl?.addEventListener('change', handleBuildingFilterChange);
    
    // Lắng nghe sự thay đổi của room filter để cập nhật customer filter
    roomFilterEl?.addEventListener('change', handleRoomFilterChange);

    // Lắng nghe select all
    selectAllCheckbox?.addEventListener('change', (e) => {
        document.querySelectorAll('.notification-checkbox').forEach(cb => {
            cb.checked = e.target.checked;
        });
    });

    // Lắng nghe mobile checkboxes
    document.addEventListener('click', (e) => {
        if (e.target.classList.contains('notification-checkbox-mobile')) {
            const notificationId = e.target.dataset.id;
            if (e.target.checked) {
                selectedMobileNotificationIds.add(notificationId);
            } else {
                selectedMobileNotificationIds.delete(notificationId);
            }
            updateClearSelectionButton();
        }
    });

    // Lắng nghe nút bỏ chọn
    const clearSelectionBtn = document.getElementById('clear-selection-notifications-btn');
    clearSelectionBtn?.addEventListener('click', () => {
        selectedMobileNotificationIds.clear();
        document.querySelectorAll('.notification-checkbox-mobile').forEach(cb => cb.checked = false);
        updateClearSelectionButton();
        showToast('Đã bỏ chọn tất cả');
    });

    // Setup real-time listeners để nhận thông báo từ app
    setupRealtimeListeners();
    
    // Initial load notifications
    loadNotifications();
}

/**
 * Tải và hiển thị thông báo
 */
export function loadNotifications() {
    if (notificationsSection?.classList.contains('hidden')) return;
    
    // Load dữ liệu mới từ store
    notificationsCache = getNotifications();
    
    // Load filter options khi section được hiển thị
    loadNotificationFilterOptions();
    
    applyNotificationFilters();
    updateNotificationBadge();
}

/**
 * Populate dropdown loại thông báo dựa trên dữ liệu thực tế
 */
function populateNotificationTypeFilter() {
    if (!typeFilterEl) return;

    // Lấy tất cả các loại thông báo duy nhất từ cache
    const uniqueTypes = [...new Set(notificationsCache.map(n => n.type))].filter(type => type);
    
    // 🎯 Sử dụng tiêu đề thực tế từ database để mapping
    const typeDisplayNames = {};
    
    // Tạo mapping từ dữ liệu thực tế
    notificationsCache.forEach(notification => {
        if (notification.type && notification.title) {
            // Lấy phần đầu của title làm tên loại (trước dấu "-" hoặc toàn bộ nếu ngắn)
            let displayName = notification.title;
            
            // Trích xuất tên loại từ title
            if (notification.title.includes('Thu tiền')) {
                displayName = 'Thu tiền thành công';
            } else if (notification.title.includes('Thông báo hóa đơn')) {
                displayName = 'Thông báo hóa đơn';
            } else if (notification.title.includes('Sự cố')) {
                displayName = 'Sự cố/Công việc';
            } else {
                // Lấy 3-4 từ đầu của title
                const words = notification.title.split(' ');
                displayName = words.slice(0, Math.min(3, words.length)).join(' ');
            }
            
            typeDisplayNames[notification.type] = displayName;
        }
    });
    
    // Fallback mapping cho những loại chưa có
    const fallbackNames = {
        'payment_collected': 'Thu tiền thành công',
        'bill_approved': 'Thông báo hóa đơn',
        'new_task': 'Sự cố mới', 
        'task_completed': 'Sự cố hoàn thành',
        'bill_created': 'Hóa đơn mới',
        'bill_overdue': 'Hóa đơn quá hạn',
        'system': 'Hệ thống',
        'maintenance': 'Bảo trì',
        'reminder': 'Nhắc nhở'
    };

    // Lưu giá trị hiện tại
    const currentValue = typeFilterEl.value;

    // Xóa các option hiện tại (trừ "Tất cả loại")
    typeFilterEl.innerHTML = '<option value="all">Tất cả loại</option>';

    // Thêm các loại từ dữ liệu thực tế
    uniqueTypes.sort().forEach(type => {
        const option = document.createElement('option');
        option.value = type;
        // Ưu tiên tên từ dữ liệu thực tế, fallback về mapping mặc định
        option.textContent = typeDisplayNames[type] || fallbackNames[type] || type;
        typeFilterEl.appendChild(option);
    });

    // Khôi phục giá trị đã chọn (nếu còn tồn tại)
    typeFilterEl.value = currentValue;
}

/**
 * Load filter options giống bills.js
 */
function loadNotificationFilterOptions() {
    if (!buildingFilterEl) return;
    
    const buildings = getBuildings();
    const currentBuilding = buildingFilterEl.value;
    
    // Populate type filter
    populateNotificationTypeFilter();
    
    // Populate building filter
    buildingFilterEl.innerHTML = '<option value="all">Tất cả tòa nhà</option>';
    buildings.forEach(building => {
        buildingFilterEl.innerHTML += `<option value="${building.id}">${building.code}</option>`;
    });
    buildingFilterEl.value = currentBuilding;
    
    // Cập nhật phòng
    handleBuildingFilterChange();
}

/**
 * Xử lý khi thay đổi bộ lọc Tòa nhà
 */
function handleBuildingFilterChange() {
    currentNotificationsPage = 1;
    updateRoomFilterOptions();
    applyNotificationFilters();
}

/**
 * Xử lý khi thay đổi bộ lọc Phòng
 */
function handleRoomFilterChange() {
    currentNotificationsPage = 1;
    updateCustomerFilterOptions();
    applyNotificationFilters();
}

/**
 * Populate dropdown tòa nhà dựa trên dữ liệu thông báo
 */
function populateBuildingFilter() {
    if (!buildingFilterEl) return;
    
    const buildings = getBuildings();
    const currentValue = buildingFilterEl.value;
    
    // Xóa các option hiện tại
    buildingFilterEl.innerHTML = '<option value="all">Tất cả tòa nhà</option>';
    
    // Lấy danh sách tòa nhà có thông báo
    const buildingsWithNotifications = new Set();
    notificationsCache.forEach(notification => {
        if (notification.buildingId) {
            buildingsWithNotifications.add(notification.buildingId);
        }
    });
    
    // Thêm các tòa nhà từ dữ liệu
    buildings.forEach(building => {
        if (buildingsWithNotifications.has(building.id)) {
            const option = document.createElement('option');
            option.value = building.id;
            option.textContent = building.code || building.name || building.id;
            buildingFilterEl.appendChild(option);
        }
    });
    
    // Khôi phục giá trị đã chọn
    buildingFilterEl.value = currentValue;
}

/**
 * Cập nhật dropdown phòng dựa trên tòa nhà đã chọn
 */
function updateRoomFilterOptions() {
    if (!roomFilterEl) return;
    
    const selectedBuildingId = buildingFilterEl?.value || 'all';
    const currentRoom = roomFilterEl.value;
    
    // Xóa các option hiện tại
    roomFilterEl.innerHTML = '<option value="all">Tất cả phòng</option>';
    
    let rooms = [];
    if (selectedBuildingId !== 'all') {
        // Lọc theo tòa nhà đã chọn
        rooms = [...new Set(notificationsCache
            .filter(n => n.buildingId === selectedBuildingId && n.room)
            .map(n => n.room))].sort();
    } else {
        // Lấy tất cả phòng từ thông báo
        rooms = [...new Set(notificationsCache
            .filter(n => n.room)
            .map(n => n.room))].sort();
    }
    
    // Thêm các phòng
    rooms.forEach(room => {
        const option = document.createElement('option');
        option.value = room;
        option.textContent = room;
        roomFilterEl.appendChild(option);
    });
    
    // Khôi phục giá trị đã chọn (nếu còn tồn tại)
    roomFilterEl.value = currentRoom;
}

/**
 * Cập nhật dropdown khách hàng dựa trên phòng đã chọn
 */
function updateCustomerFilterOptions() {
    if (!customerFilterEl) return;
    
    const selectedBuildingId = buildingFilterEl?.value || 'all';
    const selectedRoom = roomFilterEl?.value || 'all';
    const currentCustomer = customerFilterEl.value;
    
    // Xóa các option hiện tại
    customerFilterEl.innerHTML = '<option value="all">Tất cả khách hàng</option>';
    
    // Lấy danh sách customer IDs từ thông báo đã lọc
    let customerIds = [];
    if (selectedBuildingId !== 'all' && selectedRoom !== 'all') {
        // Lọc theo cả tòa nhà và phòng
        customerIds = [...new Set(notificationsCache
            .filter(n => n.buildingId === selectedBuildingId && n.room === selectedRoom && n.customerId)
            .map(n => n.customerId))];
    } else if (selectedBuildingId !== 'all') {
        // Chỉ lọc theo tòa nhà
        customerIds = [...new Set(notificationsCache
            .filter(n => n.buildingId === selectedBuildingId && n.customerId)
            .map(n => n.customerId))];
    } else {
        // Lấy tất cả khách hàng có thông báo
        customerIds = [...new Set(notificationsCache
            .filter(n => n.customerId)
            .map(n => n.customerId))];
    }
    
    // Lấy thông tin khách hàng và thêm vào dropdown
    const customers = getCustomers();
    customerIds.forEach(customerId => {
        const customer = customers.find(c => c.id === customerId);
        if (customer) {
            const option = document.createElement('option');
            option.value = customer.id;
            option.textContent = customer.name || customer.phone || customer.id;
            customerFilterEl.appendChild(option);
        }
    });
    
    // Khôi phục giá trị đã chọn (nếu còn tồn tại)
    customerFilterEl.value = currentCustomer;
}

/**
 * KHÔNG setup real-time listeners - chỉ dùng localStorage
 */
function setupRealtimeListeners() {
    // DISABLED - không tự động load từ Firebase
    console.log('🚫 Real-time listeners DISABLED - chỉ dùng localStorage');
}

/**
 * 🔄 Refresh notifications table từ cache (không reload Firebase)
 */
function refreshNotificationsFromCache() {
    try {
        // Lấy giá trị bộ lọc hiện tại
        const type = typeFilterEl?.value || 'all';
        const status = statusFilterEl?.value || 'all';
        const search = searchEl?.value.toLowerCase() || '';

        // Lọc từ cache hiện có
        notificationsCache_filtered = notificationsCache.filter(notification => {
            if (type !== 'all' && notification.type !== type) return false;
            if (status === 'read' && !notification.isRead) return false;
            if (status === 'unread' && notification.isRead) return false;
            
            if (search) {
                return (
                    notification.title?.toLowerCase().includes(search) ||
                    notification.message?.toLowerCase().includes(search)
                );
            }
            return true;
        });

        // Reset về trang đầu và render
        currentNotificationsPage = 1;
        renderNotificationsTable();
        
    } catch (error) {
        console.error('Error refreshing notifications from cache:', error);
    }
}

// 🧪 TEST FUNCTION - Có thể xóa sau khi test xong
window.testNotificationUpdate = function() {
    console.log('🧪 Testing notification real-time update...');
    const testData = {
        type: 'new_task',
        title: 'Test notification từ console',
        message: 'Đây là test notification để kiểm tra real-time update',
        customerId: 'test-customer',
        relatedId: 'test-task',
        relatedType: 'task',
        priority: 'high'
    };
    
    createNotification(testData);
    console.log('✅ Test notification created - check if table updates automatically');
};

/**
 * Tạo thông báo mới
 */
async function createNotification(notificationData) {
    try {
        const notification = {
            ...notificationData,
            read: false,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        };

        // Tạo collection 'adminNotifications' riêng cho web admin
        const docRef = await addDoc(collection(db, 'adminNotifications'), notification);
        
        console.log('📢 Created notification for admin:', docRef.id);
        
        // Cập nhật badge và danh sách
        loadNotifications();
        
        return docRef.id;
    } catch (error) {
        console.error('Error creating notification:', error);
    }
}

/**
 * Áp dụng bộ lọc và render
 */
async function applyNotificationFilters() {
    try {
        // Dùng data từ store thay vì Firebase
        notificationsCache = getNotifications();

        // Lưu ý: Các dropdown đã được populate trong loadNotifications()

        // Lấy giá trị bộ lọc
        const buildingId = buildingFilterEl?.value || 'all';
        const room = roomFilterEl?.value || 'all';
        const customerId = customerFilterEl?.value || 'all';
        const type = typeFilterEl?.value || 'all';
        const status = statusFilterEl?.value || 'all';
        const search = searchEl?.value.toLowerCase() || '';

        // Lọc
        notificationsCache_filtered = notificationsCache.filter(notification => {
            // Lọc theo tòa nhà
            if (buildingId !== 'all' && notification.buildingId !== buildingId) return false;
            
            // Lọc theo phòng
            if (room !== 'all' && notification.room !== room) return false;
            
            // Lọc theo khách hàng
            if (customerId !== 'all' && notification.customerId !== customerId) return false;
            
            // Lọc theo loại thông báo
            if (type !== 'all' && notification.type !== type) return false;
            
            // Lọc theo trạng thái
            if (status === 'read' && !notification.isRead) return false;
            if (status === 'unread' && notification.isRead) return false;
            
            // Lọc theo tìm kiếm
            if (search) {
                return (
                    notification.title?.toLowerCase().includes(search) ||
                    notification.message?.toLowerCase().includes(search)
                );
            }
            return true;
        });

        // Reset về trang đầu khi filter thay đổi
        currentNotificationsPage = 1;

        // Sắp xếp theo thời gian mới nhất lên đầu
        notificationsCache_filtered.sort((a, b) => {
            const timeA = safeToDate(a.createdAt);
            const timeB = safeToDate(b.createdAt);
            return timeB - timeA; // Mới nhất lên đầu
        });

        renderNotificationsTable();
        updateNotificationBadge();
    } catch (error) {
        console.error('Error loading notifications:', error);
        showToast('Lỗi tải thông báo: ' + error.message, 'error');
    }
}

/**
 * Hiển thị bảng thông báo
 */
function renderNotificationsTable() {
    notificationsListEl.innerHTML = '';
    const notificationsMobileListEl = document.getElementById('notifications-mobile-list');
    if (notificationsMobileListEl) notificationsMobileListEl.innerHTML = '';

    if (notificationsCache_filtered.length === 0) {
        notificationsListEl.innerHTML = '<tr><td colspan="9" class="p-8 text-center text-gray-500">Không có thông báo nào.</td></tr>';
        if (notificationsMobileListEl) {
            notificationsMobileListEl.innerHTML = '<div class="p-8 text-center text-gray-500">Không có thông báo nào.</div>';
        }
        // Ẩn pagination khi không có dữ liệu
        const paginationEl = document.getElementById('notifications-pagination');
        if (paginationEl) {
            paginationEl.innerHTML = '';
        }
        return;
    }

    // Tính toán phân trang
    const totalItems = notificationsCache_filtered.length;
    const startIndex = (currentNotificationsPage - 1) * ITEMS_PER_PAGE;
    const endIndex = startIndex + ITEMS_PER_PAGE;
    const currentNotifications = notificationsCache_filtered.slice(startIndex, endIndex);

    const customers = getCustomers();

    // Render desktop table
    const buildings = getBuildings();
    
    currentNotifications.forEach(notification => {
        const customer = customers.find(c => c.id === notification.customerId);
        const building = buildings.find(b => b.id === notification.buildingId);
        const isUnread = !notification.isRead;

        const tr = document.createElement('tr');
        tr.className = `border-b hover:bg-gray-50 ${isUnread ? 'bg-blue-50 border-blue-200' : 'bg-gray-50 border-gray-200'}`;
        tr.setAttribute('data-notification-id', notification.id);
        tr.innerHTML = `
            <td class="py-4 px-4">
                <input type="checkbox" class="notification-checkbox w-4 h-4 cursor-pointer" data-id="${notification.id}">
            </td>
            <td class="py-4 px-4">
                <div class="flex gap-2">
                    <button onclick="markAsRead('${notification.id}')" class="w-8 h-8 rounded ${isUnread ? 'bg-blue-500 hover:bg-blue-600' : 'bg-gray-400'} flex items-center justify-center" title="${isUnread ? 'Đánh dấu đã đọc' : 'Đã đọc'}">
                        <svg class="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                            <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/>
                        </svg>
                    </button>
                    ${notification.relatedType === 'task' ? 
                        `<button onclick="goToTask('${notification.relatedId}')" class="w-8 h-8 rounded bg-green-500 hover:bg-green-600 flex items-center justify-center" title="Xử lý sự cố">
                            <svg class="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                                <path fill-rule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clip-rule="evenodd"/>
                            </svg>
                        </button>` : ''
                    }
                    <button onclick="deleteNotification('${notification.id}')" class="w-8 h-8 rounded bg-red-500 hover:bg-red-600 flex items-center justify-center" title="Xóa">
                        <svg class="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                            <path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd"/>
                        </svg>
                    </button>
                </div>
            </td>
            <td class="py-4 px-4 font-medium ${isUnread ? 'font-bold' : ''}">${notification.title || 'N/A'}</td>
            <td class="py-4 px-4 whitespace-pre-wrap">${notification.message || 'N/A'}</td>
            <td class="py-4 px-4">${building?.code || building?.name || 'N/A'}</td>
            <td class="py-4 px-4">${notification.room || 'N/A'}</td>
            <td class="py-4 px-4">${customer?.name || 'N/A'}</td>
            <td class="py-4 px-4">${formatDateTime(notification.createdAt)}</td>
            <td class="py-4 px-4">
                <span class="px-2 py-1 text-xs rounded-full ${isUnread ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'}">
                    ${isUnread ? 'Chưa đọc' : 'Đã đọc'}
                </span>
            </td>
        `;
        notificationsListEl.appendChild(tr);
    });

    // Render mobile cards
    if (notificationsMobileListEl) {
        currentNotifications.forEach(notification => {
            const customer = customers.find(c => c.id === notification.customerId);
            const building = buildings.find(b => b.id === notification.buildingId);
            const isUnread = !notification.isRead;
            const isChecked = selectedMobileNotificationIds.has(notification.id);

            const card = document.createElement('div');
            card.className = 'mobile-card';
            card.innerHTML = `
                <div class="flex items-center gap-3 mb-3 pb-3 border-b">
                    <input type="checkbox" class="notification-checkbox-mobile w-5 h-5 cursor-pointer" data-id="${notification.id}" ${isChecked ? 'checked' : ''}>
                    <span class="text-xs text-gray-500 flex-1">Chọn để xóa nhiều</span>
                    <span class="px-2 py-1 text-xs rounded-full ${isUnread ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-600'}">
                        ${isUnread ? 'Chưa đọc' : 'Đã đọc'}
                    </span>
                </div>
                <div class="mobile-card-row">
                    <span class="mobile-card-label">Tiêu đề:</span>
                    <span class="mobile-card-value font-semibold">${notification.title || 'N/A'}</span>
                </div>
                <div class="mobile-card-row">
                    <span class="mobile-card-label">Nội dung:</span>
                    <span class="mobile-card-value whitespace-pre-wrap">${notification.message || 'N/A'}</span>
                </div>
                <div class="mobile-card-row">
                    <span class="mobile-card-label">Tòa nhà:</span>
                    <span class="mobile-card-value">${building?.code || building?.name || 'N/A'}</span>
                </div>
                <div class="mobile-card-row">
                    <span class="mobile-card-label">Phòng:</span>
                    <span class="mobile-card-value">${notification.room || 'N/A'}</span>
                </div>
                <div class="mobile-card-row">
                    <span class="mobile-card-label">Khách hàng:</span>
                    <span class="mobile-card-value">${customer?.name || 'N/A'}</span>
                </div>
                <div class="mobile-card-row">
                    <span class="mobile-card-label">Thời gian:</span>
                    <span class="mobile-card-value">${formatDateTime(notification.createdAt)}</span>
                </div>
                <div class="mobile-card-actions">
                    <button onclick="markAsRead('${notification.id}')" class="${isUnread ? 'bg-blue-500 hover:bg-blue-600' : 'bg-gray-400'} text-white" title="${isUnread ? 'Đánh dấu đã đọc' : 'Đã đọc'}">
                        <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                            <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/>
                        </svg>
                        ${isUnread ? 'Chưa đọc' : 'Đã đọc'}
                    </button>
                    ${notification.relatedType === 'task' ? 
                        `<button onclick="goToTask('${notification.relatedId}')" class="bg-green-500 hover:bg-green-600 text-white" title="Xử lý sự cố">
                            <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                <path fill-rule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clip-rule="evenodd"/>
                            </svg>
                            Xử lý
                        </button>` : ''
                    }
                    <button onclick="deleteNotification('${notification.id}')" class="bg-red-500 hover:bg-red-600 text-white" title="Xóa">
                        <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                            <path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd"/>
                        </svg>
                        Xóa
                    </button>
                </div>
            `;
            notificationsMobileListEl.appendChild(card);
        });
    }
    
    // Render pagination
    renderNotificationsPagination(totalItems);
    
    // Cập nhật badge thông báo chưa đọc ở header
    updateNotificationBadge();
}



/**
 * Xử lý sự kiện click
 */
function handleBodyClick(e) {
    const target = e.target.closest('button') || e.target;
    const id = target.dataset?.id;

    if (target.id === 'notifications-btn') {
        loadNotifications();
    }
    else if (target.id === 'mark-all-read-btn') {
        markAllAsRead();
    }
    else if (target.id === 'bulk-delete-notifications-btn') {
        bulkDeleteNotifications();
    }
}

/**
 * Đánh dấu thông báo đã đọc
 */
window.markAsRead = async function(notificationId) {
    try {
        // Update Firebase + localStorage
        await updateDoc(doc(db, 'adminNotifications', notificationId), {
            isRead: true,
            readAt: serverTimestamp()
        });
        
        updateInLocalStorage('notifications', notificationId, {
            isRead: true,
            readAt: new Date()
        });
        
        // Dispatch event để UI cập nhật
        window.dispatchEvent(new CustomEvent('store:notifications:updated'));
        
        showToast('Đã đánh dấu đã đọc!');
    } catch (error) {
        console.error('Lỗi khi đánh dấu thông báo đã đọc:', error);
        showToast('Lỗi: ' + error.message, 'error');
    }
};

/**
 * Đánh dấu tất cả đã đọc
 */
async function markAllAsRead() {
    try {
        const unreadNotifications = notificationsCache.filter(n => !n.isRead);
        
        for (const notification of unreadNotifications) {
            // Update Firebase
            await updateDoc(doc(db, 'adminNotifications', notification.id), {
                isRead: true,
                readAt: serverTimestamp()
            });
            
            // Update localStorage
            updateInLocalStorage('notifications', notification.id, {
                isRead: true,
                readAt: new Date()
            });
        }
        
        // Dispatch event để UI cập nhật
        window.dispatchEvent(new CustomEvent('store:notifications:updated'));
        
        resetBulkSelection();
        showToast(`Đã đánh dấu ${unreadNotifications.length} thông báo là đã đọc!`);
    } catch (error) {
        showToast('Lỗi: ' + error.message, 'error');
    }
}

/**
 * Chuyển đến trang xử lý sự cố
 */
window.goToTask = function(taskId) {
    // Chuyển đến trang tasks và highlight task cụ thể
    document.getElementById('tasks-btn').click();
    
    // Highlight task sau một chút để đảm bảo trang đã load
    setTimeout(() => {
        const taskRow = document.querySelector(`[data-task-id="${taskId}"]`);
        if (taskRow) {
            taskRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
            taskRow.style.backgroundColor = '#fef3c7'; // Highlight vàng
            setTimeout(() => {
                taskRow.style.backgroundColor = '';
            }, 3000);
        }
    }, 500);
};

/**
 * Xóa thông báo
 */
window.deleteNotification = async function(notificationId) {
    const confirmed = await showConfirm('Bạn có chắc muốn xóa thông báo này?', 'Xác nhận xóa');
    if (!confirmed) return;
    
    try {
        // Delete Firebase + localStorage
        await deleteDoc(doc(db, 'adminNotifications', notificationId));
        deleteFromLocalStorage('notifications', notificationId);
        
        // Dispatch event để UI cập nhật
        window.dispatchEvent(new CustomEvent('store:notifications:updated'));
        
        showToast('Đã xóa thông báo!');
    } catch (error) {
        showToast('Lỗi xóa: ' + error.message, 'error');
    }
};

/**
 * Xóa nhiều thông báo
 */
async function bulkDeleteNotifications() {
    let selected = [];
    
    // Sử dụng Set cho mobile, fallback cho desktop
    if (selectedMobileNotificationIds.size > 0) {
        selected = Array.from(selectedMobileNotificationIds);
    } else {
        selected = Array.from(document.querySelectorAll('.notification-checkbox:checked'))
            .map(cb => cb.dataset.id);
    }
    
    if (selected.length === 0) {
        showToast('Vui lòng chọn thông báo để xóa!', 'warning');
        return;
    }

    const confirmed = await showConfirm(`Bạn có chắc muốn xóa ${selected.length} thông báo đã chọn?`, 'Xác nhận xóa');
    if (!confirmed) return;

    try {
        for (const id of selected) {
            // Delete Firebase + localStorage
            await deleteDoc(doc(db, 'adminNotifications', id));
            deleteFromLocalStorage('notifications', id);
        }
        
        // Xóa Set sau khi xóa thành công
        selectedMobileNotificationIds.clear();
        updateClearSelectionButton();
        
        // Dispatch event để UI cập nhật
        window.dispatchEvent(new CustomEvent('store:notifications:updated'));
        
        resetBulkSelection();
        showToast(`Đã xóa ${selected.length} thông báo!`);
    } catch (error) {
        showToast('Lỗi xóa: ' + error.message, 'error');
    }
}

/**
 * Reset bulk selection sau khi xóa
 */
function resetBulkSelection() {
    // Bỏ check checkbox "Chọn tất cả"
    const selectAllCheckbox = document.getElementById('select-all-notifications');
    if (selectAllCheckbox) {
        selectAllCheckbox.checked = false;
    }
    
    // Bỏ check tất cả checkbox thông báo riêng lẻ
    document.querySelectorAll('.notification-checkbox').forEach(cb => {
        cb.checked = false;
    });
    
    // Ẩn bulk action buttons nếu có
    const bulkActions = document.querySelector('.bulk-actions');
    if (bulkActions) {
        bulkActions.style.display = 'none';
    }
}

/**
 * Cập nhật nút bỏ chọn
 */
function updateClearSelectionButton() {
    const clearBtn = document.getElementById('clear-selection-notifications-btn');
    if (clearBtn) {
        if (selectedMobileNotificationIds.size >= 2) {
            clearBtn.classList.remove('hidden');
        } else {
            clearBtn.classList.add('hidden');
        }
    }
}

/**
 * Helper functions
 */
function getTypeColor(type) {
    switch (type) {
        case 'new_task': return 'bg-red-100 text-red-800';
        case 'bill_created': return 'bg-blue-100 text-blue-800';
        case 'payment_received': return 'bg-green-100 text-green-800';
        case 'system': return 'bg-gray-100 text-gray-800';
        default: return 'bg-gray-100 text-gray-800';
    }
}

function getTypeText(type) {
    switch (type) {
        case 'new_task': return 'Sự cố mới';
        case 'bill_created': return 'Hóa đơn mới';
        case 'payment_received': return 'Thanh toán';
        case 'system': return 'Hệ thống';
        default: return 'Khác';
    }
}

function formatDateTime(timestamp) {
    if (!timestamp) return 'N/A';
    
    // Sử dụng safeToDate để xử lý cả 2 trường hợp Firebase timestamp
    const date = safeToDate(timestamp);
    
    return `${formatDate(date)} ${formatTime(date)}`;
}

/**
 * Cập nhật badge thông báo chưa đọc ở header
 */
function updateNotificationBadge() {
    const unreadCount = notificationsCache.filter(n => !n.isRead).length;
    const badge = document.getElementById('notification-count-badge');
    
    if (badge) {
        if (unreadCount > 0) {
            badge.textContent = unreadCount > 99 ? '99+' : unreadCount;
            badge.classList.remove('hidden');
        } else {
            badge.classList.add('hidden');
        }
    }
    
    console.log(`🔔 Cập nhật badge: ${unreadCount} thông báo chưa đọc`);
}

/**
 * Render pagination cho notifications
 */
function renderNotificationsPagination(totalItems) {
    const paginationEl = document.getElementById('notifications-pagination');
    if (!paginationEl || totalItems <= ITEMS_PER_PAGE) {
        if (paginationEl) paginationEl.innerHTML = '';
        return;
    }
    
    const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);
    if (totalPages <= 1) {
        paginationEl.innerHTML = '';
        return;
    }
    
    let paginationHTML = '<nav class="flex items-center justify-between">';
    
    // Thông tin trang hiện tại
    const startItem = (currentNotificationsPage - 1) * ITEMS_PER_PAGE + 1;
    const endItem = Math.min(currentNotificationsPage * ITEMS_PER_PAGE, totalItems);
    paginationHTML += `
        <div class="text-sm text-gray-700">
            Hiển thị <span class="font-medium">${startItem}</span> đến <span class="font-medium">${endItem}</span>
            trong tổng số <span class="font-medium">${totalItems}</span> thông báo
        </div>
    `;
    
    // Nút điều hướng
    paginationHTML += '<div class="flex gap-2">';
    
    // Nút Previous
    if (currentNotificationsPage > 1) {
        paginationHTML += `
            <button onclick="changeNotificationsPage(${currentNotificationsPage - 1})" 
                    class="px-3 py-1 text-sm bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 rounded">
                Trước
            </button>
        `;
    }
    
    // Các số trang
    let startPage = Math.max(1, currentNotificationsPage - 2);
    let endPage = Math.min(totalPages, startPage + 4);
    
    if (endPage - startPage < 4) {
        startPage = Math.max(1, endPage - 4);
    }
    
    for (let i = startPage; i <= endPage; i++) {
        const activeClass = i === currentNotificationsPage 
            ? 'bg-blue-500 text-white border-blue-500' 
            : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50';
        
        paginationHTML += `
            <button onclick="changeNotificationsPage(${i})" 
                    class="px-3 py-1 text-sm border rounded ${activeClass}">
                ${i}
            </button>
        `;
    }
    
    // Nút Next
    if (currentNotificationsPage < totalPages) {
        paginationHTML += `
            <button onclick="changeNotificationsPage(${currentNotificationsPage + 1})" 
                    class="px-3 py-1 text-sm bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 rounded">
                Sau
            </button>
        `;
    }
    
    paginationHTML += '</div></nav>';
    paginationEl.innerHTML = paginationHTML;
}

/**
 * Thay đổi trang cho notifications
 */
window.changeNotificationsPage = function(page) {
    currentNotificationsPage = page;
    renderNotificationsTable();
};

/**
 * Listen for store updates để reload data
 */
document.addEventListener('store:notifications:updated', () => {
    if (notificationsSection && !notificationsSection.classList.contains('hidden')) {
        console.log('🔄 Notifications updated event - reloading notifications...');
        loadNotifications();
    }
});