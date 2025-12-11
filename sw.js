// Service Worker cho N-Home PWA
// Version: 2.0.0

const CACHE_NAME = 'n-home-v2.0.0';
const OFFLINE_URL = '/app.html';

// Files cần cache để hoạt động offline
const urlsToCache = [
  '/app.html',
  '/index.html', 
  '/styles.css',
  '/icon-nen-xanh.jpg',
  '/manifest-customer.json',
  // CSS frameworks
  'https://cdn.tailwindcss.com'
];

// Install event - cache files
self.addEventListener('install', event => {
  console.log('🔧 Service Worker installing...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('💾 Caching app shell');
        return cache.addAll(urlsToCache);
      })
      .then(() => {
        console.log('✅ Service Worker installed successfully');
        return self.skipWaiting(); // Activate immediately
      })
      .catch(error => {
        console.error('❌ Cache failed:', error);
      })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', event => {
  console.log('🚀 Service Worker activating...');
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('🗑️ Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      console.log('✅ Service Worker activated');
      return self.clients.claim(); // Take control immediately
    })
  );
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', event => {
  // Skip non-GET requests
  if (event.request.method !== 'GET') {
    return;
  }

  // Skip Firebase/external API requests
  if (event.request.url.includes('firebase') || 
      event.request.url.includes('googleapis') ||
      event.request.url.includes('vercel') ||
      event.request.url.includes('cdn.')) {
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Return cached version if available
        if (response) {
          console.log('📱 Serving from cache:', event.request.url);
          return response;
        }

        // Otherwise fetch from network
        console.log('🌐 Fetching from network:', event.request.url);
        return fetch(event.request)
          .then(response => {
            // Don't cache non-successful responses
            if (!response || response.status !== 200 || response.type !== 'basic') {
              return response;
            }

            // Clone response to cache
            const responseToCache = response.clone();
            caches.open(CACHE_NAME)
              .then(cache => {
                cache.put(event.request, responseToCache);
              });

            return response;
          })
          .catch(() => {
            // If network fails and it's a navigation request, serve offline page
            if (event.request.destination === 'document') {
              return caches.match(OFFLINE_URL);
            }
          });
      })
  );
});

// Handle PWA installation prompt
self.addEventListener('beforeinstallprompt', event => {
  console.log('💡 PWA install prompt available');
  event.preventDefault();
  
  // Send event to main thread
  self.clients.matchAll().then(clients => {
    clients.forEach(client => {
      client.postMessage({
        type: 'PWA_INSTALL_AVAILABLE'
      });
    });
  });
});

// Handle app installation
self.addEventListener('appinstalled', event => {
  console.log('🎉 PWA installed successfully');
  
  // Send success message to main thread
  self.clients.matchAll().then(clients => {
    clients.forEach(client => {
      client.postMessage({
        type: 'PWA_INSTALLED'
      });
    });
  });
});

// Handle messages from main thread
self.addEventListener('message', event => {
  console.log('📨 SW received message:', event.data);
  
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Background sync for offline actions (optional)
self.addEventListener('sync', event => {
  console.log('🔄 Background sync:', event.tag);
  
  if (event.tag === 'background-sync') {
    event.waitUntil(doBackgroundSync());
  }
});

async function doBackgroundSync() {
  try {
    console.log('🔄 Performing background sync...');
    // Sync offline data when connection is restored
    // This could sync cached form submissions, etc.
    return Promise.resolve();
  } catch (error) {
    console.error('❌ Background sync failed:', error);
    throw error;
  }
}

// Push notification handler (if needed)
self.addEventListener('push', event => {
  const options = {
    body: event.data ? event.data.text() : 'Thông báo mới từ N-Home',
    icon: '/icon-nen-xanh.jpg',
    badge: '/icon-nen-xanh.jpg',
    vibrate: [200, 100, 200],
    data: {
      dateOfArrival: Date.now(),
      primaryKey: '1'
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
    self.registration.showNotification('N-Home', options)
  );
});

// Notification click handler
self.addEventListener('notificationclick', event => {
  console.log('🔔 Notification click received:', event);

  event.notification.close();

  if (event.action === 'explore') {
    // Open the app
    event.waitUntil(
      clients.openWindow('/app.html')
    );
  } else if (event.action === 'close') {
    // Just close the notification
    return;
  } else {
    // Default action - open app
    event.waitUntil(
      clients.openWindow('/app.html')
    );
  }
});

console.log('🚀 N-Home Service Worker loaded');