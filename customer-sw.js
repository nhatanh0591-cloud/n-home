// customer-sw.js
// Service Worker cho N-Home Customer PWA

const CACHE_NAME = 'n-home-customer-v2';
const urlsToCache = [
    '/app.html',
    '/icon-nen-xanh.jpg',
    '/manifest-customer.json'
];

// Install Service Worker
self.addEventListener('install', (event) => {
    console.log('N-Home Customer SW: Installing...');
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('N-Home Customer SW: Caching files');
                return cache.addAll(urlsToCache);
            })
    );
});

// Activate Service Worker
self.addEventListener('activate', (event) => {
    console.log('N-Home Customer SW: Activating...');
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME && cacheName.startsWith('n-home-customer-')) {
                        console.log('N-Home Customer SW: Deleting old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
});

// Fetch từ cache hoặc network
self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request)
            .then((response) => {
                // Trả về từ cache nếu có, hoặc fetch từ network
                return response || fetch(event.request);
            })
    );
});

console.log('✅ N-Home Customer Service Worker loaded');
