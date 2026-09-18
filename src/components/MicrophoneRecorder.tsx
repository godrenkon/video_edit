import { Headphones, Mic, Square } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { runCaptureCountdown } from '../core/captureCountdown';
import {
  formatRecordingElapsed,
  MAX_MIC_RECORDING_MS,
  microphoneRecordingFileName,
  preferredAudioRecordingMimeType,
} from '../core/microphoneRecording';
import { MicrophoneMonitor } from '../render/microphoneMonitor';
import '../microphone-recorder.css';

interface Props {
  onImport: (files: File[]) => void | Promise<void>;
  timelineTime: number;
  onPunchIn: (file: File, startTime: number) => void | Promise<void>;
  onPunchInPlayback: (active: boolean) => void;
}

export function MicrophoneRecorder({
  onImport,
  timelineTime,
  onPunchIn,
  onPunchInPlayback,
}: Props) {
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const startedAtRef = useRef(0);
  const countdownAbortRef = useRef<AbortController | null>(null);
  const monitorRef = useRef(new MicrophoneMonitor());
  const punchStartRef = useRef(0);
  const punchModeRef = useRef(false);
  const punchPlaybackActiveRef = useRef(false);
  const [recording, setRecording] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [monitorEnabled, setMonitorEnabled] = useState(false);
  const [punchInEnabled, setPunchInEnabled] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [error, setError] = useState('');

  const supported = useMemo(
    () => typeof navigator !== 'undefined'
      && Boolean(navigator.mediaDevices?.getUserMedia)
      && typeof MediaRecorder !== 'undefined',
    [],
  );

  const clearTimer = () => {
    if (timerRef.current !== null) window.clearInterval(timerRef.current);
    timerRef.current = null;
  };

  const restorePunchPlayback = () => {
    if (!punchPlaybackActiveRef.current) return;
    punchPlaybackActiveRef.current = false;
    onPunchInPlayback(false);
  };

  const releaseStream = () => {
    void monitorRef.current.close();
    for (const track of streamRef.current?.getTracks() ?? []) track.stop();
    streamRef.current = null;
  };

  const stopRecording = () => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === 'inactive') return;
    recorder.stop();
  };

  const startRecording = async () => {
    if (!supported || recording || countdownAbortRef.current) return;
    setError('');
    setElapsedMs(0);
    chunksRef.current = [];

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: false,
        },
      });
      streamRef.current = stream;

      const mimeType = preferredAudioRecordingMimeType((mime) => MediaRecorder.isTypeSupported(mime));
      const recorder = new MediaRecorder(stream, {
        ...(mimeType ? { mimeType } : {}),
        audioBitsPerSecond: 128_000,
      });
      recorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };

      recorder.onerror = () => {
        setError('録音エラー');
        stopRecording();
      };

      recorder.onstop = () => {
        clearTimer();
        const finalMime = recorder.mimeType || mimeType || 'audio/webm';
        const chunks = chunksRef.current;
        chunksRef.current = [];
        recorderRef.current = null;
        releaseStream();
        setRecording(false);
        restorePunchPlayback();

        const blob = new Blob(chunks, { type: finalMime });
        if (blob.size <= 0) {
          punchModeRef.current = false;
          setError('録音データが空です');
          return;
        }

        const now = new Date();
        const file = new File(
          [blob],
          microphoneRecordingFileName(now, finalMime),
          { type: finalMime, lastModified: now.getTime() },
        );

        const action = punchModeRef.current
          ? onPunchIn(file, punchStartRef.current)
          : onImport([file]);
        punchModeRef.current = false;
        void Promise.resolve(action).catch((cause) => {
          console.warn('Microphone recording import failed', cause);
          setError('録音素材を読み込めませんでした');
        });
      };

      const countdownController = new AbortController();
      countdownAbortRef.current = countdownController;
      const shouldRecord = await runCaptureCountdown(setCountdown, countdownController.signal);
      if (countdownAbortRef.current === countdownController) countdownAbortRef.current = null;
      if (!shouldRecord) {
        recorder.onstop = null;
        recorderRef.current = null;
        chunksRef.current = [];
        releaseStream();
        return;
      }

      punchModeRef.current = punchInEnabled;
      punchStartRef.current = Math.max(0, timelineTime);
      if (punchInEnabled) {
        punchPlaybackActiveRef.current = true;
        onPunchInPlayback(true);
      }

      startedAtRef.current = Date.now();
      setRecording(true);
      recorder.start(1_000);

      timerRef.current = window.setInterval(() => {
        const next = Date.now() - startedAtRef.current;
        setElapsedMs(next);
        if (next >= MAX_MIC_RECORDING_MS) stopRecording();
      }, 250);
    } catch (cause) {
      countdownAbortRef.current?.abort();
      countdownAbortRef.current = null;
      setCountdown(null);
      clearTimer();
      restorePunchPlayback();
      releaseStream();
      recorderRef.current = null;
      punchModeRef.current = false;
      setRecording(false);
      const denied = cause instanceof DOMException
        && (cause.name === 'NotAllowedError' || cause.name === 'SecurityError');
      setError(denied ? 'マイク権限が必要です' : 'マイクを開始できません');
      console.warn('Microphone recording failed', cause);
    }
  };

  useEffect(() => {
    const stream = streamRef.current;
    const active = recording || countdown !== null;
    if (!monitorEnabled || !stream || !active) {
      void monitorRef.current.close();
      return;
    }

    void monitorRef.current.attach(stream, 0.35).catch((cause) => {
      console.warn('Microphone monitor failed', cause);
      setMonitorEnabled(false);
      setError('モニターを開始できません');
    });
  }, [countdown, monitorEnabled, recording]);

  useEffect(() => () => {
    countdownAbortRef.current?.abort();
    countdownAbortRef.current = null;
    clearTimer();
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recorder.onstop = null;
      try {
        recorder.stop();
      } catch {
        // Recorder may already be shutting down.
      }
    }
    recorderRef.current = null;
    restorePunchPlayback();
    releaseStream();
  }, []);

  const active = recording || countdown !== null;

  return (
    <div className={`micRecorderRow ${recording ? 'recording' : countdown !== null ? 'counting' : ''}`}>
      <span className="micRecorderLabel"><Mic size={13} />マイク録音</span>
      <span className={`micRecorderStatus ${error ? 'error' : ''}`} title={error || undefined}>
        {error || (
          countdown !== null
            ? `${punchInEnabled ? 'Punch ' : ''}開始まで ${countdown}`
            : recording
              ? `${punchModeRef.current ? 'Punch · ' : ''}${formatRecordingElapsed(elapsedMs)}`
              : punchInEnabled
                ? 'Punch-in待機'
                : '最大30:00'
        )}
      </span>
      <button
        type="button"
        className={`punch ${punchInEnabled ? 'active' : ''}`}
        disabled={!supported || active}
        onClick={() => setPunchInEnabled((value) => !value)}
        title={punchInEnabled ? '通常録音へ戻す' : 'Punch-in: 再生しながら現在位置から録音'}
        aria-label={punchInEnabled ? 'Punch-in OFF' : 'Punch-in ON'}
      >
        P
      </button>
      <button
        type="button"
        className={`monitor ${monitorEnabled ? 'active' : ''}`}
        disabled={!supported}
        onClick={() => setMonitorEnabled((value) => !value)}
        title={monitorEnabled ? 'マイクモニターOFF' : 'マイクモニターON（ヘッドホン推奨）'}
        aria-label={monitorEnabled ? 'マイクモニターOFF' : 'マイクモニターON'}
      >
        <Headphones size={12} />
      </button>
      <button
        type="button"
        className={active ? 'stop' : ''}
        disabled={!supported}
        onClick={countdown !== null ? () => countdownAbortRef.current?.abort() : recording ? stopRecording : startRecording}
        title={!supported ? 'このブラウザはマイク録音に未対応です' : countdown !== null ? 'カウントダウンを中止' : recording ? '録音を停止' : punchInEnabled ? 'Punch-in録音を開始' : 'マイク録音を開始'}
      >
        {active ? <Square size={12} fill="currentColor" /> : <Mic size={12} />}
        {countdown !== null ? '中止' : recording ? '停止' : punchInEnabled ? 'Punch' : '録音'}
      </button>
    </div>
  );
}
