// js/store.js
import { db, collection, query, orderBy, getDocs } from './firebase.js';
import { initDB, saveToIndexedDB, loadFromIndexedDB, clearIndexedDB, getIndexedDBSize } from './indexeddb-storage.js';

/**
 * 💾 Dùng IndexedDB thay vì localStorage (limit lớn hơn: 50MB-1GB+)
 */
const CACHE_VERSION = '1.0'; // Tăng version khi cần xóa cache cũ

/**
 * Kho lưu trữ dữ liệu (state) tập trung của toàn bộ ứng dụng.
 * 💾 CHỈ SỬ DỤNG LOCALSTORAGE - KHÔNG REAL-TIME SYNC
 * ✨ Load lần đầu từ Firebase rồi lưu local, không tự động sync
 */
export const state = {
    buildings: [],
    services: [],
    customers: [],
    contracts: [],
    bills: [],
    transactions: [],
    accounts: [],
    tasks: [],
    notifications: [],
    transactionCategories: [],
    // Cờ báo hiệu tất cả dữ liệu ban đầu đã tải xong
    _isReady: false,
    _collectionsToLoad: ['buildings', 'services', 'customers', 'contracts', 'bills', 'transactions', 'accounts', 'tasks', 'adminNotifications', 'transactionCategories'],
    _loadedCount: 0,
    // 💾 Thêm thông tin cache
    _lastSyncTime: null,
    _cacheLoaded: false
};

// Không cần listeners trong local-only mode

/**
 * 💾 Lưu dữ liệu vào IndexedDB
 */
async function saveToCache() {
    try {
        // Lưu TẤT CẢ collections trong state (trừ các property hệ thống)
        const data = {};
        Object.keys(state).forEach(key => {
            if (!key.startsWith('_')) { // Bỏ qua _lastSyncTime, _cacheLoaded, _isReady
                data[key] = state[key];
            }
        });
        
        const cacheData = {
            version: CACHE_VERSION,
            timestamp: Date.now(),
            data: data
        };
        
        // Lưu vào IndexedDB thay vì localStorage
        await saveToIndexedDB(cacheData);
        state._lastSyncTime = Date.now();
        
        const size = await getIndexedDBSize();
        console.log(`💾 Đã lưu cache vào IndexedDB (${size} MB)`);
        
    } catch (error) {
        console.error('❌ Lỗi khi lưu cache vào IndexedDB:', error);
    }
}

/**
 * 📖 Đọc dữ liệu từ IndexedDB
 */
async function loadFromCache() {
    try {
        const cacheData = await loadFromIndexedDB();
        
        if (!cacheData) {
            console.log('📭 Chưa có dữ liệu trong IndexedDB');
            return false;
        }
        
        // Kiểm tra version cache
        if (cacheData.version !== CACHE_VERSION) {
            console.log('🔄 Cache cũ, xóa và tải mới');
            await clearIndexedDB();
            return false;
        }

        // Load dữ liệu vào state
        Object.keys(cacheData.data).forEach(collectionName => {
            state[collectionName] = cacheData.data[collectionName] || [];
        });
        
        state._lastSyncTime = cacheData.timestamp;
        state._cacheLoaded = true;
        
        const size = await getIndexedDBSize();
        console.log(`💾 Đã load dữ liệu từ IndexedDB (${new Date(cacheData.timestamp).toLocaleString()}, ${size} MB)`);
        return true;
        
    } catch (error) {
        console.error('❌ Lỗi khi đọc cache từ IndexedDB:', error);
        await clearIndexedDB();
        return false;
    }
}

/**
 * 🔥 KHỞI TẠO STORE - DÙNG INDEXEDDB
 * 💾 Load từ IndexedDB (limit lớn: 50MB-1GB+)
 */
