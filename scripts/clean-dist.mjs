import { rmSync } from 'node:fs';
import { resolve } from 'node:path';

const distRoot = resolve(import.meta.dirname, '..', 'dist');
rmSync(distRoot, { recursive: true, force: true });
