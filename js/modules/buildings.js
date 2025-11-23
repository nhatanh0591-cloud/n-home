// js/modules/buildings.js

import { db, addDoc, setDoc, doc, deleteDoc, collection, serverTimestamp } from '../firebase.js';
import { getBuildings, getServices, getAccounts, getState, saveToCache, updateInLocalStorage, deleteFromLocalStorage } from '../store.js';
import { showToast, openModal, closeModal, formatNumber, formatMoney, exportToExcel, showConfirm } from '../utils.js';

// --- BIẾN CỤC BỘ CHO MODULE ---
let currentBuildingServices = []; // Dịch vụ tạm thời khi chỉnh sửa tòa nhà
let originalBuildingServices = []; // Sao lưu dịch vụ gốc
let isCreatingServiceFromBuilding = false; // Cờ báo hiệu
let selectedMobileBuildingIds = new Set(); // Checkbox mobile persistent

// --- DOM ELEMENTS (Chỉ liên quan đến Tòa nhà) ---
const buildingsSection = document.getElementById('buildings-section');
const buildingsListEl = document.getElementById('buildings-list');

// Stats
const totalBuildingsEl = document.getElementById('total-buildings');
const totalRoomsEl = document.getElementById('total-rooms');
const activeBuildingsEl = document.getElementById('active-buildings');
const inactiveBuildingsEl = document.getElementById('inactive-buildings');

// Filters
const statusFilterEl = document.getElementById('building-status-filter');
const searchInputEl = document.getElementById('building-search');
const selectAllCheckbox = document.getElementById('select-all-buildings');

// Modals
const buildingModal = document.getElementById('building-modal');
const buildingModalTitle = document.getElementById('building-modal-title');
const buildingForm = document.getElementById('building-form');
const buildingIsActiveCheckbox = document.getElementById('building-is-active');
const buildingStatusText = document.getElementById('building-status-text');
const buildingServicesListEl = document.getElementById('building-services-list');
const roomsModal = document.getElementById('rooms-modal');
const importBuildingsModal = document.getElementById('import-buildings-modal');

// Modals (Dịch vụ)
const selectBuildingServiceModal = document.getElementById('select-building-service-modal');
const availableServicesListEl = document.getElementById('available-services-list');
const searchServicesInput = document.getElementById('search-services');
const serviceModal = document.getElementById('service-modal'); // Cần để mở modal tạo service mới

// --- HÀM CHÍNH ---

/**
 * Hàm khởi tạo, được gọi 1 lần duy nhất từ main.js
 */
export function initBuildings() {
    // Lắng nghe sự kiện từ store
    // Khi dữ liệu tòa nhà thay đổi, tự động render lại
    document.addEventListener('store:buildings:updated', () => {
        if (!buildingsSection.classList.contains('hidden')) {
            loadBuildings();
        }
    });

    // Lắng nghe khi dữ liệu accounts thay đổi để cập nhật hiển thị
    document.addEventListener('store:accounts:updated', () => {
        if (!buildingsSection.classList.contains('hidden')) {
            loadBuildings(); // Re-render để cập nhật thông tin tài khoản
        }
    });

    // Lắng nghe sự kiện click trên toàn trang (sử dụng event delegation)
    document.body.addEventListener('click', handleBodyClick);

    // Lắng nghe sự kiện cho các modal
    buildingForm.addEventListener('submit', handleBuildingFormSubmit);
    buildingIsActiveCheckbox.addEventListener('change', (e) => {
        buildingStatusText.textContent = e.target.checked ? 'Hoạt động' : 'Không hoạt động';
    });

    // Lắng nghe sự kiện cho các bộ lọc
    statusFilterEl.addEventListener('change', loadBuildings);
    searchInputEl.addEventListener('input', loadBuildings);
    selectAllCheckbox.addEventListener('change', (e) => {
        document.querySelectorAll('.building-checkbox').forEach(cb => cb.checked = e.target.checked);
    });
    
    // Lắng nghe nút bỏ chọn hàng loạt
    document.getElementById('clear-selection-buildings-btn')?.addEventListener('click', () => {
        selectedMobileBuildingIds.clear();
        document.querySelectorAll('.building-checkbox').forEach(cb => cb.checked = false);
        updateClearSelectionButton();
        showToast('Bỏ chọn thành công!');
    });

    // Lắng nghe sự kiện cho modal import
    initImportModal();
}

