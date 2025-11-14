/**
 * Tasks Module - Quản lý Sự cố/Công việc
 */

import { 
    db, 
    storage,
    collection, 
    addDoc, 
    updateDoc, 
    deleteDoc, 
    doc, 
    getDocs, 
    query, 
    where, 
    orderBy,
    serverTimestamp,
    ref,
    deleteObject
} from '../firebase.js';

import { 
    showToast, 
    openModal,
    closeModal,
    parseDateInput,
    showConfirm
} from '../utils.js';

import { getCurrentUserRole } from '../auth.js';

// Cache và biến global
let tasksCache = [];
let buildingsCache = [];
const selectedMobileTaskIds = new Set();

// Pagination variables
const ITEMS_PER_PAGE = 20;
let currentTasksPage = 1;

// DOM Elements
const tasksSection = document.getElementById('tasks-section');
const tasksListEl = document.getElementById('tasks-list');
const taskModal = document.getElementById('task-modal');
const taskForm = document.getElementById('task-form');
const taskModalTitle = document.getElementById('task-modal-title');

// Buttons
const addTaskBtn = document.getElementById('add-task-btn');
const closeTaskModalBtn = document.getElementById('close-task-modal');
const cancelTaskBtn = document.getElementById('cancel-task-btn');
const bulkDeleteTasksBtn = document.getElementById('bulk-delete-tasks-btn');
const selectAllTasksBtn = document.getElementById('select-all-tasks');

// Filters
const filterTaskBuildingEl = document.getElementById('filter-task-building');
const filterTaskRoomEl = document.getElementById('filter-task-room');
const filterTaskStatusEl = document.getElementById('filter-task-status');
const taskSearchEl = document.getElementById('task-search');
const filterTaskStartDateEl = document.getElementById('filter-task-start-date');
const filterTaskEndDateEl = document.getElementById('filter-task-end-date');

// Form inputs
const taskIdEl = document.getElementById('task-id');
const taskTitleEl = document.getElementById('task-title');
const taskDescriptionEl = document.getElementById('task-description');
const taskBuildingEl = document.getElementById('task-building');
const taskRoomEl = document.getElementById('task-room');
const taskReporterEl = document.getElementById('task-reporter');

// Stats elements
const totalTasksEl = document.getElementById('total-tasks');
const newTasksEl = document.getElementById('new-tasks');
const pendingTasksEl = document.getElementById('pending-tasks');
const completedTasksEl = document.getElementById('completed-tasks');

/**
 * Format datetime to local string
 */
function formatDateTime(timestamp) {
    if (!timestamp) return 'N/A';
    let date;
    if (timestamp.toDate) {
        date = timestamp.toDate();
    } else {
        date = new Date(timestamp);
    }
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    
    return `${hours}:${minutes} | ${day}-${month}-${year}`;
}

/**
 * Format completion datetime for display
 */
function formatCompletionTime(timestamp) {
    if (!timestamp) return null;
    let date;
    if (timestamp.toDate) {
        date = timestamp.toDate();
    } else {
        date = new Date(timestamp);
    }
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    
    return `${hours}:${minutes} | ${day}-${month}-${year}`;
}

/**
 * Get status icon SVG cho nút 1 (trạng thái xử lý)
 */
function getStatusIcon(status) {
    switch (status) {
        case 'pending':
            // Gear/Settings icon - màu vàng
            return `<svg class="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/>
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
            </svg>`;
        case 'pending-review':
            // Eye icon - màu xám
            return `<svg class="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
            </svg>`;
        default:
            return `<svg class="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/>
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
            </svg>`;
    }
}

/**
 * Get approval icon SVG cho nút 2 (nghiệm thu)
 */
function getApprovalIcon(status) {
    // Luôn là checkmark icon
    return `<svg class="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
    </svg>`;
}

/**
 * Get button tooltip text cho nút 1 (trạng thái xử lý)
 */
function getStatusTooltip(status) {
    switch (status) {
        case 'pending':
            return 'Đánh dấu hoàn thành';
        case 'pending-review':
            return 'Chưa hoàn thành';
        default:
            return 'Cập nhật trạng thái';
    }
}

/**
 * Get approval tooltip text cho nút 2 (nghiệm thu)
 */
function getApprovalTooltip(status) {
    switch (status) {
        case 'pending':
            return 'Chờ hoàn thành';
        case 'pending-review':
            return 'Nghiệm thu';
        case 'completed':
            return 'Đã nghiệm thu';
        default:
            return 'Nghiệm thu';
    }
}

/**
 * Khởi tạo module Tasks
 */
