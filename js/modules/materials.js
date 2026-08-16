// js/modules/materials.js
// Bảng Vật tư kiểu Excel: chọn 1 Hạng mục ở trên, bảng dưới chỉ hiện vật tư của hạng mục đó.
// Gõ trực tiếp vào ô, tự lưu khi rời ô (blur), không qua modal.

import { db, addDoc, setDoc, doc, deleteDoc, collection, serverTimestamp } from '../firebase.js';
import { getMaterials, getMaterialCategories, getState, saveToCache, deleteFromLocalStorage } from '../store.js';
import { showToast, formatNumber, parseFormattedNumber, showConfirm } from '../utils.js';

// --- DOM ELEMENTS ---
const materialsSection = document.getElementById('materials-section');
const materialsListEl = document.getElementById('materials-list');
const categorySelectEl = document.getElementById('material-category-select');
const searchEl = document.getElementById('material-search');
const addCategoryBtn = document.getElementById('add-material-category-btn');
const addCategoryRow = document.getElementById('add-category-row');
const newCategoryInput = document.getElementById('new-category-input');

const FIELDS = ['name', 'unit', 'price', 'phone', 'note'];

function escapeAttr(value) {
    return String(value ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

/**
 * Hàm khởi tạo, được gọi 1 lần duy nhất từ main.js
 */
export function initMaterials() {
    document.addEventListener('store:materials:updated', () => {
        if (!materialsSection.classList.contains('hidden')) {
            loadMaterials();
        }
    });
    document.addEventListener('store:materialCategories:updated', () => {
        if (!materialsSection.classList.contains('hidden')) {
            loadMaterials();
        }
    });

    materialsListEl.addEventListener('focusout', handleCellFocusOut);
    materialsListEl.addEventListener('input', handleCellInput);
    materialsListEl.addEventListener('keydown', handleCellKeydown);
    materialsListEl.addEventListener('click', handleTableClick);

    document.getElementById('add-material-row-btn')?.addEventListener('click', () => {
        const blankRow = materialsListEl.querySelector('tr[data-id=""]');
        blankRow?.querySelector('[data-field="name"]')?.focus();
        blankRow?.scrollIntoView({ block: 'center' });
    });

    categorySelectEl.addEventListener('change', loadMaterials);
    searchEl.addEventListener('input', loadMaterials);

    addCategoryBtn.addEventListener('click', () => {
        addCategoryRow.classList.toggle('hidden');
        if (!addCategoryRow.classList.contains('hidden')) {
            newCategoryInput.value = '';
            newCategoryInput.focus();
        }
    });
    document.getElementById('cancel-add-category-btn').addEventListener('click', () => {
        addCategoryRow.classList.add('hidden');
    });
    document.getElementById('confirm-add-category-btn').addEventListener('click', handleAddCategory);
    newCategoryInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); handleAddCategory(); }
        if (e.key === 'Escape') { addCategoryRow.classList.add('hidden'); }
    });
}

/**
 * Danh sách hạng mục = danh mục đã tạo riêng + hạng mục cũ suy ra từ vật tư có sẵn (phòng khi có dữ liệu cũ)
 */
function getAllCategoryNames() {
    const managed = getMaterialCategories().map(c => c.name);
    const legacy = getMaterials().map(m => m.category).filter(Boolean);
    return [...new Set([...managed, ...legacy])].sort((a, b) => a.localeCompare(b, 'vi'));
}

function updateCategorySelect() {
    const categories = getAllCategoryNames();
    const currentValue = categorySelectEl.value;
    categorySelectEl.innerHTML = '<option value="">-- Chọn hạng mục --</option>' +
        categories.map(c => `<option value="${escapeAttr(c)}">${c}</option>`).join('');

    if (currentValue && categories.includes(currentValue)) {
        categorySelectEl.value = currentValue;
    } else if (categories.length > 0) {
        categorySelectEl.value = categories[0];
    }
}

/**
 * Tải và hiển thị danh sách vật tư của hạng mục đang chọn
 */
