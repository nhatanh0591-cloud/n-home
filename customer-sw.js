// customer-sw.js
// Service Worker cho N-Home Customer App

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
                    if (cacheName !== CACHE_NAME) {
                        console.log('N-Home Customer SW: Deleting old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
});

// Fetch từ cache hoặc network - KHÔNG cache data API để real-time update
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);
    
    // KHÔNG cache Firebase/API requests để có real-time data
    if (url.hostname.includes('firestore') || 
        url.hostname.includes('firebase') || 
        url.pathname.includes('/api/') ||
        event.request.method !== 'GET') {
        event.respondWith(fetch(event.request));
        return;
    }
    
    event.respondWith(
        caches.match(event.request)
            .then((response) => {
                // Chỉ cache UI files, không cache data
                return response || fetch(event.request);
            })
    );
});

console.log('✅ N-Home Customer Service Worker loaded');