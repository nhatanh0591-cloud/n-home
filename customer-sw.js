// customer-sw.js
// Service Worker cho N-Home PWA (chung cho cả admin và customer)

const CACHE_NAME = 'n-home-unified-v1.2';
const urlsToCache = [
    '/',
    '/index.html',
    '/app.html',
    '/app',
    '/manifest.json',
    '/icon-nen-xanh.jpg',
    '/js/auth.js',
    '/js/main.js',
    '/js/firebase.js',
    '/js/utils.js',
    '/js/store.js',
    '/js/modules/customers.js',
    '/js/modules/bills.js',
    '/js/modules/transactions.js',
    '/styles.css'
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
            .then(() => {
                // Skip waiting để activate ngay lập tức
                self.skipWaiting();
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
    // Chỉ xử lý requests từ same origin
    if (event.request.url.startsWith(self.location.origin)) {
        event.respondWith(
            caches.match(event.request)
                .then((response) => {
                    // Return cached version if found
                    if (response) {
                        return response;
                    }
                    
                    // Fetch from network
                    return fetch(event.request)
                        .then((response) => {
                            // Cache valid responses
                            if (response && response.status === 200 && response.type === 'basic') {
                                const responseToCache = response.clone();
                                caches.open(CACHE_NAME)
                                    .then((cache) => {
                                        cache.put(event.request, responseToCache);
                                    });
                            }
                            return response;
                        });
                })
                .catch(() => {
                    // Fallback for offline
                    if (event.request.destination === 'document') {
                        return caches.match('/app.html');
                    }
                })
        );
    }
});

console.log('✅ Customer Service Worker loaded');