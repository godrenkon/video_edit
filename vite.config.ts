import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

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
  return {
    name: 'offline-precache-manifest',
    generateBundle(_options, bundle) {
      const assets = Object.values(bundle)
        .map((entry) => `/${entry.fileName}`)
        .filter((fileName) => /\.(?:css|js)$/.test(fileName))
        .sort();
      const buildId = buildFingerprint(JSON.stringify(assets));
      this.emitFile({
        type: 'asset',
        fileName: 'precache-assets.js',
        source: `self.__SUIRAM_BUILD_ID__ = ${JSON.stringify(buildId)};\nself.__SUIRAM_BUILD_ASSETS__ = ${JSON.stringify(assets, null, 2)};\n`,
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), offlinePrecacheAssets()],
  build: {
    target: 'es2022',
    sourcemap: true,
  },
});