export async function initializeStore() {
    console.log("🚀 Store: Bắt đầu khởi tạo (INDEXEDDB MODE)...");
    
    // Khởi tạo IndexedDB trước
    await initDB();
    
    // ⚡ BƯỚC 1: Thử load từ IndexedDB trước NGAY LẬP TỨC
    const hasCachedData = await loadFromCache();
    
    if (hasCachedData) {
        // ⚡ Có cache - hiển thị dữ liệu ngay lập tức
        console.log("⚡ CACHE HIT! Hiển thị dữ liệu từ localStorage...");
        notifyDataReady();
        
    } else {
        // 📭 Không có cache - hiển thị UI rỗng, CHỜ LOAD THỦ CÔNG
        console.log("📭 CACHE MISS! Hiển thị UI rỗng - cần load thủ công từ Firebase");
        notifyDataReady();
    }
}

// Không tự động load từ Firebase - chỉ dùng localStorage

/**
 * 📢 Thông báo dữ liệu đã sẵn sàng
 */
function notifyDataReady() {
    state._isReady = true;
    
    // Thông báo từng collection
    state._collectionsToLoad.forEach(collectionName => {
        document.dispatchEvent(new CustomEvent(`store:${collectionName}:updated`));
    });
    
    // Thông báo tổng thể
    document.dispatchEvent(new CustomEvent('store:ready'));
    console.log("🎉 Store: TẤT CẢ DỮ LIỆU đã sẵn sàng!");
}

/**
 * Các hàm "getter" để các module khác có thể truy cập
 * dữ liệu trong 'state' một cách an toàn.
 */
export const getBuildings = () => state.buildings;
export const getServices = () => state.services;
export const getCustomers = () => state.customers;
export const getContracts = () => state.contracts;
export const getBills = () => state.bills;
export const getTransactions = () => state.transactions;
export const getAccounts = () => state.accounts;
export const getTasks = () => state.tasks;
export const getNotifications = () => state.notifications;
export const getTransactionCategories = () => state.transactionCategories;
// Hàm getTenants để tương thích với code cũ (thực chất là getCustomers)
export const getTenants = () => state.customers;

/**
 * 🗑️ Xóa cache - dùng khi cần force reload
 */
export function clearCache() {
    localStorage.removeItem(CACHE_KEY);
    console.log('🗑️ Đã xóa cache');
}

/**
 * 🔄 Load data từ Firebase (CHỈ KHI LOAD THỦ CÔNG)
 */
export async function refreshStore() {
    console.log('🔄 LOAD THỦ CÔNG: DISABLED - Chỉ dùng localStorage!');
    
    try {
        console.log('⚠️ refreshStore() đã bị vô hiệu hóa - không gọi Firebase');
        return 0; // Không có Firebase reads
        
    } catch (error) {
        console.error('❌ Error refreshing store:', error); 
        return 0;
    }
}

/**
 * 🔍 Debug cache info
 */
export async function getCacheInfo() {
    try {
        const cacheData = await loadFromIndexedDB();
        if (!cacheData) return null;
        
        const size = await getIndexedDBSize();
        return {
            version: cacheData.version,
            timestamp: new Date(cacheData.timestamp).toLocaleString(),
            size: `${size} MB`,
            collections: Object.keys(cacheData.data).map(name => ({
                name,
                count: cacheData.data[name].length
            }))
        };
    } catch (error) {
        return { error: 'Cache bị lỗi' };
    }
}

/**
 * 💾 LOCAL CRUD OPERATIONS - Chỉ cập nhật localStorage, không sync Firebase
 */

