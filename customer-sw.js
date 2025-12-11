// customer-sw.js
// SUPER WORKER: Xử lý cả PWA Cache và Firebase Notification

importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-messaging-compat.js');

// --- PHẦN 1: FIREBASE CONFIG ---
const firebaseConfig = {
    apiKey: "AIzaSyA2m1K7pijNC1yirw_t36Rc3HnzCsD8pCs",
    authDomain: "nha-tro-53ca7.firebaseapp.com",
    projectId: "nha-tro-53ca7",
    storageBucket: "nha-tro-53ca7.firebasestorage.app",
    messagingSenderId: "415886594203",
    appId: "1:415886594203:web:f3cda09037973176c9763e",
    measurementId: "G-Y5GSRYP4XC"
};

firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();

// Xử lý thông báo nền
messaging.onBackgroundMessage((payload) => {
    console.log('🔔 Background Message:', payload);
    const notificationTitle = payload.notification?.title || 'Thông báo mới';
    const notificationOptions = {
        body: payload.notification?.body || 'Bạn có tin nhắn mới',
        icon: '/icon-nen-xanh.jpg',
        badge: '/icon-nen-xanh.jpg',
        tag: 'n-home-notification',
        data: payload.data || {}
    };
    return self.registration.showNotification(notificationTitle, notificationOptions);
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
            for (const client of clientList) {
                if (client.url.includes('/app') && 'focus' in client) return client.focus();
            }
            if (clients.openWindow) return clients.openWindow('/app');
        })
    );
});

// --- PHẦN 2: PWA CACHING (QUAN TRỌNG ĐỂ CÀI APP) ---
const CACHE_NAME = 'n-home-customer-super-v1';
const URLS_TO_CACHE = [
    '/app.html',           // File thật
    '/manifest-customer.json',
    '/icon-nen-xanh.jpg'
];

self.addEventListener('install', (event) => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(URLS_TO_CACHE))
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => Promise.all(
            keys.map((key) => {
                if (key !== CACHE_NAME) return caches.delete(key);
            })
        )).then(() => self.clients.claim())
    );
});

// Xử lý Fetch: Đánh tráo /app thành /app.html
self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') return;

    const url = new URL(event.request.url);

    // KỸ THUẬT FIX VERCEL: Nếu hỏi '/app' -> Trả về cache '/app.html'
    if (url.pathname === '/app') {
        event.respondWith(
            caches.match('/app.html').then(response => {
                return response || fetch('/app.html');
            }).catch(() => caches.match('/app.html'))
        );
        return;
    }

    event.respondWith(
        caches.match(event.request).then((response) => {
            return response || fetch(event.request);
        })
    );
});

console.log('✅ Super Service Worker Loaded');