export function initTasks() {
    if (!tasksSection) return;
    
    loadTasks();
    loadBuildings();
    setupEventListeners();
    
    // 🔥 SỬA LỖI REAL-TIME: Lắng nghe update từ store
    document.addEventListener('store:tasks:updated', () => {
        console.log('🔄 Tasks updated from store - refreshing table');
        if (!tasksSection.classList.contains('hidden')) {
            // Nếu đang hiển thị tab tasks, refresh ngay
            loadTasksFromStore();
        }
    });
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
    // Modal events
    addTaskBtn?.addEventListener('click', () => openTaskModal());
    closeTaskModalBtn?.addEventListener('click', () => closeModal(taskModal));
    cancelTaskBtn?.addEventListener('click', () => closeModal(taskModal));
    
    // Form submit
    taskForm?.addEventListener('submit', handleTaskFormSubmit);
    
    // Bulk actions
    bulkDeleteTasksBtn?.addEventListener('click', handleBulkDeleteTasks);
    document.getElementById('bulk-complete-tasks-btn')?.addEventListener('click', handleBulkCompleteTasks);
    selectAllTasksBtn?.addEventListener('change', handleSelectAllTasks);
    
    // Checkbox mobile events
    document.addEventListener('click', (e) => {
        if (e.target.classList.contains('task-checkbox-mobile')) {
            const taskId = e.target.dataset.id;
            if (e.target.checked) {
                selectedMobileTaskIds.add(taskId);
            } else {
                selectedMobileTaskIds.delete(taskId);
            }
            updateClearSelectionButton();
            updateBulkCompleteButton();
        }
    });
    
    // Clear selection button
    document.getElementById('clear-selection-tasks-btn')?.addEventListener('click', () => {
        selectedMobileTaskIds.clear();
        document.querySelectorAll('.task-checkbox-mobile').forEach(cb => cb.checked = false);
        updateClearSelectionButton();
        updateBulkCompleteButton();
        showToast('Bỏ chọn thành công!');
    });
    
    // Filters
    filterTaskBuildingEl?.addEventListener('change', handleFilterBuildingChange);
    filterTaskRoomEl?.addEventListener('change', filterTasks);
    filterTaskStatusEl?.addEventListener('change', filterTasks);
    taskSearchEl?.addEventListener('input', filterTasks);
    filterTaskStartDateEl?.addEventListener('input', filterTasks);
    filterTaskEndDateEl?.addEventListener('input', filterTasks);
    
    // Building change events
    taskBuildingEl?.addEventListener('change', handleBuildingChange);
    filterTaskBuildingEl?.addEventListener('change', handleFilterBuildingChange);
}

/**
 * Load danh sách tasks (sử dụng store nếu có, fallback Firebase)
 */
export async function loadTasks() {
    try {
        // Thử load từ store trước (real-time data)
        const { getTasks } = await import('../store.js');
        const storeTasks = getTasks();
        
        if (storeTasks && storeTasks.length > 0) {
            console.log('📦 Loading tasks from store (real-time)');
            tasksCache = storeTasks;
        } else {
            console.log('🔄 Loading tasks from Firebase (fallback)');
            // Fallback: load từ Firebase nếu store chưa ready
            const tasksRef = collection(db, 'tasks');
            const snapshot = await getDocs(query(tasksRef, orderBy('createdAt', 'desc')));
            
            tasksCache = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
        }
        
        renderTasks();
        updateStats();
        
    } catch (error) {
        console.error('Error loading tasks:', error);
        showToast('Lỗi khi tải danh sách công việc', 'error');
    }
}

/**
 * 🔥 Load danh sách tasks từ store (real-time)
 */
function loadTasksFromStore() {
    try {
        // Import getTasks từ store
        import('../store.js').then(({ getTasks }) => {
            tasksCache = getTasks() || [];
            console.log(`🔄 Loaded ${tasksCache.length} tasks from store`);
            
            renderTasks();
            updateStats();
        });
    } catch (error) {
        console.error('Error loading tasks from store:', error);
    }
}

/**
 * Load danh sách buildings từ store (copy từ contracts)
 */
function loadBuildings() {
    // Import từ store như các module khác
    import('../store.js').then(({ getBuildings }) => {
        buildingsCache = getBuildings();
        console.log('Tasks: Loaded buildings from store:', buildingsCache);
        populateBuildingDropdowns();
    });
    
    // Listen for updates
    document.addEventListener('store:buildings:updated', () => {
        import('../store.js').then(({ getBuildings }) => {
            buildingsCache = getBuildings();
            populateBuildingDropdowns();
        });
    });
}

/**
 * Populate building dropdowns
 */
function populateBuildingDropdowns() {
    console.log('Tasks: Populating buildings dropdown, cache:', buildingsCache.length);
    const dropdowns = [taskBuildingEl, filterTaskBuildingEl];
    
    dropdowns.forEach(dropdown => {
        if (!dropdown) {
            console.log('Tasks: Dropdown element not found');
            return;
        }
        
        // Clear existing options (except first one)
        while (dropdown.children.length > 1) {
            dropdown.removeChild(dropdown.lastChild);
        }
        
        buildingsCache.forEach(building => {
            const option = document.createElement('option');
            option.value = building.id;
            option.textContent = building.code; // Copy từ contracts.js
            dropdown.appendChild(option);
        });
    });
    
    // Initialize filter room dropdown
    if (filterTaskRoomEl) {
        filterTaskRoomEl.innerHTML = '<option value="">Phòng</option>';
    }
}

/**
 * Handle building change in task form - load rooms (copy từ contracts)
 */
function handleBuildingChange() {
    const buildingId = taskBuildingEl.value;
    const building = buildingsCache.find(b => b.id === buildingId);
    
    // Task form dùng input text, chỉ cần enable/disable
    if (taskRoomEl) {
        if (building) {
            taskRoomEl.placeholder = 'Nhập số phòng (VD: 101, 102...)';
            taskRoomEl.disabled = false;
        } else {
            taskRoomEl.placeholder = 'Chọn tòa nhà trước';
            taskRoomEl.disabled = true;
            taskRoomEl.value = '';
        }
    }
}

/**
 * Handle filter building change - load rooms and filter (copy từ contracts)
 */
function handleFilterBuildingChange() {
    const selectedBuildingId = filterTaskBuildingEl.value;
    const currentRoom = filterTaskRoomEl.value;
    filterTaskRoomEl.innerHTML = '<option value="">Phòng</option>';
    
    if (selectedBuildingId) {
        const building = buildingsCache.find(b => b.id === selectedBuildingId);
        if (building && building.rooms) {
            building.rooms.forEach(room => {
                filterTaskRoomEl.innerHTML += `<option value="${room}">${room}</option>`;
            });
        }
    }
    filterTaskRoomEl.value = currentRoom;
    
    filterTasks(); // Apply filter immediately
}



/**
 * Render danh sách tasks
 */
