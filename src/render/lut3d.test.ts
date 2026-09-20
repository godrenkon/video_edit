import { describe, expect, it } from 'vitest';
import { parseCubeLut, sampleCubeLut } from './lut3d';

const identity2 = `
TITLE "Identity 2"
LUT_3D_SIZE 2
DOMAIN_MIN 0 0 0
DOMAIN_MAX 1 1 1
0 0 0
1 0 0
0 1 0
1 1 0
0 0 1
1 0 1
0 1 1
1 1 1
`;

describe('3D LUT parser', () => {
  it('parses a standard .cube and samples corners', () => {
    const lut = parseCubeLut(identity2);
    expect(lut.title).toBe('Identity 2');
    expect(lut.size).toBe(2);
    expect(sampleCubeLut(lut, 1, 0, 0)).toEqual([1, 0, 0]);
    expect(sampleCubeLut(lut, 0, 1, 0)).toEqual([0, 1, 0]);
    expect(sampleCubeLut(lut, 0, 0, 1)).toEqual([0, 0, 1]);
  });

  it('trilinearly interpolates an identity LUT', () => {
    const lut = parseCubeLut(identity2);
    const sampled = sampleCubeLut(lut, 0.25, 0.5, 0.75);
    expect(sampled[0]).toBeCloseTo(0.25, 6);
    expect(sampled[1]).toBeCloseTo(0.5, 6);
    expect(sampled[2]).toBeCloseTo(0.75, 6);
  });

  it('honors domain min/max and clamps outside values', () => {
    const lut = parseCubeLut(identity2.replace('DOMAIN_MIN 0 0 0', 'DOMAIN_MIN -1 -1 -1').replace('DOMAIN_MAX 1 1 1', 'DOMAIN_MAX 1 1 1'));
    expect(sampleCubeLut(lut, -1, -1, -1)).toEqual([0, 0, 0]);
    expect(sampleCubeLut(lut, 2, 2, 2)).toEqual([1, 1, 1]);
  });

  it('rejects incomplete or invalid LUT data', () => {
    expect(() => parseCubeLut('0 0 0')).toThrow(/LUT_3D_SIZE/);
    expect(() => parseCubeLut('LUT_3D_SIZE 2\n0 0 0')).toThrow(/LUTデータ数/);
    expect(() => parseCubeLut('LUT_3D_SIZE 1')).toThrow(/2〜65/);
  });
});
