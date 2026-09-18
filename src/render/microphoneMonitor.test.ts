import { describe, expect, it } from 'vitest';
import { clampMonitorGain } from './microphoneMonitor';

describe('microphone monitor', () => {
  it('bounds monitor gain to a safe normalized range', () => {
    expect(clampMonitorGain(-1)).toBe(0);
    expect(clampMonitorGain(0.4)).toBe(0.4);
    expect(clampMonitorGain(9)).toBe(1);
    expect(clampMonitorGain(Number.NaN)).toBe(0.35);
  });
});
