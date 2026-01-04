const CACHE_NAME = 'spa-cache-v1';
const ASSETS = [
  '/static/offline.html',
];

// 📦 نصب (install)
self.addEventListener('install', event => {
  console.log('Service Worker: نصب شد ✅');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => { return cache.addAll(ASSETS)})
  );
});


// 🧹 فعال‌سازی (activate)
self.addEventListener('activate', event => {
  console.log('Service Worker: فعال شد ✅');
  event.waitUntil(
    caches.keys().then(names => {
      return Promise.all(
        names.map(name => {
          if (name !== CACHE_NAME) {
            console.log('حذف کش قدیمی:', name);
            return caches.delete(name);
          }
        })
      );
    })
  );
});

// 🌐 واکنش به درخواست‌ها (fetch)
self.addEventListener('fetch', event => {
  event.respondWith(
    fetch(event.request).catch(() => {
      if (event.request.mode === 'navigate') {
        return caches.match('/static/offline.html');
      } else {
        return caches.match(event.request);
      }
    })
  );
});
