// js/store.js
import { db, collection, onSnapshot, query, orderBy, getDocs } from './firebase.js';

/**
 * 💾 CACHE KEY - để lưu dữ liệu vào máy tính
 */
const CACHE_KEY = 'n_home_data_cache';
const CACHE_VERSION = '1.0'; // Tăng version khi cần xóa cache cũ

/**
 * Kho lưu trữ dữ liệu (state) tập trung của toàn bộ ứng dụng.
 * 🔥 TÍCH HỢP CACHE ĐỂ TIẾT KIỆM FIREBASE READS
 * ✨ OPTIMIZED: Listener cleanup + docChanges() + debounced cache
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
    // Cờ báo hiệu tất cả dữ liệu ban đầu đã tải xong
    _isReady: false,
    _collectionsToLoad: ['buildings', 'services', 'customers', 'contracts', 'bills', 'transactions', 'accounts', 'tasks'],
    _loadedCount: 0,
    // 💾 Thêm thông tin cache
    _lastSyncTime: null,
    _cacheLoaded: false
};

/**
 * 🧹 CLEANUP: Store unsubscribe functions để cleanup listeners
 */
const listenerUnsubscribers = [];

/**
 * 💾 Lưu dữ liệu vào máy tính (DEBOUNCED - tránh save liên tục)
 */
let saveCacheTimeout = null;
function saveToCache() {
    // Clear timeout cũ nếu có
    if (saveCacheTimeout) {
        clearTimeout(saveCacheTimeout);
    }
    
    // Debounce 2 giây - chỉ save khi không có thay đổi mới trong 2s
    saveCacheTimeout = setTimeout(() => {
        try {
            const cacheData = {
                version: CACHE_VERSION,
                timestamp: Date.now(),
                data: {
                    buildings: state.buildings,
                    services: state.services,
                    customers: state.customers,
                    contracts: state.contracts,
                    bills: state.bills,
                    transactions: state.transactions,
                    accounts: state.accounts,
                    tasks: state.tasks
                }
            };
            localStorage.setItem(CACHE_KEY, JSON.stringify(cacheData));
            state._lastSyncTime = Date.now();
            console.log('💾 Đã lưu cache vào localStorage');
        } catch (error) {
            console.error('❌ Lỗi khi lưu cache:', error);
        }
    }, 2000);
}

/**
 * 📖 Đọc dữ liệu từ máy tính
 */
function loadFromCache() {
    try {
        const cached = localStorage.getItem(CACHE_KEY);
        if (!cached) {
            console.log('📭 Chưa có dữ liệu trong máy tính');
            return false;
        }

        const cacheData = JSON.parse(cached);
        
        // Kiểm tra version cache
        if (cacheData.version !== CACHE_VERSION) {
            console.log('🔄 Cache cũ, xóa và tải mới');
            localStorage.removeItem(CACHE_KEY);
            return false;
        }

        // Load dữ liệu vào state
        Object.keys(cacheData.data).forEach(collectionName => {
            state[collectionName] = cacheData.data[collectionName] || [];
        });
        
        state._lastSyncTime = cacheData.timestamp;
        state._cacheLoaded = true;
        
        console.log(`💾 Đã load dữ liệu từ máy tính (${new Date(cacheData.timestamp).toLocaleString()})`);
        return true;
        
    } catch (error) {
        console.error('❌ Lỗi khi đọc cache:', error);
        localStorage.removeItem(CACHE_KEY);
        return false;
    }
}

/**
 * 🔥 KHỞI TẠO STORE THÔNG MINH - TIẾT KIỆM FIREBASE READS
 * ✨ OPTIMIZED: Cleanup old listeners trước khi tạo mới
 */
export async function initializeStore() {
    console.log("🚀 Store: Bắt đầu khởi tạo...");
    
    // 🧹 CLEANUP: Unsubscribe tất cả listeners cũ (nếu có)
    cleanupListeners();
    
    // ⚡ BƯỚC 1: Thử load từ máy tính trước NGAY LẬP TỨC
    const hasCachedData = loadFromCache();
    
    if (hasCachedData) {
        // ⚡ Hiển thị dữ liệu ngay từ cache - KHÔNG CHỜ Firebase
        console.log("⚡ CACHE HIT! Hiển thị dữ liệu ngay lập tức từ máy tính...");
        notifyDataReady();
        
        // 🔄 Setup listeners SAU để cập nhật real-time (không block UI)
        setTimeout(() => {
            console.log("🔄 Setup real-time listeners để sync với Firebase...");
            setupRealtimeListeners();
        }, 100);
        
    } else {
        // 📭 Không có cache - báo ready ngay để hiển thị UI, load Firebase sau
        console.log("📭 CACHE MISS! Hiển thị UI rỗng, đang tải từ Firebase...");
        notifyDataReady();
        
        // 🔄 Setup listeners + load data từ Firebase
        setTimeout(async () => {
            setupRealtimeListeners();
            await loadInitialDataFromFirebase();
        }, 100);
    }
}

/**
 * 🧹 CLEANUP: Unsubscribe tất cả listeners để tránh memory leak
 */
function cleanupListeners() {
    if (listenerUnsubscribers.length > 0) {
        console.log(`🧹 Cleaning up ${listenerUnsubscribers.length} old listeners...`);
        listenerUnsubscribers.forEach(unsubscribe => {
            try {
                unsubscribe();
            } catch (error) {
                console.error('Error unsubscribing:', error);
            }
        });
        listenerUnsubscribers.length = 0; // Clear array
        console.log('✅ All listeners cleaned up');
    }
}

