import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Cpu, Database, Gauge, HardDrive, Sparkles } from 'lucide-react';
import { detectCapabilities } from './core/capabilities';
import { HistoryController } from './core/history';
import { analyzeMouthCues, buildAssetMeta } from './core/media';
import {
  clampProjectDuration,
  createProject,
  defaultClip,
  defaultGeneratorClip,
  defaultSubtitleClip,
  defaultTextClip,
  trackKindForAsset,
  uid,
} from './core/project';
import {
  deleteAssetFile,
  listRecoverySnapshots,
  loadProject,
  loadRecoverySnapshot,
  readAssetFile,
  requestPersistentStorage,
  saveAssetFile,
  saveProject,
  storageEstimate,
  type RecoverySnapshotInfo,
} from './core/storage';
import { beginEditorSession, markEditorSessionClean } from './core/session';
import { findClip, moveClip, nudgeClip, rippleDeleteClip, splitClipAt, trimClipLeft, trimClipRight } from './core/timelineOps';
import { exportProjectVideo } from './render/projectExporter';
import { Inspector } from './components/Inspector';
import { MediaLibrary } from './components/MediaLibrary';
import { Preview } from './components/Preview';
import { RecoveryDialog } from './components/RecoveryDialog';
import { Timeline } from './components/Timeline';
import { TopBar } from './components/TopBar';
import { ZundamonPanel, type ZundamonRequest } from './components/ZundamonPanel';
import type { Clip, Project, TrackKind } from './types/editor';

interface UpdateOptions {
  history?: boolean;
  label?: string;
  key?: string;
}

