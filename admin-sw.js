// admin-sw.js
// Service Worker cho N-Home PWA

const CACHE_NAME = 'n-home-admin-v3';
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
        caches.match(event.request)
            .then((response) => {
                // Trả về từ cache nếu có, hoặc fetch từ network
                return response || fetch(event.request);
            })
            .catch(() => {
                return caches.match('/index.html');
            })
    );
});

console.log('✅ N-Home Service Worker loaded');