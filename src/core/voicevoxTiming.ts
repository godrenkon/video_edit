import type { MouthCue } from '../types/editor';

const VOICEVOX_FRAME_RATE = 24_000 / 256;
const UPSPEAK_LENGTH_SECONDS = 0.15;

type Vowel = NonNullable<MouthCue['vowel']>;

export interface VoicevoxTimingOptions {
  enableInterrogativeUpspeak?: boolean;
}

export interface VoicevoxTimingResult {
  cues: MouthCue[];
  estimatedDuration: number;
  moraCount: number;
  speedScale: number;
  text: string;
  words: Array<{ text: string; start: number; end: number }>;
}

interface ParsedMora {
  text: string;
  consonantLength: number;
  vowel: string;
  vowelLength: number;
  pitch: number;
}

interface ParsedPhrase {
  moras: ParsedMora[];
  pauseMora?: ParsedMora;
  isInterrogative: boolean;
}

export function parseVoicevoxAudioQueryMouthCues(
  input: string | unknown,
  options: VoicevoxTimingOptions = {},
): VoicevoxTimingResult {
  const root = typeof input === 'string' ? parseJson(input) : input;
  if (!isRecord(root)) throw new Error('VOICEVOX AudioQuery must be an object');

  const rawPhrases = readArray(root, 'accent_phrases', 'accentPhrases');
  if (!rawPhrases) throw new Error('VOICEVOX AudioQuery does not contain accent_phrases');

  const speedScale = positiveFinite(readNumber(root, 'speedScale', 'speed_scale'), 1);
  const pauseLength = nullableNonNegative(readUnknown(root, 'pauseLength', 'pause_length'));
  const pauseLengthScale = nonNegativeFinite(readNumber(root, 'pauseLengthScale', 'pause_length_scale'), 1);
  const prePhonemeLength = nonNegativeFinite(readNumber(root, 'prePhonemeLength', 'pre_phoneme_length'), 0);
  const postPhonemeLength = nonNegativeFinite(readNumber(root, 'postPhonemeLength', 'post_phoneme_length'), 0);
  const enableUpspeak = options.enableInterrogativeUpspeak !== false;

  const phrases = rawPhrases
    .map(parsePhrase)
    .filter((phrase): phrase is ParsedPhrase => phrase !== null);

  if (phrases.length === 0 && rawPhrases.length > 0) {
    throw new Error('VOICEVOX accent_phrases did not contain valid mora data');
  }

  let moraCount = 0;
  const flattened: ParsedMora[] = [];

  for (const phrase of phrases) {
    const moras = phrase.moras.map((mora) => ({ ...mora }));
    moraCount += moras.length;

    if (enableUpspeak && phrase.isInterrogative && moras.length > 0) {
      const last = moras[moras.length - 1];
      if (last.pitch > 0) {
        moras.push({
          text: '',
          consonantLength: 0,
          vowel: last.vowel,
          vowelLength: UPSPEAK_LENGTH_SECONDS,
          pitch: last.pitch,
        });
      }
    }

    flattened.push(...moras);
    if (phrase.pauseMora) flattened.push({ ...phrase.pauseMora });
  }

  const sequence: ParsedMora[] = [
    silenceMora(prePhonemeLength),
    ...flattened,
    silenceMora(postPhonemeLength),
  ];

  for (const mora of sequence) {
    if (mora.vowel.toLowerCase() === 'pau') {
      if (pauseLength !== null) mora.vowelLength = pauseLength;
      mora.vowelLength *= pauseLengthScale;
    }
    mora.consonantLength /= speedScale;
    mora.vowelLength /= speedScale;
  }

  const cues: MouthCue[] = [];
  const words: Array<{ text: string; start: number; end: number }> = [];
  const textParts: string[] = [];
  let cursorFrames = 0;
  pushCue(cues, { time: 0, state: 0 });

  for (const mora of sequence) {
    const consonantFrames = voicevoxFrames(mora.consonantLength);
    const vowelFrames = voicevoxFrames(mora.vowelLength);
    const mappedVowel = mapVoicevoxVowel(mora.vowel);
    const isSilence = !mappedVowel;
    const wordStartFrames = cursorFrames;
    if (mora.text) textParts.push(mora.text);

    if (consonantFrames > 0) {
      pushCue(cues, {
        time: cursorFrames / VOICEVOX_FRAME_RATE,
        state: isSilence ? 0 : 1,
      });
      cursorFrames += consonantFrames;
    }

    if (vowelFrames > 0) {
      pushCue(cues, mappedVowel
        ? {
            time: cursorFrames / VOICEVOX_FRAME_RATE,
            state: 2,
            vowel: mappedVowel,
          }
        : {
            time: cursorFrames / VOICEVOX_FRAME_RATE,
            state: 0,
          });
      cursorFrames += vowelFrames;
    }

    if (mora.text && mappedVowel && cursorFrames > wordStartFrames) {
      words.push({
        text: mora.text,
        start: wordStartFrames / VOICEVOX_FRAME_RATE,
        end: cursorFrames / VOICEVOX_FRAME_RATE,
      });
    }
  }

  const estimatedDuration = cursorFrames / VOICEVOX_FRAME_RATE;
  pushCue(cues, { time: estimatedDuration, state: 0 });

  return {
    cues,
    estimatedDuration,
    moraCount,
    speedScale,
    text: textParts.join(''),
    words,
  };
}