/**
 * Tải và hiển thị danh sách tòa nhà
 */
export function loadBuildings() {
    if (buildingsSection?.classList.contains('hidden')) return;
    
    let buildings = getBuildings(); // Lấy dữ liệu mới nhất từ store
    updateBuildingStats(buildings);

    // Áp dụng bộ lọc
    const statusFilter = statusFilterEl.value;
    const searchText = searchInputEl.value.toLowerCase();

    if (statusFilter === 'active') {
        buildings = buildings.filter(b => b.isActive !== false);
    } else if (statusFilter === 'inactive') {
        buildings = buildings.filter(b => b.isActive === false);
    }

    if (searchText) {
        buildings = buildings.filter(b =>
            (b.code && b.code.toLowerCase().includes(searchText)) ||
            (b.address && b.address.toLowerCase().includes(searchText))
        );
    }

    renderBuildingsTable(buildings);
}

/**
 * Cập nhật các thẻ thống kê (stats)
 */
function updateBuildingStats(buildings) {
    const totalBuildings = buildings.length;
    const activeBuildings = buildings.filter(building => building.isActive !== false).length;
    const inactiveBuildings = totalBuildings - activeBuildings;
    
    // Tính tổng số phòng
    const totalRooms = buildings.reduce((sum, building) => sum + building.rooms.length, 0);

    totalBuildingsEl.textContent = totalBuildings;
    totalRoomsEl.textContent = totalRooms;
    activeBuildingsEl.textContent = activeBuildings;
    inactiveBuildingsEl.textContent = inactiveBuildings;
}

/**
 * Hiển thị dữ liệu tòa nhà lên bảng
 */
