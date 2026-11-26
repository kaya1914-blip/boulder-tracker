// 오프라인용 서비스 워커: 온라인이면 최신 파일, 오프라인이면 저장해 둔 파일
const CACHE = 'bt-v52';
const FILES = ['./', './index.html', './style.css', './plan.js', './foods.js', './app.js', './engine.js', './pro.js', './food.js', './guide.js', './timer.js', './voice.js', './manifest.webmanifest', './icon.svg', './icon-192.png', './icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
// 타이머 알림을 누르면 앱으로 돌아감
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => (cs.length ? cs[0].focus() : self.clients.openWindow('./'))));
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request, { cache: 'no-cache' }).then(res => {
      if (res && res.ok && res.type === 'basic') { // 오류 응답은 저장하지 않음
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
      }
      return res;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('./index.html')))
  );
});
