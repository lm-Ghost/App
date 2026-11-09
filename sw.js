/* Focusly service worker: offline shell + fast launch.
   Bump VERSION whenever you change any file so installed apps update. */
const VERSION = 'focusly-v3';
const SHELL = [
  './', './index.html', './responsive.css', './appshell.css', './appshell.js', './auth.js', './push.js',
  './manifest.webmanifest', './logo.png', './favicon.svg',
  './lunchscreen.png', './loadingscreen-clean.png', './errorscreen.png',
  './icons/icon-192.png', './icons/icon-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => Promise.all(SHELL.map(u => c.add(u).catch(() => {})))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET') return;
  if (url.hostname.endsWith('supabase.co')) return;            // never cache account/sync calls
  if (req.mode === 'navigate') {                                // page: network first, cached copy offline
    e.respondWith(fetch(req).then(r => { caches.open(VERSION).then(c => c.put('./index.html', r.clone())); return r; })
      .catch(() => caches.match('./index.html')));
    return;
  }
  e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(r => {   // assets & fonts: cache first
    if (r.ok && (url.origin === location.origin || /fonts\.(googleapis|gstatic)\.com/.test(url.hostname)))
      caches.open(VERSION).then(c => c.put(req, r.clone()));
    return r;
  })));
});

/* Web Push: the server wakes the app even when it is closed */
self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) { }
  e.waitUntil((async () => {
    if (d.tag === 'timer') {                       // the live "timer running" card is replaced by the real event
      (await self.registration.getNotifications({ tag: 'timer-live' })).forEach(n => n.close());
    }
    await self.registration.showNotification(d.title || 'Focusly', {
      body: d.body || '', tag: d.tag || undefined, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png',
      data: { kind: 'push' }
    });
  })());
});

/* AI chat request runs here so the reply can still arrive (and notify) after you leave the app */
self.addEventListener('message', e => {
  const d = e.data || {};
  if (d.type !== 'ai-fetch') return;
  const port = e.ports && e.ports[0];
  try { port && port.postMessage({ ack: true }); } catch (_) { }
  e.waitUntil((async () => {
    let out;
    try {
      const r = await fetch(d.url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: d.body });
      const j = await r.json().catch(() => ({}));
      out = { ok: r.ok, status: r.status, data: j };
    } catch (_) { out = { ok: false, network: true }; }
    try { port && port.postMessage(out); } catch (_) { }
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const seen = wins.some(c => c.visibilityState === 'visible');
    if (!seen && out.ok && out.data && out.data.reply) {
      try {
        await self.registration.showNotification(d.title || 'Assistant', {
          body: String(out.data.reply).slice(0, 200), tag: 'ai-reply', icon: 'icons/icon-192.png', badge: 'icons/icon-192.png',
          data: { kind: 'chat' }
        });
      } catch (_) { }
    }
  })());
});

/* Tapping a notification opens (or focuses) the app; AI replies open the chat */
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const kind = e.notification.data && e.notification.data.kind;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    const c = list.find(x => 'focus' in x);
    if (c) { if (kind === 'chat') c.postMessage({ type: 'open-chat' }); return c.focus(); }
    return self.clients.openWindow(kind === 'chat' ? './index.html#chat' : './index.html');
  }));
});
