// FIRST FIVE service worker: makes the app work offline after the first visit.
// - App shell and built assets: cache-first, refreshed in the background.
// - Speech model files (huggingface.co or /models/) and the ONNX runtime:
//   cached on first download so Whisper keeps working offline.
// Nothing is ever sent anywhere; this only caches what the browser fetched.
const VERSION = 'ff-v3';
const SHELL = `${VERSION}-shell`;
const MODELS = 'ff-models'; // not versioned: model files are large and immutable

// Precache the shell plus every script and stylesheet index.html references
// (their names carry build hashes, so they are read from the page itself).
// Paths are relative to where the app is served (site root or a sub-folder).
const BASE = new URL(self.registration.scope).pathname;
const INDEX = `${BASE}index.html`;

async function precache() {
  const c = await caches.open(SHELL);
  await c.addAll([`${BASE}manifest.webmanifest`, `${BASE}icon.svg`]);
  const res = await fetch(INDEX, { cache: 'no-store' });
  const html = await res.clone().text();
  await c.put(INDEX, res);
  const assets = [...html.matchAll(/(?:src|href)="([^"]*\/assets\/[^"]+)"/g)].map((m) => m[1]);
  await c.addAll(assets);
}

self.addEventListener('install', (event) => {
  event.waitUntil(precache().then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== SHELL && k !== MODELS).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

const isModel = (url) =>
  url.hostname.endsWith('huggingface.co') || url.hostname.endsWith('hf.co') || url.pathname.startsWith(`${BASE}models/`) || url.pathname.startsWith(`${BASE}ort/`);

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (isModel(url)) {
    event.respondWith(
      caches.open(MODELS).then(async (c) => {
        const hit = await c.match(req, { ignoreVary: true });
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) c.put(req, res.clone());
        return res;
      }),
    );
    return;
  }

  if (url.origin !== self.location.origin) return;

  // Page navigations: network first so updates arrive, cached shell offline.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(SHELL).then((c) => c.put(INDEX, copy));
          return res;
        })
        .catch(() => caches.match(INDEX, { ignoreVary: true })),
    );
    return;
  }

  // Static assets: cache first, fill on miss.
  event.respondWith(
    caches.open(SHELL).then(async (c) => {
      const hit = await c.match(req, { ignoreVary: true });
      const fetched = fetch(req)
        .then((res) => {
          if (res.ok) c.put(req, res.clone());
          return res;
        })
        .catch(() => hit);
      return hit ?? fetched;
    }),
  );
});
