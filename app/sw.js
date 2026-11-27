// Service worker of the Memories web app.
// 1. Serves the photo files kept in the browser (<base>/files/<name>) and the app itself when offline.
// 2. Shows the 09:00 notification when the push script sends its (empty) wake-up.
// 3. Opens the app on "Today" when the notification is tapped.
const BASE = new URL(self.registration.scope).pathname.replace(/\/$/, '');   // e.g. "/app"
const SHELL = 'memories-shell';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil((async () => {
  await caches.delete(SHELL);                       // a new version of the app: drop the old offline copy
  await self.clients.claim();
})()));

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin || e.request.method !== 'GET' || !url.pathname.startsWith(BASE + '/')) return;
  if (url.pathname.startsWith(BASE + '/files/')) {
    e.respondWith(caches.open('memories-files').then((c) => c.match(url.origin + url.pathname)).then((r) => r || new Response('', { status: 404 })));
    return;
  }
  // Every page address of the app is the same single page (index.html); the rest are its files. The page is always
  // checked with the website (GitHub lets browsers keep it 10 minutes otherwise, which would delay an update); the
  // code files get a new name with every build, so they can come from the cache.
  const page = e.request.mode === 'navigate' || url.pathname === BASE + '/' || url.pathname === BASE + '/index.html';
  const req = page ? new Request(BASE + '/index.html', { cache: 'no-cache' }) : e.request;
  e.respondWith(fetch(req).then((r) => {
    if (r.ok) { const copy = r.clone(); caches.open(SHELL).then((c) => c.put(page ? BASE + '/index.html' : req, copy)); }
    return r;
  }).catch(() => caches.match(page ? BASE + '/index.html' : req, { ignoreSearch: true }).then((r) => r || new Response('Offline', { status: 503 }))));
});

self.addEventListener('push', (e) => e.waitUntil((async () => {
  let meta = {};
  try { const r = await caches.match(BASE + '/meta.json'); if (r) meta = await r.json(); } catch (_) { /* text below */ }
  let today = '';
  try {
    today = new Intl.DateTimeFormat('en-CA', { timeZone: meta.zone || undefined, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  } catch (_) { today = new Date().toISOString().slice(0, 10); }
  const taken = meta.days && meta.days[today];
  await self.registration.showNotification('Today’s memory 💛', {
    body: taken || 'Your memory of the day is here.',
    tag: 'memory-' + today, icon: BASE + '/icon-192.png', data: { url: BASE + '/' },
  });
})()));

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil((async () => {
    const open = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of open) {
      if (new URL(c.url).pathname.startsWith(BASE)) { c.postMessage({ kind: 'open-today' }); return c.focus(); }
    }
    return self.clients.openWindow(BASE + '/');
  })());
});
