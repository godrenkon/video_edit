import { Camera, Square } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { runCaptureCountdown } from '../core/captureCountdown';
import { createOpfsRecordingSink, deleteTemporaryRecording, type RecordingSink } from '../core/recordingStorage';
import { cameraCaptureFileName, preferredScreenCaptureMimeType } from '../core/screenCapture';
import { formatRecordingElapsed } from '../core/microphoneRecording';
import '../camera-recorder.css';

type FacingMode = 'user' | 'environment';

export function CameraRecorder({ onImport }: { onImport: (files: File[]) => void | Promise<void> }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const sinkRef = useRef<RecordingSink | null>(null);
  const countdownAbortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<number | null>(null);
  const startedAtRef = useRef(0);
  const writeFailedRef = useRef(false);
  const [recording, setRecording] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [facingMode, setFacingMode] = useState<FacingMode>('user');
  const [elapsedMs, setElapsedMs] = useState(0);
  const [error, setError] = useState('');

  const supported = useMemo(() => (
    typeof navigator !== 'undefined'
      && Boolean(navigator.mediaDevices?.getUserMedia)
      && Boolean(navigator.storage?.getDirectory)
      && typeof MediaRecorder !== 'undefined'
  ), []);

  const clearTimer = () => {
    if (timerRef.current !== null) window.clearInterval(timerRef.current);
    timerRef.current = null;
  };

  const releaseStream = () => {
    if (videoRef.current) videoRef.current.srcObject = null;
    for (const track of streamRef.current?.getTracks() ?? []) track.stop();
    streamRef.current = null;
  };

  const stopRecording = () => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === 'inactive') return;
    recorder.stop();
  };

  const stopOrCancel = () => {
    if (countdownAbortRef.current) {
      countdownAbortRef.current.abort();
      return;
    }
    stopRecording();
  };

  const startRecording = async () => {
    if (!supported || recording || countdownAbortRef.current) return;
    setError('');
    setElapsedMs(0);
    writeFailedRef.current = false;

    let sink: RecordingSink | null = null;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          frameRate: { ideal: 30, max: 60 },
          facingMode: { ideal: facingMode },
        },
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: false,
        },
      });
      streamRef.current = stream;
      if (stream.getVideoTracks().length === 0) {
        releaseStream();
        throw new Error('No camera video track');
      }

      const requestedMime = preferredScreenCaptureMimeType((mime) => MediaRecorder.isTypeSupported(mime));
      const recorder = new MediaRecorder(stream, {
        ...(requestedMime ? { mimeType: requestedMime } : {}),
        videoBitsPerSecond: 8_000_000,
        audioBitsPerSecond: 128_000,
      });
      recorderRef.current = recorder;
      const finalMime = recorder.mimeType || requestedMime || 'video/webm';
      sink = await createOpfsRecordingSink(cameraCaptureFileName(new Date(), finalMime));
      sinkRef.current = sink;

      recorder.ondataavailable = (event) => {
        if (event.data.size <= 0 || !sinkRef.current || writeFailedRef.current) return;
        void sinkRef.current.write(event.data).catch((cause) => {
          writeFailedRef.current = true;
          setError('カメラ録画の保存に失敗しました');
          console.warn('Camera recording OPFS write failed', cause);
          stopRecording();
        });
      };

      recorder.onerror = () => {
        setError('カメラ録画エラー');
        stopRecording();
      };

      recorder.onstop = () => {
        void (async () => {
          clearTimer();
          releaseStream();
          recorderRef.current = null;
          setRecording(false);

          const activeSink = sinkRef.current;
          sinkRef.current = null;
          if (!activeSink) return;
          try {
            const file = await activeSink.close(finalMime);
            await onImport([file]);
            await deleteTemporaryRecording(file.name);
          } catch (cause) {
            setError('カメラ録画ファイルを保存できませんでした');
            console.warn('Camera recording finalize failed', cause);
          }
        })();
      };

      for (const track of stream.getVideoTracks()) {
        track.addEventListener('ended', stopOrCancel, { once: true });
      }

      const countdownController = new AbortController();
      countdownAbortRef.current = countdownController;
      const shouldRecord = await runCaptureCountdown(setCountdown, countdownController.signal);
      if (countdownAbortRef.current === countdownController) countdownAbortRef.current = null;
      if (!shouldRecord) {
        recorder.onstop = null;
        recorderRef.current = null;
        sinkRef.current = null;
        releaseStream();
        await sink.abort().catch(() => undefined);
        return;
      }

      startedAtRef.current = Date.now();
      setRecording(true);
      recorder.start(1_000);
      timerRef.current = window.setInterval(() => {
        setElapsedMs(Date.now() - startedAtRef.current);
      }, 250);
    } catch (cause) {
      countdownAbortRef.current?.abort();
      countdownAbortRef.current = null;
      setCountdown(null);
      clearTimer();
      releaseStream();
      recorderRef.current = null;
      sinkRef.current = null;
      setRecording(false);
      if (sink) await sink.abort().catch(() => undefined);
      const denied = cause instanceof DOMException
        && (cause.name === 'NotAllowedError' || cause.name === 'SecurityError');
      setError(denied ? 'カメラ / マイク権限が必要です' : 'カメラ録画を開始できません');
      console.warn('Camera capture failed', cause);
    }
  };

  useEffect(() => {
    if ((recording || countdown !== null) && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      void videoRef.current.play().catch(() => undefined);
    }
  }, [countdown, recording]);

  useEffect(() => () => {
    countdownAbortRef.current?.abort();
    countdownAbortRef.current = null;
    clearTimer();
    const recorder = recorderRef.current;
    recorderRef.current = null;
    if (recorder && recorder.state !== 'inactive') {
      recorder.onstop = null;
      try {
        recorder.stop();
      } catch {
        // Recorder may already be shutting down.
      }
    }
    releaseStream();
    const sink = sinkRef.current;
    sinkRef.current = null;
    if (sink) void sink.abort();
  }, []);

  const active = recording || countdown !== null;

  return (
    <div className={`cameraRecorder ${recording ? 'recording' : countdown !== null ? 'counting' : ''}`}>
      <div className="cameraRecorderRow">
        <span className="cameraRecorderLabel"><Camera size={13} />カメラ</span>
        <select
          value={facingMode}
          disabled={active}
          onChange={(event) => setFacingMode(event.target.value as FacingMode)}
          aria-label="カメラ向き"
        >
          <option value="user">前面</option>
          <option value="environment">背面</option>
        </select>
        <span className={`cameraRecorderStatus ${error ? 'error' : ''}`} title={error || undefined}>
          {error || (countdown !== null ? `開始まで ${countdown}` : recording ? formatRecordingElapsed(elapsedMs) : supported ? 'OPFS直接保存' : '未対応')}
        </span>
        <button
          type="button"
          className={active ? 'stop' : ''}
          disabled={!supported}
          onClick={countdown !== null ? () => countdownAbortRef.current?.abort() : recording ? stopRecording : startRecording}
          title={!supported ? 'カメラ録画にはMediaRecorder・OPFS対応ブラウザが必要です' : countdown !== null ? 'カウントダウンを中止' : recording ? 'カメラ録画を停止' : 'カメラ録画を開始'}
        >
          {active ? <Square size={12} fill="currentColor" /> : <Camera size={12} />}
          {countdown !== null ? '中止' : recording ? '停止' : '録画'}
        </button>
      </div>
      {active && <video ref={videoRef} className="cameraRecorderPreview" muted playsInline />}
    </div>
  );
}
