// customer-sw.js
// Service Worker cho N-Home Customer App PWA

const CACHE_NAME = 'n-home-customer-v1';
const urlsToCache = [
    '/app.html',
    '/icon-nen-xanh.jpg',
    '/manifest-customer.json',
    '/images/plumber-illustration.png'
];

// Install Service Worker
self.addEventListener('install', (event) => {
    console.log('✅ Customer SW: Installing...');
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('✅ Customer SW: Caching files');
                return cache.addAll(urlsToCache).catch(err => {
                    console.log('⚠️ Customer SW: Some files failed to cache:', err);
                    // Không fail install nếu một số file không cache được
                });
            })
    );
    self.skipWaiting(); // Force activate ngay
});

// Activate Service Worker
self.addEventListener('activate', (event) => {
    console.log('✅ Customer SW: Activating...');
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('🗑️ Customer SW: Deleting old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
    return self.clients.claim(); // Take control ngay
});

// Fetch - Network first, fallback to cache
self.addEventListener('fetch', (event) => {
    event.respondWith(
        fetch(event.request)
            .then((response) => {
                // Clone response để cache
                const responseToCache = response.clone();
                caches.open(CACHE_NAME)
                    .then((cache) => {
                        cache.put(event.request, responseToCache);
                    });
                return response;
            })
            .catch(() => {
                // Nếu network fail, dùng cache
                return caches.match(event.request);
            })
    );
});

console.log('✅ N-Home Customer Service Worker loaded');
