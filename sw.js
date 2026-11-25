// Service worker: aplikacja działa offline, a nowe wersje pobiera w tle.
const CACHE = 'stazysta-v32';
const SHELL = [
  './', 'index.html', 'css/app.css', 'manifest.webmanifest',
  'js/app.js', 'js/store.js', 'js/engine.js', 'js/dates.js', 'js/holidays.js', 'js/defaults.js',
  'js/hospitals.js', 'js/ics.js', 'js/blocks-ui.js', 'js/more-ui.js', 'js/calendar-ui.js', 'js/duties-ui.js', 'js/skills.js', 'js/booklet.js', 'js/sync.js', 'js/sync-core.js',
  'js/lek.js', 'js/lek-ui.js', 'js/specs.js', 'data/nabory.json',
  'js/timesheet.js', 'js/timesheet-ui.js', 'img/usk2-logo.svg',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

// Najpierw sieć (żeby zawsze była najnowsza wersja), a bez internetu – kopia z pamięci.
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  // Czcionka: najpierw z pamięci (rzadko się zmienia)
  if (FONT_HOSTS.includes(url.hostname)) {
    e.respondWith(caches.match(e.request).then((r) => r || fetch(e.request).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
      return res;
    })));
    return;
  }
  if (url.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match('index.html')))
  );
});