function renderTasks(tasks = tasksCache) {
    if (!tasksListEl) return;
    
    const mobileListEl = document.getElementById('tasks-mobile-list');
    
    if (tasks.length === 0) {
        tasksListEl.innerHTML = `
            <tr>
                <td colspan="8" class="text-center py-8 text-gray-500">
                    Chưa có công việc nào. Nhấn nút "+" để thêm mới.
                </td>
            </tr>
        `;
        if (mobileListEl) {
            mobileListEl.innerHTML = '<div class="text-center py-8 text-gray-500">Chưa có công việc nào. Nhấn nút "+" để thêm mới.</div>';
        }
        // Ẩn pagination khi không có dữ liệu
        const paginationEl = document.getElementById('tasks-pagination');
        if (paginationEl) {
            paginationEl.innerHTML = '';
        }
        return;
    }
    
    // Tính toán phân trang
    const totalItems = tasks.length;
    const startIndex = (currentTasksPage - 1) * ITEMS_PER_PAGE;
    const endIndex = startIndex + ITEMS_PER_PAGE;
    const currentTasks = tasks.slice(startIndex, endIndex);
    
    // 🖥️ RENDER DESKTOP TABLE
    tasksListEl.innerHTML = currentTasks.map(task => {
        const building = buildingsCache.find(b => b.id === task.buildingId);
        const buildingName = building ? building.code : 'N/A';
        const userRole = getCurrentUserRole();
        const isAdmin = userRole && userRole.email !== 'quanly@gmail.com';
        const isManager = userRole && userRole.email === 'quanly@gmail.com';
        
        console.log('🔍 DEBUG - UserRole:', userRole);
        console.log('🔍 DEBUG - Email:', userRole?.email);
        console.log('🔍 DEBUG - isAdmin:', isAdmin, 'isManager:', isManager);
        
        return `
            <tr class="border-b hover:bg-gray-50">
                <td class="py-3 px-4">
                    <input type="checkbox" class="task-checkbox w-4 h-4 cursor-pointer" data-id="${task.id}">
                </td>
                <td class="py-3 px-4">
                    <div class="flex gap-2">
                        <!-- Nút 1: Trạng thái xử lý (pending <-> pending-review) -->
                        <button onclick="toggleTaskStatus('${task.id}')" 
                                class="w-8 h-8 rounded ${getStatusButtonClass(task.status)} flex items-center justify-center ${task.status === 'completed' ? 'opacity-50 cursor-not-allowed' : ''}" 
                                title="${getStatusTooltip(task.status)}"
                                ${task.status === 'completed' ? 'disabled' : ''}>
                            ${getStatusIcon(task.status)}
                        </button>
                        <!-- Nút 2: Nghiệm thu (sẽ bị ẩn bởi auth.js cho manager) -->
                        <button onclick="toggleTaskApproval('${task.id}')" 
                                class="w-8 h-8 rounded ${getApprovalButtonClass(task.status)} flex items-center justify-center ${task.status === 'pending' ? 'opacity-50 cursor-not-allowed' : ''}" 
                                title="${getApprovalTooltip(task.status)}"
                                ${task.status === 'pending' ? 'disabled' : ''}>
                            ${getApprovalIcon(task.status)}
                        </button>
                        ${task.imageUrls && task.imageUrls.length > 0 ? `
                            <button onclick="viewTaskImages('${task.id}')" class="w-8 h-8 rounded bg-blue-500 hover:bg-blue-600 flex items-center justify-center relative" title="Xem ${task.imageUrls.length} ảnh">
                                <svg class="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/>
                                </svg>
                                <span class="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">${task.imageUrls.length}</span>
                            </button>
                        ` : ''}
                        <!-- Nút sửa/xóa (sẽ bị ẩn bởi auth.js cho manager) -->
                        <button onclick="editTask('${task.id}')" class="w-8 h-8 rounded bg-gray-500 hover:bg-gray-600 flex items-center justify-center" title="Sửa">
                            <svg class="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
                            </svg>
                        </button>
                        <button onclick="deleteTask('${task.id}')" class="w-8 h-8 rounded bg-red-500 hover:bg-red-600 flex items-center justify-center" title="Xóa">
                            <svg class="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                            </svg>
                        </button>
                    </div>
                </td>
                <td class="py-3 px-4" style="word-wrap: break-word; word-break: break-word; max-width: 300px;">
                    <div class="font-medium text-gray-900">${task.title}</div>
                    ${task.description ? `<div class="text-sm text-gray-500">${task.description}</div>` : ''}
                </td>
                <td class="py-3 px-4" style="white-space: nowrap;">${buildingName}</td>
                <td class="py-3 px-4" style="white-space: nowrap;">${task.room || '-'}</td>
                <td class="py-3 px-4" style="white-space: nowrap;">${task.reporter}</td>
                <td class="py-3 px-4" style="white-space: nowrap;">${formatDateTime(task.createdAt)}</td>
                <td class="py-3 px-4" style="white-space: nowrap;">
                    ${task.status === 'pending' ? 
                        `<span class="px-2 py-1 text-xs rounded-full bg-red-500 text-white">
                            ${getStatusText(task.status, task.completedAt)}
                        </span>` :
                        `<span style="white-space: nowrap;">${getStatusText(task.status, task.completedAt)}</span>`
                    }
                </td>
            </tr>
        `;
    }).join('');
    
    // 📱 RENDER MOBILE CARDS
    if (mobileListEl) {
        mobileListEl.innerHTML = '';
        currentTasks.forEach(task => {
            const building = buildingsCache.find(b => b.id === task.buildingId);
            const buildingName = building ? building.code : 'N/A';
            const isChecked = selectedMobileTaskIds.has(task.id);
            const userRole = getCurrentUserRole();
            const isAdmin = userRole && userRole.email !== 'quanly@gmail.com';
            const isManager = userRole && userRole.email === 'quanly@gmail.com';
            
            const mobileCard = document.createElement('div');
            mobileCard.className = 'mobile-card';
            mobileCard.innerHTML = `
                <div class="flex items-center gap-3 mb-3 pb-3 border-b">
                    <input type="checkbox" class="task-checkbox-mobile w-5 h-5 cursor-pointer" data-id="${task.id}" ${isChecked ? 'checked' : ''}>
                    <span class="text-xs text-gray-500 flex-1">Chọn để xóa nhiều</span>
                </div>
                <div class="mobile-card-row">
                    <span class="mobile-card-label">Công việc:</span>
                    <span class="mobile-card-value font-bold text-lg">${task.title}</span>
                </div>
                ${task.description ? `
                <div class="mobile-card-row">
                    <span class="mobile-card-label">Mô tả:</span>
                    <span class="mobile-card-value text-gray-600">${task.description}</span>
                </div>
                ` : ''}
                <div class="mobile-card-row">
                    <span class="mobile-card-label">Tòa nhà:</span>
                    <span class="mobile-card-value">${buildingName}</span>
                </div>
                <div class="mobile-card-row">
                    <span class="mobile-card-label">Phòng:</span>
                    <span class="mobile-card-value">${task.room || '-'}</span>
                </div>
                <div class="mobile-card-row">
                    <span class="mobile-card-label">Người báo:</span>
                    <span class="mobile-card-value">${task.reporter}</span>
                </div>
                <div class="mobile-card-row">
                    <span class="mobile-card-label">Ngày báo cáo:</span>
                    <span class="mobile-card-value">${formatDateTime(task.createdAt)}</span>
                </div>
                <div class="mobile-card-row">
                    <span class="mobile-card-label">Trạng thái:</span>
                    <span class="px-2 py-1 text-xs rounded-full ${getStatusBadgeClass(task.status)}">
                        ${getStatusText(task.status, task.completedAt)}
                    </span>
                </div>
                ${task.imageUrls && task.imageUrls.length > 0 ? `
                <div class="mobile-card-row">
                    <span class="mobile-card-label">Hình ảnh:</span>
                    <button onclick="viewTaskImages('${task.id}')" class="inline-flex items-center px-3 py-1 rounded-lg bg-blue-100 text-blue-800 text-sm font-medium hover:bg-blue-200">
                        <svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/>
                        </svg>
                        ${task.imageUrls.length} ảnh
                    </button>
                </div>
                ` : ''}
                <div class="mobile-card-actions">
                    <!-- Nút 1: Trạng thái xử lý -->
                    <button onclick="toggleTaskStatus('${task.id}')" 
                            class="${getStatusButtonClass(task.status)} text-white ${task.status === 'completed' ? 'opacity-50 cursor-not-allowed' : ''}"
                            ${task.status === 'completed' ? 'disabled' : ''}>
                        ${getStatusIcon(task.status)} ${task.status === 'pending' ? 'Xong' : 'Chưa'}
                    </button>
                    <!-- Nút 2: Nghiệm thu (sẽ bị ẩn bởi auth.js cho manager) -->
                    <button onclick="toggleTaskApproval('${task.id}')" 
                            class="${getApprovalButtonClass(task.status)} text-white ${task.status === 'pending' ? 'opacity-50 cursor-not-allowed' : ''}"
                            ${task.status === 'pending' ? 'disabled' : ''}>
                        ${getApprovalIcon(task.status)} ${task.status === 'completed' ? 'OK' : task.status === 'pending-review' ? 'Duyệt' : 'Chờ'}
                    </button>
                    <!-- Nút sửa/xóa mobile (sẽ bị ẩn bởi auth.js cho manager) -->
                    <button onclick="editTask('${task.id}')" class="bg-gray-500 hover:bg-gray-600 text-white">
                        <svg class="w-4 h-4 pointer-events-none" fill="currentColor" viewBox="0 0 20 20"><path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z"/></svg>
                        Sửa
                    </button>
                    <button onclick="deleteTask('${task.id}')" class="bg-red-500 hover:bg-red-600 text-white">
                        <svg class="w-4 h-4 pointer-events-none" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd"/></svg>
                        Xóa
                    </button>
                </div>
            `;
            mobileListEl.appendChild(mobileCard);
        });
    }
    
    // Render pagination
    renderTasksPagination(totalItems);
    
    // Ẩn nút action theo quyền (với timeout để đảm bảo DOM đã render)
    setTimeout(() => {
        if (window.hideActionButtons && typeof window.hideActionButtons === 'function') {
            window.hideActionButtons('tasks');
        }
    }, 100);
}