export function mapVoicevoxVowel(value: string): Vowel | undefined {
  const normalized = value.trim().toLowerCase();
  if (normalized === 'a' || normalized === 'i' || normalized === 'u' || normalized === 'e' || normalized === 'o') {
    return normalized;
  }
  return undefined;
}

export function voicevoxFrames(seconds: number) {
  const value = Math.max(0, Number.isFinite(seconds) ? seconds : 0) * VOICEVOX_FRAME_RATE;
  return roundHalfToEven(value);
}

function parsePhrase(value: unknown): ParsedPhrase | null {
  if (!isRecord(value)) return null;
  const rawMoras = readArray(value, 'moras');
  if (!rawMoras) return null;
  const moras = rawMoras.map(parseMora).filter((mora): mora is ParsedMora => mora !== null);
  const rawPause = readUnknown(value, 'pause_mora', 'pauseMora');
  return {
    moras,
    pauseMora: rawPause == null ? undefined : parseMora(rawPause) ?? undefined,
    isInterrogative: Boolean(readUnknown(value, 'is_interrogative', 'isInterrogative')),
  };
}

function parseMora(value: unknown): ParsedMora | null {
  if (!isRecord(value)) return null;
  const vowel = readString(value, 'vowel');
  const vowelLength = nonNegativeFinite(readNumber(value, 'vowel_length', 'vowelLength'), Number.NaN);
  if (!vowel || !Number.isFinite(vowelLength)) return null;
  return {
    text: readString(value, 'text') ?? '',
    consonantLength: nonNegativeFinite(readNumber(value, 'consonant_length', 'consonantLength'), 0),
    vowel,
    vowelLength,
    pitch: nonNegativeFinite(readNumber(value, 'pitch'), 0),
  };
}

function silenceMora(length: number): ParsedMora {
  return {
    text: '',
    consonantLength: 0,
    vowel: 'sil',
    vowelLength: length,
    pitch: 0,
  };
}

function pushCue(cues: MouthCue[], cue: MouthCue) {
  const safeTime = Math.max(0, finite(cue.time, 0));
  const previous = cues[cues.length - 1];
  if (previous && Math.abs(previous.time - safeTime) < 1e-9) {
    cues[cues.length - 1] = { ...cue, time: safeTime };
    return;
  }
  if (previous && previous.state === cue.state && previous.vowel === cue.vowel) return;
  cues.push({ ...cue, time: safeTime });
}

function roundHalfToEven(value: number) {
  const floor = Math.floor(value);
  const fraction = value - floor;
  if (fraction < 0.5 - Number.EPSILON) return floor;
  if (fraction > 0.5 + Number.EPSILON) return floor + 1;
  return floor % 2 === 0 ? floor : floor + 1;
}

function parseJson(value: string) {
  try {
    return JSON.parse(value);
  } catch {
    throw new Error('VOICEVOX AudioQuery JSON could not be parsed');
  }
}

function readUnknown(record: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    if (key in record) return record[key];
  }
  return undefined;
}

function readArray(record: Record<string, unknown>, ...keys: string[]) {
  const value = readUnknown(record, ...keys);
  return Array.isArray(value) ? value : undefined;
}

function readString(record: Record<string, unknown>, ...keys: string[]) {
  const value = readUnknown(record, ...keys);
  return typeof value === 'string' ? value : undefined;
}

function readNumber(record: Record<string, unknown>, ...keys: string[]) {
  const value = readUnknown(record, ...keys);
  return typeof value === 'number' ? value : undefined;
}

function nullableNonNegative(value: unknown) {
  if (value === null || value === undefined) return null;
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : null;
}

function positiveFinite(value: number | undefined, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;
}

function nonNegativeFinite(value: number | undefined, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback;
}

function finite(value: number, fallback: number) {
  return Number.isFinite(value) ? value : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
