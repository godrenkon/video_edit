import { gzipSync } from 'node:zlib';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { init, parse } from 'es-module-lexer';

await init;
assertJavaScriptGraphParser();

const root = resolve(import.meta.dirname, '..');
const html = readFileSync(resolve(root, 'dist/index.html'), 'utf8');
const entryMatch = html.match(/<script[^>]+type="module"[^>]+src="([^"]+\.js)"/);

if (!entryMatch) {
  throw new Error('Unable to locate the production entry script in dist/index.html');
}

const relativeEntry = entryMatch[1].replace(/^\//, '');
const distRoot = resolve(root, 'dist');
const distAssetsRoot = resolve(distRoot, 'assets');
const fixedPrecacheAssets = [
  '/sw.js',
  '/manifest.webmanifest',
  '/app-icon.svg',
  '/audio-effects-worklet.js',
];
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

  const workerFiles = collectJavaScriptGraph(resolve(distAssetsRoot, workerName), true);
  const workerRawBytes = workerFiles.reduce((total, file) => total + readFileSync(file).byteLength, 0);
  const workerGzipBytes = workerFiles.reduce(
    (total, file) => total + gzipSync(readFileSync(file), { level: 9 }).byteLength,
    0,
  );
  console.log(`${label} graph (${workerFiles.length} chunks): ${format(workerRawBytes)} raw / ${format(workerGzipBytes)} gzip`);

  const workerFailures = [];
  if (workerRawBytes > workerLimits.rawBytes) workerFailures.push(`raw ${format(workerRawBytes)} > ${format(workerLimits.rawBytes)}`);
  if (workerGzipBytes > workerLimits.gzipBytes) workerFailures.push(`gzip ${format(workerGzipBytes)} > ${format(workerLimits.gzipBytes)}`);
  if (workerFailures.length) throw new Error(`${label} budget exceeded: ${workerFailures.join(', ')}`);
}