function renderBuildingsTable(buildings) {
    buildingsListEl.innerHTML = ''; // Xóa bảng cũ
    const mobileListEl = document.getElementById('buildings-mobile-list');
    if (mobileListEl) mobileListEl.innerHTML = '';

    if (buildings.length === 0) {
        buildingsListEl.innerHTML = '<tr><td colspan="8" class="p-8 text-center text-gray-500">Không tìm thấy tòa nhà nào.</td></tr>';
        return;
    }

    buildings.forEach(building => {
        // Tìm thông tin tài khoản được gán
        const accounts = getAccounts();
        const assignedAccount = building.accountId ? accounts.find(acc => acc.id === building.accountId) : null;
        let accountDisplay = '<span class="text-gray-400 text-sm">Chưa gán</span>';
        let accountDisplayMobile = 'Chưa gán';
        
        if (assignedAccount) {
            if (assignedAccount.bank === 'Cash') {
                accountDisplay = '<span class="text-green-600 font-medium">Tiền mặt</span>';
                accountDisplayMobile = 'Tiền mặt';
            } else {
                const name = assignedAccount.accountHolder || assignedAccount.accountNumber || 'Chưa rõ';
                accountDisplay = `<div class="text-sm"><div class="font-medium">${assignedAccount.bank}</div><div class="text-gray-600">${name}</div></div>`;
                accountDisplayMobile = `${assignedAccount.bank} - ${name}`;
            }
        }

        // 🖥️ RENDER DESKTOP ROW
        const tr = document.createElement('tr');
        tr.className = 'border-b hover:bg-gray-50';
        tr.innerHTML = `
            <td class="py-4 px-4">
                <input type="checkbox" class="building-checkbox w-4 h-4 cursor-pointer" data-id="${building.id}" data-code="${building.code}">
            </td>
            <td class="py-4 px-4 font-bold text-blue-600">${building.code || 'N/A'}</td>
            <td class="py-4 px-4">
                <div class="flex gap-3">
                    <button data-id="${building.id}" class="edit-building-btn w-8 h-8 rounded bg-gray-500 hover:bg-gray-600 flex items-center justify-center" title="Sửa">
                        <svg class="w-4 h-4 text-white pointer-events-none" fill="currentColor" viewBox="0 0 20 20"><path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z"/></svg>
                    </button>
                    <button data-id="${building.id}" class="delete-building-btn w-8 h-8 rounded bg-red-500 hover:bg-red-600 flex items-center justify-center" title="Xóa">
                        <svg class="w-4 h-4 text-white pointer-events-none" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd"/></svg>
                    </button>
                </div>
            </td>
            <td class="py-4 px-4 font-medium">${building.address}</td>
            <td class="py-4 px-4">${building.rooms.length} phòng</td>
            <td class="py-4 px-4">
                <button data-building-id="${building.id}" data-building-code="${building.code}" data-rooms='${JSON.stringify(building.rooms)}' class="view-rooms-btn text-blue-600 hover:underline font-medium text-sm">
                    [Xem danh sách]
                </button>
            </td>
            <td class="py-4 px-4">${accountDisplay}</td>
            <td class="py-4 px-4">
                <span class="px-3 py-1 rounded-full text-xs font-semibold ${building.isActive !== false ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}">
                    ${building.isActive !== false ? 'Hoạt động' : 'Không hoạt động'}
                </span>
            </td>
        `;
        buildingsListEl.appendChild(tr);
        
        // 📱 RENDER MOBILE CARD
        if (mobileListEl) {
            const isChecked = selectedMobileBuildingIds.has(building.id);
            const mobileCard = document.createElement('div');
            mobileCard.className = 'mobile-card';
            mobileCard.innerHTML = `
                <div class="flex items-center gap-3 mb-3 pb-3 border-b">
                    <input type="checkbox" class="building-checkbox w-5 h-5 cursor-pointer" data-id="${building.id}" data-code="${building.code}" ${isChecked ? 'checked' : ''}>
                    <span class="text-xs text-gray-500 flex-1">Chọn để xóa nhiều</span>
                </div>
                <div class="mobile-card-row">
                    <span class="mobile-card-label">Mã tòa nhà:</span>
                    <span class="mobile-card-value font-bold text-blue-600">${building.code || 'N/A'}</span>
                </div>
                <div class="mobile-card-row">
                    <span class="mobile-card-label">Địa chỉ:</span>
                    <span class="mobile-card-value font-medium">${building.address}</span>
                </div>
                <div class="mobile-card-row">
                    <span class="mobile-card-label">Số phòng:</span>
                    <span class="mobile-card-value">${building.rooms.length} phòng</span>
                </div>
                <div class="mobile-card-row">
                    <span class="mobile-card-label">Danh sách:</span>
                    <button data-building-id="${building.id}" data-building-code="${building.code}" data-rooms='${JSON.stringify(building.rooms)}' class="view-rooms-btn text-blue-600 hover:underline font-medium text-sm">
                        [Xem danh sách phòng]
                    </button>
                </div>
                <div class="mobile-card-row">
                    <span class="mobile-card-label">Sổ quỹ:</span>
                    <span class="mobile-card-value text-sm">${accountDisplayMobile}</span>
                </div>
                <div class="mobile-card-row">
                    <span class="mobile-card-label">Trạng thái:</span>
                    <span class="mobile-card-value">
                        <span class="px-3 py-1 rounded-full text-xs font-semibold ${building.isActive !== false ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}">
                            ${building.isActive !== false ? 'Hoạt động' : 'Không hoạt động'}
                        </span>
                    </span>
                </div>
                <div class="mobile-card-actions">
                    <button data-id="${building.id}" class="edit-building-btn bg-gray-500 hover:bg-gray-600 text-white">
                        <svg class="w-4 h-4 pointer-events-none" fill="currentColor" viewBox="0 0 20 20"><path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z"/></svg>
                        Sửa
                    </button>
                    <button data-id="${building.id}" class="delete-building-btn bg-red-500 hover:bg-red-600 text-white">
                        <svg class="w-4 h-4 pointer-events-none" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd"/></svg>
                        Xóa
                    </button>
                </div>
            `;
            mobileListEl.appendChild(mobileCard);
        }
    });
}

/**
 * Xử lý tất cả các sự kiện click trên body
 */
