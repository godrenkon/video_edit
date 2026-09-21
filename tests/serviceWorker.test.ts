import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

const origin = 'https://video.test';
const source = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');

class MemoryCache {
  private readonly entries = new Map<string, Response>();

  async match(request: RequestInfo | URL) {
    return this.entries.get(cacheKey(request))?.clone();
  }

  async put(request: RequestInfo | URL, response: Response) {
    this.entries.set(cacheKey(request), response.clone());
  }

  async delete(request: RequestInfo | URL) {
    return this.entries.delete(cacheKey(request));
  }

  async keys() {
    return [...this.entries.keys()].map((url) => new Request(url));
  }

  async addAll() {}
}

class MemoryCacheStorage {
  readonly stores = new Map<string, MemoryCache>();

  async open(name: string) {
    let cache = this.stores.get(name);
    if (!cache) {
      cache = new MemoryCache();
      this.stores.set(name, cache);
    }
    return cache;
  }

  async keys() {
    return [...this.stores.keys()];
  }

  async delete(name: string) {
    return this.stores.delete(name);
  }
}

function cacheKey(request: RequestInfo | URL) {
  const value = typeof request === 'string' || request instanceof URL ? String(request) : request.url;
  return new URL(value, origin).href;
}

function createServiceWorker(caches: MemoryCacheStorage, buildId: string, clientIds: string[]) {
  const listeners = new Map<string, (event: any) => void>();
  const clients = clientIds.map((id) => ({ id, postMessage: vi.fn() }));
  const scope = {
    __SUIRAM_BUILD_ID__: buildId,
    __SUIRAM_BUILD_ASSETS__: [],
    location: { origin },
    clients: {
      claim: vi.fn(async () => undefined),
      matchAll: vi.fn(async () => clients),
    },
    skipWaiting: vi.fn(async () => undefined),
    addEventListener: (kind: string, listener: (event: any) => void) => listeners.set(kind, listener),
  };
  Function('self', 'caches', 'importScripts', source)(scope, caches, vi.fn());
  return listeners;
}

describe('service worker build routing', () => {
  it('restores a client build mapping after the worker process restarts', async () => {
    const caches = new MemoryCacheStorage();
    const currentBuild = '2222222222222222';
    const retainedBuild = '1111111111111111';
    const clientId = 'old-client';
    const retained = await caches.open(`suiram-video-edit-shell-${retainedBuild}`);
    const current = await caches.open(`suiram-video-edit-shell-${currentBuild}`);
    await retained.put('/audio-effects-worklet.js', new Response('retained'));
    await current.put('/audio-effects-worklet.js', new Response('current'));

    const first = createServiceWorker(caches, currentBuild, [clientId]);
    let persisted: Promise<unknown> | undefined;
    first.get('message')?.({
      data: { kind: 'client-build', buildId: retainedBuild },
      source: { id: clientId },
      waitUntil: (promise: Promise<unknown>) => { persisted = promise; },
    });
    await persisted;

    const restarted = createServiceWorker(caches, currentBuild, [clientId]);
    let response: Promise<Response> | undefined;
    restarted.get('fetch')?.({
      request: {
        method: 'GET',
        url: `${origin}/audio-effects-worklet.js`,
        mode: 'cors',
        destination: 'audioworklet',
      },
      clientId,
      resultingClientId: '',
      respondWith: (promise: Promise<Response>) => { response = promise; },
    });

    expect(await (await response)?.text()).toBe('retained');
  });
});