export function loadMaterials() {
    if (materialsSection?.classList.contains('hidden')) return;

    updateCategorySelect();

    const selectedCategory = categorySelectEl.value;
    const searchTerm = searchEl.value.toLowerCase();

    if (!selectedCategory) {
        materialsListEl.innerHTML = '<tr><td colspan="6" class="p-8 text-center text-gray-400">Chưa có hạng mục nào — bấm nút "+" để tạo hạng mục đầu tiên.</td></tr>';
        return;
    }

    let materials = getMaterials().filter(m => m.category === selectedCategory);

    if (searchTerm) {
        materials = materials.filter(m => (m.name || '').toLowerCase().includes(searchTerm));
    }

    renderMaterialsTable(materials, selectedCategory);
}

function buildRowCells(values) {
    return `
        <td class="p-0"><input type="text" class="material-cell w-full bg-transparent border-0 focus:outline-none focus:bg-blue-50 px-3 py-2.5" data-field="name" placeholder="Tên vật tư" value="${escapeAttr(values.name)}"></td>
        <td class="p-0"><input type="text" class="material-cell w-full bg-transparent border-0 focus:outline-none focus:bg-blue-50 px-3 py-2.5" data-field="unit" placeholder="m², cây, cái..." value="${escapeAttr(values.unit)}"></td>
        <td class="p-0"><input type="text" class="material-cell w-full bg-transparent border-0 focus:outline-none focus:bg-blue-50 px-3 py-2.5 text-right tabular-nums" data-field="price" placeholder="Đơn giá" value="${escapeAttr(values.price)}"></td>
        <td class="p-0"><input type="text" class="material-cell w-full bg-transparent border-0 focus:outline-none focus:bg-blue-50 px-3 py-2.5" data-field="phone" placeholder="SĐT đơn vị bán" value="${escapeAttr(values.phone)}"></td>
        <td class="p-0"><input type="text" class="material-cell w-full bg-transparent border-0 focus:outline-none focus:bg-blue-50 px-3 py-2.5 text-gray-500" data-field="note" placeholder="Ghi chú" value="${escapeAttr(values.note)}"></td>
        <td class="text-center">
            <button class="delete-material-row-btn text-gray-300 hover:text-red-500 w-7 h-7 flex items-center justify-center mx-auto rounded hover:bg-red-50" title="Xóa dòng">✕</button>
        </td>
    `;
}

/**
 * Hiển thị dữ liệu vật tư lên bảng kiểu Excel (mỗi dòng luôn ở chế độ nhập)
 */
function renderMaterialsTable(materials, selectedCategory) {
    materialsListEl.innerHTML = '';

    materials.forEach(material => {
        const tr = document.createElement('tr');
        tr.dataset.id = material.id;
        tr.className = 'hover:bg-gray-50/80 group';
        tr.innerHTML = buildRowCells({
            name: material.name,
            unit: material.unit,
            price: material.price ? formatNumber(material.price) : '',
            phone: material.phone,
            note: material.note
        });
        materialsListEl.appendChild(tr);
    });

    // Dòng trống luôn nằm cuối để nhập vật tư mới, gắn sẵn vào hạng mục đang chọn
    const blankTr = document.createElement('tr');
    blankTr.dataset.id = '';
    blankTr.dataset.category = selectedCategory;
    blankTr.className = 'bg-emerald-50/30';
    blankTr.innerHTML = buildRowCells({ name: '', unit: '', price: '', phone: '', note: '' });
    materialsListEl.appendChild(blankTr);
}

/**
 * Thêm hạng mục mới
 */
async function handleAddCategory() {
    const name = newCategoryInput.value.trim();
    if (!name) return;

    const existing = getAllCategoryNames().find(c => c.toLowerCase() === name.toLowerCase());
    if (existing) {
        categorySelectEl.value = existing;
        addCategoryRow.classList.add('hidden');
        loadMaterials();
        return;
    }

    try {
        const categoryData = { name, createdAt: serverTimestamp() };
        const docRef = await addDoc(collection(db, 'materialCategories'), categoryData);
        const state = getState();
        state.materialCategories.push({ ...categoryData, id: docRef.id, createdAt: new Date() });
        saveToCache();
        document.dispatchEvent(new CustomEvent('store:materialCategories:updated'));

        addCategoryRow.classList.add('hidden');
        categorySelectEl.value = name;
        loadMaterials();
        showToast('Đã thêm hạng mục!');
    } catch (error) {
        showToast('Lỗi thêm hạng mục: ' + error.message, 'error');
    }
}

