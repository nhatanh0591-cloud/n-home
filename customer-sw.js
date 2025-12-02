// customer-sw.js
// Service Worker cho N-Home Customer PWA

const CACHE_NAME = 'n-home-customer-v2';
const urlsToCache = [
    '/app.html',
    '/styles.css',
    '/icon-nen-xanh.jpg',
    '/manifest-customer.json',
    'https://cdn.tailwindcss.com',
    'https://www.gstatic.com/firebasejs/9.17.1/firebase-app.js',
    'https://www.gstatic.com/firebasejs/9.17.1/firebase-firestore.js',
    'https://www.gstatic.com/firebasejs/9.17.1/firebase-auth.js',
    'https://www.gstatic.com/firebasejs/9.17.1/firebase-storage.js'
];

// Install Service Worker
self.addEventListener('install', (event) => {
    console.log('N-Home Customer SW: Installing...');
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('N-Home Customer SW: Caching files');
                return cache.addAll(urlsToCache.filter(url => !url.includes('cdn.tailwindcss.com'))); // Skip external CDN for cache
            })
            .catch((error) => {
                console.log('N-Home Customer SW: Cache error:', error);
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

// Fetch từ cache hoặc network
self.addEventListener('fetch', (event) => {
    // Skip cross-origin requests
    if (!event.request.url.startsWith(self.location.origin)) {
        return;
    }
    
    event.respondWith(
        caches.match(event.request)
            .then((response) => {
                // Trả về từ cache nếu có, hoặc fetch từ network
                if (response) {
                    return response;
                }
                
                // Clone request vì request stream chỉ có thể sử dụng 1 lần
                const fetchRequest = event.request.clone();
                
                return fetch(fetchRequest).then((response) => {
                    // Kiểm tra response hợp lệ
                    if (!response || response.status !== 200 || response.type !== 'basic') {
                        return response;
                    }
                    
                    // Clone response vì response stream chỉ có thể sử dụng 1 lần
                    const responseToCache = response.clone();
                    
                    caches.open(CACHE_NAME)
                        .then((cache) => {
                            cache.put(event.request, responseToCache);
                        });
                    
                    return response;
                });
            })
            .catch(() => {
                // Nếu offline và không có cache, trả về trang offline đơn giản
                if (event.request.destination === 'document') {
                    return new Response(`
                        <!DOCTYPE html>
                        <html>
                        <head>
                            <title>N-Home - Offline</title>
                            <meta charset="UTF-8">
                            <meta name="viewport" content="width=device-width, initial-scale=1.0">
                            <style>
                                body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
                                .offline { color: #666; }
                            </style>
                        </head>
                        <body>
                            <h1>N-Home</h1>
                            <p class="offline">Bạn đang offline. Vui lòng kiểm tra kết nối mạng.</p>
                        </body>
                        </html>
                    `, {
                        headers: { 'Content-Type': 'text/html' }
                    });
                }
            })
    );
});

console.log('✅ N-Home Customer Service Worker loaded');