/**
 * Get status button class
 */
function getStatusButtonClass(status) {
    switch (status) {
        case 'pending': return 'bg-yellow-500 hover:bg-yellow-600'; // Chưa xử lý - màu vàng như đèn
        case 'pending-review': return 'bg-gray-500 hover:bg-gray-600'; // Chờ nghiệm thu - màu xám
        default: return 'bg-yellow-500 hover:bg-yellow-600';
    }
}

/**
 * Get approval button class cho nút 2 (nghiệm thu)
 */
function getApprovalButtonClass(status) {
    switch (status) {
        case 'pending': return 'bg-gray-400'; // Disable - màu xám
        case 'pending-review': return 'bg-green-500 hover:bg-green-600'; // Enable - màu xanh lá
        case 'completed': return 'bg-gray-500 hover:bg-gray-600'; // Hoàn thành - màu xám
        default: return 'bg-gray-400';
    }
}

/**
 * Get status badge class
 */
function getStatusBadgeClass(status) {
    switch (status) {
        case 'pending': return 'bg-yellow-100 text-yellow-800';
        case 'pending-review': return 'bg-purple-100 text-purple-800';
        case 'completed': return 'bg-green-100 text-green-800';
        default: return 'bg-gray-100 text-gray-800';
    }
}

/**
 * Get status text with completion time
 */
