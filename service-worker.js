/* Home Gains service worker.
   - App shell is cached on install so the app opens offline.
   - The page itself (index.html) is network-first: when online you always get the newest copy, the cached copy is only a fallback.
   - Icons and the manifest are cached and refreshed in the background.
   - Google Fonts (already used by the app) are cached after the first online visit so the font also works offline.
   - Nothing here reads or writes localStorage / sessionStorage, so saved workouts, backups and timers are untouched.
   To force every phone to drop old cached files, change CACHE_VERSION when you publish. */
const CACHE_VERSION = "v1";
const CACHE = "home-gains-" + CACHE_VERSION;
const FONT_CACHE = "home-gains-fonts-v1";
const ROOT = new URL("./", self.registration.scope).href; /* e.g. https://nova278.github.io/Home-gains-/ */
const INDEX = ROOT + "index.html";
const SHELL = [
  ROOT,
  INDEX,
  ROOT + "manifest.json",
  ROOT + "icons/icon-192.png",
  ROOT + "icons/icon-512.png",
  ROOT + "icons/icon-maskable-512.png",
  ROOT + "icons/apple-touch-icon.png",
  ROOT + "icons/favicon-48.png"
];
const NAV_TIMEOUT_MS = 4000; /* on a bad connection, fall back to the saved copy instead of waiting */

self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(CACHE)
      /* cache:"reload" skips the browser's own HTTP cache so a fresh install never stores an old file */
      .then(c => c.addAll(SHELL.map(u => new Request(u, { cache: "reload" }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith("home-gains-") && k !== CACHE && k !== FONT_CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function timeout(ms) { return new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms)); }

async function navigate(req) {
  const cache = await caches.open(CACHE);
  try {
    const res = await Promise.race([fetch(req.url, { cache: "no-cache" }), timeout(NAV_TIMEOUT_MS)]);
    if (res && res.ok) { cache.put(INDEX, res.clone()); cache.put(ROOT, res.clone()); return res; }
    throw new Error("bad response");
  } catch (err) {
    return (await cache.match(req, { ignoreSearch: true })) || (await cache.match(INDEX)) || (await cache.match(ROOT)) ||
      new Response("Home Gains is offline and has not been saved on this device yet. Open it once while online.", { status: 503, headers: { "Content-Type": "text/plain" } });
  }
}

async function staleWhileRevalidate(req, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req);
  const net = fetch(req).then(res => { if (res && (res.ok || res.type === "opaque")) cache.put(req, res.clone()); return res; }).catch(() => null);
  return hit || (await net) || new Response("", { status: 504 });
}

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (!/^https?:$/.test(url.protocol)) return;
  if (req.mode === "navigate" && url.origin === location.origin) { e.respondWith(navigate(req)); return; }
  if (url.origin === location.origin && url.href.startsWith(ROOT)) { e.respondWith(staleWhileRevalidate(req, CACHE)); return; }
  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") { e.respondWith(staleWhileRevalidate(req, FONT_CACHE)); return; }
  /* anything else goes straight to the network, untouched */
});
