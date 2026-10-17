/* MTCS Tracker service worker — offline app shell. Bump VERSION on each release. */
const VERSION = "mtcs-1.1.0.2";
const CACHE = "mtcs-tracker:" + VERSION;
const SHELL = ["./","index.html","manifest.webmanifest","css/styles.css","js/app.js","js/packs.generated.js","js/vendor/jszip.min.js","js/vendor/pdf-lib.min.js","icons/icon-192.png","icons/icon-512.png","icons/icon-maskable-192.png","icons/icon-maskable-512.png","icons/apple-touch-icon.png"];
self.addEventListener("install", e => { e.waitUntil((async () => { const c = await caches.open(CACHE); await c.addAll(SHELL.map(u => new Request(u, { cache: "reload" }))); if (!self.registration.active) await self.skipWaiting(); })()); });
self.addEventListener("activate", e => { e.waitUntil((async () => { const keys = await caches.keys(); await Promise.all(keys.filter(k => k.startsWith("mtcs-tracker:") && k !== CACHE).map(k => caches.delete(k))); await self.clients.claim(); })()); });
self.addEventListener("fetch", e => {
  const req = e.request; if (req.method !== "GET") return; const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (req.mode === "navigate") { e.respondWith((async () => { const c = await caches.open(CACHE); const hit = await c.match("index.html", { ignoreSearch: true }) || await c.match("./"); if (hit) return hit; try { return await fetch(req); } catch (_) { return new Response("<h1>Offline</h1><p>Open MTCS Tracker once while online so it can work offline.</p>", { headers: { "Content-Type": "text/html" }, status: 503 }); } })()); return; }
  e.respondWith((async () => { const c = await caches.open(CACHE); const hit = await c.match(req, { ignoreSearch: true }); if (hit) return hit; const res = await fetch(req); if (res && res.ok) { try { await c.put(req, res.clone()); } catch (_) {} } return res; })());
});
