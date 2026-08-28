/**
 * Sync Manager - Tự động đồng bộ dữ liệu từ Firebase
 *
 * Nguyên tắc:
 * - Mỗi collection tự nhớ mốc "updatedAt" của lần đồng bộ trước (lưu ở localStorage).
 *   Lần đồng bộ sau chỉ lấy các bản ghi có updatedAt >= mốc đó (tăng dần) -> ít reads nhất.
 * - Firebase không báo được "bản ghi nào vừa bị xóa" qua query thường, nên cứ khoảng
 *   FULL_RESYNC_INTERVAL_MS lại tự quét lại toàn bộ 1 lần (khi người dùng bấm nút) để dọn
 *   các bản ghi đã bị xóa khỏi dữ liệu local.
 * - Tài khoản "quản lý" (viewer) chỉ đồng bộ các module họ được phép xem.
 */

import { db, collection, getDocs, query, where, Timestamp } from '../firebase.js';
import { getState, saveToCache, updateState } from '../store.js';
import { getCurrentUserRole } from '../auth.js';

// Danh sách collection cần đồng bộ: tên trên Firebase <-> tên key trong state local
const SYNC_TARGETS = [
    { firebaseName: 'buildings', stateKey: 'buildings' },
    { firebaseName: 'services', stateKey: 'services' },
    { firebaseName: 'transactionCategories', stateKey: 'transactionCategories' },
    { firebaseName: 'accounts', stateKey: 'accounts' },
    { firebaseName: 'customers', stateKey: 'customers' },
    { firebaseName: 'contracts', stateKey: 'contracts' },
    { firebaseName: 'bills', stateKey: 'bills' },
    { firebaseName: 'transactions', stateKey: 'transactions' },
    { firebaseName: 'tasks', stateKey: 'tasks' },
    { firebaseName: 'adminNotifications', stateKey: 'notifications' },
    { firebaseName: 'materials', stateKey: 'materials' },
    { firebaseName: 'materialCategories', stateKey: 'materialCategories' }
];

// Các module tài khoản "quản lý" (viewer) không được xem -> không đồng bộ cho tài khoản này
const VIEWER_RESTRICTED_STATE_KEYS = ['services', 'notifications'];

const CURSOR_STORAGE_KEY = 'n_home_sync_cursors';
const FULL_RESYNC_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000; // 7 ngày

function loadCursors() {
    try {
        return JSON.parse(localStorage.getItem(CURSOR_STORAGE_KEY)) || {};
    } catch (error) {
        return {};
    }
}

function saveCursors(cursors) {
    localStorage.setItem(CURSOR_STORAGE_KEY, JSON.stringify(cursors));
}

function getSyncTargetsForCurrentUser() {
    const userRole = getCurrentUserRole();
    if (userRole && userRole.role === 'viewer') {
        return SYNC_TARGETS.filter(t => !VIEWER_RESTRICTED_STATE_KEYS.includes(t.stateKey));
    }
    return SYNC_TARGETS;
}

function timestampToMillis(timestamp) {
    if (!timestamp) return null;
    if (typeof timestamp.toDate === 'function') return timestamp.toDate().getTime();
    if (timestamp.seconds) return timestamp.seconds * 1000;
    if (timestamp instanceof Date) return timestamp.getTime();
    if (typeof timestamp === 'string') {
        const t = new Date(timestamp).getTime();
        return isNaN(t) ? null : t;
    }
    return null;
}

/**
 * Đồng bộ tự động - nút "Đồng bộ dữ liệu" gọi đúng 1 hàm này.
 * Tự quyết định: tăng dần hay quét toàn bộ, tự lọc module theo quyền tài khoản,
 * tự lưu lại mốc đồng bộ - người dùng chỉ cần bấm nút.
 *
 * @param {Object} [options]
 * @param {boolean} [options.forceFull] - Ép quét lại toàn bộ ngay, không chờ đủ 7 ngày
 *   (dùng khi người dùng chủ động chọn "Đồng bộ toàn bộ dữ liệu" - ví dụ để dọn các bản ghi
 *   đã bị xóa ở máy khác mà đồng bộ tăng dần không phát hiện được).
 */
export async function autoSync(options = {}) {
    const { forceFull = false } = options;
    const targets = getSyncTargetsForCurrentUser();
    const cursors = loadCursors();
    const now = Date.now();
    const needFullReconcile = forceFull || !cursors._lastFullSync || (now - cursors._lastFullSync > FULL_RESYNC_INTERVAL_MS);

    let totalReads = 0;
    let totalChanged = 0;
    const changedByModule = {};

    for (const { firebaseName, stateKey } of targets) {
        const runFull = needFullReconcile || !cursors[stateKey];
        const cursorBefore = runFull ? null : cursors[stateKey];

        const isFull = !cursorBefore;
        const q = isFull
            ? query(collection(db, firebaseName))
            : query(collection(db, firebaseName), where('updatedAt', '>=', Timestamp.fromMillis(cursorBefore)));

        const snapshot = await getDocs(q);
        const docs = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));

        const state = getState();
        const existing = state[stateKey] || [];

        const merged = isFull
            ? docs
            : (() => {
                const map = new Map(existing.map(item => [item.id, item]));
                docs.forEach(item => map.set(item.id, item));
                return Array.from(map.values());
            })();

        let newCursorMs = cursorBefore || null;
        docs.forEach(item => {
            const t = timestampToMillis(item.updatedAt);
            if (t && (!newCursorMs || t > newCursorMs)) newCursorMs = t;
        });
        if (!newCursorMs) newCursorMs = now;

        updateState(stateKey, merged);
        document.dispatchEvent(new CustomEvent(`store:${stateKey}:updated`));

        totalReads += snapshot.size;
        totalChanged += docs.length;
        if (docs.length > 0) changedByModule[stateKey] = docs.length;
        cursors[stateKey] = newCursorMs;
    }

    if (needFullReconcile) cursors._lastFullSync = now;
    saveCursors(cursors);
    saveToCache();

    return {
        success: true,
        totalReads,
        totalChanged,
        changedByModule,
        didFullReconcile: needFullReconcile
    };
}

// Export cho window để có thể gọi từ console khi cần debug
window.autoSync = autoSync;
