/**
 * Sync Manager - Quản lý đồng bộ dữ liệu từ Firebase
 */

import { 
    db, 
    collection, 
    getDocs, 
    query, 
    where,
    orderBy,
    Timestamp
} from '../firebase.js';

import { showToast } from '../utils.js';

// Import từ store.js để sử dụng state chung
import { getState, saveToCache, updateState } from '../store.js';

/**
 * Đồng bộ các collection được chọn với tùy chọn date range
 */
export async function syncSelectedCollections(selectedCollections, dateFrom = null, dateTo = null) {
    console.log('🔄 Starting selective sync:', { selectedCollections, dateFrom, dateTo });
    
    if (!selectedCollections || selectedCollections.length === 0) {
        throw new Error('Vui lòng chọn ít nhất một module để cập nhật');
    }

    let totalReads = 0;
    const results = {};

    try {
        for (const collectionName of selectedCollections) {
            console.log(`🔄 Syncing ${collectionName}...`);
            
            const result = await syncSingleCollection(collectionName, dateFrom, dateTo);
            results[collectionName] = result;
            totalReads += result.reads;
            
            // Dispatch event để các module khác biết dữ liệu đã cập nhật
            console.log(`🔥 Dispatching event: store:${collectionName}:updated`);
            const currentState = getState();
            console.log(`🔥 DEBUG: Final state[${collectionName}] before dispatch:`, currentState[collectionName]?.length || 'undefined');
            document.dispatchEvent(new CustomEvent(`store:${collectionName}:updated`));
        }

        // Lưu vào localStorage thông qua store.js
        console.log('🔍 DEBUG: About to saveToCache...');
        saveToCache();
        console.log('🔍 DEBUG: saveToCache completed');
        
        console.log(`✅ Sync completed! Total reads: ${totalReads}`);
        return {
            success: true,
            totalReads,
            results
        };

    } catch (error) {
        console.error('❌ Sync failed:', error);
        throw error;
    }
}

/**
 * Đồng bộ một collection cụ thể
 */
async function syncSingleCollection(collectionName, dateFrom, dateTo) {
    // Map collection names cho Firebase
    const firebaseCollectionName = collectionName === 'notifications' ? 'adminNotifications' : collectionName;
    
    let q = query(collection(db, firebaseCollectionName), orderBy('createdAt', 'desc'));
    
    // Thêm filter theo date range nếu có
    if (dateFrom || dateTo) {
        const conditions = [];
        
        if (dateFrom) {
            // Convert to Date object if needed
            let fromDate = dateFrom instanceof Date ? dateFrom : new Date(dateFrom);
            // Validate date
            if (isNaN(fromDate.getTime())) {
                throw new Error('Ngày bắt đầu không hợp lệ');
            }
            // Set to start of day
            fromDate.setHours(0, 0, 0, 0);
            const fromTimestamp = Timestamp.fromDate(fromDate);
            conditions.push(where('createdAt', '>=', fromTimestamp));
        }
        
        if (dateTo) {
            // Convert to Date object if needed
            let toDate = dateTo instanceof Date ? dateTo : new Date(dateTo);
            // Validate date
            if (isNaN(toDate.getTime())) {
                throw new Error('Ngày kết thúc không hợp lệ');
            }
            // Set to end of day
            toDate.setHours(23, 59, 59, 999);
            const toTimestamp = Timestamp.fromDate(toDate);
            conditions.push(where('createdAt', '<=', toTimestamp));
        }
        
        // Rebuild query với conditions
        q = query(collection(db, firebaseCollectionName), orderBy('createdAt', 'desc'), ...conditions);
    }

    const snapshot = await getDocs(q);
    const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    
    // Map lại key cho state (adminNotifications -> notifications)
    const stateKey = firebaseCollectionName === 'adminNotifications' ? 'notifications' : collectionName;
    
    // Lấy state từ store.js chính
    const state = getState();
    console.log(`🔍 DEBUG: Current state[${stateKey}] before update:`, state[stateKey]?.length || 'undefined');
    console.log(`🔍 DEBUG: New data from Firebase:`, data.length, 'items');
    
    if (dateFrom || dateTo) {
        // Nếu có date range, merge với dữ liệu cũ
        const existingData = state[stateKey] || [];
        const mergedData = mergeDataByDateRange(existingData, data, dateFrom, dateTo);
        updateState(stateKey, mergedData);
        console.log(`🔍 DEBUG: After merge, state[${stateKey}]:`, mergedData.length, 'items');
    } else {
        // Nếu không có date range, replace toàn bộ
        updateState(stateKey, data);
        console.log(`🔍 DEBUG: After replace, state[${stateKey}]:`, data.length, 'items');
    }
    
    console.log(`✅ ${collectionName}: ${snapshot.size} records synced`);
    
    return {
        collection: collectionName,
        records: snapshot.size,
        reads: snapshot.size
    };
}

/**
 * Merge dữ liệu mới với dữ liệu cũ theo date range
 */
