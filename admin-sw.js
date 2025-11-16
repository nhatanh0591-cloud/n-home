// admin-sw.js
// Service Worker cho N-Home Admin PWA

const CACHE_NAME = 'n-home-admin-v6';
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
    console.log('N-Home Admin SW: Installing...');
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('N-Home Admin SW: Caching files');
                return cache.addAll(urlsToCache);
            })
    );
});

// Activate Service Worker
self.addEventListener('activate', (event) => {
    console.log('N-Home Admin SW: Activating...');
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('N-Home Admin SW: Deleting old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
});

// Fetch từ cache hoặc network - FORCE BYPASS cache cho mọi Firebase requests  
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);
    
    // BYPASS cache hoàn toàn cho Firebase để đồng bộ data real-time
    if (url.hostname.includes('firestore') || 
        url.hostname.includes('firebase') || 
        url.hostname.includes('googleapis') ||
        url.pathname.includes('/api/') ||
        event.request.method !== 'GET') {
        
        // Force network-first, no cache
        event.respondWith(
            fetch(event.request.clone(), {
                cache: 'no-cache',
                headers: {
                    'Cache-Control': 'no-cache, no-store, must-revalidate',
                    'Pragma': 'no-cache',
                    'Expires': '0'
                }
            }).catch(() => {
                // Fallback nếu network fail
                return new Response('{"error": "Network unavailable"}', {
                    status: 503,
                    headers: { 'Content-Type': 'application/json' }
                });
            })
        );
        return;
    }
    
    // Chỉ cache static files (HTML, CSS, JS, images)
    if (url.pathname.endsWith('.html') || 
        url.pathname.endsWith('.css') ||
        url.pathname.endsWith('.js') ||
        url.pathname.endsWith('.jpg') ||
        url.pathname.endsWith('.png') ||
        url.pathname.endsWith('.json')) {
        
        event.respondWith(
            caches.match(event.request)
                .then((response) => {
                    return response || fetch(event.request);
                })
        );
        return;
    }
    
    // Tất cả requests khác - network first
    event.respondWith(fetch(event.request));
});

console.log('✅ N-Home Admin Service Worker loaded');