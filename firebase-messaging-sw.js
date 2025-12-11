// firebase-messaging-sw.js
// Firebase Cloud Messaging Service Worker

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

// --- CACHE STRATEGY ĐỂ KÍCH HOẠT PWA INSTALL ---
const CACHE_NAME = 'n-home-customer-v1';
const urlsToCache = [
  '/app.html',
  '/styles.css',
  '/icon-nen-xanh.jpg',
  '/manifest-customer.json'
  // Note: Tailwind CDN bị CORS, sẽ cache riêng trong fetch event
];

// Cache resources khi install
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
                return self.skipWaiting(); // Force activate immediately
            })
            .catch((error) => {
                console.error('❌ Cache failed:', error);
            })
    );
});

// Clean old caches khi activate
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
            return self.clients.claim(); // Take control immediately
        })
    );
});

// QUAN TRỌNG: Fetch event với cache-first strategy
self.addEventListener('fetch', (event) => {
    // Only cache GET requests
    if (event.request.method !== 'GET') {
        return;
    }
    
    event.respondWith(
        caches.match(event.request)
            .then((response) => {
                // Return cached version if found
                if (response) {
                    return response;
                }
                
                // Fetch from network and cache (including external resources)
                return fetch(event.request)
                    .then((networkResponse) => {
                        // Clone response for caching
                        if (networkResponse.ok) {
                            const responseToCache = networkResponse.clone();
                            caches.open(CACHE_NAME).then((cache) => {
                                cache.put(event.request, responseToCache);
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
                return new Response('Offline mode', {
                    status: 200,
                    headers: { 'Content-Type': 'text/plain' }
                });
            })
    );
});