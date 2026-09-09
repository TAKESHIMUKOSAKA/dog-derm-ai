const CACHE = 'dog-derm-ai-shell-v07';
const SHELL = [
  '/', '/static/styles.css', '/static/v03.css', '/static/v04.css', '/static/v05.css',
  '/static/app.js', '/static/treatment-v03.js', '/static/case-v05.js', '/manifest.webmanifest',
  '/static/icons/dog-derm-ai-192.jpg', '/static/icons/apple-touch-icon.png'
];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET' || req.url.includes('/api/')) return;
  event.respondWith(fetch(req).then(res => {
    const copy = res.clone();
    caches.open(CACHE).then(cache => cache.put(req, copy));
    return res;
  }).catch(() => caches.match(req).then(x => x || caches.match('/'))));
});
