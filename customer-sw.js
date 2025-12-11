// customer-sw.js
// Service Worker cho Customer N-Home PWA

// Tăng version lên v5 để reset toàn bộ cache cũ bị lỗi
const CACHE_NAME = 'n-home-customer-v5'; 

const urlsToCache = [
    '/app',               // QUAN TRỌNG: Cache đường dẫn sạch, không có .html
    '/manifest-customer.json',
    '/icon-nen-xanh.jpg'
];

// Install Service Worker
self.addEventListener('install', (event) => {
    console.log('Customer SW: Installing...');
    self.skipWaiting(); // Kích hoạt ngay lập tức
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

// Fetch handler
self.addEventListener('fetch', (event) => {
    // Chỉ xử lý GET requests và file http/https
    if (event.request.method !== 'GET' || !event.request.url.startsWith('http')) return;

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
                        // Trả về file /app đã lưu trong cache
                        return caches.match('/app');
                    }
                });
            })
    );
});

console.log('✅ Customer Service Worker loaded');