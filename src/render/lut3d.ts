export interface CubeLut {
  title?: string;
  size: number;
  domainMin: [number, number, number];
  domainMax: [number, number, number];
  data: Float32Array;
}

export function parseCubeLut(source: string): CubeLut {
  if (typeof source !== 'string' || !source.trim()) throw new Error('LUTデータが空です。');

  let title: string | undefined;
  let size = 0;
  let domainMin: [number, number, number] = [0, 0, 0];
  let domainMax: [number, number, number] = [1, 1, 1];
  const values: number[] = [];

  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim();
    if (!line) continue;

    const titleMatch = /^TITLE\s+"?(.*?)"?$/i.exec(line);
    if (titleMatch) {
      title = titleMatch[1]?.trim() || undefined;
      continue;
    }

    const sizeMatch = /^LUT_3D_SIZE\s+(\d+)$/i.exec(line);
    if (sizeMatch) {
      size = Number(sizeMatch[1]);
      if (!Number.isSafeInteger(size) || size < 2 || size > 65) {
        throw new Error(`LUT_3D_SIZE は2〜65に対応しています: ${sizeMatch[1]}`);
      }
      continue;
    }

    const minMatch = /^DOMAIN_MIN\s+(.+)$/i.exec(line);
    if (minMatch) {
      domainMin = parseTriple(minMatch[1], 'DOMAIN_MIN');
      continue;
    }

    const maxMatch = /^DOMAIN_MAX\s+(.+)$/i.exec(line);
    if (maxMatch) {
      domainMax = parseTriple(maxMatch[1], 'DOMAIN_MAX');
      continue;
    }

    if (/^[+-]?(?:\d|\.)(?:[\d.eE+\-\s]*)$/.test(line)) {
      const triple = parseTriple(line, 'LUT entry');
      values.push(...triple);
      continue;
    }

    // Ignore common 1D metadata only when it carries no 3D sample data.
    if (/^(LUT_1D_SIZE|LUT_1D_INPUT_RANGE)\b/i.test(line)) continue;
    throw new Error(`未対応の .cube 行です: ${line.slice(0, 80)}`);
  }

  if (!size) throw new Error('LUT_3D_SIZE が見つかりません。');
  for (let channel = 0; channel < 3; channel += 1) {
    if (!(domainMax[channel] > domainMin[channel])) {
      throw new Error('DOMAIN_MAX は DOMAIN_MIN より大きい必要があります。');
    }
  }

  const expected = size * size * size * 3;
  if (values.length !== expected) {
    throw new Error(`LUTデータ数が不正です: expected ${expected / 3}, got ${values.length / 3}`);
  }

  const data = new Float32Array(values.length);
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (!Number.isFinite(value)) throw new Error('LUTに有限でない値が含まれています。');
    data[index] = value;
  }

  return { title, size, domainMin, domainMax, data };
}

export function sampleCubeLut(
  lut: CubeLut,
  red: number,
  green: number,
  blue: number,
): [number, number, number] {
  const x = coordinate(red, lut.domainMin[0], lut.domainMax[0], lut.size);
  const y = coordinate(green, lut.domainMin[1], lut.domainMax[1], lut.size);
  const z = coordinate(blue, lut.domainMin[2], lut.domainMax[2], lut.size);

  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const z0 = Math.floor(z);
  const x1 = Math.min(lut.size - 1, x0 + 1);
  const y1 = Math.min(lut.size - 1, y0 + 1);
  const z1 = Math.min(lut.size - 1, z0 + 1);
  const tx = x - x0;
  const ty = y - y0;
  const tz = z - z0;

  const c000 = entry(lut, x0, y0, z0);
  const c100 = entry(lut, x1, y0, z0);
  const c010 = entry(lut, x0, y1, z0);
  const c110 = entry(lut, x1, y1, z0);
  const c001 = entry(lut, x0, y0, z1);
  const c101 = entry(lut, x1, y0, z1);
  const c011 = entry(lut, x0, y1, z1);
  const c111 = entry(lut, x1, y1, z1);

  return [0, 1, 2].map((channel) => {
    const c00 = lerp(c000[channel], c100[channel], tx);
    const c10 = lerp(c010[channel], c110[channel], tx);
    const c01 = lerp(c001[channel], c101[channel], tx);
    const c11 = lerp(c011[channel], c111[channel], tx);
    const c0 = lerp(c00, c10, ty);
    const c1 = lerp(c01, c11, ty);
    return lerp(c0, c1, tz);
  }) as [number, number, number];
}

function entry(lut: CubeLut, r: number, g: number, b: number): [number, number, number] {
  // IRIDAS .cube lists red as the fastest-changing coordinate.
  const offset = (r + g * lut.size + b * lut.size * lut.size) * 3;
  return [lut.data[offset], lut.data[offset + 1], lut.data[offset + 2]];
}

function coordinate(value: number, min: number, max: number, size: number) {
  const normalized = clamp((finite(value) - min) / (max - min), 0, 1);
  return normalized * (size - 1);
}

function parseTriple(value: string, label: string): [number, number, number] {
  const parts = value.trim().split(/\s+/).map(Number);
  if (parts.length !== 3 || parts.some((part) => !Number.isFinite(part))) {
    throw new Error(`${label} は3つの数値である必要があります。`);
  }
  return [parts[0], parts[1], parts[2]];
}

function lerp(a: number, b: number, amount: number) {
  return a + (b - a) * amount;
}

function finite(value: number) {
  return Number.isFinite(value) ? value : 0;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
