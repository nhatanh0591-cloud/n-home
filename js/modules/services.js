// js/modules/services.js

import { db, addDoc, setDoc, doc, deleteDoc, collection, serverTimestamp } from '../firebase.js';
import { getServices, getBuildings, getState, saveToCache, updateInLocalStorage, deleteFromLocalStorage } from '../store.js';
import { showToast, openModal, closeModal, formatNumber, parseFormattedNumber, showConfirm } from '../utils.js';

// --- BIẾN CỤC BỘ CHO MODULE ---
let isCreatingServiceFromBuilding = false;
let isCreatingServiceFromContract = false;
let selectedMobileServiceIds = new Set(); // Checkbox mobile persistent

// --- DOM ELEMENTS (Chỉ liên quan đến Dịch vụ) ---
const servicesSection = document.getElementById('services-section');
const servicesListEl = document.getElementById('services-list');

// Filters
const typeFilterEl = document.getElementById('service-type-filter');
const buildingFilterEl = document.getElementById('service-building-filter');
const searchEl = document.getElementById('service-search');
const selectAllCheckbox = document.getElementById('select-all-services');

// Modal
const serviceModal = document.getElementById('service-modal');
const serviceModalTitle = document.getElementById('service-modal-title');
const serviceForm = document.getElementById('service-form');
const serviceBuildingsSection = document.getElementById('service-buildings-section');
const buildingCheckboxesEl = document.getElementById('building-checkboxes');

// --- HÀM CHÍNH ---

/**
 * Hàm khởi tạo, được gọi 1 lần duy nhất từ main.js
 */
export function initServices() {
    // Lắng nghe sự kiện từ store
    document.addEventListener('store:services:updated', () => {
        if (!servicesSection.classList.contains('hidden')) {
            loadServices();
        }
    });
    // Cập nhật bộ lọc tòa nhà khi tòa nhà thay đổi
    document.addEventListener('store:buildings:updated', () => {
        if (!servicesSection.classList.contains('hidden')) {
            updateServiceFilterDropdowns(getServices(), getBuildings());
        }
    });

    // Lắng nghe sự kiện click trên toàn trang (sử dụng event delegation)
    document.body.addEventListener('click', handleBodyClick);
    
    // Lắng nghe sự kiện cho form
    serviceForm.addEventListener('submit', handleServiceFormSubmit);
    
    // Đồng bộ dữ liệu dịch vụ và tòa nhà khi store sẵn sàng
    document.addEventListener('store:ready', () => {
        syncServiceBuildingData();
    });
    
    // Tự động format số tiền khi nhập
    const servicePriceInput = document.getElementById('service-price');
    servicePriceInput.addEventListener('input', (e) => {
        let value = e.target.value.replace(/\./g, ''); // Xóa dấu chấm cũ
        value = value.replace(/\D/g, ''); // Chỉ giữ số
        if (value) {
            e.target.value = formatNumber(parseInt(value));
        } else {
            e.target.value = '';
        }
    });

    // Lắng nghe sự kiện cho các bộ lọc và nút
    typeFilterEl.addEventListener('change', loadServices);
    buildingFilterEl.addEventListener('change', loadServices);
    searchEl.addEventListener('input', loadServices);
    selectAllCheckbox.addEventListener('change', (e) => {
        document.querySelectorAll('.service-checkbox').forEach(cb => cb.checked = e.target.checked);
    });
    
    // Lắng nghe nút bỏ chọn hàng loạt
    document.getElementById('clear-selection-services-btn')?.addEventListener('click', () => {
        selectedMobileServiceIds.clear();
        document.querySelectorAll('.service-checkbox').forEach(cb => cb.checked = false);
        updateClearSelectionButton();
        showToast('Bỏ chọn thành công!');
    });

    // Nút chọn tất cả/bỏ chọn tòa nhà trong modal dịch vụ
    document.getElementById('select-all-buildings-btn')?.addEventListener('click', () => {
        document.querySelectorAll('#building-checkboxes input[type="checkbox"]').forEach(cb => cb.checked = true);
    });
    
    document.getElementById('deselect-all-buildings-btn')?.addEventListener('click', () => {
        document.querySelectorAll('#building-checkboxes input[type="checkbox"]').forEach(cb => cb.checked = false);
    });

    // Lắng nghe yêu cầu mở modal từ các module khác (ví dụ: buildings.js)
    document.addEventListener('request:openServiceModal', (e) => {
        openServiceModal(e.detail || {});
    });
}

