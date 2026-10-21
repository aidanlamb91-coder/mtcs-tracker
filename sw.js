/* MTCS Tracker service worker — offline app shell. Bump VERSION on each release. */
const VERSION = "mtcs-0.2.25.0";
const CACHE = "mtcs-tracker:" + VERSION;
const SHELL = ["./","index.html","manifest.webmanifest","css/styles.css","js/app.js","js/pack-meta.js","js/parser.js","js/cloud-config.js","js/cloud.js","js/smart-import.js","js/vendor/jszip.min.js","js/vendor/pdf-lib.min.js","js/vendor/pdf.min.js","js/vendor/pdf.worker.min.js","icons/icon-192.png","icons/icon-512.png","icons/icon-maskable-192.png","icons/icon-maskable-512.png","icons/apple-touch-icon.png","icons/cloud/google-drive.png","icons/cloud/onedrive.png"];
const OPTIONAL = ["img/guide/guide-ring.png","img/guide/guide-direct.png","img/guide/guide-work-status.png","img/guide/guide-filters.png","img/guide/guide-chips.png","img/guide/guide-summary.png","img/guide/guide-preview.png","img/guide/guide-checklist.png","img/guide/guide-update.png"]; /* v0.2.16 guide images: precached, but a missing one never blocks install */;
self.addEventListener("install", e => { e.waitUntil((async () => { const c = await caches.open(CACHE); await c.addAll(SHELL.map(u => new Request(u, { cache: "reload" }))); await Promise.allSettled(OPTIONAL.map(u => c.add(new Request(u, { cache: "reload" })))); if (!(await caches.has("feature:update-prompt"))) await self.skipWaiting(); /* legacy (<0.2.15) pages have no banner: upgrade them directly once */ })()); });
self.addEventListener("activate", e => { e.waitUntil((async () => { const keys = await caches.keys(); await Promise.all(keys.filter(k => k !== CACHE && (k.startsWith("mtcs-tracker:") || k.startsWith("mtcs-") || k.startsWith("mtcs"))).map(k => caches.delete(k))); await caches.open("feature:update-prompt"); await self.clients.claim(); })()); });
self.addEventListener("message", e => { if (e.data && e.data.type === "SKIP_WAITING") self.skipWaiting(); });
self.addEventListener("fetch", e => {
  const req = e.request; if (req.method !== "GET") return; const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (/\/(version\.json|sw\.js)$/.test(url.pathname)) return;
  if (req.mode === "navigate") { e.respondWith((async () => { const c = await caches.open(CACHE); const hit = await c.match("index.html", { ignoreSearch: true }) || await c.match("./"); if (hit) return hit; try { return await fetch(req); } catch (_) { return new Response("<h1>Offline</h1><p>Open MTCS Tracker once while online so it can work offline.</p>", { headers: { "Content-Type": "text/html" }, status: 503 }); } })()); return; }
  e.respondWith((async () => { const c = await caches.open(CACHE); const hit = await c.match(req, { ignoreSearch: true }); if (hit) return hit; const res = await fetch(req); if (res && res.ok) { try { await c.put(req, res.clone()); } catch (_) {} } return res; })());
});
