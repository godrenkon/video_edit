importScripts('/precache-assets.js');

const CACHE_PREFIX = 'suiram-video-edit-shell-';
const CACHE_NAME = CACHE_PREFIX + self.__SUIRAM_BUILD_ID__;
const clientBuilds = new Map();
const APP_SHELL = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/app-icon.svg',
  '/audio-effects-worklet.js',
  '/precache-assets.js',
  ...self.__SUIRAM_BUILD_ASSETS__,
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll([...new Set(APP_SHELL)]))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    self.clients.claim()
      .then(() => self.clients.matchAll({ type: 'window', includeUncontrolled: true }))
      .then((clients) => {
        if (clients.length === 0) return cleanupObsoleteCaches();
        for (const client of clients) client.postMessage({ kind: 'request-client-build' });
      }),
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.kind !== 'client-build' || !/^[0-9a-f]{16}$/.test(event.data.buildId)) return;
  if (!event.source?.id) return;
  clientBuilds.set(event.source.id, event.data.buildId);
  event.waitUntil(cleanupObsoleteCaches());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  if (url.pathname === '/precache-assets.js') {
    event.respondWith(currentCacheFirst(request));
    return;
  }

  const buildAsset = url.pathname.startsWith('/assets/');
  if (!buildAsset && !['script', 'worker', 'sharedworker', 'audioworklet', 'style', 'font', 'image', 'manifest'].includes(request.destination)) return;
  event.respondWith(cacheFirstAsset(request));
});

async function networkFirstNavigation(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      await cache.put('/index.html', response.clone());
    }
    return response;
  } catch {
    return (await caches.match('/index.html')) || (await caches.match('/')) || Response.error();
  }
}

async function cacheFirstAsset(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response.ok && response.type === 'basic') {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(request, response.clone());
  }
  return response;
}

async function currentCacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response.ok && response.type === 'basic') await cache.put(request, response.clone());
  return response;
}

async function cleanupObsoleteCaches() {
  const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  const liveClientIds = new Set(clients.map((client) => client.id));
  for (const clientId of clientBuilds.keys()) {
    if (!liveClientIds.has(clientId)) clientBuilds.delete(clientId);
  }
  if (clients.some((client) => !clientBuilds.has(client.id))) return;

  const keep = new Set([CACHE_NAME]);
  for (const buildId of clientBuilds.values()) keep.add(CACHE_PREFIX + buildId);
  const keys = await caches.keys();
  await Promise.all(keys
    .filter((key) => key.startsWith(CACHE_PREFIX) && !keep.has(key))
    .map((key) => caches.delete(key)));
}