/**
 * 📡 Setup real-time listeners (onSnapshot chỉ tính reads cho thay đổi)
 * ✨ OPTIMIZED: 
 * - Store unsubscribe functions
 * - Use docChanges() để chỉ xử lý delta thay vì read toàn bộ
 * - Debounced cache saving
 */
function setupRealtimeListeners() {
    state._collectionsToLoad.forEach(collectionName => {
        const q = query(collection(db, collectionName), orderBy('createdAt', 'desc'));

        // Subscribe và lưu unsubscribe function
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const changes = snapshot.docChanges();
            
            if (changes.length === 0) {
                console.log(`📊 [${collectionName}] No changes`);
                return;
            }
            
            console.log(`📊 [${collectionName}] Firebase changes: ${changes.length} reads (added: ${changes.filter(c => c.type === 'added').length}, modified: ${changes.filter(c => c.type === 'modified').length}, removed: ${changes.filter(c => c.type === 'removed').length})`);
            
            // ✨ OPTIMIZE: Chỉ xử lý delta thay vì map toàn bộ snapshot.docs
            if (state[collectionName].length === 0) {
                // Lần đầu load - map toàn bộ
                state[collectionName] = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            } else {
                // Đã có data - chỉ apply changes
                changes.forEach(change => {
                    const docData = { id: change.doc.id, ...change.doc.data() };
                    const index = state[collectionName].findIndex(item => item.id === change.doc.id);
                    
                    if (change.type === 'added' && index === -1) {
                        // Thêm mới
                        state[collectionName].unshift(docData);
                    } else if (change.type === 'modified' && index !== -1) {
                        // Cập nhật
                        state[collectionName][index] = docData;
                    } else if (change.type === 'removed' && index !== -1) {
                        // Xóa
                        state[collectionName].splice(index, 1);
                    }
                });
            }
            
            // Lưu vào cache (debounced)
            saveToCache();
            
            // Thông báo cập nhật
            document.dispatchEvent(new CustomEvent(`store:${collectionName}:updated`));
            
            console.log(`✅ [${collectionName}] updated: ${state[collectionName].length} items`);
        }, (error) => {
            console.error(`❌ Lỗi listener [${collectionName}]:`, error);
        });
        
        // 🧹 Lưu unsubscribe function để cleanup sau
        listenerUnsubscribers.push(unsubscribe);
    });
    
    console.log(`✅ Setup ${listenerUnsubscribers.length} listeners with cleanup support`);
}

/**
 * 🔄 Load dữ liệu lần đầu từ Firebase (chỉ khi không có cache)
 */
async function loadInitialDataFromFirebase() {
    console.log("🔄 Đang tải dữ liệu lần đầu từ Firebase...");
    
    try {
        for (const collectionName of state._collectionsToLoad) {
            const q = query(collection(db, collectionName), orderBy('createdAt', 'desc'));
            const snapshot = await getDocs(q);
            
            state[collectionName] = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            state._loadedCount++;
            
            console.log(`📦 [${collectionName}] loaded: ${state[collectionName].length} items`);
        }
        
        // Lưu vào cache
        saveToCache();
        
        // Thông báo ready
        notifyDataReady();
        
    } catch (error) {
        console.error('❌ Lỗi tải dữ liệu lần đầu:', error);
    }
}

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
 * 🔄 Force refresh data từ Firebase (manual refresh)
 */
export async function refreshStore() {
    console.log('🔄 Manual refresh: Loading fresh data from Firebase...');
    
    try {
        let totalReads = 0;
        
        for (const collectionName of state._collectionsToLoad) {
            const q = query(collection(db, collectionName), orderBy('createdAt', 'desc'));
            const snapshot = await getDocs(q);
            
            state[collectionName] = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            totalReads += snapshot.size;
            
            // Notify update
            document.dispatchEvent(new CustomEvent(`store:${collectionName}:updated`));
            
            console.log(`📦 [${collectionName}] refreshed: ${snapshot.size} items`);
        }
        
        // Save to cache immediately (không debounce)
        if (saveCacheTimeout) clearTimeout(saveCacheTimeout);
        const cacheData = {
            version: CACHE_VERSION,
            timestamp: Date.now(),
            data: {
                buildings: state.buildings,
                services: state.services,
                customers: state.customers,
                contracts: state.contracts,
                bills: state.bills,
                transactions: state.transactions,
                accounts: state.accounts,
                tasks: state.tasks
            }
        };
        localStorage.setItem(CACHE_KEY, JSON.stringify(cacheData));
        state._lastSyncTime = Date.now();
        
        console.log(`✅ Store refreshed successfully (${totalReads} reads)`);
        return totalReads;
        
    } catch (error) {
        console.error('❌ Error refreshing store:', error);
        throw error;
    }
}

/**
 * 🔍 Debug cache info
 */
export function getCacheInfo() {
    const cached = localStorage.getItem(CACHE_KEY);
    if (!cached) return null;
    
    try {
        const cacheData = JSON.parse(cached);
        return {
            version: cacheData.version,
            timestamp: new Date(cacheData.timestamp).toLocaleString(),
            size: `${(cached.length / 1024).toFixed(1)} KB`,
            collections: Object.keys(cacheData.data).map(name => ({
                name,
                count: cacheData.data[name].length
            }))
        };
    } catch (error) {
        return { error: 'Cache bị lỗi' };
    }
}

// 🧪 Test functions
window.clearCache = clearCache;
window.getCacheInfo = getCacheInfo;
window.refreshStore = refreshStore;