export default function App() {
  const [project, setProject] = useState<Project>(() => createProject());
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [zoom, setZoom] = useState(48);
  const [hydrated, setHydrated] = useState(false);
  const [saveState, setSaveState] = useState('起動中…');
  const [zBusy, setZBusy] = useState(false);
  const [storageText, setStorageText] = useState('—');
  const [recoverySnapshots, setRecoverySnapshots] = useState<RecoverySnapshotInfo[]>([]);
  const [showRecovery, setShowRecovery] = useState(false);
  const [suspectedCrash, setSuspectedCrash] = useState(false);
  const [recoveryBusy, setRecoveryBusy] = useState(false);
  const [rendering, setRendering] = useState(false);
  const [renderProgress, setRenderProgress] = useState<number | null>(null);
  const capabilities = useMemo(() => detectCapabilities(), []);
  const lastFrame = useRef<number | null>(null);
  const history = useRef(new HistoryController<Project>(120, 750));
  const renderAbort = useRef<AbortController | null>(null);

  const selectedClip = useMemo(() => {
    for (const track of project.tracks) {
      const clip = track.clips.find((c) => c.id === selectedClipId);
      if (clip) return clip;
    }
    return null;
  }, [project.tracks, selectedClipId]);

  useEffect(() => () => {
    renderAbort.current?.abort('Editor closed');
  }, []);

  useEffect(() => {
    let cancelled = false;
    const previousSessionWasUnclean = beginEditorSession();
    setSuspectedCrash(previousSessionWasUnclean);

    const markClean = () => markEditorSessionClean();
    window.addEventListener('pagehide', markClean);
    window.addEventListener('beforeunload', markClean);

    (async () => {
      try {
        await requestPersistentStorage();
        const saved = await loadProject();
        if (saved && !cancelled) {
          const hydratedProject = await hydrateProjectAssets(saved);
          if (!cancelled) {
            history.current.clear();
            setProject(hydratedProject);
          }
        }

        if (previousSessionWasUnclean && capabilities.opfs) {
          const snapshots = await listRecoverySnapshots();
          if (!cancelled && snapshots.length > 0) {
            setRecoverySnapshots(snapshots);
            setShowRecovery(true);
          }
        }

        const estimate = await storageEstimate();
        if (estimate?.quota && !cancelled) {
          const used = estimate.usage ?? 0;
          setStorageText(`${(used / 1024 / 1024).toFixed(0)} / ${(estimate.quota / 1024 / 1024 / 1024).toFixed(1)} GB`);
        }
        if (!cancelled) {
          setHydrated(true);
          setSaveState(previousSessionWasUnclean ? '復旧候補を確認してください' : '保存済み');
        }
      } catch (error) {
        console.error(error);
        if (!cancelled) {
          setHydrated(true);
          setSaveState('一時モード');
        }
      }
    })();

    return () => {
      cancelled = true;
      window.removeEventListener('pagehide', markClean);
      window.removeEventListener('beforeunload', markClean);
      markEditorSessionClean();
    };
  }, [capabilities.opfs]);

  useEffect(() => {
    if (!hydrated || !capabilities.opfs) return;
    setSaveState('変更あり');
    const timer = window.setTimeout(async () => {
      try {
        await saveProject(project);
        setSaveState('自動保存済み');
      } catch (error) {
        console.error(error);
        setSaveState('保存エラー');
      }
    }, 700);
    return () => window.clearTimeout(timer);
  }, [project, hydrated, capabilities.opfs]);

  useEffect(() => {
    if (!playing) {
      lastFrame.current = null;
      return;
    }
    let raf = 0;
    const tick = (now: number) => {
      if (lastFrame.current == null) lastFrame.current = now;
      const delta = Math.min(0.1, (now - lastFrame.current) / 1000);
      lastFrame.current = now;
      setTime((prev) => {
        const next = prev + delta;
        if (next >= project.duration) {
          setPlaying(false);
          return project.duration;
        }
        return next;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, project.duration]);

  const updateProject = useCallback((mutator: (p: Project) => Project, options: UpdateOptions = {}) => {
    setProject((current) => {
      const mutated = mutator(current);
      if (mutated === current) return current;
      const next = clampProjectDuration({ ...mutated, updatedAt: new Date().toISOString() });
      if (options.history !== false) {
        history.current.record(current, options.label ?? '編集', options.key);
      }
      return next;
    });
  }, []);

  const updateClip = useCallback((clipId: string, patch: Partial<Clip>, historyKey?: string, label = 'クリップ編集') => {
    updateProject((p) => ({
      ...p,
      tracks: p.tracks.map((track) => ({
        ...track,
        clips: track.clips.map((clip) => clip.id === clipId ? { ...clip, ...patch } : clip),
      })),
    }), { label, key: historyKey ?? `clip:${clipId}` });
  }, [updateProject]);

  const undo = useCallback(() => {
    const result = history.current.undo(project);
    if (!result) return;
    setPlaying(false);
    setSelectedClipId(null);
    setProject(clampProjectDuration({ ...result.value, updatedAt: new Date().toISOString() }));
    setSaveState(`元に戻す: ${result.label}`);
  }, [project]);

  const redo = useCallback(() => {
    const result = history.current.redo(project);
    if (!result) return;
    setPlaying(false);
    setSelectedClipId(null);
    setProject(clampProjectDuration({ ...result.value, updatedAt: new Date().toISOString() }));
    setSaveState(`やり直し: ${result.label}`);
  }, [project]);

  const restoreSnapshot = useCallback(async (snapshotId: string) => {
    setRecoveryBusy(true);
    try {
      const restored = await loadRecoverySnapshot(snapshotId);
      if (!restored) {
        setSaveState('復旧データを読み込めませんでした');
        return;
      }
      const hydratedProject = await hydrateProjectAssets(restored);
      revokeProjectUrls(project);
      history.current.clear();
      setPlaying(false);
      setTime(0);
      setSelectedClipId(null);
      setProject(hydratedProject);
      await saveProject(hydratedProject);
      setShowRecovery(false);
      setSaveState('復旧スナップショットを適用しました');
    } catch (error) {
      console.error(error);
      setSaveState('復旧に失敗しました');
    } finally {
      setRecoveryBusy(false);
    }
  }, [project]);

  const importFiles = async (files: File[]) => {
    if (rendering) return;
    setSaveState('素材を保存中…');
    for (const file of files) {
      try {
        const asset = await buildAssetMeta(file);
        if (capabilities.opfs) await saveAssetFile(asset.storageName, file);
        updateProject((p) => ({ ...p, assets: [...p.assets, asset] }), {
          label: '素材を読み込む',
          key: 'import-assets',
        });
      } catch (error) {
        console.error(`Failed to import ${file.name}`, error);
      }
    }
    setSaveState('素材追加済み');
  };

  const addAssetToTimeline = (assetId: string) => {
    if (rendering) return;
    const asset = project.assets.find((a) => a.id === assetId);
    if (!asset) return;
    const kind = trackKindForAsset(asset.kind);
    updateProject((p) => {
      const target = p.tracks.find((t) => t.kind === kind && !t.locked);
      if (!target) return p;
      const duration = asset.kind === 'image' ? 5 : Math.max(0.1, asset.duration);
      return {
        ...p,
        tracks: p.tracks.map((track) => track.id === target.id
          ? { ...track, clips: [...track.clips, defaultClip(asset.name, asset.id, time, duration)] }
          : track),
      };
    }, { label: 'タイムラインに追加' });
  };

  const addSyntheticClip = useCallback((clip: Clip, trackKind: TrackKind, label: string) => {
    if (rendering) return;
    const target = project.tracks.find((track) => track.kind === trackKind && !track.locked);
    if (!target) {
      setSaveState(`${label}: 使用できる${trackKind}トラックがありません`);
      return;
    }
    updateProject((p) => ({
      ...p,
      tracks: p.tracks.map((track) => track.id === target.id ? { ...track, clips: [...track.clips, clip] } : track),
    }), { label });
    setSelectedClipId(clip.id);
    setPlaying(false);
  }, [project.tracks, rendering, updateProject]);

  const createText = useCallback(() => {
    addSyntheticClip(defaultTextClip(time), 'overlay', 'テキストを追加');
  }, [addSyntheticClip, time]);

  const createSubtitle = useCallback(() => {
    addSyntheticClip(defaultSubtitleClip(time, project.height * 0.34), 'subtitle', '字幕を追加');
  }, [addSyntheticClip, project.height, time]);

  const createGenerator = useCallback(() => {
    addSyntheticClip(defaultGeneratorClip(time, 'color'), 'video', '背景を追加');
  }, [addSyntheticClip, time]);

  const deleteAsset = async (assetId: string) => {
    if (rendering) return;
    const asset = project.assets.find((a) => a.id === assetId);
    if (!asset) return;
    if (capabilities.opfs) await deleteAssetFile(asset.storageName);
    if (asset.objectUrl) URL.revokeObjectURL(asset.objectUrl);
    history.current.clear();
    updateProject((p) => ({
      ...p,
      assets: p.assets.filter((a) => a.id !== assetId),
      tracks: p.tracks.map((t) => ({ ...t, clips: t.clips.filter((c) => c.assetId !== assetId && !clipUsesAsset(c, assetId)) })),
    }), { history: false });
    if (selectedClip && (selectedClip.assetId === assetId || clipUsesAsset(selectedClip, assetId))) setSelectedClipId(null);
    setSaveState('素材を削除しました（履歴をリセット）');
  };

  const removeSelectedClip = useCallback(() => {
    if (!selectedClipId || rendering) return;
    updateProject((p) => ({
      ...p,
      tracks: p.tracks.map((t) => ({ ...t, clips: t.clips.filter((c) => c.id !== selectedClipId) })),
    }), { label: 'クリップ削除' });
    setSelectedClipId(null);
  }, [rendering, selectedClipId, updateProject]);

  const splitSelectedClip = useCallback(() => {
    if (!selectedClipId || !selectedClip || rendering) return;
    const frame = 1 / Math.max(1, project.fps);
    if (time < selectedClip.start + frame || time > selectedClip.start + selectedClip.duration - frame) return;
    updateProject((p) => splitClipAt(p, selectedClipId, time), { label: 'クリップ分割' });
  }, [project.fps, rendering, selectedClip, selectedClipId, time, updateProject]);

  const rippleDeleteSelectedClip = useCallback(() => {
    if (!selectedClipId || rendering) return;
    updateProject((p) => rippleDeleteClip(p, selectedClipId), { label: 'リップル削除' });
    setSelectedClipId(null);
  }, [rendering, selectedClipId, updateProject]);

  const nudgeSelected = useCallback((frames: number) => {
    if (!selectedClipId || rendering) return;
    updateProject((p) => nudgeClip(p, selectedClipId, frames), {
      label: 'クリップをフレーム移動',
      key: `clip:${selectedClipId}:nudge`,
    });
  }, [rendering, selectedClipId, updateProject]);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.matches('input, textarea, select')) return;
      if (showRecovery || rendering) return;

      const mod = e.ctrlKey || e.metaKey;
      const lower = e.key.toLowerCase();
      if (mod && lower === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (mod && lower === 'y') {
        e.preventDefault();
        redo();
        return;
      }
      if (mod && lower === 'k') {
        e.preventDefault();
        splitSelectedClip();
        return;
      }
      if (e.altKey && e.key === 'ArrowLeft') {
        e.preventDefault();
        nudgeSelected(-1);
        return;
      }
      if (e.altKey && e.key === 'ArrowRight') {
        e.preventDefault();
        nudgeSelected(1);
        return;
      }
      if (e.code === 'Space') {
        e.preventDefault();
        setPlaying((v) => !v);
        return;
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && e.shiftKey && selectedClipId) {
        e.preventDefault();
        rippleDeleteSelectedClip();
        return;
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedClipId) {
        e.preventDefault();
        removeSelectedClip();
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [showRecovery, rendering, selectedClipId, removeSelectedClip, rippleDeleteSelectedClip, splitSelectedClip, nudgeSelected, undo, redo]);

  const manualSave = async () => {
    try {
      await saveProject(project);
      setSaveState('保存済み');
    } catch {
      setSaveState('保存エラー');
    }
  };

  const backupProject = () => {
    const clean = {
      ...project,
      assets: project.assets.map(({ objectUrl: _objectUrl, ...asset }) => asset),
    };
    const blob = new Blob([JSON.stringify(clean, null, 2)], { type: 'application/json' });
    downloadBlob(blob, `${sanitize(project.name)}.sveproj.json`);
    setSaveState('プロジェクトをバックアップしました');
  };

  const renderVideo = useCallback(async () => {
    if (rendering) return;
    setPlaying(false);

    const controller = new AbortController();
    renderAbort.current = controller;
    setRendering(true);
    setRenderProgress(null);
    setSaveState('動画書き出しを準備中…');

    try {
      const result = await exportProjectVideo(project, {
        container: 'auto',
        signal: controller.signal,
        preferOpfs: true,
        onProgress: (progress) => setRenderProgress(progress.fraction),
      });
      if (controller.signal.aborted) return;

      const output = result.storage === 'opfs' ? result.file : result.blob;
      downloadBlob(output, result.fileName);
      setRenderProgress(1);
      const format = result.container.toUpperCase();
      setSaveState(result.hasAudio ? `${format} 書き出し完了（音声込み）` : `${format} 書き出し完了`);
    } catch (error) {
      if (controller.signal.aborted) {
        setSaveState('動画書き出しを中止しました');
      } else {
        console.error(error);
        setSaveState(error instanceof Error ? `動画書き出しエラー: ${error.message}` : '動画書き出しエラー');
      }
    } finally {
      if (renderAbort.current === controller) renderAbort.current = null;
      setRendering(false);
      setRenderProgress(null);
    }
  }, [project, rendering]);

  const cancelRender = useCallback(() => {
    renderAbort.current?.abort('ユーザーが動画書き出しを中止しました');
  }, []);

  const generateZundamon = async (request: ZundamonRequest) => {
    const audio = project.assets.find((a) => a.id === request.audioAssetId);
    if (!audio) return;
    setZBusy(true);
    setSaveState('ずんだもん音声解析中…');
    try {
      let blob: Blob;
      if (capabilities.opfs) blob = await readAssetFile(audio.storageName);
      else if (audio.objectUrl) blob = await (await fetch(audio.objectUrl)).blob();
      else throw new Error('Audio source not available');
      const cues = await analyzeMouthCues(blob);
      const zClip: Clip = {
        id: uid('clip'),
        kind: 'zundamon',
        name: `ずんだもん / ${audio.name}`,
        start: time,
        duration: audio.duration,
        inPoint: 0,
        volume: 1,
        muted: false,
        transform: { x: 0, y: 0, scale: 0.82, rotation: 0, opacity: 1, anchorX: 0.5, anchorY: 0.5 },
        blendMode: 'normal',
        speed: 1,
        reverse: false,
        effects: [],
        zundamon: { ...request, cues },
      };
      const audioClip = defaultClip(audio.name, audio.id, time, audio.duration);
      updateProject((p) => {
        const overlay = p.tracks.find((t) => t.kind === 'overlay');
        const audioTrack = p.tracks.find((t) => t.kind === 'audio');
        return {
          ...p,
          tracks: p.tracks.map((track) => {
            if (track.id === overlay?.id) return { ...track, clips: [...track.clips, zClip] };
            if (track.id === audioTrack?.id) return { ...track, clips: [...track.clips, audioClip] };
            return track;
          }),
        };
      }, { label: 'ずんだもんを生成' });
      setSelectedClipId(zClip.id);
      setSaveState(`口パク ${cues.length} 点を生成`);
    } catch (error) {
      console.error(error);
      setSaveState('口パク生成エラー');
    } finally {
      setZBusy(false);
    }
  };

  const snapThreshold = 8 / Math.max(20, zoom);

  return (
    <div className="appShell">
      {showRecovery && (
        <RecoveryDialog
          snapshots={recoverySnapshots}
          suspectedCrash={suspectedCrash}
          busy={recoveryBusy}
          onRestore={restoreSnapshot}
          onDismiss={() => {
            setShowRecovery(false);
            setSaveState('現在の保存を使用');
          }}
        />
      )}

      <TopBar
        projectName={project.name}
        onProjectName={(name) => updateProject((p) => ({ ...p, name }), { label: 'プロジェクト名変更', key: 'project-name' })}
        onSave={manualSave}
        onBackup={backupProject}
        onRender={renderVideo}
        onCancelRender={cancelRender}
        rendering={rendering}
        renderProgress={renderProgress}
        capabilities={capabilities}
        saveState={saveState}
      />

      {!capabilities.opfs && (
        <div className="warningBar"><AlertTriangle size={16} />このブラウザではOPFSが利用できないため、素材の永続保存が制限されます。Chrome系ブラウザ推奨です。</div>
      )}

      <main className="editorGrid" aria-busy={rendering}>
        <MediaLibrary
          assets={project.assets}
          onImport={importFiles}
          onAdd={addAssetToTimeline}
          onDelete={deleteAsset}
          onCreateText={createText}
          onCreateSubtitle={createSubtitle}
          onCreateGenerator={createGenerator}
        />
        <div className="centerColumn">
          <Preview project={project} time={time} playing={playing} onTogglePlay={() => setPlaying((v) => !v)} onTime={(v) => setTime(Math.max(0, Math.min(project.duration, v)))} />
          <ZundamonPanel assets={project.assets} busy={zBusy} onGenerate={generateZundamon} />
          <EngineStatus capabilities={capabilities} storageText={storageText} />
        </div>
        <Inspector
          project={project}
          selectedClip={selectedClip}
          timelineTime={time}
          onProject={(patch) => updateProject((p) => ({ ...p, ...patch }), { label: 'プロジェクト設定', key: 'project-settings' })}
          onClip={(patch) => selectedClipId && updateClip(selectedClipId, patch, `clip:${selectedClipId}:properties`, 'クリップ設定')}
          onTransform={(key, value) => selectedClipId && selectedClip && updateClip(
            selectedClipId,
            { transform: { ...selectedClip.transform, [key]: value } },
            `clip:${selectedClipId}:transform:${key}`,
            '変形',
          )}
          onDeleteClip={removeSelectedClip}
        />
      </main>

      <Timeline
        project={project}
        time={time}
        zoom={zoom}
        selectedClipId={selectedClipId}
        onZoom={setZoom}
        onTime={(v) => { setPlaying(false); setTime(v); }}
        onSelect={setSelectedClipId}
        onSplitSelected={splitSelectedClip}
        onRippleDeleteSelected={rippleDeleteSelectedClip}
        onMoveClip={(id, start) => updateProject(
          (p) => moveClip(p, id, start, time, snapThreshold),
          { label: 'クリップ移動', key: `clip:${id}:move` },
        )}
        onTrimClipLeft={(id, start) => updateProject(
          (p) => trimClipLeft(p, id, start, time, snapThreshold),
          { label: '左トリム', key: `clip:${id}:trim-left` },
        )}
        onTrimClip={(id, duration) => updateProject((p) => {
          const location = findClip(p, id);
          if (!location) return p;
          return trimClipRight(p, id, location.clip.start + duration, time, snapThreshold);
        }, { label: '右トリム', key: `clip:${id}:trim-right` })}
        onToggleMuteTrack={(id) => updateProject((p) => ({ ...p, tracks: p.tracks.map((t) => t.id === id ? { ...t, muted: !t.muted } : t) }), { label: 'トラックミュート' })}
        onToggleLockTrack={(id) => updateProject((p) => ({ ...p, tracks: p.tracks.map((t) => t.id === id ? { ...t, locked: !t.locked } : t) }), { label: 'トラックロック' })}
      />
    </div>
  );
}

function EngineStatus({ capabilities, storageText }: { capabilities: ReturnType<typeof detectCapabilities>; storageText: string }) {
  const rows = [
    ['WebCodecs', capabilities.webCodecs, <Gauge size={14} key="a" />],
    ['OPFS', capabilities.opfs, <HardDrive size={14} key="b" />],
    ['WebGPU', capabilities.webGpu, <Cpu size={14} key="c" />],
    ['OffscreenCanvas', capabilities.offscreenCanvas, <Sparkles size={14} key="d" />],
    ['Cross-origin isolated', capabilities.crossOriginIsolated, <Database size={14} key="e" />],
  ] as const;
  return (
    <div className="engineStatus">
      <div><strong>Engine</strong><span>Storage {storageText}</span></div>
      <div className="enginePills">
        {rows.map(([label, ok, icon]) => <span key={label} className={ok ? 'ok' : 'off'}>{icon}{label}{ok ? <CheckCircle2 size={12} /> : null}</span>)}
      </div>
    </div>
  );
}

async function hydrateProjectAssets(input: Project): Promise<Project> {
  const assets = await Promise.all(input.assets.map(async (asset) => {
    try {
      const file = await readAssetFile(asset.storageName);
      return { ...asset, objectUrl: URL.createObjectURL(file) };
    } catch {
      return asset;
    }
  }));
  return { ...input, assets };
}

function revokeProjectUrls(input: Project) {
  for (const asset of input.assets) {
    if (asset.objectUrl) URL.revokeObjectURL(asset.objectUrl);
  }
}

function clipUsesAsset(clip: Clip, assetId: string) {
  const z = clip.zundamon;
  return Boolean(z && [z.closedAssetId, z.halfAssetId, z.openAssetId, z.blinkAssetId, z.audioAssetId].includes(assetId));
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

function sanitize(name: string) {
  return name.replace(/[\\/:*?"<>|]/g, '_').trim() || 'project';
}
