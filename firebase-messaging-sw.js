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

// 💾 PWA CACHING cho offline support
const CACHE_NAME = 'n-home-v1';
const STATIC_CACHE_URLS = [
    '/app.html',
    '/index.html', 
    '/icon-nen-xanh.jpg',
    '/manifest-customer.json',
    'https://cdn.tailwindcss.com',
    'https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js',
    'https://www.gstatic.com/firebasejs/9.23.0/firebase-messaging-compat.js'
];

// Install event - cache các file tĩnh
self.addEventListener('install', (event) => {
    console.log('📦 Service Worker installing...');
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('💾 Caching static files');
                return cache.addAll(STATIC_CACHE_URLS);
            })
            .then(() => {
                console.log('✅ Static files cached successfully');
                return self.skipWaiting();
            })
            .catch((error) => {
                console.error('❌ Cache installation failed:', error);
            })
    );
});

// Activate event - xóa cache cũ
self.addEventListener('activate', (event) => {
    console.log('⚙️ Service Worker activating...');
    event.waitUntil(
        caches.keys()
            .then((cacheNames) => {
                return Promise.all(
                    cacheNames.map((cacheName) => {
                        if (cacheName !== CACHE_NAME) {
                            console.log('🗑️ Deleting old cache:', cacheName);
                            return caches.delete(cacheName);
                        }
                    })
                );
            })
            .then(() => {
                console.log('✅ Service Worker activated');
                return self.clients.claim();
            })
    );
});

// Fetch event - xử lý request với cache-first strategy
self.addEventListener('fetch', (event) => {
    // Chỉ cache các request GET
    if (event.request.method !== 'GET') return;
    
    // Skip cache cho Firebase và external APIs
    const url = new URL(event.request.url);
    if (url.hostname.includes('firebase') || 
        url.hostname.includes('googleapis') ||
        url.hostname.includes('gstatic') ||
        event.request.url.includes('chrome-extension')) {
        return;
    }
    
    event.respondWith(
        caches.match(event.request)
            .then((cachedResponse) => {
                // Nếu có trong cache, trả về ngay
                if (cachedResponse) {
                    // Vẫn fetch ở background để cập nhật cache
                    fetch(event.request)
                        .then((response) => {
                            if (response && response.status === 200) {
                                const responseClone = response.clone();
                                caches.open(CACHE_NAME)
                                    .then((cache) => {
                                        cache.put(event.request, responseClone);
                                    });
                            }
                        })
                        .catch(() => {});
                    
                    return cachedResponse;
                }
                
                // Nếu không có trong cache, fetch và cache
                return fetch(event.request)
                    .then((response) => {
                        if (!response || response.status !== 200 || response.type !== 'basic') {
                            return response;
                        }
                        
                        const responseClone = response.clone();
                        caches.open(CACHE_NAME)
                            .then((cache) => {
                                cache.put(event.request, responseClone);
                            });
                        
                        return response;
                    })
                    .catch(() => {
                        // Nếu offline và là navigation request, trả về app.html
                        if (event.request.mode === 'navigate') {
                            return caches.match('/app.html');
                        }
                    });
            })
    );
});

console.log('✅ Firebase Messaging Service Worker + PWA Caching setup hoàn tất');