function checkOfflinePrecacheManifest() {
  const manifestPath = resolve(distRoot, 'precache-assets.js');
  const source = readFileSync(manifestPath, 'utf8');
  const manifestMatch = source.match(/self\.__SUIRAM_BUILD_ASSETS__ = (\[[\s\S]*\]);/);
  const fixedAssetsMatch = source.match(/self\.__SUIRAM_FIXED_ASSET_REVISIONS__ = (\[[\s\S]*?\]);/);
  const htmlRevisionMatch = source.match(/self\.__SUIRAM_HTML_REVISION__ = "([0-9a-f]{16})";/);
  const buildIdMatch = source.match(/self\.__SUIRAM_BUILD_ID__ = "([0-9a-f]{16})";/);
  if (!manifestMatch || !fixedAssetsMatch || !htmlRevisionMatch || !buildIdMatch) {
    throw new Error('Offline precache asset module is invalid');
  }
  const manifest = JSON.parse(manifestMatch[1]);
  const fixedAssets = JSON.parse(fixedAssetsMatch[1]);
  if (!Array.isArray(manifest) || manifest.some((entry) => typeof entry !== 'string')) {
    throw new Error('Offline precache manifest is invalid');
  }
  if (!Array.isArray(fixedAssets)
    || fixedAssets.some((entry) => typeof entry?.url !== 'string' || !/^[0-9a-f]{16}$/.test(entry?.revision))) {
    throw new Error('Offline fixed-asset revisions are invalid');
  }
  for (const url of fixedPrecacheAssets) {
    const entry = fixedAssets.find((candidate) => candidate.url === url);
    const expectedRevision = buildFingerprint(readFileSync(resolve(distRoot, url.slice(1)), 'utf8'));
    if (!entry || entry.revision !== expectedRevision) {
      throw new Error(`Offline fixed asset is not fingerprinted: ${url}`);
    }
  }
  const expectedHtmlRevision = buildFingerprint(readFileSync(resolve(root, 'index.html'), 'utf8'));
  if (htmlRevisionMatch[1] !== expectedHtmlRevision) {
    throw new Error('Offline build id does not fingerprint the source HTML shell');
  }
  const expectedBuildId = buildFingerprint(JSON.stringify({
    assets: manifest,
    fixedAssets,
    htmlRevision: expectedHtmlRevision,
  }));
  if (buildIdMatch[1] !== expectedBuildId) {
    throw new Error('Offline build id does not cover every generated and fixed asset revision');
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
  if (!builtHtml.includes(`globalThis.__SUIRAM_BUILD_ID__ = ${JSON.stringify(buildIdMatch[1])};`)) {
    throw new Error('Production HTML does not inline its matching build id');
  }
  if (builtHtml.includes('src="/precache-assets.js"')) {
    throw new Error('Production HTML can load a stale build id through a controlling service worker');
  }
  const serviceWorker = readFileSync(resolve(distRoot, 'sw.js'), 'utf8');
  if (!serviceWorker.includes('request-client-build') || !serviceWorker.includes('cleanupObsoleteCaches')) {
    throw new Error('Service worker does not preserve caches used by live clients');
  }
  if (serviceWorker.includes("url.pathname === '/precache-assets.js'")) {
    throw new Error('Service worker can intercept the page build id with an obsolete manifest');
  }
  if (serviceWorker.includes('caches.match(')) {
    throw new Error('Service worker performs an ambiguous read across retained build caches');
  }
  if (!serviceWorker.includes('cacheForClient(clientId, resultingClientId)')
    || !serviceWorker.includes('persistClientBuild(resultingClientId, buildId)')) {
    throw new Error('Service worker does not route retained-cache reads by requesting client build');
  }
  if (!serviceWorker.includes('CLIENT_BUILD_STATE_CACHE') || !serviceWorker.includes('clientBuildId(clientId)')) {
    throw new Error('Service worker does not restore client build routing after worker restarts');
  }
  console.log(`Offline precache manifest ${buildIdMatch[1]}: ${manifest.length} build assets (including ${exportChunk})`);
}

function collectStaticJavaScript(entryPath) {
  return collectJavaScriptGraph(entryPath, false);
}

function collectJavaScriptGraph(entryPath, includeDynamicImports) {
  const queue = [entryPath];
  const files = new Set();

  while (queue.length) {
    const file = queue.pop();
    if (!file || files.has(file)) continue;
    const outsideDist = relative(distRoot, file).startsWith('..');
    if (outsideDist) throw new Error(`JavaScript graph import escaped dist: ${file}`);
    files.add(file);

    const source = readFileSync(file, 'utf8');
    for (const specifier of javascriptSpecifiers(source, includeDynamicImports)) {
      if (!specifier.startsWith('.') || !specifier.endsWith('.js')) continue;
      queue.push(resolve(dirname(file), specifier));
    }
  }
  return [...files];
}

function javascriptSpecifiers(source, includeDynamicImports) {
  const [imports] = parse(source);
  return imports
    .filter((entry) => typeof entry.n === 'string' && (includeDynamicImports || entry.d === -1))
    .map((entry) => entry.n);
}

function assertJavaScriptGraphParser() {
  const fixture = [
    'import"./import.js";',
    'export{value}from"./named.js";',
    'export*from"./star.js";',
    'export*as namespace from"./namespace.js";',
    'import("./dynamic.js");',
  ].join('');
  const staticSpecifiers = javascriptSpecifiers(fixture, false);
  const allSpecifiers = javascriptSpecifiers(fixture, true);
  const expectedStatic = ['./import.js', './named.js', './star.js', './namespace.js'];
  if (expectedStatic.some((specifier) => !staticSpecifiers.includes(specifier))
    || staticSpecifiers.includes('./dynamic.js')
    || !allSpecifiers.includes('./dynamic.js')) {
    throw new Error('JavaScript graph parser does not cover minified imports, re-exports and dynamic imports');
  }
}

function buildFingerprint(value) {
  const hash = (seed) => {
    let result = seed;
    for (let index = 0; index < value.length; index += 1) {
      result ^= value.charCodeAt(index);
      result = Math.imul(result, 16_777_619);
    }
    return (result >>> 0).toString(16).padStart(8, '0');
  };
  return `${hash(2_166_136_261)}${hash(2_654_435_769)}`;
}