function getStatusText(status, completedAt = null) {
    switch (status) {
        case 'pending': 
            return 'Chưa xử lý';
        case 'pending-review':
        case 'completed':
            // Hiển thị ngày giờ hoàn thành cho cả 2 trạng thái (màu đen)
            const timeStr = formatCompletionTime(completedAt);
            return timeStr || 'N/A';
        default: 
            return 'Không xác định';
    }
}

/**
 * Update statistics
 */
function updateStats() {
    const total = tasksCache.length;
    const newTasks = tasksCache.filter(t => t.status === 'pending').length;
    const pendingReview = tasksCache.filter(t => t.status === 'pending-review').length;
    const completed = tasksCache.filter(t => t.status === 'completed').length;
    
    if (totalTasksEl) totalTasksEl.textContent = total;
    if (newTasksEl) newTasksEl.textContent = newTasks;
    if (pendingTasksEl) pendingTasksEl.textContent = pendingReview; // Sử dụng cho chờ nghiệm thu
    if (completedTasksEl) completedTasksEl.textContent = completed;
}

/**
 * Update statistics với data đã filter
 */
function updateStatsWithFiltered(filteredTasks) {
    const total = filteredTasks.length;
    const newTasks = filteredTasks.filter(t => t.status === 'pending').length;
    const completed = filteredTasks.filter(t => t.status === 'completed').length;
    
    if (totalTasksEl) totalTasksEl.textContent = total;
    if (newTasksEl) newTasksEl.textContent = newTasks;
    if (pendingTasksEl) pendingTasksEl.textContent = 0; // Không dùng nữa
    if (completedTasksEl) completedTasksEl.textContent = completed;
}

/**
 * Open task modal for add/edit
 */
function openTaskModal(taskData = null) {
    if (!taskModal) return;
    
    taskModalTitle.textContent = taskData ? 'Sửa Công việc' : 'Thêm Công việc';
    
    // Reset form
    taskForm.reset();
    taskIdEl.value = '';
    
    if (taskData) {
        taskIdEl.value = taskData.id;
        taskTitleEl.value = taskData.title;
        taskBuildingEl.value = taskData.buildingId || '';
        taskRoomEl.value = taskData.room || '';
        taskReporterEl.value = taskData.reporter;
    }
    
    // 🔥 SỬA: Dùng helper openModal từ utils để xử lý animation đúng cách
    openModal(taskModal);
    setTimeout(() => taskTitleEl.focus(), 50); // Focus sau khi animation bắt đầu
}

/**
 * Handle task form submit
 */
async function handleTaskFormSubmit(e) {
    e.preventDefault();
    
    const taskData = {
        title: taskTitleEl.value.trim(),
        buildingId: taskBuildingEl.value,
        room: taskRoomEl.value.trim(),
        reporter: taskReporterEl.value.trim(),
        status: 'pending'
    };
    
    try {
        const taskId = taskIdEl.value;
        
        if (taskId) {
            // Update existing task
            taskData.updatedAt = serverTimestamp();
            await updateDoc(doc(db, 'tasks', taskId), taskData);
            showToast('Cập nhật công việc thành công!', 'success');
        } else {
            // Add new task
            taskData.createdAt = serverTimestamp();
            taskData.updatedAt = serverTimestamp();
            await addDoc(collection(db, 'tasks'), taskData);
            showToast('Thêm công việc thành công!', 'success');
        }
        
        // 🔥 SỬA: Đóng modal và reset form TRƯỚC KHI load lại data
        closeModal(taskModal);
        taskForm.reset();
        taskIdEl.value = '';
        
        // Load lại data sau khi đóng modal để tránh block UI
        await loadTasks();
        
    } catch (error) {
        console.error('Error saving task:', error);
        showToast('Lỗi khi lưu công việc: ' + error.message, 'error');
    }
}

/**
 * Edit task - global function
 */
window.editTask = function(taskId) {
    const task = tasksCache.find(t => t.id === taskId);
    if (task) {
        openTaskModal(task);
    }
};

/**
 * Delete task - global function
 */
window.deleteTask = async function(taskId) {
    const confirmed = await showConfirm('Bạn có chắc chắn muốn xóa công việc này?', 'Xác nhận xóa');
    if (!confirmed) return;
    
    try {
        // 1. Xóa task
        await deleteDoc(doc(db, 'tasks', taskId));
        
        // 2. 🔥 XÓA THÔNG BÁO LIÊN QUAN ĐẾN TASK NÀY
        await deleteRelatedNotifications(taskId);
        
        showToast('Xóa công việc và thông báo liên quan thành công!', 'success');
        await loadTasks();
    } catch (error) {
        console.error('Error deleting task:', error);
        showToast('Lỗi khi xóa công việc: ' + error.message, 'error');
    }
};

/**
 * Toggle task status - global function
 */
/**
 * Bulk complete tasks - nghiệm thu hàng loạt
 */
