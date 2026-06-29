const CACHE_NAME = "hermes-iphone-client-20260629-pwa";
const APP_SHELL = [
  "/",
  "/index.html",
  "/iphone.html",
  "/iphone-manifest.json",
  "/iphone-icon-180.png",
  "/iphone-icon.svg"
];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys
        .filter(key => key.startsWith("hermes-iphone-client-") && key !== CACHE_NAME)
        .map(key => caches.delete(key))
    ))
  );
  self.clients.claim();
});

self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);
  if (url.pathname.startsWith("/api/")) return;
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request).then(resp => {
        const copy = resp.clone();
        caches.open(CACHE_NAME).then(cache => cache.put("/", copy));
        return resp;
      }).catch(() => caches.match("/").then(resp => resp || caches.match("/index.html")))
    );
    return;
  }
  if (APP_SHELL.includes(url.pathname)) {
    event.respondWith(
      fetch(event.request).then(resp => {
        const copy = resp.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
        return resp;
      }).catch(() => caches.match(event.request))
    );
  }
});
