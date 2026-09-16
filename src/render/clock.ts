import type { FrameDimensions, RenderFrameRequest } from './types';

const MICROS_PER_SECOND = 1_000_000;

export class RenderClock {
  readonly fps: number;

  constructor(fps: number) {
    if (!Number.isFinite(fps) || fps <= 0) {
      throw new RangeError(`fps must be a positive finite number, received ${fps}`);
    }
    this.fps = fps;
  }

  get frameDurationSeconds() {
    return 1 / this.fps;
  }

  timestampUs(frameIndex: number) {
    assertFrameIndex(frameIndex);
    return Math.round(frameIndex * MICROS_PER_SECOND / this.fps);
  }

  frameRequest(frameIndex: number, dimensions: FrameDimensions): RenderFrameRequest {
    assertFrameIndex(frameIndex);
    assertDimensions(dimensions);

    const timestampUs = this.timestampUs(frameIndex);
    const nextTimestampUs = this.timestampUs(frameIndex + 1);

    return {
      frameIndex,
      width: dimensions.width,
      height: dimensions.height,
      timeSeconds: frameIndex / this.fps,
      durationSeconds: this.frameDurationSeconds,
      timestampUs,
      durationUs: nextTimestampUs - timestampUs,
    };
  }

  framesForDuration(durationSeconds: number) {
    if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return 0;
    return Math.ceil(durationSeconds * this.fps);
  }

  *requests(durationSeconds: number, dimensions: FrameDimensions, startFrame = 0): Generator<RenderFrameRequest> {
    assertFrameIndex(startFrame);
    const frameCount = this.framesForDuration(durationSeconds);
    for (let offset = 0; offset < frameCount; offset += 1) {
      yield this.frameRequest(startFrame + offset, dimensions);
    }
  }
}

function assertFrameIndex(frameIndex: number) {
  if (!Number.isSafeInteger(frameIndex) || frameIndex < 0) {
    throw new RangeError(`frameIndex must be a non-negative safe integer, received ${frameIndex}`);
  }
}

function assertDimensions(dimensions: FrameDimensions) {
  if (!Number.isSafeInteger(dimensions.width) || dimensions.width <= 0) {
    throw new RangeError(`width must be a positive integer, received ${dimensions.width}`);
  }
  if (!Number.isSafeInteger(dimensions.height) || dimensions.height <= 0) {
    throw new RangeError(`height must be a positive integer, received ${dimensions.height}`);
  }
}