/**
 * Đồng bộ dữ liệu dịch vụ và tòa nhà - chạy 1 lần khi khởi động
 */
async function syncServiceBuildingData() {
    try {
        const services = getServices();
        const buildings = getBuildings();
        
        for (const service of services) {
            if (service.buildings && service.buildings.length > 0) {
                // Cập nhật dịch vụ vào tòa nhà nếu chưa có
                for (const buildingId of service.buildings) {
                    const building = buildings.find(b => b.id === buildingId);
                    if (building) {
                        const currentServices = building.services || [];
                        const existingService = currentServices.find(s => s.id === service.id);
                        
                        if (!existingService) {
                            // Thêm dịch vụ vào tòa nhà
                            const serviceToAdd = {
                                id: service.id,
                                name: service.name,
                                price: service.price,
                                unit: service.unit
                            };
                            currentServices.push(serviceToAdd);
                            
                            await setDoc(doc(db, 'buildings', buildingId), {
                                services: currentServices,
                                updatedAt: serverTimestamp()
                            }, { merge: true });
                        }
                    }
                }
            }
        }
        console.log('Đồng bộ dữ liệu dịch vụ-tòa nhà hoàn thành');
    } catch (error) {
        console.error('Lỗi đồng bộ dữ liệu:', error);
    }
}

/**
 * Tải và hiển thị danh sách dịch vụ
 */
export function loadServices() {
    if (servicesSection?.classList.contains('hidden')) return;
    
    const allServices = getServices();
    const allBuildings = getBuildings();
    
    updateServiceFilterDropdowns(allServices, allBuildings);

    // Áp dụng bộ lọc
    const typeFilter = typeFilterEl.value;
    const buildingFilter = buildingFilterEl.value;
    const searchTerm = searchEl.value.toLowerCase();

    let services = allServices;

    if (typeFilter !== 'all') {
        services = services.filter(s => s.name === typeFilter);
    }

    // Lọc theo tòa nhà: Dịch vụ phải được gán cho tòa nhà đó
    if (buildingFilter !== 'all') {
        const building = allBuildings.find(b => b.id === buildingFilter);
        if (building && building.services) {
            const buildingServiceIds = building.services.map(s => s.id);
            services = services.filter(s => buildingServiceIds.includes(s.id));
        } else {
            services = [];
        }
    }

    if (searchTerm) {
        services = services.filter(s =>
            s.name.toLowerCase().includes(searchTerm) ||
            s.unit.toLowerCase().includes(searchTerm)
        );
    }

    renderServicesTable(services);
}

/**
 * Hiển thị dữ liệu dịch vụ lên bảng
 */
