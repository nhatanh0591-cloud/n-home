/**
 * IndexedDB Storage - Thay thế localStorage với limit lớn hơn (50MB-1GB+)
 */

const DB_NAME = 'n_home_db';
const DB_VERSION = 1;
const STORE_NAME = 'cache';
const CACHE_KEY = 'app_data';

let db = null;

/**
 * Khởi tạo IndexedDB
 */
export async function initDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
            db = request.result;
            console.log('✅ IndexedDB initialized');
            resolve(db);
        };
        
        request.onupgradeneeded = (event) => {
            db = event.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME);
                console.log('✅ IndexedDB object store created');
            }
        };
    });
}

/**
 * Lưu dữ liệu vào IndexedDB
 */
export async function saveToIndexedDB(data) {
    if (!db) await initDB();
    
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.put(data, CACHE_KEY);
        
        request.onsuccess = () => {
            console.log('💾 Saved to IndexedDB');
            resolve();
        };
        request.onerror = () => reject(request.error);
    });
}

/**
 * Đọc dữ liệu từ IndexedDB
 */
export async function loadFromIndexedDB() {
    if (!db) await initDB();
    
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.get(CACHE_KEY);
        
        request.onsuccess = () => {
            resolve(request.result || null);
        };
        request.onerror = () => reject(request.error);
    });
}

/**
 * Xóa dữ liệu từ IndexedDB
 */
export async function clearIndexedDB() {
    if (!db) await initDB();
    
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.delete(CACHE_KEY);
        
        request.onsuccess = () => {
            console.log('🗑️ IndexedDB cleared');
            resolve();
        };
        request.onerror = () => reject(request.error);
    });
}

/**
 * Lấy kích thước dữ liệu trong IndexedDB
 */
export async function getIndexedDBSize() {
    if (!db) await initDB();
    
    const data = await loadFromIndexedDB();
    if (!data) return 0;
    
    const sizeInBytes = new Blob([JSON.stringify(data)]).size;
    return (sizeInBytes / (1024 * 1024)).toFixed(2); // MB
}