/**
 * Format số khi gõ vào ô Đơn giá
 */
function handleCellInput(e) {
    const target = e.target;
    if (!target.classList.contains('material-cell') || target.dataset.field !== 'price') return;
    let value = target.value.replace(/\./g, '').replace(/\D/g, '');
    target.value = value ? formatNumber(parseInt(value)) : '';
}

/**
 * Enter = xác nhận & nhảy xuống ô cùng cột ở dòng dưới
 */
function handleCellKeydown(e) {
    if (e.key !== 'Enter') return;
    const target = e.target;
    if (!target.classList.contains('material-cell')) return;
    e.preventDefault();
    const field = target.dataset.field;
    const tr = target.closest('tr');
    const nextTr = tr?.nextElementSibling;
    const nextInput = nextTr?.querySelector(`[data-field="${field}"]`);
    if (nextInput) {
        nextInput.focus();
    } else {
        target.blur();
    }
}

/**
 * Lưu khi rời khỏi 1 ô (dòng có sẵn: cập nhật; dòng trống: tạo mới nếu đủ thông tin)
 */
async function handleCellFocusOut(e) {
    const target = e.target;
    if (!target.classList.contains('material-cell')) return;

    const tr = target.closest('tr');
    if (!tr) return;

    const values = {};
    FIELDS.forEach(field => {
        const input = tr.querySelector(`[data-field="${field}"]`);
        values[field] = input ? input.value.trim() : '';
    });

    const isNewRow = !tr.dataset.id;

    if (isNewRow) {
        // Chỉ tạo dòng mới khi đã có đủ tên + đơn giá + đơn vị
        if (!values.name || !values.price || !values.unit) return;

        try {
            const materialData = {
                category: tr.dataset.category,
                name: values.name,
                unit: values.unit,
                price: parseFormattedNumber(values.price),
                phone: values.phone,
                note: values.note,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp()
            };
            const docRef = await addDoc(collection(db, 'materials'), materialData);

            const newItem = { ...materialData, id: docRef.id, createdAt: new Date(), updatedAt: new Date() };
            const state = getState();
            state.materials.push(newItem);
            saveToCache();
            document.dispatchEvent(new CustomEvent('store:materials:updated'));

            // Focus lại vào dòng trống mới (được render lại) để gõ tiếp
            const freshBlankRow = materialsListEl.querySelector('tr[data-id=""]');
            freshBlankRow?.querySelector('[data-field="name"]')?.focus();
        } catch (error) {
            showToast('Lỗi thêm vật tư: ' + error.message, 'error');
        }
        return;
    }

    // Dòng có sẵn: lưu trực tiếp vào state (không phát sự kiện re-render để khỏi mất focus khi Tab qua ô khác)
    const id = tr.dataset.id;
    const updateData = {
        name: values.name,
        unit: values.unit,
        price: parseFormattedNumber(values.price) || 0,
        phone: values.phone,
        note: values.note,
        updatedAt: serverTimestamp()
    };

    try {
        await setDoc(doc(db, 'materials', id), updateData, { merge: true });

        const state = getState();
        const index = state.materials.findIndex(m => m.id === id);
        if (index !== -1) {
            state.materials[index] = { ...state.materials[index], ...updateData, updatedAt: new Date() };
            saveToCache();
        }
    } catch (error) {
        showToast('Lỗi lưu vật tư: ' + error.message, 'error');
    }
}

/**
 * Xóa 1 dòng vật tư
 */
async function handleTableClick(e) {
    const deleteBtn = e.target.closest('.delete-material-row-btn');
    if (!deleteBtn) return;

    const tr = deleteBtn.closest('tr');
    const id = tr?.dataset.id;
    if (!id) return; // Dòng trống, không có gì để xóa

    const name = tr.querySelector('[data-field="name"]')?.value || 'vật tư này';
    const confirmed = await showConfirm(`Bạn có chắc muốn xóa "${name}"?`, 'Xác nhận xóa');
    if (!confirmed) return;

    try {
        await deleteDoc(doc(db, 'materials', id));
        deleteFromLocalStorage('materials', id);
        showToast('Đã xóa vật tư!');
    } catch (error) {
        showToast('Lỗi xóa vật tư: ' + error.message, 'error');
    }
}