async function handleBodyClick(e) {
    const target = e.target;
    const id = target.dataset.id || target.closest('[data-id]')?.dataset.id;

    // Nút "Thêm tòa nhà"
    if (target.id === 'add-building-btn' || target.closest('#add-building-btn')) {
        buildingModalTitle.textContent = 'Thêm Tòa nhà';
        buildingForm.reset();
        document.getElementById('building-id').value = '';
        buildingIsActiveCheckbox.checked = true;
        buildingStatusText.textContent = 'Hoạt động';
        currentBuildingServices = [];
        originalBuildingServices = [];
        renderBuildingServices();
        loadAccountsToDropdown();
        openModal(buildingModal);
    }
    // Nút "Sửa" tòa nhà
    else if (target.classList.contains('edit-building-btn')) {
        const building = getBuildings().find(b => b.id === id);
        if (building) {
            buildingModalTitle.textContent = 'Sửa Tòa nhà';
            document.getElementById('building-id').value = building.id;
            document.getElementById('building-code').value = building.code || '';
            document.getElementById('building-address').value = building.address;
            document.getElementById('building-rooms').value = building.rooms.join(', ');
            buildingIsActiveCheckbox.checked = building.isActive !== false;
            buildingStatusText.textContent = buildingIsActiveCheckbox.checked ? 'Hoạt động' : 'Không hoạt động';
            
            currentBuildingServices = JSON.parse(JSON.stringify(building.services || []));
            originalBuildingServices = JSON.parse(JSON.stringify(building.services || []));
            renderBuildingServices();
            loadAccountsToDropdown();
            
            // Set giá trị account sau khi load dropdown với retry mechanism
            const accountIdToSet = building.accountId || '';
            setTimeout(() => {
                const accountSelect = document.getElementById('building-account');
                if (accountSelect) {
                    accountSelect.value = accountIdToSet;
                    // Double check để đảm bảo value được set
                    if (accountSelect.value !== accountIdToSet && accountIdToSet) {
                        // Try again if failed
                        setTimeout(() => {
                            accountSelect.value = accountIdToSet;
                        }, 50);
                    }
                }
            }, 150);
            
            openModal(buildingModal);
        }
    }
    // Nút "Xóa" tòa nhà
    else if (target.classList.contains('delete-building-btn')) {
        const confirmed = await showConfirm('Bạn có chắc muốn xóa tòa nhà này?', 'Xác nhận xóa');
        if (confirmed) {
            try {
                // Delete Firebase
                await deleteDoc(doc(db, 'buildings', id));
                
                // Delete localStorage
                deleteFromLocalStorage('buildings', id);
                showToast('Xóa tòa nhà thành công!');
            } catch (error) {
                showToast('Lỗi xóa tòa nhà: ' + error.message, 'error');
            }
        }
    }
    // Checkbox mobile
    else if (target.classList.contains('building-checkbox')) {
        const buildingId = target.dataset.id;
        if (target.checked) {
            selectedMobileBuildingIds.add(buildingId);
        } else {
            selectedMobileBuildingIds.delete(buildingId);
        }
        updateClearSelectionButton();
    }
    // Nút "Xem danh sách phòng"
    else if (target.classList.contains('view-rooms-btn')) {
        const buildingCode = target.dataset.buildingCode;
        const rooms = JSON.parse(target.dataset.rooms);
        document.getElementById('rooms-modal-title').textContent = `Danh sách phòng - ${buildingCode}`;
        document.getElementById('rooms-modal-content').innerHTML = rooms.map(room =>
            `<span class="bg-blue-100 text-blue-800 px-3 py-2 rounded text-sm font-medium text-center">${room}</span>`
        ).join('');
        openModal(roomsModal);
    }
    // Nút đóng modal phòng
    else if (target.id === 'close-rooms-modal') {
        closeModal(roomsModal);
    }
    // Nút "Thêm dịch vụ" (trong modal tòa nhà)
    else if (target.id === 'add-building-service-btn' || target.closest('#add-building-service-btn')) {
        showAvailableServices();
        openModal(selectBuildingServiceModal);
    }
    // Nút "Xóa dịch vụ" (trong modal tòa nhà)
    else if (target.classList.contains('remove-building-service-btn')) {
        const index = parseInt(target.dataset.index);
        currentBuildingServices.splice(index, 1);
        renderBuildingServices();
    }
    // Nút "Thêm" dịch vụ (trong modal chọn dịch vụ)
    else if (target.classList.contains('add-service-to-building-btn')) {
        const service = getServices().find(s => s.id === target.dataset.id);
        if (service && !currentBuildingServices.some(s => s.id === service.id)) {
            currentBuildingServices.push({ ...service });
            renderBuildingServices();
            showAvailableServices(); // Refresh lại modal chọn
        }
    }
    // Nút "Tạo dịch vụ mới" (trong modal chọn dịch vụ)
    else if (target.id === 'create-new-service-btn' || target.closest('#create-new-service-btn')) {
        closeModal(selectBuildingServiceModal);
        isCreatingServiceFromBuilding = true; // Đặt cờ
        // Cần module service xử lý việc mở modal
        // Tạm thời, chúng ta sẽ giả định module service đã export hàm openServiceModal
        // Vì chưa có, chúng ta sẽ thông báo cho main.js
        document.dispatchEvent(new CustomEvent('request:openServiceModal', { detail: { isCreatingServiceFromBuilding: true } }));
    }
    // Nút đóng modal
    else if (target.id === 'close-building-modal' || target.id === 'cancel-building-btn') {
        closeModal(buildingModal);
    }
    else if (target.id === 'close-select-service-modal' || target.id === 'cancel-select-service-btn') {
        // Hủy bỏ - Khôi phục lại dịch vụ ban đầu
        currentBuildingServices = JSON.parse(JSON.stringify(originalBuildingServices));
        renderBuildingServices();
        closeModal(selectBuildingServiceModal);
    }
    // Nút "Hoàn tất" - Lưu các dịch vụ đã chọn
    else if (target.id === 'confirm-select-service-btn') {
        // Cập nhật backup với dịch vụ mới
        originalBuildingServices = JSON.parse(JSON.stringify(currentBuildingServices));
        renderBuildingServices();
        closeModal(selectBuildingServiceModal);
        showToast('Đã thêm dịch vụ vào tòa nhà!');
    }
    // Nút Xóa nhiều
    else if (target.id === 'bulk-delete-buildings-btn' || target.closest('#bulk-delete-buildings-btn')) {
        handleBulkDelete();
    }
    // Nút Xuất Excel
    else if (target.id === 'export-buildings-btn' || target.closest('#export-buildings-btn')) {
        handleExport();
    }
    // Nút Import Excel
    else if (target.id === 'import-buildings-btn' || target.closest('#import-buildings-btn')) {
        openModal(importBuildingsModal);
    }
}

