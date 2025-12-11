// customer-sw.js
// Service Worker cho N-Home Customer PWA

const CACHE_NAME = 'n-home-customer-v2';
const urlsToCache = [
    '/app.html',
    '/js/firebase.js',
    '/js/auth.js',
    '/js/utils.js',
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

// Fetch event
self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request)
            .then((response) => {
                // Return cached version or fetch from network
                return response || fetch(event.request);
            }
        )
    );
});

// Handle push notifications
self.addEventListener('push', (event) => {
    console.log('Push message received:', event);
    
    const options = {
        body: event.data ? event.data.text() : 'Có thông báo mới từ N-Home',
        icon: '/icon-nen-xanh.jpg',
        badge: '/icon-nen-xanh.jpg',
        vibrate: [100, 50, 100],
        data: {
            dateOfArrival: Date.now(),
            primaryKey: 1
        },
        actions: [
            {
                action: 'explore', 
                title: 'Xem ngay',
                icon: '/icon-nen-xanh.jpg'
            },
            {
                action: 'close', 
                title: 'Đóng',
                icon: '/icon-nen-xanh.jpg'
            }
        ]
    };
    
    event.waitUntil(
        self.registration.showNotification('N-Home Customer', options)
    );
});

// Handle notification click
self.addEventListener('notificationclick', (event) => {
    console.log('Notification click Received.');
    
    event.notification.close();
    
    if (event.action === 'explore') {
        event.waitUntil(
            clients.openWindow('/app.html')
        );
    }
});