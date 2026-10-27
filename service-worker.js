const CACHE_NAME = 'starosta-v5';
const ASSETS = ['./', './index.html', './styles.css', './auth.js', './storage.js', './app.js', './schedule-import.js', './manifest.json'];

self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(ASSETS))); self.skipWaiting(); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))); self.clients.claim(); });
self.addEventListener('fetch', e => { e.respondWith(caches.match(e.request).then(c => c || fetch(e.request))); });
