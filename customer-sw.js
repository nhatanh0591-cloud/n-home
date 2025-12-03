const CACHE_NAME = 'n-home-customer-v1.1';
const urlsToCache = [
  '/app.html',
  '/styles.css',
  '/js/firebase.js',
  '/js/auth.js',
  '/js/utils.js',
  '/js/indexeddb-storage.js',
  '/icon-nen-xanh.jpg',
  '/manifest-customer.json'
];

// Install event - cache resources
self.addEventListener('install', (event) => {
  console.log('🔧 Service Worker installing...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('📦 Caching app resources...');
        return cache.addAll(urlsToCache);
      })
      .then(() => {
        console.log('✅ All resources cached');
        return self.skipWaiting();
      })
      .catch((error) => {
        console.error('❌ Cache failed:', error);
      })
  );
});

// Activate event - clean up old caches
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
      console.log('✅ Service Worker activated');
      return self.clients.claim();
    })
  );
});

// Fetch event - serve from cache with network fallback
self.addEventListener('fetch', (event) => {
  // Skip non-GET requests
  if (event.request.method !== 'GET') {
    return;
  }

  // Skip Firebase and external requests
  if (event.request.url.includes('firebaseapp.com') || 
      event.request.url.includes('googleapis.com') ||
      event.request.url.includes('gstatic.com') ||
      event.request.url.startsWith('chrome-extension://')) {
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // Return cached version or fetch from network
        if (response) {
          console.log('📦 Serving from cache:', event.request.url);
          return response;
        }

        console.log('🌐 Fetching from network:', event.request.url);
        return fetch(event.request).then((response) => {
          // Don't cache if not valid response
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response;
          }

          // Clone the response
          const responseToCache = response.clone();

          // Add to cache for next time
          caches.open(CACHE_NAME)
            .then((cache) => {
              cache.put(event.request, responseToCache);
            });

          return response;
        });
      })
      .catch(() => {
        // Network failed, try to serve offline page
        if (event.request.destination === 'document') {
          return caches.match('/app.html');
        }
      })
  );
});

// Handle background sync for offline functionality
self.addEventListener('sync', (event) => {
  console.log('🔄 Background sync triggered:', event.tag);
  
  if (event.tag === 'sync-notifications') {
    event.waitUntil(syncNotifications());
  }
});

// Sync notifications when back online
function syncNotifications() {
  return new Promise((resolve) => {
    console.log('🔔 Syncing notifications...');
    // This will be handled by the main app when it comes back online
    resolve();
  });
}

// Handle push notifications
self.addEventListener('push', (event) => {
  console.log('🔔 Push notification received:', event);
  
  if (!event.data) {
    return;
  }

  const data = event.data.json();
  const title = data.title || 'N-Home Customer';
  const options = {
    body: data.body || data.message || 'Bạn có thông báo mới',
    icon: '/icon-nen-xanh.jpg',
    badge: '/icon-nen-xanh.jpg',
    tag: 'n-home-customer',
    requireInteraction: true,
    vibrate: [200, 100, 200],
    actions: [
      {
        action: 'open',
        title: 'Mở ứng dụng',
        icon: '/icon-nen-xanh.jpg'
      },
      {
        action: 'close',
        title: 'Đóng'
      }
    ],
    data: data
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
  console.log('🔔 Notification clicked:', event);
  
  event.notification.close();

  if (event.action === 'open' || !event.action) {
    event.waitUntil(
      clients.matchAll({ type: 'window', includeUncontrolled: true })
        .then((clientList) => {
          // Try to focus existing window
          for (const client of clientList) {
            if (client.url.includes('/app') && 'focus' in client) {
              return client.focus();
            }
          }
          
          // Open new window if no existing window found
          if (clients.openWindow) {
            return clients.openWindow('/app.html');
          }
        })
    );
  }
});

// Handle message from main thread
self.addEventListener('message', (event) => {
  console.log('📨 SW received message:', event.data);
  
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});