// NO-CACHE service worker.
// This app intentionally does NOT cache anything. Every request goes
// straight to the network so the site always shows the latest version
// (no stale HTML/JS/CSS, no "missing" content from old cache).
//
// A service worker is still registered (even though it caches nothing)
// because Android requires an active service worker for the site to be
// installable as a PWA (Add to Home Screen). Without this file, "Add to
// Home Screen" may not create a proper standalone app.

const CACHE_NAME = 'usajili-vip-nocache-v1';

self.addEventListener('install', (event) => {
  // Activate the new service worker immediately, don't wait for old
  // tabs to close.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // Delete ANY caches from previous versions of this app (from before
  // we switched to no-cache mode), then take control of all open pages
  // right away.
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  // Always go to the network. Never read from or write to any cache.
  // If the network fails (no internet), the request simply fails -
  // this app is online-only by design.
  event.respondWith(fetch(event.request));
});
