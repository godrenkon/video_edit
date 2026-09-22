import type { ProjectTimecodeMode } from '../types/editor';
import { frameIndexAt, normalizedFrameRate } from './timebase';

export interface FrameRateSpec {
  rate: number;
  nominal: number;
  numerator?: number;
  denominator?: number;
  dropFrames: number;
}

const CANONICAL_RATES: Array<Omit<FrameRateSpec, 'rate'> & { rate: number }> = [
  { rate: 24000 / 1001, nominal: 24, numerator: 24000, denominator: 1001, dropFrames: 0 },
  { rate: 30000 / 1001, nominal: 30, numerator: 30000, denominator: 1001, dropFrames: 2 },
  { rate: 60000 / 1001, nominal: 60, numerator: 60000, denominator: 1001, dropFrames: 4 },
];

const CANONICAL_TOLERANCE = 0.001;

export function resolveFrameRateSpec(fps: number): FrameRateSpec {
  const rate = normalizedFrameRate(fps);
  const canonical = CANONICAL_RATES.find((item) => Math.abs(item.rate - rate) <= CANONICAL_TOLERANCE);
  if (canonical) return canonical;
  return {
    rate,
    nominal: Math.max(1, Math.round(rate)),
    dropFrames: 0,
  };
}

export function supportsDropFrameTimecode(fps: number) {
  return resolveFrameRateSpec(fps).dropFrames > 0;
}

export function normalizeProjectTimecodeMode(mode: unknown, fps: number): ProjectTimecodeMode {
  return mode === 'drop-frame' && supportsDropFrameTimecode(fps)
    ? 'drop-frame'
    : 'non-drop-frame';
}

export function formatSmpteTimecode(
  timeSeconds: number,
  fps: number,
  dropFrame = false,
) {
  const spec = resolveFrameRateSpec(fps);
  const useDropFrame = dropFrame && spec.dropFrames > 0;
  let frameNumber = frameIndexAt(timeSeconds, spec.rate, 'nearest');

  if (useDropFrame) {
    frameNumber = addDroppedFrameNumbers(frameNumber, spec.nominal, spec.dropFrames);
  }

  const framesPerHour = spec.nominal * 60 * 60;
  const framesPerMinute = spec.nominal * 60;
  const hours = Math.floor(frameNumber / framesPerHour) % 24;
  const minutes = Math.floor(frameNumber / framesPerMinute) % 60;
  const seconds = Math.floor(frameNumber / spec.nominal) % 60;
  const frames = frameNumber % spec.nominal;
  const separator = useDropFrame ? ';' : ':';

  return `${pad2(hours)}:${pad2(minutes)}:${pad2(seconds)}${separator}${pad2(frames)}`;
}

export function formatEditorTimecode(
  timeSeconds: number,
  fps: number,
  mode: ProjectTimecodeMode | 'auto' = 'auto',
) {
  const dropFrame = mode === 'drop-frame'
    || (mode === 'auto' && supportsDropFrameTimecode(fps));
  return formatSmpteTimecode(timeSeconds, fps, dropFrame);
}

export function parseSmpteTimecode(value: string, fps: number): number | null {
  const match = /^\s*(\d{1,2}):(\d{2}):(\d{2})([:;])(\d{2})\s*$/.exec(value);
  if (!match) return null;

  const spec = resolveFrameRateSpec(fps);
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);
  const frames = Number(match[5]);
  const useDropFrame = match[4] === ';';

  if (
    hours > 23
    || minutes > 59
    || seconds > 59
    || frames >= spec.nominal
    || (useDropFrame && spec.dropFrames === 0)
  ) return null;

  if (
    useDropFrame
    && seconds === 0
    && minutes % 10 !== 0
    && frames < spec.dropFrames
  ) return null;

  const nominalFrameNumber = ((hours * 3600 + minutes * 60 + seconds) * spec.nominal) + frames;
  let frameNumber = nominalFrameNumber;

  if (useDropFrame) {
    const totalMinutes = hours * 60 + minutes;
    const dropped = spec.dropFrames * (totalMinutes - Math.floor(totalMinutes / 10));
    frameNumber -= dropped;
  }

  if (frameNumber < 0) return null;
  return frameNumber / spec.rate;
}

function addDroppedFrameNumbers(frameNumber: number, nominal: number, dropFrames: number) {
  const framesPer10Minutes = nominal * 60 * 10 - dropFrames * 9;
  const framesPerDroppedMinute = nominal * 60 - dropFrames;
  const tenMinuteBlocks = Math.floor(frameNumber / framesPer10Minutes);
  const remainder = frameNumber % framesPer10Minutes;

  let dropped = dropFrames * 9 * tenMinuteBlocks;
  if (remainder >= dropFrames) {
    dropped += dropFrames * Math.floor((remainder - dropFrames) / framesPerDroppedMinute);
  }
  return frameNumber + dropped;
}

function pad2(value: number) {
  return String(value).padStart(2, '0');
}
