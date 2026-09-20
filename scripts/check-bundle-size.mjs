import { gzipSync } from 'node:zlib';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const html = readFileSync(resolve(root, 'dist/index.html'), 'utf8');
const entryMatch = html.match(/<script[^>]+type="module"[^>]+src="([^"]+\.js)"/);

if (!entryMatch) {
  throw new Error('Unable to locate the production entry script in dist/index.html');
}

const relativeEntry = entryMatch[1].replace(/^\//, '');
const distRoot = resolve(root, 'dist');
const distAssetsRoot = resolve(distRoot, 'assets');
const initialFiles = collectStaticJavaScript(resolve(distRoot, relativeEntry));
const rawBytes = initialFiles.reduce((total, file) => total + readFileSync(file).byteLength, 0);
const gzipBytes = initialFiles.reduce((total, file) => total + gzipSync(readFileSync(file), { level: 9 }).byteLength, 0);
const limits = {
  rawBytes: 520 * 1024,
  gzipBytes: 160 * 1024,
};

const format = (bytes) => `${(bytes / 1024).toFixed(2)} KiB`;
console.log(`Initial editor graph (${initialFiles.length} chunks): ${format(rawBytes)} raw / ${format(gzipBytes)} gzip`);

const failures = [];
if (rawBytes > limits.rawBytes) failures.push(`raw ${format(rawBytes)} > ${format(limits.rawBytes)}`);
if (gzipBytes > limits.gzipBytes) failures.push(`gzip ${format(gzipBytes)} > ${format(limits.gzipBytes)}`);

if (failures.length) {
  throw new Error(`Initial bundle budget exceeded: ${failures.join(', ')}. Keep media/export engines demand-loaded.`);
}

checkWorkerBundle('mediaAnalysisWorker', 'Media analysis worker', { rawBytes: 720 * 1024, gzipBytes: 180 * 1024 });
checkWorkerBundle('previewRenderWorker', 'Preview render worker', { rawBytes: 720 * 1024, gzipBytes: 180 * 1024 });
checkWorkerBundle('projectExportWorker', 'Project export worker', { rawBytes: 780 * 1024, gzipBytes: 195 * 1024 });
checkOfflinePrecacheManifest();

function checkWorkerBundle(filePrefix, label, workerLimits) {
  const workerName = readdirSync(distAssetsRoot)
    .find((name) => new RegExp(`^${filePrefix}-.*\\.js$`).test(name));
  if (!workerName) throw new Error(`${label} bundle is missing from the production build`);

  const workerSource = readFileSync(resolve(distAssetsRoot, workerName));
  const workerRawBytes = workerSource.byteLength;
  const workerGzipBytes = gzipSync(workerSource, { level: 9 }).byteLength;
  console.log(`${label}: ${format(workerRawBytes)} raw / ${format(workerGzipBytes)} gzip`);

  const workerFailures = [];
  if (workerRawBytes > workerLimits.rawBytes) workerFailures.push(`raw ${format(workerRawBytes)} > ${format(workerLimits.rawBytes)}`);
  if (workerGzipBytes > workerLimits.gzipBytes) workerFailures.push(`gzip ${format(workerGzipBytes)} > ${format(workerLimits.gzipBytes)}`);
  if (workerFailures.length) throw new Error(`${label} budget exceeded: ${workerFailures.join(', ')}`);
}

function checkOfflinePrecacheManifest() {
  const manifestPath = resolve(distRoot, 'precache-assets.js');
  const source = readFileSync(manifestPath, 'utf8');
  const manifestMatch = source.match(/self\.__SUIRAM_BUILD_ASSETS__ = (\[[\s\S]*\]);/);
  const buildIdMatch = source.match(/self\.__SUIRAM_BUILD_ID__ = "([0-9a-f]{16})";/);
  if (!manifestMatch || !buildIdMatch) throw new Error('Offline precache asset module is invalid');
  const manifest = JSON.parse(manifestMatch[1]);
  if (!Array.isArray(manifest) || manifest.some((entry) => typeof entry !== 'string')) {
    throw new Error('Offline precache manifest is invalid');
  }
  const cached = new Set(manifest);
  const requiredAssets = readdirSync(distAssetsRoot)
    .filter((name) => /\.(?:css|js)$/.test(name))
    .map((name) => `/assets/${name}`);
  const missing = requiredAssets.filter((asset) => !cached.has(asset));
  if (missing.length) throw new Error(`Offline precache manifest is missing: ${missing.join(', ')}`);
  const exportChunk = requiredAssets.find((asset) => /\/projectExporter-.*\.js$/.test(asset));
  if (!exportChunk) throw new Error('Demand-loaded project exporter chunk is missing from the production build');
  const builtHtml = readFileSync(resolve(distRoot, 'index.html'), 'utf8');
  if (!builtHtml.includes('<script src="/precache-assets.js">')) {
    throw new Error('Production HTML does not capture its build-specific precache id');
  }
  const serviceWorker = readFileSync(resolve(distRoot, 'sw.js'), 'utf8');
  if (!serviceWorker.includes('request-client-build') || !serviceWorker.includes('cleanupObsoleteCaches')) {
    throw new Error('Service worker does not preserve caches used by live clients');
  }
  console.log(`Offline precache manifest ${buildIdMatch[1]}: ${manifest.length} build assets (including ${exportChunk})`);
}

function collectStaticJavaScript(entryPath) {
  const queue = [entryPath];
  const files = new Set();
  const importPatterns = [
    /(?:^|[;\n])\s*import\s*(?:[^"'()]*?\s*from\s*)?["']([^"']+\.js)["']/g,
    /(?:^|[;\n])\s*export\s+[^"'()]*?\s*from\s*["']([^"']+\.js)["']/g,
  ];

  while (queue.length) {
    const file = queue.pop();
    if (!file || files.has(file)) continue;
    const outsideDist = relative(distRoot, file).startsWith('..');
    if (outsideDist) throw new Error(`Initial bundle import escaped dist: ${file}`);
    files.add(file);

    const source = readFileSync(file, 'utf8');
    for (const pattern of importPatterns) {
      pattern.lastIndex = 0;
      for (const match of source.matchAll(pattern)) {
        const specifier = match[1];
        if (!specifier.startsWith('.')) continue;
        queue.push(resolve(dirname(file), specifier));
      }
    }
  }
  return [...files];
}