/**
 * Xử lý khi submit form Thêm/Sửa Tòa nhà
 */
async function handleBuildingFormSubmit(e) {
    e.preventDefault();
    const id = document.getElementById('building-id').value;
    const code = document.getElementById('building-code').value.trim();
    const address = document.getElementById('building-address').value.trim();
    const roomsText = document.getElementById('building-rooms').value.trim();
    const rooms = roomsText.split(',').map(room => room.trim()).filter(room => room);
    const isActive = buildingIsActiveCheckbox.checked;
    const accountSelect = document.getElementById('building-account');
    const accountId = accountSelect ? accountSelect.value : '';
    
    console.log('📝 Submitting building with account ID:', accountId);
    console.log('📝 Account select element exists:', !!accountSelect);

    if (!code || !address || rooms.length === 0) {
        showToast('Vui lòng nhập đầy đủ thông tin!', 'error');
        return;
    }

    try {
        // Lọc ra các dịch vụ mới (nếu có)
        const finalServices = [];
        for (const service of currentBuildingServices) {
            if (service.isNew) {
                // Dịch vụ này được tạo từ 'create-new-service-btn'
                // Nó cần được tạo trong collection 'services' trước
                const serviceData = {
                    name: service.name,
                    price: service.price,
                    unit: service.unit,
                    buildings: [id], // Gán cho tòa nhà này
                    createdAt: serverTimestamp(),
                    updatedAt: serverTimestamp()
                };
                const docRef = await addDoc(collection(db, 'services'), serviceData);
                finalServices.push({ id: docRef.id, name: service.name, price: service.price, unit: service.unit });
            } else {
                finalServices.push({ id: service.id, name: service.name, price: service.price, unit: service.unit });
            }
        }
        
        const buildingData = {
            code,
            address,
            rooms,
            isActive,
            services: finalServices, // Chỉ lưu thông tin cơ bản
            updatedAt: serverTimestamp()
        };
        
        // LUÔN set accountId (có thể là empty string để xóa giá trị cũ)
        buildingData.accountId = accountId && accountId.trim() !== '' ? accountId : null;

        let buildingId = id;
        if (id) {
            // Update Firebase
            await setDoc(doc(db, 'buildings', id), buildingData, { merge: true });
            
            // Update localStorage
            updateInLocalStorage('buildings', id, buildingData);
            showToast('Cập nhật tòa nhà thành công!');
        } else {
            // Create Firebase
            buildingData.createdAt = serverTimestamp();
            const docRef = await addDoc(collection(db, 'buildings'), buildingData);
            buildingId = docRef.id;
            
            // Add to localStorage với Firebase ID
            const newItem = { 
                ...buildingData, 
                id: docRef.id,
                createdAt: new Date(),
                updatedAt: new Date()
            };
            const state = getState();
            state.buildings.unshift(newItem);
            saveToCache();
            document.dispatchEvent(new CustomEvent('store:buildings:updated'));
            
            showToast('Thêm tòa nhà thành công!');
        }

        // ✅ ĐỒNG BỘ: Cập nhật field "buildings" cho từng dịch vụ
        for (const service of finalServices) {
            if (!service.isNew) { // Chỉ cập nhật dịch vụ đã tồn tại
                const serviceRef = doc(db, 'services', service.id);
                const serviceData = getServices().find(s => s.id === service.id);
                if (serviceData) {
                    const currentBuildings = serviceData.buildings || [];
                    if (!currentBuildings.includes(buildingId)) {
                        await setDoc(serviceRef, {
                            buildings: [...currentBuildings, buildingId],
                            updatedAt: serverTimestamp()
                        }, { merge: true });
                    }
                }
            }
        }

        closeModal(buildingModal);
        // Store listener sẽ tự động cập nhật UI
    } catch (error) {
        showToast('Lỗi lưu tòa nhà: ' + error.message, 'error');
    }
}