async function handleBulkCompleteTasks() {
    // Lấy từ Set mobile nếu có, không thì từ desktop checkboxes
    let selectedIds;
    if (selectedMobileTaskIds.size > 0) {
        selectedIds = Array.from(selectedMobileTaskIds);
    } else {
        selectedIds = Array.from(document.querySelectorAll('.task-checkbox:checked'))
            .map(checkbox => checkbox.dataset.id);
    }
    
    if (selectedIds.length === 0) {
        showToast('Vui lòng chọn ít nhất một công việc để nghiệm thu!', 'warning');
        return;
    }
    
    const confirmed = await showConfirm(`Bạn có chắc chắn muốn nghiệm thu ${selectedIds.length} công việc đã chọn?`, 'Xác nhận nghiệm thu');
    if (!confirmed) return;
    
    try {
        let totalImagesDeleted = 0;
        
        // Xử lý từng task
        for (const taskId of selectedIds) {
            const task = tasksCache.find(t => t.id === taskId);
            if (!task) continue;
            
            // Nếu task có ảnh, xóa ảnh trước
            if (task.imageUrls && task.imageUrls.length > 0) {
                const deletePromises = task.imageUrls.map(url => {
                    try {
                        const path = decodeURIComponent(url.split('/o/')[1].split('?')[0]);
                        const imageRef = ref(storage, path);
                        return deleteObject(imageRef);
                    } catch (err) {
                        console.error('Error deleting image:', err);
                        return Promise.resolve();
                    }
                });
                
                await Promise.all(deletePromises);
                totalImagesDeleted += task.imageUrls.length;
                
                // Cập nhật task với status completed và xóa imageUrls
                await updateDoc(doc(db, 'tasks', taskId), {
                    status: 'completed',
                    imageUrls: [],
                    images: 0,
                    updatedAt: serverTimestamp()
                });
            } else {
                // Chỉ cập nhật status
                await updateDoc(doc(db, 'tasks', taskId), {
                    status: 'completed',
                    updatedAt: serverTimestamp()
                });
            }
            
            // Gửi thông báo
            await sendTaskCompletionNotification(task);
        }
        
        // Reset trạng thái
        selectedMobileTaskIds.clear();
        if (selectAllTasksBtn) selectAllTasksBtn.checked = false;
        document.querySelectorAll('.task-checkbox, .task-checkbox-mobile').forEach(cb => cb.checked = false);
        updateClearSelectionButton();
        updateBulkCompleteButton();
        
        const message = totalImagesDeleted > 0 
            ? `Đã nghiệm thu ${selectedIds.length} công việc và xóa ${totalImagesDeleted} ảnh!`
            : `Đã nghiệm thu ${selectedIds.length} công việc!`;
        
        showToast(message, 'success');
        await loadTasks();
        
    } catch (error) {
        console.error('Error bulk completing tasks:', error);
        showToast('Lỗi khi nghiệm thu: ' + error.message, 'error');
    }
}

// Function cho nút 1: Toggle giữa pending và pending-review
window.toggleTaskStatus = async function(taskId) {
    const task = tasksCache.find(t => t.id === taskId);
    if (!task) return;
    
    let newStatus;
    let updateData = {
        updatedAt: serverTimestamp()
    };
    
    // Toggle giữa pending và pending-review
    switch (task.status) {
        case 'pending':
            newStatus = 'pending-review';
            updateData.completedAt = serverTimestamp(); // Lưu thời gian hoàn thành
            break;
        case 'pending-review':
            newStatus = 'pending';
            updateData.completedAt = null; // Xóa thời gian hoàn thành
            break;
        default:
            newStatus = 'pending';
    }
    
    updateData.status = newStatus;
    
    try {
        await updateDoc(doc(db, 'tasks', taskId), updateData);
        
        // Cập nhật cache
        const taskIndex = tasksCache.findIndex(t => t.id === taskId);
        if (taskIndex !== -1) {
            tasksCache[taskIndex] = { ...tasksCache[taskIndex], ...updateData };
        }
        
        loadTasks(); // Refresh table
        showToast(`Đã cập nhật trạng thái thành ${newStatus === 'pending' ? 'Chưa xử lý' : 'Chờ nghiệm thu'}`, 'success');
    } catch (error) {
        console.error('Error updating task status:', error);
        showToast('Lỗi khi cập nhật trạng thái', 'error');
    }
};

// Function cho nút 2: Nghiệm thu (pending-review <-> completed)
window.toggleTaskApproval = async function(taskId) {
    const task = tasksCache.find(t => t.id === taskId);
    if (!task) return;
    
    // Không cho phép thao tác nếu task đang pending
    if (task.status === 'pending') {
        showToast('Cần hoàn thành công việc trước khi nghiệm thu', 'warning');
        return;
    }
    
    let newStatus;
    let updateData = {
        updatedAt: serverTimestamp()
    };
    
    // Toggle giữa pending-review và completed
    switch (task.status) {
        case 'pending-review':
            newStatus = 'completed';
            // Giữ nguyên completedAt
            break;
        case 'completed':
            newStatus = 'pending-review';
            // Giữ nguyên completedAt
            break;
        default:
            return;
    }
    
    updateData.status = newStatus;
    
    try {
        // Nếu chuyển sang completed và có ảnh → xóa ảnh để tiết kiệm bộ nhớ
        if (newStatus === 'completed' && task.imageUrls && task.imageUrls.length > 0) {
            console.log('🗑️ Deleting images from storage...');
            
            // Xóa từng ảnh trên Storage
            const deletePromises = task.imageUrls.map(url => {
                try {
                    // Extract path from URL
                    const path = decodeURIComponent(url.split('/o/')[1].split('?')[0]);
                    const imageRef = ref(storage, path);
                    return deleteObject(imageRef);
                } catch (err) {
                    console.error('Error deleting image:', err);
                    return Promise.resolve(); // Continue even if delete fails
                }
            });
            
            await Promise.all(deletePromises);
            console.log('✅ Deleted', task.imageUrls.length, 'images');
            
            // Update task to remove image URLs
            updateData.imageUrls = []; // Clear image URLs
            updateData.images = 0; // Reset count
        }
        
        // Update task with new status
        await updateDoc(doc(db, 'tasks', taskId), updateData);
        
        // Cập nhật cache
        const taskIndex = tasksCache.findIndex(t => t.id === taskId);
        if (taskIndex !== -1) {
            tasksCache[taskIndex] = { ...tasksCache[taskIndex], ...updateData };
        }
        
        loadTasks(); // Refresh table
        
        const statusMessages = {
            'pending-review': 'Đã chuyển về chờ nghiệm thu',
            'completed': 'Đã nghiệm thu hoàn thành'
        };
        
        showToast(statusMessages[newStatus] || `Đã cập nhật trạng thái nghiệm thu`, 'success');
        
        // 🔔 GỬI THÔNG BÁO ĐẨY KHI HOÀN THÀNH TASK
        if (newStatus === 'completed') {
            await sendTaskCompletionNotification(task);
        }
        
    } catch (error) {
        console.error('Error updating task approval:', error);
        showToast('Lỗi khi cập nhật nghiệm thu: ' + error.message, 'error');
    }
};

