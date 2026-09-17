import { describe, expect, it } from 'vitest';
import { audioBufferToPcm16, createWavHeader } from './wavExporter';

describe('WAV export primitives', () => {
  it('writes a canonical 16-bit PCM WAV header', () => {
    const header = createWavHeader(48_000, 48_000, 2);
    const view = new DataView(header.buffer);
    expect(readAscii(header, 0, 4)).toBe('RIFF');
    expect(readAscii(header, 8, 4)).toBe('WAVE');
    expect(readAscii(header, 12, 4)).toBe('fmt ');
    expect(view.getUint16(20, true)).toBe(1);
    expect(view.getUint16(22, true)).toBe(2);
    expect(view.getUint32(24, true)).toBe(48_000);
    expect(view.getUint32(28, true)).toBe(192_000);
    expect(view.getUint16(34, true)).toBe(16);
    expect(readAscii(header, 36, 4)).toBe('data');
    expect(view.getUint32(40, true)).toBe(48_000 * 2 * 2);
    expect(view.getUint32(4, true)).toBe(36 + 48_000 * 2 * 2);
  });

  it('interleaves stereo PCM samples and clamps out-of-range values', () => {
    const left = new Float32Array([-2, 0.5]);
    const right = new Float32Array([1, 2]);
    const buffer = {
      length: 2,
      numberOfChannels: 2,
      getChannelData: (channel: number) => channel === 0 ? left : right,
    } as AudioBuffer;
    const pcm = audioBufferToPcm16(buffer, 2);
    const view = new DataView(pcm.buffer);
    expect(view.getInt16(0, true)).toBe(-32768);
    expect(view.getInt16(2, true)).toBe(32767);
    expect(view.getInt16(4, true)).toBe(16384);
    expect(view.getInt16(6, true)).toBe(32767);
  });

  it('duplicates mono input into stereo output when requested', () => {
    const mono = new Float32Array([0.25]);
    const buffer = {
      length: 1,
      numberOfChannels: 1,
      getChannelData: () => mono,
    } as AudioBuffer;
    const pcm = audioBufferToPcm16(buffer, 2);
    const view = new DataView(pcm.buffer);
    expect(view.getInt16(0, true)).toBe(8192);
    expect(view.getInt16(2, true)).toBe(8192);
  });
});

function readAscii(bytes: Uint8Array, offset: number, length: number) {
  return String.fromCharCode(...bytes.slice(offset, offset + length));
}
