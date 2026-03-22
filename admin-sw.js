// admin-sw.js
// Service Worker cho N-Home PWA

const CACHE_NAME = 'n-home-admin-v4';
const urlsToCache = [
    '/index.html',
    '/styles.css',
    '/js/main.js',
    '/js/auth.js',
    '/js/firebase.js',
    '/js/navigation.js',
    '/js/store.js',
    '/js/utils.js',
    '/js/modules/dashboard.js',
    '/js/modules/bills.js',
    '/js/modules/customers.js',
    '/js/modules/buildings.js',
    '/js/modules/contracts.js',
    '/js/modules/services.js',
    '/js/modules/transactions.js',
    '/js/modules/accounts.js',
    '/js/modules/reports.js',
    '/js/modules/notifications.js',
    '/js/modules/tasks.js',
    '/js/modules/transaction-categories.js',
    '/icon-nen-xanh.jpg',
    '/manifest.json'
];

// Install Service Worker
self.addEventListener('install', (event) => {
    console.log('N-Home SW: Installing...');
    self.skipWaiting(); // Kích hoạt ngay, không chờ
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('N-Home SW: Caching files');
                return cache.addAll(urlsToCache);
            })
    );
});

// Activate Service Worker
self.addEventListener('activate', (event) => {
    console.log('N-Home SW: Activating...');
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('N-Home SW: Deleting old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => self.clients.claim()) // Chiếm quyền ngay cho tất cả tab
    );
});

// Fetch từ cache hoặc network
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);
    
    // Bỏ qua request đến domain bên ngoài (vietqr, firebase, v.v.) - để browser tự xử lý
    if (url.origin !== self.location.origin) {
        return;
    }
    
    event.respondWith(
        // ignoreSearch: true -> 'styles.css?v=8.5' match được cache entry '/styles.css'
        caches.match(event.request, { ignoreSearch: true })
            .then((response) => {
                return response || fetch(event.request);
            })
            .catch(() => {
                // Chỉ trả index.html cho navigate (gõ URL, click link)
                // KHÔNG trả index.html cho CSS/JS/image - tránh HTML bị parse làm asset
                if (event.request.mode === 'navigate') {
                    return caches.match('/index.html', { ignoreSearch: true });
                }
                return Response.error();
            })
    );
});

console.log('✅ N-Home Service Worker loaded');