// Thêm item mới vào collection trong localStorage
export function addToLocalStorage(collectionName, item) {
    const newItem = { 
        ...item, 
        id: `local_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        createdAt: new Date(),
        updatedAt: new Date()
    };
    
    state[collectionName].unshift(newItem);
    saveToCache();
    
    // Thông báo cập nhật
    document.dispatchEvent(new CustomEvent(`store:${collectionName}:updated`));
    
    console.log(`➕ [${collectionName}] Đã thêm item vào localStorage:`, newItem.id);
    return newItem;
}

// Cập nhật item trong collection trong localStorage
export function updateInLocalStorage(collectionName, id, updateData) {
    const index = state[collectionName].findIndex(item => item.id === id);
    if (index !== -1) {
        state[collectionName][index] = { 
            ...state[collectionName][index], 
            ...updateData,
            updatedAt: new Date()
        };
        saveToCache();
        
        // Thông báo cập nhật
        document.dispatchEvent(new CustomEvent(`store:${collectionName}:updated`));
        
        console.log(`✏️ [${collectionName}] Đã cập nhật item trong localStorage:`, id);
        return state[collectionName][index];
    }
    return null;
}

// Xóa item khỏi collection trong localStorage
export function deleteFromLocalStorage(collectionName, id) {
    const index = state[collectionName].findIndex(item => item.id === id);
    if (index !== -1) {
        const deleted = state[collectionName].splice(index, 1)[0];
        saveToCache();
        
        // Thông báo cập nhật
        document.dispatchEvent(new CustomEvent(`store:${collectionName}:updated`));
        
        console.log(`🗑️ [${collectionName}] Đã xóa item khỏi localStorage:`, id);
        return deleted;
    }
    return null;
}

// 🧪 Test functions
window.clearCache = clearCache;
window.getCacheInfo = getCacheInfo;
window.refreshStore = refreshStore;
window.addToLocalStorage = addToLocalStorage;
window.updateInLocalStorage = updateInLocalStorage;
window.deleteFromLocalStorage = deleteFromLocalStorage;

// Export cho sync-manager
export function getState() {
    return state;
}

// Update state function cho sync-manager
export function updateState(key, data) {
    state[key] = data;
    console.log(`📝 State updated: ${key} = ${data?.length || 'undefined'} items`);
}

export { saveToCache };

/**
 * 🔥 DUAL SAVE: localStorage first (render ngay) + Firebase background
 */

// Add item: localStorage + Firebase
export async function addToBoth(collectionName, itemData) {
    // 1. Add to localStorage first (render ngay)
    const newItem = addToLocalStorage(collectionName, itemData);
    
    // 2. Add to Firebase background (không block UI)
    setTimeout(async () => {
        try {
            const { db } = await import('./firebase.js');
            const { addDoc, collection } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
            
            const docRef = await addDoc(collection(db, collectionName), {
                ...newItem,
                createdAt: newItem.createdAt,
                updatedAt: newItem.updatedAt
            });
            
            // Update localStorage với Firebase ID thực
            const oldId = newItem.id;
            const firebaseId = docRef.id;
            const index = state[collectionName].findIndex(item => item.id === oldId);
            if (index !== -1) {
                state[collectionName][index].id = firebaseId;
                saveToCache();
                console.log(`🔥 [${collectionName}] Đã sync lên Firebase và update ID: ${oldId} → ${firebaseId}`);
            }
        } catch (error) {
            console.error(`❌ [${collectionName}] Lỗi sync Firebase:`, error);
        }
    }, 100);
    
    return newItem;
}

// Update item: localStorage + Firebase  
export async function updateToBoth(collectionName, id, updateData) {
    // 1. Update localStorage first (render ngay)
    const updatedItem = updateInLocalStorage(collectionName, id, updateData);
    if (!updatedItem) return null;
    
    // 2. Update Firebase background
    setTimeout(async () => {
        try {
            const { db } = await import('./firebase.js');
            const { doc, updateDoc, collection } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
            
            await updateDoc(doc(db, collectionName, id), {
                ...updateData,
                updatedAt: updatedItem.updatedAt
            });
            console.log(`🔥 [${collectionName}] Đã sync update lên Firebase:`, id);
        } catch (error) {
            console.error(`❌ [${collectionName}] Lỗi sync Firebase:`, error);
        }
    }, 100);
    
    return updatedItem;
}

// Delete item: localStorage + Firebase
export async function deleteFromBoth(collectionName, id) {
    // 1. Delete from localStorage first (render ngay)
    const deletedItem = deleteFromLocalStorage(collectionName, id);
    if (!deletedItem) return null;
    
    // 2. Delete from Firebase background
    setTimeout(async () => {
        try {
            const { db } = await import('./firebase.js');
            const { doc, deleteDoc, collection } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
            
            await deleteDoc(doc(db, collectionName, id));
            console.log(`🔥 [${collectionName}] Đã xóa khỏi Firebase:`, id);
        } catch (error) {
            console.error(`❌ [${collectionName}] Lỗi xóa Firebase:`, error);
        }
    }, 100);
    
    return deletedItem;
}