function mergeDataByDateRange(existingData, newData, dateFrom, dateTo) {
    if (!dateFrom && !dateTo) {
        return newData; // Replace all
    }

    // Tạo bản sao existing data
    let merged = [...existingData];
    
    // Update/thêm từng item mới
    newData.forEach(newItem => {
        const existingIndex = merged.findIndex(item => item.id === newItem.id);
        if (existingIndex >= 0) {
            // Cập nhật item cũ
            merged[existingIndex] = newItem;
        } else {
            // Thêm item mới
            merged.push(newItem);
        }
    });
    
    // Sort theo createdAt
    merged.sort((a, b) => {
        const dateA = getDateFromTimestamp(a.createdAt);
        const dateB = getDateFromTimestamp(b.createdAt);
        if (!dateA || !dateB) return 0;
        return dateB.getTime() - dateA.getTime(); // Desc order
    });
    
    return merged;
}

/**
 * Lấy Date object từ Firebase Timestamp
 */
function getDateFromTimestamp(timestamp) {
    if (!timestamp) return null;
    
    // Handle Firebase Timestamp object
    if (timestamp.toDate && typeof timestamp.toDate === 'function') {
        return timestamp.toDate();
    }
    
    // Handle plain object with seconds
    if (timestamp.seconds) {
        return new Date(timestamp.seconds * 1000);
    }
    
    // Handle regular Date
    if (timestamp instanceof Date) {
        return timestamp;
    }
    
    // Handle string
    if (typeof timestamp === 'string') {
        return new Date(timestamp);
    }
    
    return null;
}

// Các functions saveToLocalStorage và getFromLocalStorage đã được thay thế bằng store.js

/**
 * Smart Sync - Chỉ sync dữ liệu mới/thay đổi
 */
export async function smartSync() {
    console.log('🚀 [SMART-SYNC] Starting smart sync...');
    
    const collections = ['contracts', 'bills', 'customers', 'buildings', 'services', 'transactions'];
    const state = getState();
    let totalNew = 0;
    let totalUpdated = 0;
    let totalDeleted = 0;
    
    try {
        for (const collectionName of collections) {
            const result = await smartSyncCollection(collectionName, state[collectionName] || []);
            totalNew += result.newItems;
            totalUpdated += result.updatedItems;
            totalDeleted += result.deletedItems;
            
            if (result.hasChanges) {
                document.dispatchEvent(new CustomEvent(`store:${collectionName}:updated`));
            }
        }
        
        if (totalNew > 0 || totalUpdated > 0 || totalDeleted > 0) {
            saveToCache();
            showToast(`Smart Sync hoàn tất: ${totalNew} mới, ${totalUpdated} cập nhật, ${totalDeleted} xóa`, 'success');
        } else {
            showToast('Không có dữ liệu mới để cập nhật', 'info');
        }
        
    } catch (error) {
        console.error('❌ [SMART-SYNC] Error:', error);
        showToast('Lỗi smart sync: ' + error.message, 'error');
    }
}

async function smartSyncCollection(collectionName, localData) {
    const firebaseRef = collection(db, collectionName);
    const snapshot = await getDocs(firebaseRef);
    const firebaseData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    
    const localDataMap = new Map(localData.map(item => [item.id, item]));
    const firebaseDataMap = new Map(firebaseData.map(item => [item.id, item]));
    let newItems = 0;
    let updatedItems = 0;
    let deletedItems = 0;
    let hasChanges = false;
    
    // Bắt đầu với dữ liệu Firebase làm chuẩn
    const mergedData = [...firebaseData];
    
    // Kiểm tra items mới và cập nhật từ Firebase
    firebaseData.forEach(firebaseItem => {
        const localItem = localDataMap.get(firebaseItem.id);
        
        if (!localItem) {
            // Item mới từ Firebase
            newItems++;
            hasChanges = true;
            console.log(`➕ [SMART-SYNC] New ${collectionName}:`, firebaseItem.id);
        } else {
            // Kiểm tra có cần cập nhật không
            const firebaseUpdated = firebaseItem.updatedAt || firebaseItem.createdAt;
            const localUpdated = localItem.updatedAt || localItem.createdAt;
            
            let needsUpdate = false;
            
            if (firebaseUpdated && localUpdated) {
                // So sánh timestamp
                const fbTime = firebaseUpdated.toDate ? firebaseUpdated.toDate().getTime() : new Date(firebaseUpdated).getTime();
                const localTime = localUpdated.toDate ? localUpdated.toDate().getTime() : new Date(localUpdated).getTime();
                
                if (fbTime > localTime) {
                    needsUpdate = true;
                }
            } else if (firebaseUpdated && !localUpdated) {
                needsUpdate = true;
            }
            
            if (needsUpdate) {
                updatedItems++;
                hasChanges = true;
                console.log(`🔄 [SMART-SYNC] Updated ${collectionName}:`, firebaseItem.id);
            }
        }
    });
    
    // Kiểm tra items bị xóa (có ở local nhưng không có ở Firebase)
    localData.forEach(localItem => {
        if (!firebaseDataMap.has(localItem.id)) {
            deletedItems++;
            hasChanges = true;
            console.log(`🗑️ [SMART-SYNC] Deleted ${collectionName}:`, localItem.id);
        }
    });
    
    if (hasChanges) {
        updateState(collectionName, mergedData);
    }
    
    return { newItems, updatedItems, deletedItems, hasChanges };
}

/**
 * Export cho window để có thể gọi từ console
 */
window.syncSelectedCollections = syncSelectedCollections;
window.smartSync = smartSync;