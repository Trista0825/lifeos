// LifeOS Service Worker：快取 App 外殼，讓 App 可以離線開啟。
// 每次更新前端檔案時，把 CACHE 的版本號 +1，使用者下次開啟就會拿到新版。
const CACHE = 'lifeos-v10';
const SHELL = [
  './',
  'index.html',
  'styles.css',
  'app.js',
  'manifest.json',
  'icons/icon-192.png',
  'icons/icon-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  // 只處理自己網域的 GET；呼叫 Apps Script 的 API 直接走網路
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  // 網路優先、失敗時用快取：有網路時永遠拿最新版，沒網路時照樣能開
  e.respondWith(
    // cache: 'no-cache' 讓瀏覽器每次都向 GitHub 確認有沒有新版，更新會立刻生效
    fetch(e.request.url, { cache: 'no-cache' })
      .then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request).then(r => r || caches.match('index.html')))
  );
});