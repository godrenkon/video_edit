import { describe, expect, it } from 'vitest';
import { proxyStorageName, proxyVideoBitrate, resolveProxyDimensions } from './proxyGenerator';

describe('proxy generator planning', () => {
  it('fits landscape video inside 1280x720 while preserving aspect ratio', () => {
    expect(resolveProxyDimensions({ width: 3840, height: 2160 })).toEqual({ width: 1280, height: 720 });
  });

  it('fits portrait video without stretching and keeps encoder-safe even dimensions', () => {
    expect(resolveProxyDimensions({ width: 1080, height: 1920 })).toEqual({ width: 404, height: 720 });
  });

  it('does not upscale already small media', () => {
    expect(resolveProxyDimensions({ width: 640, height: 360 })).toEqual({ width: 640, height: 360 });
  });

  it('uses a bounded proxy bitrate', () => {
    expect(proxyVideoBitrate(320, 180, 24)).toBe(600_000);
    expect(proxyVideoBitrate(3840, 2160, 60)).toBe(3_500_000);
  });

  it('uses a stable asset-scoped storage name', () => {
    expect(proxyStorageName('asset_123')).toBe('asset_123.proxy.webm');
  });
});
