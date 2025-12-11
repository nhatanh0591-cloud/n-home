// firebase-messaging-sw.js
// Firebase Cloud Messaging Service Worker + PWA Support

// ========== PWA CACHE SETUP ==========
const CACHE_NAME = 'n-home-customer-v1';
const urlsToCache = [
    '/app.html',
    '/manifest-customer.json',
    '/icon-nen-xanh.jpg',
    '/'
];

// ========== PWA INSTALL HANDLER ==========
self.addEventListener('install', (event) => {
    console.log('🔧 Service Worker installing...');
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('🗂️ Caching app shell');
                return cache.addAll(urlsToCache);
            })
            .then(() => {
                console.log('✅ Cache completed, forcing activation');
                return self.skipWaiting();
            })
    );
});

// ========== PWA ACTIVATE HANDLER ==========
self.addEventListener('activate', (event) => {
    console.log('🚀 Service Worker activating...');
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('🗑️ Deleting old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => {
            console.log('✅ Service Worker activated, claiming clients');
            return self.clients.claim();
        })
    );
});

// Import Firebase scripts for service worker
importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-messaging-compat.js');

// Firebase configuration - PHẢI KHỚP VỚI js/firebase.js
const firebaseConfig = {
    apiKey: "AIzaSyA2m1K7pijNC1yirw_t36Rc3HnzCsD8pCs",
    authDomain: "nha-tro-53ca7.firebaseapp.com",
    projectId: "nha-tro-53ca7",
    storageBucket: "nha-tro-53ca7.firebasestorage.app",
    messagingSenderId: "415886594203",
    appId: "1:415886594203:web:f3cda09037973176c9763e",
    measurementId: "G-Y5GSRYP4XC"
};

// Khởi tạo Firebase trong Service Worker
firebase.initializeApp(firebaseConfig);

// Khởi tạo Firebase Messaging
const messaging = firebase.messaging();

console.log('🔔 Firebase Messaging Service Worker đã được khởi tạo');

// Xử lý thông báo background (khi app đóng hoặc không focus)
messaging.onBackgroundMessage((payload) => {
    console.log('🔔 Nhận background message:', payload);
    
    const notificationTitle = payload.notification?.title || payload.data?.title || 'N-Home Notification';
    const notificationOptions = {
        body: payload.notification?.body || payload.data?.body || 'Bạn có thông báo mới',
        icon: '/icon-nen-xanh.jpg',
        badge: '/icon-nen-xanh.jpg',
        tag: 'n-home-notification',
        requireInteraction: true,
        actions: [
            {
                action: 'open',
                title: 'Mở ứng dụng'
            },
            {
                action: 'close', 
                title: 'Đóng'
            }
        ],
        data: payload.data || {}
    };

    // Hiển thị thông báo
    return self.registration.showNotification(notificationTitle, notificationOptions);
});

// Xử lý khi người dùng click vào thông báo
self.addEventListener('notificationclick', (event) => {
    console.log('🔔 Notification clicked:', event);
    
    event.notification.close();
    
    if (event.action === 'open' || !event.action) {
        // Mở hoặc focus vào tab N-Home
        event.waitUntil(
            clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
                // Tìm tab N-Home đã mở
                for (const client of clientList) {
                    if (client.url.includes('/app') || client.url.includes('n-home')) {
                        return client.focus();
                    }
                }
                
                // Nếu chưa có tab nào, mở tab mới
                return clients.openWindow('/app');
            })
        );
    }
    // Nếu action === 'close', không làm gì (thông báo đã đóng)
});

console.log('✅ Firebase Messaging Service Worker setup hoàn tất');

// ========== PWA FETCH HANDLER - QUAN TRỌNG CHO INSTALLABILITY ==========
// Đây là lý do PWA có thể cài được! Chrome yêu cầu fetch handler

self.addEventListener('fetch', (event) => {
    // Skip chrome-extension and invalid schemes  
    if (event.request.url.startsWith('chrome-extension:') ||
        event.request.url.startsWith('chrome:') ||
        event.request.url.startsWith('moz-extension:')) {
        return;
    }
    
    // Skip non-GET requests
    if (event.request.method !== 'GET') {
        return;
    }
    
    // Skip toolsngon.com API calls (they're failing anyway)
    if (event.request.url.includes('toolsngon.com')) {
        return;
    }
    
    event.respondWith(
        caches.match(event.request)
            .then((response) => {
                // Return cached version if found
                if (response) {
                    return response;
                }
                
                // Fetch from network
                return fetch(event.request)
                    .then((networkResponse) => {
                        // Only cache successful responses
                        if (networkResponse.ok && 
                            !event.request.url.startsWith('chrome-extension:')) {
                            
                            const responseToCache = networkResponse.clone();
                            caches.open(CACHE_NAME).then((cache) => {
                                try {
                                    cache.put(event.request, responseToCache);
                                } catch (error) {
                                    // Silent fail for invalid URLs
                                }
                            });
                        }
                        return networkResponse;
                    });
            })
            .catch(() => {
                // Fallback cho offline
                if (event.request.destination === 'document') {
                    return caches.match('/app.html');
                }
            })
    );
});