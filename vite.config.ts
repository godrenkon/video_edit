import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const FIXED_PRECACHE_ASSETS = [
  '/sw.js',
  '/manifest.webmanifest',
  '/app-icon.svg',
  '/audio-effects-worklet.js',
] as const;

function buildFingerprint(value: string) {
  const hash = (seed: number) => {
    let result = seed;
    for (let index = 0; index < value.length; index += 1) {
      result ^= value.charCodeAt(index);
      result = Math.imul(result, 16_777_619);
    }
    return (result >>> 0).toString(16).padStart(8, '0');
  };
  return `${hash(2_166_136_261)}${hash(2_654_435_769)}`;
}

function offlinePrecacheAssets(): Plugin {
  let generatedBuildId: string | undefined;
  const htmlRevision = buildFingerprint(readFileSync(resolve(import.meta.dirname, 'index.html'), 'utf8'));
  return {
    name: 'offline-precache-manifest',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler() {
        if (!generatedBuildId) this.error('Unable to inject the build id into index.html');
        return [{
          tag: 'script',
          children: `globalThis.__SUIRAM_BUILD_ID__ = ${JSON.stringify(generatedBuildId)};`,
          injectTo: 'head-prepend',
        }];
      },
    },
    generateBundle(_options, bundle) {
      const assets = Object.values(bundle)
        .map((entry) => `/${entry.fileName}`)
        .filter((fileName) => /\.(?:css|js)$/.test(fileName))
        .sort();
      const fixedAssets = FIXED_PRECACHE_ASSETS.map((url) => ({
        url,
        revision: buildFingerprint(readFileSync(resolve(import.meta.dirname, 'public', url.slice(1)), 'utf8')),
      }));
      const buildId = buildFingerprint(JSON.stringify({ assets, fixedAssets, htmlRevision }));
      generatedBuildId = buildId;
      this.emitFile({
        type: 'asset',
        fileName: 'precache-assets.js',
        source: `self.__SUIRAM_HTML_REVISION__ = ${JSON.stringify(htmlRevision)};\nself.__SUIRAM_FIXED_ASSET_REVISIONS__ = ${JSON.stringify(fixedAssets, null, 2)};\nself.__SUIRAM_BUILD_ID__ = ${JSON.stringify(buildId)};\nself.__SUIRAM_BUILD_ASSETS__ = ${JSON.stringify(assets, null, 2)};\n`,
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), offlinePrecacheAssets()],
  build: {
    target: 'es2022',
    sourcemap: true,
    emptyOutDir: true,
  },
});
