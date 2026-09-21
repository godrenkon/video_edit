importScripts('/precache-assets.js');

const CACHE_PREFIX = 'suiram-video-edit-shell-';
const CACHE_NAME = CACHE_PREFIX + self.__SUIRAM_BUILD_ID__;
const CLIENT_BUILD_STATE_CACHE = 'suiram-video-edit-client-builds-v1';
const CLIENT_BUILD_STATE_PATH = '/__suiram-client-build/';
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
  event.waitUntil(recordClientBuild(event.source.id, event.data.buildId));
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  const clientId = event.clientId;
  const resultingClientId = event.resultingClientId;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirstNavigation(request, clientId, resultingClientId));
    return;
  }

  const buildAsset = url.pathname.startsWith('/assets/');
  if (!buildAsset && !['script', 'worker', 'sharedworker', 'audioworklet', 'style', 'font', 'image', 'manifest'].includes(request.destination)) return;
  event.respondWith(cacheFirstAsset(request, clientId, resultingClientId));
});

async function networkFirstNavigation(request, clientId, resultingClientId) {
  try {
    return await fetch(request);
  } catch {
    const { cache, cacheName } = await cacheForClient(clientId, resultingClientId);
    const cached = (await cache.match('/index.html')) || (await cache.match('/'));
    if (cached) return cached;
    if (cacheName !== CACHE_NAME) {
      const currentCache = await caches.open(CACHE_NAME);
      return (await currentCache.match('/index.html')) || (await currentCache.match('/')) || Response.error();
    }
    return Response.error();
  }
}

async function cacheFirstAsset(request, clientId, resultingClientId) {
  const { cache } = await cacheForClient(clientId, resultingClientId);
  const cached = await cache.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response.ok && response.type === 'basic') {
    await cache.put(request, response.clone());
  }
  return response;
}

async function cacheForClient(clientId, resultingClientId) {
  const buildId = await clientBuildId(clientId) || await clientBuildId(resultingClientId);
  if (buildId && resultingClientId && resultingClientId !== clientId) {
    clientBuilds.set(resultingClientId, buildId);
    await persistClientBuild(resultingClientId, buildId);
  }
  const cacheName = buildId ? CACHE_PREFIX + buildId : CACHE_NAME;
  return { cacheName, cache: await caches.open(cacheName) };
}

async function clientBuildId(clientId) {
  if (!clientId) return undefined;
  const active = clientBuilds.get(clientId);
  if (active) return active;

  const stateCache = await caches.open(CLIENT_BUILD_STATE_CACHE);
  const persisted = await stateCache.match(clientBuildStateKey(clientId));
  if (!persisted) return undefined;
  const buildId = await persisted.text();
  if (!/^[0-9a-f]{16}$/.test(buildId)) {
    await stateCache.delete(clientBuildStateKey(clientId));
    return undefined;
  }
  const current = clientBuilds.get(clientId);
  if (current) return current;
  clientBuilds.set(clientId, buildId);
  return buildId;
}

async function recordClientBuild(clientId, buildId) {
  await persistClientBuild(clientId, buildId);
  await cleanupObsoleteCaches();
}

async function persistClientBuild(clientId, buildId) {
  const stateCache = await caches.open(CLIENT_BUILD_STATE_CACHE);
  await stateCache.put(clientBuildStateKey(clientId), new Response(buildId, {
    headers: { 'content-type': 'text/plain' },
  }));
}

function clientBuildStateKey(clientId) {
  return new URL(CLIENT_BUILD_STATE_PATH + encodeURIComponent(clientId), self.location.origin).href;
}

async function cleanupObsoleteCaches() {
  const clients = await self.clients.matchAll({ type: 'all', includeUncontrolled: true });
  const liveClientIds = new Set(clients.map((client) => client.id));
  for (const clientId of clientBuilds.keys()) {
    if (!liveClientIds.has(clientId)) clientBuilds.delete(clientId);
  }
  await Promise.all(clients.map((client) => clientBuildId(client.id)));
  await cleanupClientBuildState(liveClientIds);
  if (clients.some((client) => !clientBuilds.has(client.id))) return;

  const keep = new Set([CACHE_NAME]);
  for (const buildId of clientBuilds.values()) keep.add(CACHE_PREFIX + buildId);
  const keys = await caches.keys();
  await Promise.all(keys
    .filter((key) => key.startsWith(CACHE_PREFIX) && !keep.has(key))
    .map((key) => caches.delete(key)));
}

async function cleanupClientBuildState(liveClientIds) {
  const stateCache = await caches.open(CLIENT_BUILD_STATE_CACHE);
  const keys = await stateCache.keys();
  await Promise.all(keys.map((request) => {
    const pathname = new URL(request.url).pathname;
    if (!pathname.startsWith(CLIENT_BUILD_STATE_PATH)) return undefined;
    const clientId = decodeURIComponent(pathname.slice(CLIENT_BUILD_STATE_PATH.length));
    return liveClientIds.has(clientId) ? undefined : stateCache.delete(request);
  }));
}
