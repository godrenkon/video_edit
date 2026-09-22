import { describe, expect, it } from 'vitest';
import { createProject, defaultTextClip } from './project';
import {
  adjacentEditPoint,
  nextShuttleRate,
  quantizeTransportTime,
  stepTransportFrames,
  transportFrameTime,
} from './transport';

describe('NLE transport', () => {
  it('accelerates repeated J/L shuttle presses and reverses direction cleanly', () => {
    expect(nextShuttleRate(0, 1)).toBe(1);
    expect(nextShuttleRate(1, 1)).toBe(2);
    expect(nextShuttleRate(2, 1)).toBe(4);
    expect(nextShuttleRate(16, 1)).toBe(16);
    expect(nextShuttleRate(4, -1)).toBe(-1);
    expect(nextShuttleRate(-1, -1)).toBe(-2);
  });

  it('advances and reverses on project frame boundaries', () => {
    expect(transportFrameTime(1, 0.5, 30, 10, 1)).toBeCloseTo(1.5, 6);
    expect(transportFrameTime(1, 0.5, 30, 10, 2)).toBeCloseTo(2, 6);
    expect(transportFrameTime(2, 0.5, 30, 10, -1)).toBeCloseTo(1.5, 6);
    expect(transportFrameTime(0.1, 1, 30, 10, -4)).toBe(0);
    expect(transportFrameTime(9.9, 1, 30, 10, 4)).toBe(10);
  });

  it('steps exactly by frame and clamps to the sequence', () => {
    expect(stepTransportFrames(1, 1, 30, 10)).toBeCloseTo(31 / 30, 8);
    expect(stepTransportFrames(1, -1, 30, 10)).toBeCloseTo(29 / 30, 8);
    expect(stepTransportFrames(0, -1, 30, 10)).toBe(0);
    expect(stepTransportFrames(10, 1, 30, 10)).toBe(10);
    expect(quantizeTransportTime(1.019, 30, 10)).toBeCloseTo(31 / 30, 8);
  });

  it('navigates between clip edit points across tracks', () => {
    const project = createProject();
    project.duration = 20;
    const track = project.tracks.find((item) => item.kind === 'overlay')!;
    track.clips = [defaultTextClip(2, 3), defaultTextClip(8, 2)];

    expect(adjacentEditPoint(project, 0, 1)).toBe(2);
    expect(adjacentEditPoint(project, 2, 1)).toBe(5);
    expect(adjacentEditPoint(project, 8, -1)).toBe(5);
    expect(adjacentEditPoint(project, 0, -1)).toBe(0);
    expect(adjacentEditPoint(project, 20, 1)).toBe(20);
  });
});