/**
 * Hiển thị danh sách dịch vụ có sẵn trong modal
 */
function showAvailableServices() {
    const services = getServices();
    availableServicesListEl.innerHTML = '';

    const searchText = searchServicesInput.value.toLowerCase();
    const filteredServices = services.filter(s => s.name.toLowerCase().includes(searchText));

    if (filteredServices.length === 0) {
        availableServicesListEl.innerHTML = '<div class="text-center text-gray-500 py-4">Không tìm thấy dịch vụ nào.</div>';
        return;
    }

    filteredServices.forEach(service => {
        const isAdded = currentBuildingServices.some(s => s.id === service.id);
        const serviceDiv = document.createElement('div');
        serviceDiv.className = `flex items-center justify-between p-3 border rounded-lg ${isAdded ? 'bg-gray-100 opacity-50' : 'bg-white hover:bg-gray-50 cursor-pointer'}`;
        serviceDiv.innerHTML = `
            <div class="flex-1">
                <div class="font-medium text-gray-700">${service.name}</div>
                <div class="text-sm text-gray-600">${formatMoney(service.price)} đ/${service.unit}</div>
            </div>
            ${isAdded ?
                '<span class="text-sm text-gray-500">Đã thêm</span>' :
                `<button type="button" class="add-service-to-building-btn bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded text-sm" data-id="${service.id}">Thêm</button>`
            }
        `;
        availableServicesListEl.appendChild(serviceDiv);
    });
}

/**
 * Hiển thị danh sách dịch vụ đã chọn trong modal Tòa nhà
 */
function renderBuildingServices() {
    buildingServicesListEl.innerHTML = '';
    
    if (currentBuildingServices.length === 0) {
        buildingServicesListEl.innerHTML = '<div class="text-center text-gray-500 text-sm py-4">Chưa có dịch vụ nào</div>';
        return;
    }
    
    currentBuildingServices.forEach((service, index) => {
        const serviceDiv = document.createElement('div');
        serviceDiv.className = 'flex items-center justify-between p-3 border rounded-lg bg-gray-50 hover:bg-gray-100';
        serviceDiv.innerHTML = `
            <div class="flex-1">
                <span class="font-medium text-gray-700">${index + 1}. ${service.name}</span>
                <span class="text-gray-600 ml-4">${formatMoney(service.price)} đ/${service.unit}</span>
            </div>
            <button type="button" class="remove-building-service-btn text-red-600 hover:text-red-700 border border-red-600 hover:border-red-700 px-3 py-1 rounded text-sm flex items-center gap-1" data-index="${index}">
                <svg class="w-4 h-4 pointer-events-none" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"/></svg>
                Xoá
            </button>
        `;
        buildingServicesListEl.appendChild(serviceDiv);
    });
}

/**
 * Load danh sách tài khoản vào dropdown
 */
