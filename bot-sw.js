// EVALON AUTO TRADING BOT — service worker
// Intentionally does NOT cache anything and does NOT serve offline content.
// The app must always load fresh from the network (online only).

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) => Promise.all(names.map((name) => caches.delete(name))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // Network-only: always go to the network, never serve from cache,
  // never store a cached copy. If there is no internet, the request
  // simply fails (no offline fallback).
  event.respondWith(fetch(event.request));
});
