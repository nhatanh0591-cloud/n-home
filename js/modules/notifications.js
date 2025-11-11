// js/modules/notifications.js

import { db, collection, query, where, getDocs, orderBy, onSnapshot, addDoc, setDoc, doc, deleteDoc, serverTimestamp } from '../firebase.js';
import { getCustomers, getTasks } from '../store.js';
import { showToast, formatDate, formatTime } from '../utils.js';

// --- BIẾN CỤC BỘ CHO MODULE ---
let notificationsCache = [];
let notificationsCache_filtered = [];

// Pagination variables
const ITEMS_PER_PAGE = 50;
let currentNotificationsPage = 1;

// --- DOM ELEMENTS ---
const notificationsSection = document.getElementById('notifications-section');
const notificationsListEl = document.getElementById('notifications-list');

// Filters
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
    [typeFilterEl, statusFilterEl, searchEl].forEach(el => {
        el?.addEventListener('input', applyNotificationFilters);
    });

    // Lắng nghe select all
    selectAllCheckbox?.addEventListener('change', (e) => {
        document.querySelectorAll('.notification-checkbox').forEach(cb => {
            cb.checked = e.target.checked;
        });
    });

    // Setup real-time listeners để nhận thông báo từ app
    setupRealtimeListeners();
}

/**
 * Tải và hiển thị thông báo
 */
export function loadNotifications() {
    applyNotificationFilters();
    updateNotificationBadge();
}

/**
 * Setup real-time listeners để nhận thông báo từ app khách hàng
 */
function setupRealtimeListeners() {
    // 💰 adminNotifications không có trong store → cần onSnapshot riêng
    // Nhưng chỉ 1 listener duy nhất, không duplicate
    
    const notificationsQuery = query(
        collection(db, 'adminNotifications'),
        orderBy('createdAt', 'desc')
    );

    onSnapshot(notificationsQuery, (snapshot) => {
        console.log(`📊 Firebase reads: ${snapshot.docChanges().length} changes detected`);
        
        // Cập nhật cache
        notificationsCache = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        // Cập nhật badge ngay lập tức
        updateNotificationBadge();
        
        // 🔥 Cập nhật table nếu đang ở tab notifications  
        const notificationsSection = document.getElementById('notifications-section');
        if (notificationsSection && !notificationsSection.classList.contains('hidden')) {
            // Re-apply filters và render lại table
            refreshNotificationsFromCache();
            console.log('� Real-time updated notifications table');
        }
        
        console.log(`🔔 Total notifications: ${notificationsCache.length}, Unread: ${notificationsCache.filter(n => !n.isRead).length}`);
    });
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
        // Load notifications từ Firebase
        const q = query(collection(db, 'adminNotifications'), orderBy('createdAt', 'desc'));
        const snapshot = await getDocs(q);
        notificationsCache = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        // Lấy giá trị bộ lọc
        const type = typeFilterEl?.value || 'all';
        const status = statusFilterEl?.value || 'all';
        const search = searchEl?.value.toLowerCase() || '';

        // Lọc
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

        // Reset về trang đầu khi filter thay đổi
        currentNotificationsPage = 1;

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

    if (notificationsCache_filtered.length === 0) {
        notificationsListEl.innerHTML = '<tr><td colspan="7" class="p-8 text-center text-gray-500">Không có thông báo nào.</td></tr>';
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

    currentNotifications.forEach(notification => {
        const customer = customers.find(c => c.id === notification.customerId);
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
        // 1. Cập nhật UI ngay lập tức (optimistic update)
        const notificationElement = document.querySelector(`[data-notification-id="${notificationId}"]`);
        if (notificationElement) {
            notificationElement.classList.remove('bg-blue-50', 'border-blue-200');
            notificationElement.classList.add('bg-gray-50', 'border-gray-200');
            
            const button = notificationElement.querySelector('button');
            if (button) {
                button.classList.remove('bg-blue-500', 'hover:bg-blue-600');
                button.classList.add('bg-gray-400');
                button.title = 'Đã đọc';
                button.innerHTML = '<svg class="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"></path></svg>';
            }
        }
        
        // 2. Cập nhật cache local
        const notification = notificationsCache.find(n => n.id === notificationId);
        if (notification) {
            notification.isRead = true;
            notification.updatedAt = new Date();
        }
        
        // 3. Cập nhật Firestore (trong background)
        await setDoc(doc(db, 'adminNotifications', notificationId), {
            isRead: true,
            updatedAt: serverTimestamp()
        }, { merge: true });
        
        // 4. Cập nhật badge count
        updateNotificationBadge();
        
        showToast('Đã đánh dấu đã đọc!');
    } catch (error) {
        console.error('Error marking as read:', error);
        // Revert UI changes on error
        loadNotifications();
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
            await setDoc(doc(db, 'adminNotifications', notification.id), {
                isRead: true,
                updatedAt: serverTimestamp()
            }, { merge: true });
        }
        
        loadNotifications();
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
    if (!confirm('Bạn có chắc muốn xóa thông báo này?')) return;
    
    try {
        await deleteDoc(doc(db, 'adminNotifications', notificationId));
        loadNotifications();
        showToast('Đã xóa thông báo!');
    } catch (error) {
        showToast('Lỗi xóa: ' + error.message, 'error');
    }
};

/**
 * Xóa nhiều thông báo
 */
async function bulkDeleteNotifications() {
    const selected = Array.from(document.querySelectorAll('.notification-checkbox:checked'))
        .map(cb => cb.dataset.id);
    
    if (selected.length === 0) {
        showToast('Vui lòng chọn thông báo để xóa!', 'warning');
        return;
    }

    if (!confirm(`Bạn có chắc muốn xóa ${selected.length} thông báo đã chọn?`)) return;

    try {
        for (const id of selected) {
            await deleteDoc(doc(db, 'adminNotifications', id));
        }
        
        loadNotifications();
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
    
    let date;
    if (timestamp.toDate) {
        date = timestamp.toDate();
    } else {
        date = new Date(timestamp);
    }
    
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