function loadAccountsToDropdown() {
    const accountSelect = document.getElementById('building-account');
    if (!accountSelect) return;
    
    const accounts = getAccounts();
    accountSelect.innerHTML = '<option value="">-- Chọn tài khoản --</option>';
    
    accounts.forEach(account => {
        const option = document.createElement('option');
        option.value = account.id;
        
        // Hiển thị tên ngân hàng - Tên chủ TK (hoặc số TK nếu không có tên)
        let displayText = account.bank;
        if (account.bank === 'Cash') {
            displayText = 'Tiền mặt';
        } else {
            const name = account.accountHolder || account.accountNumber || 'Chưa rõ';
            displayText = `${account.bank} - ${name}`;
        }
        
        option.textContent = displayText;
        accountSelect.appendChild(option);
    });
}

/**
 * Xử lý Xóa nhiều
 */
async function handleBulkDelete() {
    // Lấy từ Set mobile nếu có, không thì từ desktop checkboxes
    let selected;
    if (selectedMobileBuildingIds.size > 0) {
        const allBuildings = getBuildings();
        selected = Array.from(selectedMobileBuildingIds).map(id => {
            const building = allBuildings.find(b => b.id === id);
            return { id, code: building?.code || 'N/A' };
        });
    } else {
        selected = Array.from(document.querySelectorAll('.building-checkbox:checked'))
            .map(cb => ({ id: cb.dataset.id, code: cb.dataset.code }));
    }

    if (selected.length === 0) {
        showToast('Vui lòng chọn ít nhất 1 tòa nhà để xóa!', 'error');
        return;
    }

    const confirmMsg = `Bạn có chắc muốn xóa ${selected.length} tòa nhà đã chọn?\n\n${selected.map(b => b.code).join(', ')}`;
    const confirmed = await showConfirm(confirmMsg, 'Xác nhận xóa');
    if (!confirmed) return;

    try {
        // Bulk delete Firebase + localStorage
        for (const building of selected) {
            await deleteDoc(doc(db, 'buildings', building.id));
            deleteFromLocalStorage('buildings', building.id);
        }
        
        // Reset trạng thái checkbox sau khi xóa thành công
        selectedMobileBuildingIds.clear();
        resetBulkSelection();
        updateClearSelectionButton();
        
        showToast(`Đã xóa ${selected.length} tòa nhà thành công!`);
    } catch (error) {
        showToast('Lỗi xóa tòa nhà: ' + error.message, 'error');
    }
}

/**
 * Reset trạng thái bulk selection
 */
function resetBulkSelection() {
    // Bỏ chọn checkbox "select all"
    const selectAllCheckbox = document.getElementById('select-all-buildings');
    if (selectAllCheckbox) {
        selectAllCheckbox.checked = false;
    }
    
    // Bỏ chọn tất cả checkbox con
    const buildingCheckboxes = document.querySelectorAll('.building-checkbox');
    buildingCheckboxes.forEach(checkbox => {
        checkbox.checked = false;
    });
}

/**
 * Xử lý Xuất Excel
 */
function handleExport() {
    const buildings = getBuildings(); // Lấy từ store
    if (buildings.length === 0) {
        showToast('Không có dữ liệu để xuất!', 'error');
        return;
    }
    
    const data = buildings.map(b => ({
        'Mã': b.code || '',
        'Địa chỉ': b.address,
        'Số phòng': b.rooms.length,
        'Danh sách phòng': b.rooms.join(', ')
    }));
    
    exportToExcel(data, 'Danh_sach_toa_nha');
    showToast('Đã xuất dữ liệu thành công!');
}

/**
 * Cập nhật hiển/ẩn nút bỏ chọn hàng loạt (chỉ hiện khi chọn >= 2)
 */
function updateClearSelectionButton() {
    const btn = document.getElementById('clear-selection-buildings-btn');
    if (btn) {
        if (selectedMobileBuildingIds.size >= 2) {
            btn.classList.remove('hidden');
        } else {
            btn.classList.add('hidden');
        }
    }
}

/**
 * Khởi tạo các sự kiện cho modal Import
 */
