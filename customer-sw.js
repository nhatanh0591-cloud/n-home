// customer-sw.js
// Service Worker cho Customer N-Home PWA

const CACHE_NAME = 'n-home-customer-v4'; // Tăng version để reset cache
const urlsToCache = [
    '/',
    '/app.html',        // QUAN TRỌNG: File thật
    '/manifest-customer.json',
    '/icon-nen-xanh.jpg'
    // XÓA '/app' đi
];

// Install Service Worker
self.addEventListener('install', (event) => {
    console.log('Customer SW: Installing...');
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('Customer SW: Caching files');
                return cache.addAll(urlsToCache);
            })
    );
});

// Activate Service Worker
self.addEventListener('activate', (event) => {
    console.log('Customer SW: Activating...');
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('Customer SW: Deleting old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => {
            console.log('Customer SW: Activated');
            return self.clients.claim();
        })
    );
});

// Fetch handler - QUAN TRỌNG CHO PWA INSTALL
self.addEventListener('fetch', (event) => {
    // Chỉ xử lý GET requests
    if (event.request.method !== 'GET') return;

    event.respondWith(
        caches.match(event.request)
            .then((response) => {
                if (response) {
                    return response; // Có cache thì trả về ngay
                }
                
                // Tải từ mạng
                return fetch(event.request).catch(() => {
                    // NẾU MẤT MẠNG (OFFLINE)
                    if (event.request.mode === 'navigate') {
                        // Trả về app.html cho mọi navigation request
                        return caches.match('/app.html');
                    }
                });
            })
    );
});

console.log('✅ Customer Service Worker loaded');