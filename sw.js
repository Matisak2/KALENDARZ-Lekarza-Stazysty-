// Service worker: aplikacja działa offline, a nowe wersje pobiera w tle.
const CACHE = 'stazysta-v47';
const SHELL = [
  './', 'index.html', 'css/app.css', 'manifest.webmanifest',
  'js/app.js', 'js/store.js', 'js/engine.js', 'js/dates.js', 'js/holidays.js', 'js/defaults.js',
  'js/hospitals.js', 'js/ics.js', 'js/blocks-ui.js', 'js/more-ui.js', 'js/calendar-ui.js', 'js/duties-ui.js', 'js/skills.js', 'js/booklet.js', 'js/sync.js', 'js/sync-core.js',
  'js/lek.js', 'js/lek-domains.js', 'js/lek-freq.js', 'js/lek-review.js', 'js/lek-ui.js', 'js/specs.js', 'data/nabory.json', 'data/cem.json',
  'js/timesheet.js', 'js/timesheet-ui.js', 'img/usk2-logo.svg',
  'js/letters.js', 'js/letters-ui.js', 'js/hrmail.js', 'js/hrmail-ui.js', 'js/cases.js', 'js/cases-ui.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png',
];

// Instalacja: cała wersja naraz (z pominięciem pamięci podręcznej przeglądarki), żeby nigdy nie mieszać plików dwóch wersji.
// Nowa wersja czeka – aplikacja pokazuje „Jest nowa wersja – Odśwież” (albo włącza się przy następnym otwarciu).
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' })))));
});

self.addEventListener('message', (e) => {
  if (e.data === 'skipWaiting') self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];

// Najpierw pamięć tej wersji (szybko, także bez zasięgu), sieć tylko dla plików spoza listy (audyt B1).
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  const store = (res) => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
    return res;
  };
  if (FONT_HOSTS.includes(url.hostname)) {
    e.respondWith(caches.match(e.request).then((r) => r || fetch(e.request).then(store)));
    return;
  }
  if (url.origin !== location.origin) return;
  if (e.request.mode === 'navigate') {
    e.respondWith(caches.match('index.html').then((r) => r || fetch(e.request)));
    return;
  }
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then((r) => r || fetch(e.request).then(store)));
});
