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

const mediaAnalysisWorkerName = readdirSync(resolve(root, 'dist/assets'))
  .find((name) => /^mediaAnalysisWorker-.*\.js$/.test(name));
if (!mediaAnalysisWorkerName) {
  throw new Error('Media analysis worker bundle is missing from the production build');
} else {
  const workerSource = readFileSync(resolve(root, 'dist/assets', mediaAnalysisWorkerName));
  const workerRawBytes = workerSource.byteLength;
  const workerGzipBytes = gzipSync(workerSource, { level: 9 }).byteLength;
  const workerLimits = { rawBytes: 720 * 1024, gzipBytes: 180 * 1024 };
  console.log(`Media analysis worker: ${format(workerRawBytes)} raw / ${format(workerGzipBytes)} gzip`);

  const workerFailures = [];
  if (workerRawBytes > workerLimits.rawBytes) workerFailures.push(`raw ${format(workerRawBytes)} > ${format(workerLimits.rawBytes)}`);
  if (workerGzipBytes > workerLimits.gzipBytes) workerFailures.push(`gzip ${format(workerGzipBytes)} > ${format(workerLimits.gzipBytes)}`);
  if (workerFailures.length) {
    throw new Error(`Media analysis worker budget exceeded: ${workerFailures.join(', ')}`);
  }
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