/**
 * Filter tasks
 */
function filterTasks() {
    const buildingFilter = filterTaskBuildingEl?.value || '';
    const roomFilter = filterTaskRoomEl?.value || '';
    const statusFilter = filterTaskStatusEl?.value || '';
    const searchText = taskSearchEl?.value?.toLowerCase() || '';
    const startDate = parseDateInput(filterTaskStartDateEl?.value || '');
    const endDate = parseDateInput(filterTaskEndDateEl?.value || '');
    
    const filtered = tasksCache.filter(task => {
        const matchBuilding = !buildingFilter || task.buildingId === buildingFilter;
        const matchRoom = !roomFilter || (task.room && task.room.toLowerCase().includes(roomFilter.toLowerCase()));
        const matchStatus = !statusFilter || task.status === statusFilter;
        const matchSearch = !searchText || 
            task.title.toLowerCase().includes(searchText) ||
            (task.description && task.description.toLowerCase().includes(searchText)) ||
            task.reporter.toLowerCase().includes(searchText);
        
        // Date filter (copy từ transactions)
        const taskDate = task.createdAt ? new Date(task.createdAt.seconds * 1000) : null;
        if (startDate && (!taskDate || taskDate < startDate)) return false;
        if (endDate && (!taskDate || taskDate > endDate)) return false;
        
        return matchBuilding && matchRoom && matchStatus && matchSearch;
    });
    
    // Reset về trang đầu khi filter thay đổi
    currentTasksPage = 1;
    
    renderTasks(filtered);
    
    // Cập nhật thống kê theo data đã lọc
    updateStatsWithFiltered(filtered);
    
    return filtered;
}

/**
 * Handle select all tasks
 */
function handleSelectAllTasks() {
    const checkboxes = document.querySelectorAll('.task-checkbox');
    const isChecked = selectAllTasksBtn.checked;
    
    checkboxes.forEach(checkbox => {
        checkbox.checked = isChecked;
    });
}

/**
 * Handle bulk delete tasks
 */
async function handleBulkDeleteTasks() {
    // Lấy từ Set mobile nếu có, không thì từ desktop checkboxes
    let selectedIds;
    if (selectedMobileTaskIds.size > 0) {
        selectedIds = Array.from(selectedMobileTaskIds);
    } else {
        selectedIds = Array.from(document.querySelectorAll('.task-checkbox:checked'))
            .map(checkbox => checkbox.dataset.id);
    }
    
    if (selectedIds.length === 0) {
        showToast('Vui lòng chọn ít nhất một công việc để xóa!', 'warning');
        return;
    }
    
    const confirmed = await showConfirm(`Bạn có chắc chắn muốn xóa ${selectedIds.length} công việc đã chọn?`, 'Xác nhận xóa');
    if (!confirmed) return;
    
    try {
        // 1. Xóa tasks
        const deletePromises = selectedIds.map(id => deleteDoc(doc(db, 'tasks', id)));
        await Promise.all(deletePromises);
        
        // 2. 🔥 XÓA THÔNG BÁO LIÊN QUAN ĐẾN CÁC TASK NÀY
        const notificationDeletePromises = selectedIds.map(taskId => deleteRelatedNotifications(taskId));
        await Promise.all(notificationDeletePromises);
        
        // Reset trạng thái
        selectedMobileTaskIds.clear();
        if (selectAllTasksBtn) selectAllTasksBtn.checked = false;
        document.querySelectorAll('.task-checkbox').forEach(cb => cb.checked = false);
        updateClearSelectionButton();
        
        showToast(`Đã xóa ${selectedIds.length} công việc và thông báo liên quan!`, 'success');
        await loadTasks();
        
    } catch (error) {
        console.error('Error bulk deleting tasks:', error);
        showToast('Lỗi khi xóa công việc: ' + error.message, 'error');
    }
}

/**
 * 🔥 Xóa các thông báo liên quan đến task
 */
async function deleteRelatedNotifications(taskId) {
    try {
        console.log(`🗑️ Deleting notifications related to task: ${taskId}`);
        
        // 🔥 SỬA LỖI: App sử dụng field 'taskId' chứ không phải 'relatedId'
        const notificationsQuery = query(
            collection(db, 'adminNotifications'),
            where('taskId', '==', taskId)
        );
        
        const snapshot = await getDocs(notificationsQuery);
        
        if (snapshot.empty) {
            console.log('📭 No related notifications found for taskId:', taskId);
            return;
        }
        
        console.log(`🔍 Found ${snapshot.docs.length} notifications to delete`);
        
        // Xóa tất cả thông báo liên quan
        const deletePromises = snapshot.docs.map(notificationDoc => {
            console.log(`🗑️ Deleting notification: ${notificationDoc.id}`);
            return deleteDoc(doc(db, 'adminNotifications', notificationDoc.id));
        });
        
        await Promise.all(deletePromises);
        
        console.log(`✅ Successfully deleted ${snapshot.docs.length} related notifications`);
        
    } catch (error) {
        console.error('❌ Error deleting related notifications:', error);
        // Không throw error để không block việc xóa task
    }
}

/**
 * Xem ảnh của task
 */
