// アプリの画面はオンライン時に最新を優先。オフライン時だけ保存済み画面を表示します。
// 書いた内容はここでは一切扱わず、端末の localStorage にのみ保存します。
const VERSION = 'tane-v25';
const FILES = ['./', './index.html', './manifest.webmanifest', './icon-180.png', './icon-192.png', './icon-512.png', './assets/icon/tanecho-icon.svg'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(VERSION).then(cache => cache.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('tane-') && key !== VERSION).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
  const isPage = event.request.mode === 'navigate' || /\/index\.html$/.test(url.pathname);
  if (isPage) {
    event.respondWith((async () => {
      const cache = await caches.open(VERSION);
      try {
        const fresh = await fetch(event.request, { cache: 'no-store' });
        if (fresh.ok) {
          await cache.put('./index.html', fresh.clone());
          return fresh;
        }
        if (fresh.status >= 400) return fresh;
      } catch (error) {}
      return (await cache.match('./index.html')) || Response.error();
    })());
    return;
  }
  event.respondWith((async () => {
    const cache = await caches.open(VERSION);
    const cached = await cache.match(event.request, { ignoreSearch: true });
    if (cached) return cached;
    try {
      const fresh = await fetch(event.request);
      if (fresh.ok) await cache.put(event.request, fresh.clone());
      return fresh;
    } catch (error) {
      return Response.error();
    }
  })());
});
