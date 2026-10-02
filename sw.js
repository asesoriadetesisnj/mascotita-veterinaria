/* =====================================================================
 * sw.js - Service Worker de Mascotita
 * ---------------------------------------------------------------------
 * Hace la app instalable (PWA) y acelera la carga:
 *  - Archivos propios (HTML/CSS/JS/imagenes): "stale-while-revalidate"
 *    (responde rapido desde cache y actualiza en segundo plano).
 *  - Todo lo demas (Firebase, CDNs, APIs): va directo a la red, sin cache,
 *    para NUNCA servir datos clinicos viejos ni guardar datos sensibles.
 * Sube VERSION cada vez que quieras forzar la actualizacion del cache.
 * ===================================================================== */
const VERSION = "mascotita-v2";
const SHELL = [
  "index.html", "dashboard.html", "css/styles.css", "css/dark-mode.css",
  "assets/logo.svg", "assets/logo.png", "manifest.json"
];

self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(VERSION).then(function (c) { return c.addAll(SHELL); })
    .then(function () { return self.skipWaiting(); }));
});

self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== VERSION; })
      .map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener("fetch", function (e) {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;           // CDNs y Firebase: red directa
  e.respondWith(caches.open(VERSION).then(function (cache) {
    return cache.match(req).then(function (hit) {
      const red = fetch(req).then(function (resp) {
        if (resp && resp.ok) cache.put(req, resp.clone());
        return resp;
      }).catch(function () { return hit; });
      return hit || red;
    });
  }));
});
