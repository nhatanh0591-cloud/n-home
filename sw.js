// sw.js - Service Worker cho PWA + Firebase Messaging
// Version: 2.0.0

const CACHE_NAME = 'n-home-customer-v2';
const urlsToCache = [
  '/app.html',
  '/manifest-customer.json',
  '/icon-nen-xanh.jpg',
  '/styles.css'
];

// Import Firebase scripts for messaging
importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-messaging-compat.js');

// Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyA2m1K7pijNC1yirw_t36Rc3HnzCsD8pCs",
    authDomain: "nha-tro-53ca7.firebaseapp.com",
    projectId: "nha-tro-53ca7",
    storageBucket: "nha-tro-53ca7.firebasestorage.app",
    messagingSenderId: "415886594203",
    appId: "1:415886594203:web:f3cda09037973176c9763e",
    measurementId: "G-Y5GSRYP4XC"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();

console.log('🔧 N-Home Customer Service Worker loaded');

// Install event - cache resources
self.addEventListener('install', (event) => {
  console.log('🔧 Service Worker installing...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('📦 Caching app resources');
        return cache.addAll(urlsToCache);
      })
      .catch((error) => {
        console.error('❌ Cache error:', error);
      })
  );
  self.skipWaiting();
});

// Activate event - clean old caches
self.addEventListener('activate', (event) => {
  console.log('✅ Service Worker activated');
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
    })
  );
  return self.clients.claim();
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
  // Skip cross-origin requests
  if (!event.request.url.startsWith(self.location.origin)) {
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // Return cached version or fetch from network
        return response || fetch(event.request);
      })
      .catch((error) => {
        console.error('❌ Fetch error:', error);
      })
  );
});

// Firebase Cloud Messaging - Background messages
messaging.onBackgroundMessage((payload) => {
    console.log('🔔 Received background message:', payload);
    
    const notificationTitle = payload.notification?.title || payload.data?.title || 'N-Home Notification';
    const notificationOptions = {
        body: payload.notification?.body || payload.data?.body || 'Bạn có thông báo mới',
        icon: '/icon-nen-xanh.jpg',
        badge: '/icon-nen-xanh.jpg',
        tag: 'n-home-customer-notification',
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

    return self.registration.showNotification(notificationTitle, notificationOptions);
});

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
    console.log('🔔 Notification clicked:', event);
    
    event.notification.close();
    
    if (event.action === 'open' || !event.action) {
        event.waitUntil(
            clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
                for (const client of clientList) {
                    if (client.url.includes('/app') || client.url.includes('n-home')) {
                        return client.focus();
                    }
                }
                return clients.openWindow('/app.html');
            })
        );
    }
});

console.log('✅ N-Home Customer Service Worker setup complete');