function initImportModal() {
    const downloadTemplateLink = document.getElementById('download-buildings-template-link');
    const importFileInput = document.getElementById('import-buildings-file');
    const fileNameDisplay = document.getElementById('import-buildings-file-name');
    
    // Open import modal
    document.getElementById('import-buildings-btn').addEventListener('click', () => {
        fileNameDisplay.textContent = '';
        importFileInput.value = '';
        openModal(importBuildingsModal);
    });

    // Download template - use function from main.js
    downloadTemplateLink.addEventListener('click', () => {
        window.downloadBuildingsTemplate();
    });

    // File input change
    importFileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            fileNameDisplay.textContent = `Đã chọn: ${file.name}`;
        }
    });

    // Close modal
    document.getElementById('close-import-buildings-modal').addEventListener('click', () => closeModal(importBuildingsModal));
    document.getElementById('cancel-import-buildings-btn').addEventListener('click', () => closeModal(importBuildingsModal));

    // Submit import
    document.getElementById('submit-import-buildings-btn').addEventListener('click', async () => {
        const file = importFileInput.files[0];
        
        if (!file) {
            showToast('Vui lòng chọn file Excel!', 'warning');
            return;
        }
        
        showToast('Đang xử lý file Excel...', 'info');
        
        try {
            const reader = new FileReader();
            reader.onload = async (event) => {
                try {
                    const data = new Uint8Array(event.target.result);
                    const workbook = XLSX.read(data, { type: 'array' });
                    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
                    const rows = XLSX.utils.sheet_to_json(firstSheet);
                    
                    if (rows.length === 0) {
                        showToast('File Excel không có dữ liệu!', 'error');
                        return;
                    }
                    
                    let imported = 0;
                    let errors = 0;
                    let skipped = 0;
                    
                    // Lấy danh sách tòa nhà hiện tại để kiểm tra trùng lặp
                    const existingBuildings = getBuildings();
                    const existingCodes = new Set(existingBuildings.map(b => b.code.toLowerCase()));
                    
                    for (const row of rows) {
                        try {
                            const code = row['Mã'] || row['Code'] || '';
                            const address = row['Địa chỉ'] || row['Address'] || '';
                            const name = row['Tên'] || row['Name'] || '';
                            const roomsStr = row['Danh sách phòng'] || row['Rooms'] || '';
                            
                            if (!code || !address) {
                                errors++;
                                continue;
                            }
                            
                            // Kiểm tra trùng lặp mã tòa nhà
                            if (existingCodes.has(code.toString().trim().toLowerCase())) {
                                skipped++;
                                continue; // Bỏ qua nếu đã tồn tại
                            }
                            
                            const rooms = roomsStr.toString().split(/[,\s]+/).map(r => r.trim()).filter(r => r);
                            
                            if (rooms.length === 0) {
                                errors++;
                                continue;
                            }
                            
                            const buildingData = {
                                code: code.toString().trim(),
                                name: name.toString().trim(),
                                address: address.toString().trim(),
                                rooms: rooms,
                                services: [],
                                isActive: true,
                                createdAt: serverTimestamp(),
                                updatedAt: serverTimestamp()
                            };
                            
                            // Import to Firebase + localStorage
                            const docRef = await addDoc(collection(db, 'buildings'), buildingData);
                            
                            // Add to localStorage với Firebase ID
                            const newItem = { 
                                ...buildingData, 
                                id: docRef.id,
                                createdAt: new Date(),
                                updatedAt: new Date()
                            };
                            const state = getState();
                            state.buildings.unshift(newItem);
                            
                            imported++;
                        } catch (err) {
                            console.error('Error importing row:', row, err);
                            errors++;
                        }
                    }
                    
                    // Save cache và dispatch event sau khi import xong
                    if (imported > 0) {
                        saveToCache();
                        document.dispatchEvent(new CustomEvent('store:buildings:updated'));
                    }
                    
                    closeModal(importBuildingsModal);
                    let message = `Nhập thành công ${imported} tòa nhà`;
                    if (skipped > 0) message += `, bỏ qua ${skipped} tòa nhà đã tồn tại`;
                    if (errors > 0) message += `, ${errors} lỗi`;
                    showToast(message + '!');
                    // Store listener sẽ tự động cập nhật UI
                    
                } catch (error) {
                    console.error('Error parsing Excel:', error);
                    showToast('Lỗi đọc file Excel: ' + error.message, 'error');
                }
            };
            reader.readAsArrayBuffer(file);
        } catch (error) {
            console.error('Error reading file:', error);
            showToast('Lỗi đọc file: ' + error.message, 'error');
        }
    });
}