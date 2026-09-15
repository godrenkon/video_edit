export interface CapabilityReport {
  webCodecs: boolean;
  opfs: boolean;
  webGpu: boolean;
  offscreenCanvas: boolean;
  audioWorklet: boolean;
  crossOriginIsolated: boolean;
}

export function detectCapabilities(): CapabilityReport {
  return {
    webCodecs: 'VideoEncoder' in window && 'VideoDecoder' in window,
    opfs: typeof navigator.storage?.getDirectory === 'function',
    webGpu: 'gpu' in navigator,
    offscreenCanvas: 'OffscreenCanvas' in window,
    audioWorklet: 'AudioWorkletNode' in window,
    crossOriginIsolated: window.crossOriginIsolated,
  };
}