function renderServicesTable(services) {
    servicesListEl.innerHTML = ''; // Xóa bảng cũ
    const mobileListEl = document.getElementById('services-mobile-list');
    if (mobileListEl) mobileListEl.innerHTML = '';

    if (services.length === 0) {
        servicesListEl.innerHTML = '<tr><td colspan="6" class="p-8 text-center text-gray-500">Chưa có phí dịch vụ nào.</td></tr>';
        return;
    }

    const allBuildings = getBuildings();

    services.forEach(service => {
        // Đếm số tòa nhà mà dịch vụ này áp dụng
        const buildingCount = service.buildings && service.buildings.length > 0 ? service.buildings.length : 0;
        
        // 🖥️ RENDER DESKTOP ROW
        const tr = document.createElement('tr');
        tr.className = 'border-b hover:bg-gray-50';
        
        tr.innerHTML = `
            <td class="py-4 px-4">
                <input type="checkbox" class="service-checkbox w-4 h-4 cursor-pointer" data-id="${service.id}" data-name="${service.name}">
            </td>
            <td class="py-4 px-4">
                <div class="flex gap-3">
                    <button data-id="${service.id}" class="edit-service-btn w-8 h-8 rounded bg-gray-500 hover:bg-gray-600 flex items-center justify-center" title="Sửa">
                        <svg class="w-4 h-4 text-white pointer-events-none" fill="currentColor" viewBox="0 0 20 20"><path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z"/></svg>
                    </button>
                    <button data-id="${service.id}" class="delete-service-btn w-8 h-8 rounded bg-red-500 hover:bg-red-600 flex items-center justify-center" title="Xóa">
                        <svg class="w-4 h-4 text-white pointer-events-none" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd"/></svg>
                    </button>
                </div>
            </td>
            <td class="py-4 px-4 font-medium">${service.name}</td>
            <td class="py-4 px-4">${formatNumber(service.price)}</td>
            <td class="py-4 px-4">${service.unit}</td>
            <td class="py-4 px-4">
                <button data-id="${service.id}" class="view-service-buildings-btn inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium cursor-pointer hover:opacity-80 transition-opacity ${buildingCount > 0 ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}">
                    ${buildingCount} tòa nhà
                </button>
            </td>
        `;
        servicesListEl.appendChild(tr);
        
        // 📱 RENDER MOBILE CARD
        if (mobileListEl) {
            const isChecked = selectedMobileServiceIds.has(service.id);
            const mobileCard = document.createElement('div');
            mobileCard.className = 'mobile-card';
            mobileCard.innerHTML = `
                <div class="flex items-center gap-3 mb-3 pb-3 border-b">
                    <input type="checkbox" class="service-checkbox w-5 h-5 cursor-pointer" data-id="${service.id}" data-name="${service.name}" ${isChecked ? 'checked' : ''}>
                    <span class="text-xs text-gray-500 flex-1">Chọn để xóa nhiều</span>
                </div>
                <div class="mobile-card-row">
                    <span class="mobile-card-label">Tên dịch vụ:</span>
                    <span class="mobile-card-value font-semibold">${service.name}</span>
                </div>
                <div class="mobile-card-row">
                    <span class="mobile-card-label">Đơn giá:</span>
                    <span class="mobile-card-value font-bold text-green-600">${formatNumber(service.price)} VNĐ</span>
                </div>
                <div class="mobile-card-row">
                    <span class="mobile-card-label">Đơn vị:</span>
                    <span class="mobile-card-value">${service.unit}</span>
                </div>
                <div class="mobile-card-row">
                    <span class="mobile-card-label">Áp dụng cho:</span>
                    <button data-id="${service.id}" class="view-service-buildings-btn inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium cursor-pointer hover:opacity-80 transition-opacity ${buildingCount > 0 ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}">
                        ${buildingCount} tòa nhà
                    </button>
                </div>
                <div class="mobile-card-actions">
                    <button data-id="${service.id}" class="edit-service-btn bg-gray-500 hover:bg-gray-600 text-white">
                        <svg class="w-4 h-4 pointer-events-none" fill="currentColor" viewBox="0 0 20 20"><path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z"/></svg>
                        Sửa
                    </button>
                    <button data-id="${service.id}" class="delete-service-btn bg-red-500 hover:bg-red-600 text-white">
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
 * Cập nhật các dropdown lọc
 */
function updateServiceFilterDropdowns(services, buildings) {
    // Lọc "Loại dịch vụ"
    const serviceNames = [...new Set(services.map(s => s.name))].sort();
    const currentType = typeFilterEl.value;
    typeFilterEl.innerHTML = '<option value="all">Loại dịch vụ</option>';
    serviceNames.forEach(name => {
        typeFilterEl.innerHTML += `<option value="${name}">${name}</option>`;
    });
    typeFilterEl.value = currentType;

    // Lọc "Tòa nhà"
    const currentBuilding = buildingFilterEl.value;
    buildingFilterEl.innerHTML = '<option value="all">Tòa nhà</option>';
    buildings.forEach(building => {
        buildingFilterEl.innerHTML += `<option value="${building.id}">${building.code || 'N/A'}</option>`;
    });
    buildingFilterEl.value = currentBuilding;
}

/**
 * Xử lý tất cả các sự kiện click trên body
 */
async function handleBodyClick(e) {
    const target = e.target;
    const id = target.dataset.id;

    // Nút "Thêm dịch vụ" - kiểm tra cả target và closest
    if (target.id === 'add-service-btn' || target.closest('#add-service-btn')) {
        e.preventDefault();
        e.stopPropagation();
        openServiceModal();
        return;
    }
    // Nút "Xem tòa nhà" - kiểm tra cả target và closest
    const viewBuildingsBtn = target.classList.contains('view-service-buildings-btn') ? target : target.closest('.view-service-buildings-btn');
    if (viewBuildingsBtn) {
        const serviceId = viewBuildingsBtn.dataset.id;
        const service = getServices().find(s => s.id === serviceId);
        if (service) {
            showServiceBuildingsModal(service);
        }
        return;
    }
    // Nút "Sửa" dịch vụ - kiểm tra cả target và closest
    const editBtn = target.classList.contains('edit-service-btn') ? target : target.closest('.edit-service-btn');
    if (editBtn) {
        const serviceId = editBtn.dataset.id;
        const service = getServices().find(s => s.id === serviceId);
        if (service) {
            openServiceModal({ serviceToEdit: service });
        }
        return;
    }
    // Nút "Xóa" dịch vụ - kiểm tra cả target và closest
    const deleteBtn = target.classList.contains('delete-service-btn') ? target : target.closest('.delete-service-btn');
    if (deleteBtn) {
        const confirmed = await showConfirm('Bạn có chắc muốn xóa phí dịch vụ này?', 'Xác nhận xóa');
        if (confirmed) {
            try {
                const serviceId = deleteBtn.dataset.id;
                // Delete Firebase
                await deleteDoc(doc(db, 'services', serviceId));
                
                // Delete localStorage
                deleteFromLocalStorage('services', serviceId);
                showToast('Xóa dịch vụ thành công!');
            } catch (error) {
                showToast('Lỗi xóa dịch vụ: ' + error.message, 'error');
            }
        }
    }
    // Checkbox mobile
    else if (target.classList.contains('service-checkbox')) {
        const serviceId = target.dataset.id;
        if (target.checked) {
            selectedMobileServiceIds.add(serviceId);
        } else {
            selectedMobileServiceIds.delete(serviceId);
        }
        updateClearSelectionButton();
    }
    // Nút "Xóa nhiều"
    else if (target.id === 'bulk-delete-services-btn' || target.closest('#bulk-delete-services-btn')) {
        handleBulkDelete();
    }
    // Nút đóng modal
    else if (target.id === 'close-service-modal' || target.closest('#close-service-modal') || target.id === 'cancel-service-btn' || target.closest('#cancel-service-btn')) {
        closeModal(serviceModal);
    }
}

/**
 * Mở modal Thêm/Sửa Dịch vụ
 */
function openServiceModal(options = {}) {
    const { serviceToEdit, isFromBuilding, isFromContract } = options;

    isCreatingServiceFromBuilding = isFromBuilding || false;
    isCreatingServiceFromContract = isFromContract || false;
    
    serviceForm.reset();
    document.getElementById('service-id').value = '';

    if (serviceToEdit) {
        // Chế độ Sửa
        serviceModalTitle.textContent = 'Sửa Phí dịch vụ';
        document.getElementById('service-id').value = serviceToEdit.id;
        document.getElementById('service-name').value = serviceToEdit.name;
        document.getElementById('service-price').value = formatNumber(serviceToEdit.price);
        document.getElementById('service-unit').value = serviceToEdit.unit;
        
        serviceBuildingsSection.classList.remove('hidden');
        loadBuildingCheckboxes(serviceToEdit.buildings || []);
    } else {
        // Chế độ Thêm mới
        serviceModalTitle.textContent = 'Thêm Phí dịch vụ';
        if (isCreatingServiceFromBuilding || isCreatingServiceFromContract) {
            // Ẩn chọn tòa nhà nếu tạo từ modal khác
            serviceBuildingsSection.classList.add('hidden');
        } else {
            // Hiện chọn tòa nhà nếu tạo bình thường
            serviceBuildingsSection.classList.remove('hidden');
            loadBuildingCheckboxes([]);
        }
    }

    openModal(serviceModal);
}

/**
 * Tải danh sách tòa nhà vào modal dịch vụ
 */
function loadBuildingCheckboxes(selectedBuildingIds = []) {
    const buildings = getBuildings();
    buildingCheckboxesEl.innerHTML = '';

    if (buildings.length === 0) {
        buildingCheckboxesEl.innerHTML = '<p class="text-gray-500 text-sm">Chưa có tòa nhà nào.</p>';
        return;
    }

    buildingCheckboxesEl.innerHTML = buildings.map(building => `
        <label class="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" value="${building.id}" ${selectedBuildingIds.includes(building.id) ? 'checked' : ''} 
                   class="building-checkbox-item rounded">
            <span class="text-sm font-medium text-blue-600">${building.code || 'N/A'}</span>
            <span class="text-sm text-gray-600">- ${building.address}</span>
        </label>
    `).join('');
}

/**
 * Xử lý khi submit form Thêm/Sửa Dịch vụ
 */
async function handleServiceFormSubmit(e) {
    e.preventDefault();
    const id = document.getElementById('service-id').value;
    const name = document.getElementById('service-name').value.trim();
    const price = parseFormattedNumber(document.getElementById('service-price').value);
    const unit = document.getElementById('service-unit').value.trim();

    if (!name || !price || !unit) {
        showToast('Vui lòng nhập đầy đủ thông tin!', 'error');
        return;
    }
    
    const newServiceData = { name, price, unit };

    try {
        if (isCreatingServiceFromBuilding) {
            // Gửi sự kiện lại cho module 'buildings'
            document.dispatchEvent(new CustomEvent('service:createdForBuilding', { detail: newServiceData }));
            isCreatingServiceFromBuilding = false;
        } else if (isCreatingServiceFromContract) {
            // Gửi sự kiện lại cho module 'contracts'
            document.dispatchEvent(new CustomEvent('service:createdForContract', { detail: newServiceData }));
            isCreatingServiceFromContract = false;
        } else {
            // Xử lý Thêm/Sửa bình thường
            const selectedBuildings = Array.from(document.querySelectorAll('.building-checkbox-item:checked'))
                .map(cb => cb.value);

            const serviceData = {
                ...newServiceData,
                buildings: selectedBuildings, // Có thể là array rỗng []
                updatedAt: serverTimestamp()
            };

            let serviceId;
            if (id) {
                // Sửa - lấy dịch vụ cũ để so sánh thay đổi tòa nhà
                const oldService = getServices().find(s => s.id === id);
                const oldBuildings = oldService ? oldService.buildings || [] : [];
                
                // Update Firebase
                await setDoc(doc(db, 'services', id), serviceData, { merge: true });
                serviceId = id;
                
                // Update localStorage
                updateInLocalStorage('services', id, serviceData);
                
                // Cập nhật tòa nhà: loại bỏ dịch vụ khỏi tòa nhà cũ, thêm vào tòa nhà mới
                await updateBuildingServices(serviceId, { ...newServiceData, id: serviceId }, oldBuildings, selectedBuildings);
                showToast('Cập nhật dịch vụ thành công!');
            } else {
                // Create Firebase
                serviceData.createdAt = serverTimestamp();
                const docRef = await addDoc(collection(db, 'services'), serviceData);
                serviceId = docRef.id;
                
                // Add to localStorage với Firebase ID
                const newItem = { 
                    ...serviceData, 
                    id: docRef.id,
                    createdAt: new Date(),
                    updatedAt: new Date()
                };
                const state = getState();
                state.services.unshift(newItem);
                saveToCache();
                document.dispatchEvent(new CustomEvent('store:services:updated'));
                
                // Thêm dịch vụ vào các tòa nhà đã chọn
                await updateBuildingServices(serviceId, { ...newServiceData, id: serviceId }, [], selectedBuildings);
                showToast('Thêm dịch vụ thành công!');
            }
            // Store listener sẽ tự động cập nhật
        }

        closeModal(serviceModal);
    } catch (error) {
        showToast('Lỗi lưu dịch vụ: ' + error.message, 'error');
    }
}

/**
 * Xử lý Xóa nhiều
 */
async function handleBulkDelete() {
    // Lấy từ Set mobile nếu có, không thì từ desktop checkboxes
    let selected;
    if (selectedMobileServiceIds.size > 0) {
        const allServices = getServices();
        selected = Array.from(selectedMobileServiceIds).map(id => {
            const service = allServices.find(s => s.id === id);
            return { id, name: service?.name || 'N/A' };
        });
    } else {
        selected = Array.from(document.querySelectorAll('.service-checkbox:checked'))
            .map(cb => ({ id: cb.dataset.id, name: cb.dataset.name }));
    }

    if (selected.length === 0) {
        showToast('Vui lòng chọn ít nhất 1 dịch vụ để xóa!', 'error');
        return;
    }

    const confirmMsg = `Bạn có chắc muốn xóa ${selected.length} dịch vụ đã chọn?\n\n${selected.map(s => s.name).join(', ')}`;
    const confirmed = await showConfirm(confirmMsg, 'Xác nhận xóa');
    if (!confirmed) return;

    try {
        for (const service of selected) {
            // Loại bỏ dịch vụ khỏi tất cả tòa nhà trước khi xóa
            const serviceToDelete = getServices().find(s => s.id === service.id);
            if (serviceToDelete && serviceToDelete.buildings) {
                await updateBuildingServices(service.id, null, serviceToDelete.buildings, []);
            }
            
            // Delete Firebase + localStorage
            await deleteDoc(doc(db, 'services', service.id));
            deleteFromLocalStorage('services', service.id);
        }
        
        // Reset trạng thái checkbox sau khi xóa thành công
        selectedMobileServiceIds.clear();
        resetBulkSelection();
        updateClearSelectionButton();
        
        showToast(`Đã xóa ${selected.length} dịch vụ thành công!`);
    } catch (error) {
        showToast('Lỗi xóa dịch vụ: ' + error.message, 'error');
    }
}

/**
 * Cập nhật dịch vụ trong tòa nhà khi thêm/sửa/xóa dịch vụ
 */
async function updateBuildingServices(serviceId, serviceData, oldBuildingIds = [], newBuildingIds = []) {
    const buildings = getBuildings();
    
    // Loại bỏ dịch vụ khỏi các tòa nhà cũ
    for (const buildingId of oldBuildingIds) {
        if (!newBuildingIds.includes(buildingId)) {
            const building = buildings.find(b => b.id === buildingId);
            if (building) {
                const updatedServices = (building.services || []).filter(s => s.id !== serviceId);
                await setDoc(doc(db, 'buildings', buildingId), {
                    services: updatedServices,
                    updatedAt: serverTimestamp()
                }, { merge: true });
            }
        }
    }
    
    // Thêm/cập nhật dịch vụ vào các tòa nhà mới
    for (const buildingId of newBuildingIds) {
        const building = buildings.find(b => b.id === buildingId);
        if (building) {
            const currentServices = building.services || [];
            const existingIndex = currentServices.findIndex(s => s.id === serviceId);
            
            if (existingIndex >= 0) {
                // Cập nhật dịch vụ đã có
                currentServices[existingIndex] = serviceData;
            } else {
                // Thêm dịch vụ mới
                currentServices.push(serviceData);
            }
            
            await setDoc(doc(db, 'buildings', buildingId), {
                services: currentServices,
                updatedAt: serverTimestamp()
            }, { merge: true });
        }
    }
}

/**
 * Reset trạng thái bulk selection
 */
function resetBulkSelection() {
    // Bỏ chọn checkbox "select all"
    const selectAllCheckbox = document.getElementById('select-all-services');
    if (selectAllCheckbox) {
        selectAllCheckbox.checked = false;
    }
    
    // Bỏ chọn tất cả checkbox con
    const serviceCheckboxes = document.querySelectorAll('.service-checkbox');
    serviceCheckboxes.forEach(checkbox => {
        checkbox.checked = false;
    });
}

/**
 * Cập nhật trạng thái hiển thị nút bỏ chọn hàng loạt
 */
function updateClearSelectionButton() {
    const clearBtn = document.getElementById('clear-selection-services-btn');
    if (clearBtn) {
        if (selectedMobileServiceIds.size >= 2) {
            clearBtn.classList.remove('hidden');
        } else {
            clearBtn.classList.add('hidden');
        }
    }
}

/**
 * Hiển thị modal danh sách tòa nhà áp dụng dịch vụ
 */
function showServiceBuildingsModal(service) {
    const modal = document.getElementById('view-service-buildings-modal');
    const titleEl = document.getElementById('view-service-buildings-title');
    const listEl = document.getElementById('service-buildings-list');
    
    titleEl.textContent = `Tòa nhà áp dụng dịch vụ: ${service.name}`;
    
    // Lấy danh sách tòa nhà
    const allBuildings = getBuildings();
    const serviceBuildings = service.buildings || [];
    
    console.log('Service:', service);
    console.log('Service buildings:', serviceBuildings);
    console.log('All buildings:', allBuildings);
    console.log('All buildings IDs:', allBuildings.map(b => ({ id: b.id, code: b.code })));
    
    if (serviceBuildings.length === 0) {
        listEl.innerHTML = '<p class="text-center text-gray-500 py-8">Dịch vụ chưa được áp dụng cho tòa nhà nào.</p>';
    } else {
        // Hiển thị dạng grid các mã tòa nhà giống như "Xem phòng"
        listEl.innerHTML = '<div class="grid grid-cols-4 gap-3"></div>';
        const gridEl = listEl.querySelector('.grid');
        
        serviceBuildings.forEach(buildingId => {
            console.log('Looking for building ID:', buildingId, 'Type:', typeof buildingId);
            const building = allBuildings.find(b => {
                console.log('Comparing with b.id:', b.id, 'Type:', typeof b.id, 'Match:', b.id === buildingId);
                return b.id === buildingId;
            });
            console.log('Found building:', building);
            if (building) {
                const div = document.createElement('div');
                div.className = 'p-4 bg-blue-100 text-blue-800 rounded-lg text-center font-semibold cursor-pointer hover:bg-blue-200';
                div.textContent = building.code || 'Unknown';
                console.log('Added div with text:', building.code);
                gridEl.appendChild(div);
            } else {
                console.error('Building not found for ID:', buildingId);
            }
        });
        console.log('Grid HTML:', gridEl.innerHTML);
    }
    
    // Mở modal
    openModal(modal);
    
    // Đóng modal khi bấm nút đóng
    const closeBtn1 = document.getElementById('close-view-service-buildings-modal');
    const closeBtn2 = document.getElementById('close-view-service-buildings-btn');
    
    closeBtn1.onclick = () => closeModal(modal);
    closeBtn2.onclick = () => closeModal(modal);
}