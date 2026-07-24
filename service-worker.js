const CACHE_NAME = "the-box-os-phase-6b2-compliance-expiry-tags";

const APP_FILES = [
  "./",
  "./index.html",
  "./style.css",
  "./config.js",
  "./cloud.js",
  "./app.js",
  "./manifest.json"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_FILES))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) =>
      Promise.all(
        cacheNames
          .filter((cacheName) => cacheName !== CACHE_NAME)
          .map((cacheName) => caches.delete(cacheName))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const requestUrl = new URL(event.request.url);

  if (
    requestUrl.hostname === "api.open-meteo.com" ||
    requestUrl.hostname.endsWith("supabase.co") ||
    requestUrl.hostname === "cdn.jsdelivr.net"
  ) {
    event.respondWith(fetch(event.request));
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        if (
          networkResponse &&
          networkResponse.status === 200 &&
          requestUrl.origin === self.location.origin
        ) {
          const copy = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        }
        return networkResponse;
      })
      .catch(() =>
        caches.match(event.request).then(
          (cachedResponse) => cachedResponse || caches.match("./index.html")
        )
      )
  );
});