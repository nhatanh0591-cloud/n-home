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
    closeModal,
    parseDateInput,
    showConfirm
} from '../utils.js';

// Cache và biến global
let tasksCache = [];
let buildingsCache = [];

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
    
    // Bulk delete
    bulkDeleteTasksBtn?.addEventListener('click', handleBulkDeleteTasks);
    selectAllTasksBtn?.addEventListener('change', handleSelectAllTasks);
    
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
    
    if (tasks.length === 0) {
        tasksListEl.innerHTML = `
            <tr>
                <td colspan="7" class="text-center py-8 text-gray-500">
                    Chưa có công việc nào. Nhấn nút "+" để thêm mới.
                </td>
            </tr>
        `;
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
    
    tasksListEl.innerHTML = currentTasks.map(task => {
        const building = buildingsCache.find(b => b.id === task.buildingId);
        const buildingName = building ? building.code : 'N/A';
        
        return `
            <tr class="border-b hover:bg-gray-50">
                <td class="py-3 px-4">
                    <input type="checkbox" class="task-checkbox w-4 h-4 cursor-pointer" data-id="${task.id}">
                </td>
                <td class="py-3 px-4">
                    <div class="flex gap-2">
                        <button onclick="toggleTaskStatus('${task.id}')" class="w-8 h-8 rounded ${getStatusButtonClass(task.status)} flex items-center justify-center" title="Nghiệm thu">
                            <svg class="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
                            </svg>
                        </button>
                        ${task.imageUrls && task.imageUrls.length > 0 ? `
                            <button onclick="viewTaskImages('${task.id}')" class="w-8 h-8 rounded bg-blue-500 hover:bg-blue-600 flex items-center justify-center relative" title="Xem ${task.imageUrls.length} ảnh">
                                <svg class="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/>
                                </svg>
                                <span class="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">${task.imageUrls.length}</span>
                            </button>
                        ` : ''}
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
                <td class="py-3 px-4">
                    <div class="font-medium text-gray-900">${task.title}</div>
                    ${task.description ? `<div class="text-sm text-gray-500">${task.description}</div>` : ''}
                </td>
                <td class="py-3 px-4">${buildingName}</td>
                <td class="py-3 px-4">${task.room || 'N/A'}</td>
                <td class="py-3 px-4">${task.reporter}</td>
                <td class="py-3 px-4">${formatDateTime(task.createdAt)}</td>
                <td class="py-3 px-4">
                    <span class="px-2 py-1 text-xs rounded-full ${getStatusBadgeClass(task.status)}">
                        ${getStatusText(task.status)}
                    </span>
                </td>
            </tr>
        `;
    }).join('');
    
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
        case 'completed': return 'bg-gray-400 hover:bg-gray-500';
        case 'in-progress': return 'bg-yellow-500 hover:bg-yellow-600';
        default: return 'bg-green-500 hover:bg-green-600';
    }
}

/**
 * Get status badge class
 */
function getStatusBadgeClass(status) {
    switch (status) {
        case 'pending': return 'bg-yellow-100 text-yellow-800';
        case 'in-progress': return 'bg-blue-100 text-blue-800';
        case 'completed': return 'bg-green-100 text-green-800';
        default: return 'bg-gray-100 text-gray-800';
    }
}

/**
 * Get status text
 */
function getStatusText(status) {
    switch (status) {
        case 'pending': return 'Chưa xử lý';
        case 'in-progress': return 'Đang xử lý';
        case 'completed': return 'Hoàn thành';
        default: return 'Không xác định';
    }
}

/**
 * Update statistics
 */
function updateStats() {
    const total = tasksCache.length;
    const newTasks = tasksCache.filter(t => t.status === 'pending').length;
    const completed = tasksCache.filter(t => t.status === 'completed').length;
    
    if (totalTasksEl) totalTasksEl.textContent = total;
    if (newTasksEl) newTasksEl.textContent = newTasks;
    if (pendingTasksEl) pendingTasksEl.textContent = 0; // Không dùng nữa
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
    
    taskModal.classList.remove('hidden');
    taskTitleEl.focus();
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
        
        closeModal(taskModal);
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
window.toggleTaskStatus = async function(taskId) {
    const task = tasksCache.find(t => t.id === taskId);
    if (!task) return;
    
    let newStatus;
    switch (task.status) {
        case 'pending':
            newStatus = 'completed';
            break;
        case 'completed':
            newStatus = 'pending';
            break;
        default:
            newStatus = 'pending';
    }
    
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
            await updateDoc(doc(db, 'tasks', taskId), {
                status: newStatus,
                imageUrls: [], // Clear image URLs
                images: 0, // Reset count
                updatedAt: serverTimestamp()
            });
            
            showToast(`Đã nghiệm thu và xóa ${task.imageUrls.length} ảnh!`, 'success');
        } else {
            // Normal status update
            await updateDoc(doc(db, 'tasks', taskId), {
                status: newStatus,
                updatedAt: serverTimestamp()
            });
            
            showToast(`Đã cập nhật trạng thái: ${getStatusText(newStatus)}`, 'success');
        }
        
        // 🔔 GỬI THÔNG BÁO ĐẨY KHI HOÀN THÀNH TASK
        if (newStatus === 'completed') {
            await sendTaskCompletionNotification(task);
        }
        
        await loadTasks();
        
    } catch (error) {
        console.error('Error updating task status:', error);
        showToast('Lỗi khi cập nhật trạng thái: ' + error.message, 'error');
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
    const selectedIds = Array.from(document.querySelectorAll('.task-checkbox:checked'))
        .map(checkbox => checkbox.dataset.id);
    
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
        
        showToast(`Đã xóa ${selectedIds.length} công việc và thông báo liên quan!`, 'success');
        await loadTasks();
        
        // Uncheck select all
        if (selectAllTasksBtn) selectAllTasksBtn.checked = false;
        
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