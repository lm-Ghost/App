/* Focusly service worker: offline shell + fast launch.
   Bump VERSION whenever you change any file so installed apps update. */
const VERSION = 'focusly-v1';
const SHELL = [
  './', './index.html', './responsive.css', './appshell.css', './appshell.js', './auth.js',
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
