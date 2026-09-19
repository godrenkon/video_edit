import { beforeEach, describe, expect, it } from 'vitest';
import {
  readDecodeLatencySnapshot,
  recordDecodeLatency,
  resetDecodeLatencyDiagnostics,
} from './decodeDiagnostics';

describe('decode latency diagnostics', () => {
  beforeEach(() => resetDecodeLatencyDiagnostics());

  it('reports average, p95, max and latest latency in a bounded time window', () => {
    [4, 8, 12, 16, 20].forEach((value, index) => recordDecodeLatency(value, 1000 + index * 10));
    const snapshot = readDecodeLatencySnapshot(1100, 500);
    expect(snapshot).toMatchObject({ count: 5, lastMs: 20, maxMs: 20 });
    expect(snapshot.averageMs).toBe(12);
    expect(snapshot.p95Ms).toBe(20);
  });

  it('drops stale samples outside the requested time window', () => {
    recordDecodeLatency(99, 1000);
    recordDecodeLatency(10, 5000);
    expect(readDecodeLatencySnapshot(5100, 500)).toMatchObject({
      count: 1,
      lastMs: 10,
      averageMs: 10,
      p95Ms: 10,
      maxMs: 10,
    });
  });

  it('ignores invalid latency values', () => {
    recordDecodeLatency(-1, 1000);
    recordDecodeLatency(Number.NaN, 1000);
    expect(readDecodeLatencySnapshot(1100)).toMatchObject({ count: 0 });
  });

  it('resets all diagnostics explicitly', () => {
    recordDecodeLatency(5, 1000);
    resetDecodeLatencyDiagnostics();
    expect(readDecodeLatencySnapshot(1100)).toEqual({
      count: 0,
      lastMs: 0,
      averageMs: 0,
      p95Ms: 0,
      maxMs: 0,
    });
  });
});
