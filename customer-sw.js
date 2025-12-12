// customer-sw.js
// Service Worker cho Customer N-Home PWA

const CACHE_NAME = 'n-home-customer-v2';
const urlsToCache = [
    '/app.html',
    '/manifest-customer.json',
    '/icon-nen-xanh.jpg'
];

// Install Service Worker
self.addEventListener('install', (event) => {
    console.log('Customer SW: Installing...');
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('Customer SW: Caching files');
                return cache.addAll(urlsToCache).catch(err => {
                    console.error('Cache addAll failed:', err);
                    // Continue installation even if cache fails
                });
            })
    );
    self.skipWaiting();
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
    event.respondWith(
        caches.match(event.request)
            .then((response) => {
                // Return cached version if found
                if (response) {
                    return response;
                }
                
                // Fetch from network
                return fetch(event.request);
            })
            .catch(() => {
                // Fallback for offline
                if (event.request.destination === 'document') {
                    return caches.match('/app.html');
                }
            })
    );
});

console.log('✅ Customer Service Worker loaded');