window.viewTaskImages = function(taskId) {
    const task = tasksCache.find(t => t.id === taskId);
    if (!task || !task.imageUrls || task.imageUrls.length === 0) {
        showToast('Không có ảnh nào!', 'info');
        return;
    }
    
    // Tạo modal hiển thị ảnh
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-black bg-opacity-75 z-50 flex items-center justify-center p-4';
    modal.onclick = (e) => {
        if (e.target === modal) modal.remove();
    };
    
    const content = document.createElement('div');
    content.className = 'bg-white rounded-lg p-6 max-w-4xl max-h-[90vh] overflow-y-auto';
    content.onclick = (e) => e.stopPropagation();
    
    content.innerHTML = `
        <div class="flex justify-between items-center mb-4">
            <h3 class="text-xl font-bold">Hình ảnh sự cố (${task.imageUrls.length})</h3>
            <button onclick="this.closest('.fixed').remove()" class="text-gray-500 hover:text-gray-700">
                <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                </svg>
            </button>
        </div>
        <div class="grid grid-cols-2 gap-4">
            ${task.imageUrls.map((url, index) => `
                <div class="relative">
                    <img src="${url}" alt="Ảnh ${index + 1}" class="w-full h-64 object-cover rounded-lg border border-gray-300">
                    <a href="${url}" target="_blank" class="absolute bottom-2 right-2 bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700">
                        Mở ảnh gốc
                    </a>
                </div>
            `).join('')}
        </div>
    `;
    
    modal.appendChild(content);
    document.body.appendChild(modal);
};

/**
 * Cập nhật trạng thái hiển thị nút bỏ chọn hàng loạt
 */
function updateClearSelectionButton() {
    const clearBtn = document.getElementById('clear-selection-tasks-btn');
    if (clearBtn) {
        if (selectedMobileTaskIds.size >= 2) {
            clearBtn.classList.remove('hidden');
        } else {
            clearBtn.classList.add('hidden');
        }
    }
}

/**
 * Cập nhật trạng thái hiển thị nút nghiệm thu hàng loạt
 */
function updateBulkCompleteButton() {
    const bulkCompleteBtn = document.getElementById('bulk-complete-tasks-btn');
    if (bulkCompleteBtn) {
        // Hiển nút khi có ít nhất 2 task được chọn
        if (selectedMobileTaskIds.size >= 2) {
            bulkCompleteBtn.classList.remove('hidden');
        } else {
            bulkCompleteBtn.classList.add('hidden');
        }
    }
}

/**
 * Gửi thông báo đẩy khi hoàn thành task
 */
async function sendTaskCompletionNotification(task) {
    try {
        // Tìm thông tin khách hàng từ buildingId và room
        const customers = getCustomers();
        const customer = customers.find(c => 
            c.buildingId === task.buildingId && 
            c.room === task.room
        );
        
        if (!customer) {
            return;
        }
        
        // Tìm thông tin tòa nhà
        const buildings = getBuildings();
        const building = buildings.find(b => b.id === task.buildingId);
        
        const { sendPushNotification } = await import('../utils.js');
        await sendPushNotification(
            customer.id,
            '✅ Sự cố đã được xử lý',
            `Sự cố "${task.title}" tại phòng ${building?.code || ''}-${task.room} đã được xử lý xong. Cảm ơn bạn đã báo cáo!`,
            {
                type: 'task_completed',
                taskId: task.id,
                buildingCode: building?.code || '',
                room: task.room,
                taskTitle: task.title
            }
        );
        
    } catch (error) {
        console.error('❌ Lỗi khi gửi thông báo hoàn thành task:', error);
    }
}

/**
 * Render pagination cho tasks
 */
function renderTasksPagination(totalItems) {
    const paginationEl = document.getElementById('tasks-pagination');
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
    const startItem = (currentTasksPage - 1) * ITEMS_PER_PAGE + 1;
    const endItem = Math.min(currentTasksPage * ITEMS_PER_PAGE, totalItems);
    paginationHTML += `
        <div class="text-sm text-gray-700">
            Hiển thị <span class="font-medium">${startItem}</span> đến <span class="font-medium">${endItem}</span>
            trong tổng số <span class="font-medium">${totalItems}</span> công việc
        </div>
    `;
    
    // Nút điều hướng
    paginationHTML += '<div class="flex gap-2">';
    
    // Nút Previous
    if (currentTasksPage > 1) {
        paginationHTML += `
            <button onclick="changeTasksPage(${currentTasksPage - 1})" 
                    class="px-3 py-1 text-sm bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 rounded">
                Trước
            </button>
        `;
    }
    
    // Các số trang
    let startPage = Math.max(1, currentTasksPage - 2);
    let endPage = Math.min(totalPages, startPage + 4);
    
    if (endPage - startPage < 4) {
        startPage = Math.max(1, endPage - 4);
    }
    
    for (let i = startPage; i <= endPage; i++) {
        const activeClass = i === currentTasksPage 
            ? 'bg-blue-500 text-white border-blue-500' 
            : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50';
        
        paginationHTML += `
            <button onclick="changeTasksPage(${i})" 
                    class="px-3 py-1 text-sm border rounded ${activeClass}">
                ${i}
            </button>
        `;
    }
    
    // Nút Next
    if (currentTasksPage < totalPages) {
        paginationHTML += `
            <button onclick="changeTasksPage(${currentTasksPage + 1})" 
                    class="px-3 py-1 text-sm bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 rounded">
                Sau
            </button>
        `;
    }
    
    paginationHTML += '</div></nav>';
    paginationEl.innerHTML = paginationHTML;
}

/**
 * Thay đổi trang cho tasks
 */
window.changeTasksPage = function(page) {
    currentTasksPage = page;
    const filtered = filterTasks();
    renderTasks(filtered);
};