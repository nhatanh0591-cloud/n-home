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
 * 💾 Lưu dữ liệu vào máy tính
 */
function saveToCache() {
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
        console.log('💾 Đã lưu dữ liệu vào máy tính');
    } catch (error) {
        console.error('❌ Lỗi khi lưu cache:', error);
    }
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
 */
export async function initializeStore() {
    console.log("🚀 Store: Bắt đầu khởi tạo...");
    
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
        console.log("� CACHE MISS! Hiển thị UI rỗng, đang tải từ Firebase...");
        notifyDataReady();
        
        // 🔄 Setup listeners + load data từ Firebase
        setTimeout(async () => {
            setupRealtimeListeners();
            await loadInitialDataFromFirebase();
        }, 100);
    }
}

/**
 * 📡 Setup real-time listeners (onSnapshot chỉ tính reads cho thay đổi)
 */
function setupRealtimeListeners() {
    state._collectionsToLoad.forEach(collectionName => {
        const q = query(collection(db, collectionName), orderBy('createdAt', 'desc'));

        onSnapshot(q, (snapshot) => {
            console.log(`📊 [${collectionName}] Firebase changes: ${snapshot.docChanges().length} reads`);
            
            // Cập nhật dữ liệu
            state[collectionName] = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            
            // Lưu vào cache
            saveToCache();
            
            // Thông báo cập nhật
            document.dispatchEvent(new CustomEvent(`store:${collectionName}:updated`));
            
            console.log(`✅ [${collectionName}] cập nhật: ${state[collectionName].length} items`);
        }, (error) => {
            console.error(`❌ Lỗi listener [${collectionName}]:`, error);
        });
    });
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