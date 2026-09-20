import { gzipSync } from 'node:zlib';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const html = readFileSync(resolve(root, 'dist/index.html'), 'utf8');
const entryMatch = html.match(/<script[^>]+type="module"[^>]+src="([^"]+\.js)"/);

if (!entryMatch) {
  throw new Error('Unable to locate the production entry script in dist/index.html');
}

const relativeEntry = entryMatch[1].replace(/^\//, '');
const source = readFileSync(resolve(root, 'dist', relativeEntry));
const rawBytes = source.byteLength;
const gzipBytes = gzipSync(source, { level: 9 }).byteLength;
const limits = {
  rawBytes: 520 * 1024,
  gzipBytes: 160 * 1024,
};

const format = (bytes) => `${(bytes / 1024).toFixed(2)} KiB`;
console.log(`Initial editor entry: ${format(rawBytes)} raw / ${format(gzipBytes)} gzip`);

const failures = [];
if (rawBytes > limits.rawBytes) failures.push(`raw ${format(rawBytes)} > ${format(limits.rawBytes)}`);
if (gzipBytes > limits.gzipBytes) failures.push(`gzip ${format(gzipBytes)} > ${format(limits.gzipBytes)}`);

if (failures.length) {
  throw new Error(`Initial bundle budget exceeded: ${failures.join(', ')}. Keep media/export engines demand-loaded.`);
}

const thumbnailWorkerName = readdirSync(resolve(root, 'dist/assets'))
  .find((name) => /^thumbnailWorker-.*\.js$/.test(name));
if (!thumbnailWorkerName) {
  throw new Error('Timeline thumbnail worker bundle is missing from the production build');
} else {
  const workerSource = readFileSync(resolve(root, 'dist/assets', thumbnailWorkerName));
  const workerRawBytes = workerSource.byteLength;
  const workerGzipBytes = gzipSync(workerSource, { level: 9 }).byteLength;
  const workerLimits = { rawBytes: 720 * 1024, gzipBytes: 180 * 1024 };
  console.log(`Thumbnail worker: ${format(workerRawBytes)} raw / ${format(workerGzipBytes)} gzip`);

  const workerFailures = [];
  if (workerRawBytes > workerLimits.rawBytes) workerFailures.push(`raw ${format(workerRawBytes)} > ${format(workerLimits.rawBytes)}`);
  if (workerGzipBytes > workerLimits.gzipBytes) workerFailures.push(`gzip ${format(workerGzipBytes)} > ${format(workerLimits.gzipBytes)}`);
  if (workerFailures.length) {
    throw new Error(`Thumbnail worker budget exceeded: ${workerFailures.join(', ')}`);
  }
}
