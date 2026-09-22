import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Cpu, Database, Gauge, HardDrive, Sparkles } from 'lucide-react';
import { rippleTrimClip, rollEditBoundary, slideEditClip } from './core/advancedTimelineOps';
import { addAssetBin, assignAssetBin, removeAssetBin, renameAssetBin } from './core/assetBins';
import type { ProjectSearchResult } from './core/projectSearch';
import { detectCapabilities } from './core/capabilities';
import { copyClip, duplicateClipAfter, pasteClipAt, type ClipClipboardPayload } from './core/clipboardOps';
import { HistoryController } from './core/history';
import { groupClipIds, groupSelectedClips, selectedHasGroup, ungroupSelectedClips } from './core/groupOps';
import { pickMediaFilesFromFolder, supportsDirectoryPicker } from './core/folderImport';
import { addPunchInVoiceover } from './core/punchInVoiceover';
import { loadShortcutOverrides, saveShortcutOverrides, shortcutMatches, type ShortcutOverrides } from './core/shortcuts';
import { overwriteClipAt } from './core/editModes';
import { placeClipOnAvailableTrack } from './core/freePlacement';
import { analyzeMouthCues, buildAssetMeta, mergeRelinkedAsset } from './core/media';
import {
  clampProjectDuration,
  createProject,
  defaultClip,
  defaultGeneratorClip,
  defaultLowerThirdClip,
  defaultSubtitleClip,
  defaultTextClip,
  type LowerThirdPreset,
  trackKindForAsset,
  uid,
} from './core/project';
import {
  deleteAssetFile,
  deleteWaveformCache,
  deleteThumbnailCachesForAsset,
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
import { beginEditorSession, markEditorSessionClean, markEditorSessionDirty } from './core/session';
import { findClip, moveClip, nudgeClip, rippleDeleteClip, splitClipAt, trimClipLeft, trimClipRight } from './core/timelineOps';
import { moveClipToTrack } from './core/trackPlacement';
import { deleteSelectedClips, existingClipIds, moveSelectedClipsByDelta, nudgeSelectedClips } from './core/multiSelectionOps';
import { previewFrameTime, quantizePreviewTime } from './render/previewClock';
import { clearWaveformMemoryCache, waveformCacheKey } from './render/waveform';
import { clearTimelineThumbnailCache } from './render/thumbnailCache';
import { deleteAssetStorageBeforeInvalidation, replaceRelinkedAssetStorage } from './render/assetRelinkLifecycle';
import { Inspector } from './components/Inspector';
import { MediaLibrary } from './components/MediaLibrary';
import { Preview } from './components/Preview';
import { Timeline } from './components/Timeline';
import { TopBar } from './components/TopBar';
import { ZundamonPanel } from './components/ZundamonPanel';
import type { ZundamonRequest } from './components/ZundamonPanel';
import type { Clip, Project, TrackKind } from './types/editor';

const RecoveryDialog = lazy(() => import('./components/RecoveryDialog').then((module) => ({ default: module.RecoveryDialog })));
const SearchEverythingPalette = lazy(() => import('./components/SearchEverythingPalette').then((module) => ({ default: module.SearchEverythingPalette })));

interface UpdateOptions {
  history?: boolean;
  label?: string;
  key?: string;
}

export default function App() {
  const [project, setProject] = useState<Project>(() => createProject());
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [selectedClipIds, setSelectedClipIds] = useState<string[]>([]);
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
  const [proxyProgress, setProxyProgress] = useState<Record<string, number>>({});
  const [searchOpen, setSearchOpen] = useState(false);
  const [mediaFocus, setMediaFocus] = useState<{ assetId?: string; binId?: string; token: number }>({ token: 0 });
  const [shortcutOverrides, setShortcutOverrides] = useState<ShortcutOverrides>(() => loadShortcutOverrides());
  const [mediaWidth, setMediaWidth] = useState(300);
  const [inspectorWidth, setInspectorWidth] = useState(320);
  const [timelineHeight, setTimelineHeight] = useState(300);
  const [snappingEnabled, setSnappingEnabled] = useState(true);
  const capabilities = useMemo(() => detectCapabilities(), []);
  const playbackOrigin = useRef<{ wallMs: number; time: number } | null>(null);
  const timeRef = useRef(0);
  const playingRef = useRef(false);
  const punchPlaybackPrevious = useRef(false);
  const history = useRef(new HistoryController<Project>(120, 750));
  const renderAbort = useRef<AbortController | null>(null);
  const proxyAbort = useRef(new Map<string, AbortController>());
  const clipClipboard = useRef<ClipClipboardPayload | null>(null);
  const saveGeneration = useRef(0);
  const projectDirty = useRef(false);

  const selectedClip = useMemo(() => {
    for (const track of project.tracks) {
      const clip = track.clips.find((c) => c.id === selectedClipId);
      if (clip) return clip;
    }
    return null;
  }, [project.tracks, selectedClipId]);

  const selectedTrackId = useMemo(() => {
    if (!selectedClipId) return null;
    return project.tracks.find((track) => track.clips.some((clip) => clip.id === selectedClipId))?.id ?? null;
  }, [project.tracks, selectedClipId]);

  const selectClip = useCallback((clipId: string, additive = false) => {
    if (!additive) {
      const ids = groupClipIds(project, clipId);
      setSelectedClipIds(ids);
      setSelectedClipId(clipId);
      return;
    }
    setSelectedClipIds((current) => {
      if (current.includes(clipId)) {
        const next = current.filter((id) => id !== clipId);
        setSelectedClipId((primary) => primary === clipId ? (next.at(-1) ?? null) : primary);
        return next;
      }
      setSelectedClipId(clipId);
      return [...current, clipId];
    });
  }, [project]);

  const clearClipSelection = useCallback(() => {
    setSelectedClipIds([]);
    setSelectedClipId(null);
  }, []);

  const markProjectDirty = useCallback(() => {
    saveGeneration.current += 1;
    projectDirty.current = true;
    markEditorSessionDirty();
  }, []);

  useEffect(() => {
    if (selectedClipId && !selectedClipIds.includes(selectedClipId)) {
      setSelectedClipIds([selectedClipId]);
      return;
    }
    if (!selectedClipId && selectedClipIds.length > 0) {
      setSelectedClipIds([]);
      return;
    }
    const existing = existingClipIds(project, selectedClipIds);
    if (existing.length !== selectedClipIds.length) {
      setSelectedClipIds(existing);
      if (selectedClipId && !existing.includes(selectedClipId)) setSelectedClipId(existing.at(-1) ?? null);
    }
  }, [project, selectedClipId, selectedClipIds]);

  useEffect(() => () => {
    renderAbort.current?.abort('Editor closed');
    for (const controller of proxyAbort.current.values()) controller.abort('Editor closed');
    proxyAbort.current.clear();
  }, []);

  useEffect(() => {
    let cancelled = false;
    const previousSessionWasUnclean = beginEditorSession();
    setSuspectedCrash(previousSessionWasUnclean);

    const markCleanIfSaved = () => {
      if (!projectDirty.current) markEditorSessionClean();
    };
    window.addEventListener('pagehide', markCleanIfSaved);
    window.addEventListener('beforeunload', markCleanIfSaved);

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
      window.removeEventListener('pagehide', markCleanIfSaved);
      window.removeEventListener('beforeunload', markCleanIfSaved);
      markCleanIfSaved();
    };
  }, [capabilities.opfs]);

  useEffect(() => {
    if (!hydrated || !capabilities.opfs) return;
    const generation = ++saveGeneration.current;
    projectDirty.current = true;
    markEditorSessionDirty();
    setSaveState('変更あり');
    const timer = window.setTimeout(async () => {
      try {
        await saveProject(project);
        if (saveGeneration.current !== generation) return;
        projectDirty.current = false;
        markEditorSessionClean();
        setSaveState('自動保存済み');
      } catch (error) {
        if (saveGeneration.current !== generation) return;
        console.error(error);
        setSaveState('保存エラー');
      }
    }, 700);
    return () => window.clearTimeout(timer);
  }, [project, hydrated, capabilities.opfs]);

  useEffect(() => {
    timeRef.current = time;
  }, [time]);

  useEffect(() => {
    playingRef.current = playing;
  }, [playing]);

  useEffect(() => {
    if (!playing) {
      playbackOrigin.current = null;
      return;
    }

    const originTime = quantizePreviewTime(timeRef.current, project.fps);
    const wallMs = performance.now();
    playbackOrigin.current = { wallMs, time: originTime };
    timeRef.current = originTime;
    setTime(originTime);

    let raf = 0;
    const tick = (now: number) => {
      const origin = playbackOrigin.current;
      if (!origin) return;
      const next = previewFrameTime(
        origin.time,
        (now - origin.wallMs) / 1000,
        project.fps,
        project.duration,
      );
      timeRef.current = next;
      setTime(next);
      if (next >= project.duration) {
        setPlaying(false);
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, project.duration, project.fps]);

  const updateProject = useCallback((mutator: (p: Project) => Project, options: UpdateOptions = {}) => {
    setProject((current) => {
      const mutated = mutator(current);
      if (mutated === current) return current;
      markProjectDirty();
      const next = clampProjectDuration({ ...mutated, updatedAt: new Date().toISOString() });
      if (options.history !== false) {
        history.current.record(current, options.label ?? '編集', options.key);
      }
      return next;
    });
  }, [markProjectDirty]);

  const updateClip = useCallback((clipId: string, patch: Partial<Clip>, historyKey?: string, label = 'クリップ編集') => {
    updateProject((p) => ({
      ...p,
      tracks: p.tracks.map((track) => ({
        ...track,
        clips: track.clips.map((clip) => clip.id === clipId ? { ...clip, ...patch } : clip),
      })),
    }), { label, key: historyKey ?? `clip:${clipId}` });
  }, [updateProject]);

  const updateClipTransform = useCallback((clipId: string, patch: Partial<Clip['transform']>) => {
    updateProject((p) => ({
      ...p,
      tracks: p.tracks.map((track) => ({
        ...track,
        clips: track.clips.map((clip) => clip.id === clipId
          ? { ...clip, transform: { ...clip.transform, ...patch } }
          : clip),
      })),
    }), { label: 'プレビュー変形', key: `clip:${clipId}:preview-transform` });
  }, [updateProject]);

  const undo = useCallback(() => {
    const result = history.current.undo(project);
    if (!result) return;
    setPlaying(false);
    setSelectedClipId(null);
    markProjectDirty();
    setProject(clampProjectDuration({ ...result.value, updatedAt: new Date().toISOString() }));
    setSaveState(`元に戻す: ${result.label}`);
  }, [markProjectDirty, project]);

  const redo = useCallback(() => {
    const result = history.current.redo(project);
    if (!result) return;
    setPlaying(false);
    setSelectedClipId(null);
    markProjectDirty();
    setProject(clampProjectDuration({ ...result.value, updatedAt: new Date().toISOString() }));
    setSaveState(`やり直し: ${result.label}`);
  }, [markProjectDirty, project]);

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
      markProjectDirty();
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
  }, [markProjectDirty, project]);

  const importFiles = async (files: File[]) => {
    if (rendering) return;
    setSaveState('素材を保存中…');
    let imported = 0;
    let failed = 0;
    for (const file of files) {
      let asset: Project['assets'][number] | null = null;
      try {
        const importedAsset = await buildAssetMeta(file);
        asset = importedAsset;
        if (capabilities.opfs) await saveAssetFile(importedAsset.storageName, file);
        updateProject((p) => ({ ...p, assets: [...p.assets, importedAsset] }), {
          label: '素材を読み込む',
          key: 'import-assets',
        });
        imported += 1;
      } catch (error) {
        console.error(`Failed to import ${file.name}`, error);
        if (asset?.objectUrl) URL.revokeObjectURL(asset.objectUrl);
        failed += 1;
      }
    }
    if (failed === 0) setSaveState(`${imported}件の素材を追加しました`);
    else if (imported > 0) setSaveState(`${imported}件を追加・${failed}件を読み込めませんでした`);
    else setSaveState('素材を読み込めませんでした');
  };

  const setPunchInPlayback = useCallback((active: boolean) => {
    if (active) {
      punchPlaybackPrevious.current = playingRef.current;
      setPlaying(true);
      return;
    }
    setPlaying(punchPlaybackPrevious.current);
  }, []);

  const importPunchInVoiceover = useCallback(async (file: File, startTime: number) => {
    if (rendering) return;
    setSaveState('パンチイン録音を保存中…');
    let asset: Project['assets'][number] | null = null;
    try {
      asset = await buildAssetMeta(file);
      if (asset.kind !== 'audio') throw new Error('Punch-in recording is not audio');
      if (capabilities.opfs) await saveAssetFile(asset.storageName, file);
      const clipId = uid('clip');
      const recordedAsset = asset;
      updateProject((p) => addPunchInVoiceover(
        p,
        recordedAsset,
        startTime,
        { clipId },
      ).project, { label: 'パンチイン録音' });
      setSelectedClipId(clipId);
      setSelectedClipIds([clipId]);
      setSaveState(`パンチイン配置済み: ${asset.name}`);
    } catch (error) {
      console.error('Punch-in voiceover import failed', error);
      if (asset?.objectUrl) URL.revokeObjectURL(asset.objectUrl);
      setSaveState('パンチイン録音の保存に失敗しました');
    }
  }, [capabilities.opfs, rendering, updateProject]);

  const updateAssetMeta = useCallback((assetId: string, patch: Partial<Project['assets'][number]>) => {
    if (rendering) return;
    updateProject((p) => ({
      ...p,
      assets: p.assets.map((asset) => asset.id === assetId ? { ...asset, ...patch } : asset),
    }), {
      label: '素材メタデータを更新',
      key: `asset:${assetId}:metadata`,
    });
  }, [rendering, updateProject]);

  const createAssetBin = useCallback((name: string) => {
    if (rendering) return;
    updateProject((p) => addAssetBin(p, name), { label: '素材ビンを作成' });
  }, [rendering, updateProject]);

  const renameMediaBin = useCallback((binId: string, name: string) => {
    if (rendering) return;
    updateProject((p) => renameAssetBin(p, binId, name), {
      label: '素材ビン名を変更',
      key: `asset-bin:${binId}:name`,
    });
  }, [rendering, updateProject]);

  const deleteMediaBin = useCallback((binId: string) => {
    if (rendering) return;
    updateProject((p) => removeAssetBin(p, binId), { label: '素材ビンを削除' });
  }, [rendering, updateProject]);

  const setAssetBin = useCallback((assetId: string, binId?: string) => {
    if (rendering) return;
    updateProject((p) => assignAssetBin(p, assetId, binId), {
      label: '素材ビンを変更',
      key: `asset:${assetId}:bin`,
    });
  }, [rendering, updateProject]);

  const generateAssetProxy = useCallback(async (assetId: string) => {
    if (rendering || !capabilities.opfs || proxyAbort.current.has(assetId)) return;
    const asset = project.assets.find((item) => item.id === assetId);
    if (!asset || asset.kind !== 'video') return;

    const controller = new AbortController();
    proxyAbort.current.set(assetId, controller);
    setProxyProgress((current) => ({ ...current, [assetId]: 0 }));
    setSaveState(`proxy生成中: ${asset.name}`);

    if (asset.proxyObjectUrl) URL.revokeObjectURL(asset.proxyObjectUrl);
    if (asset.proxyStorageName) await deleteAssetFile(asset.proxyStorageName).catch(() => undefined);
    clearTimelineThumbnailCache(assetId);
    await deleteThumbnailCachesForAsset(assetId).catch(() => undefined);
    updateProject((p) => ({
      ...p,
      assets: p.assets.map((item) => item.id === assetId
        ? { ...item, proxyStorageName: undefined, proxyObjectUrl: undefined }
        : item),
    }), { history: false });

    try {
      const { generateVideoProxy } = await import('./render/proxyGenerator');
      const generated = await generateVideoProxy(asset, {
        signal: controller.signal,
        onProgress: (progress) => {
          setProxyProgress((current) => ({ ...current, [assetId]: progress }));
        },
      });
      const proxyObjectUrl = URL.createObjectURL(generated.file);
      clearTimelineThumbnailCache(assetId);
      await deleteThumbnailCachesForAsset(assetId).catch(() => undefined);
      updateProject((p) => ({
        ...p,
        assets: p.assets.map((item) => item.id === assetId
          ? {
              ...item,
              proxyStorageName: generated.storageName,
              proxyObjectUrl,
            }
          : item),
      }), { history: false });
      setSaveState(`proxy生成済み: ${asset.name} (${generated.width}×${generated.height})`);
    } catch (error) {
      if (controller.signal.aborted) {
        setSaveState(`proxy生成を中止: ${asset.name}`);
      } else {
        console.error('Proxy generation failed', error);
        setSaveState(`proxy生成失敗: ${asset.name}`);
      }
    } finally {
      proxyAbort.current.delete(assetId);
      setProxyProgress((current) => {
        const next = { ...current };
        delete next[assetId];
        return next;
      });
    }
  }, [capabilities.opfs, project.assets, rendering, updateProject]);

  const cancelAssetProxy = useCallback((assetId: string) => {
    proxyAbort.current.get(assetId)?.abort('Proxy generation canceled');
  }, []);

  const removeAssetProxy = useCallback(async (assetId: string) => {
    proxyAbort.current.get(assetId)?.abort('Proxy removed');
    const asset = project.assets.find((item) => item.id === assetId);
    if (!asset) return;
    if (asset.proxyStorageName && capabilities.opfs) {
      await deleteAssetFile(asset.proxyStorageName).catch(() => undefined);
    }
    if (asset.proxyObjectUrl) URL.revokeObjectURL(asset.proxyObjectUrl);
    clearTimelineThumbnailCache(assetId);
    await deleteThumbnailCachesForAsset(assetId).catch(() => undefined);
    updateProject((p) => ({
      ...p,
      assets: p.assets.map((item) => item.id === assetId
        ? { ...item, proxyStorageName: undefined, proxyObjectUrl: undefined }
        : item),
    }), { history: false });
    setSaveState(`proxy解除: ${asset.name}`);
  }, [capabilities.opfs, project.assets, updateProject]);

  const relinkAsset = useCallback(async (assetId: string, file: File) => {
    if (rendering) return;
    const current = project.assets.find((asset) => asset.id === assetId);
    if (!current) return;

    setSaveState(`元素材を再リンク中: ${current.name}`);
    let replacement: Project['assets'][number] | null = null;
    try {
      replacement = await buildAssetMeta(file);
      if (replacement.kind !== current.kind) {
        if (replacement.objectUrl) URL.revokeObjectURL(replacement.objectUrl);
        setSaveState(`再リンク失敗: ${current.kind}素材を選択してください`);
        return;
      }

      await replaceRelinkedAssetStorage(current, file, waveformCacheKey(current), capabilities.opfs);

      proxyAbort.current.get(assetId)?.abort('Original media relinked');
      if (current.objectUrl) URL.revokeObjectURL(current.objectUrl);
      if (current.proxyObjectUrl) URL.revokeObjectURL(current.proxyObjectUrl);
      clearTimelineThumbnailCache(assetId);
      clearWaveformMemoryCache(assetId);

      const merged = mergeRelinkedAsset(current, replacement);
      history.current.clear();
      updateProject((p) => ({
        ...p,
        assets: p.assets.map((asset) => asset.id === assetId ? merged : asset),
      }), { history: false });
      setSaveState(`再リンク済み: ${current.name}（履歴をリセット）`);
    } catch (error) {
      console.error('Asset relink failed', error);
      if (replacement?.objectUrl) URL.revokeObjectURL(replacement.objectUrl);
      setSaveState(`再リンク失敗: ${current.name}`);
    }
  }, [capabilities.opfs, project.assets, rendering, updateProject]);

  const importFolder = useCallback(async () => {
    if (rendering || !supportsDirectoryPicker()) return;
    try {
      const result = await pickMediaFilesFromFolder();
      if (result.files.length === 0) {
        setSaveState('フォルダ内に対応メディアがありません');
        return;
      }
      await importFiles(result.files);
      setSaveState(result.truncated
        ? `${result.files.length}件を読み込みました（上限で打ち切り）`
        : `${result.files.length}件をフォルダから読み込みました`);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      console.error('Folder import failed', error);
      setSaveState('フォルダ読み込みに失敗しました');
    }
  }, [rendering]);

  const addAssetToTimeline = (assetId: string, mode: 'insert' | 'overwrite') => {
    if (rendering) return;
    let addedClipId: string | null = null;
    updateProject((p) => {
      const asset = p.assets.find((item) => item.id === assetId);
      if (!asset) return p;
      const kind = trackKindForAsset(asset.kind);
      const duration = asset.kind === 'image' ? 5 : Math.max(0.1, asset.duration);
      const incoming = defaultClip(asset.name, asset.id, time, duration);
      addedClipId = incoming.id;

      if (mode === 'overwrite') {
        const selectedTrack = selectedTrackId
          ? p.tracks.find((track) => track.id === selectedTrackId && track.kind === kind && !track.locked)
          : undefined;
        const target = selectedTrack ?? p.tracks.find((track) => track.kind === kind && !track.locked);
        return target ? overwriteClipAt(p, target.id, incoming, time) : placeClipOnAvailableTrack(p, incoming, kind, selectedTrackId);
      }

      return placeClipOnAvailableTrack(p, incoming, kind, selectedTrackId);
    }, { label: mode === 'overwrite' ? '上書き編集' : '素材を配置' });
    if (addedClipId) {
      setSelectedClipId(addedClipId);
      setSelectedClipIds([addedClipId]);
    }
    setPlaying(false);
  };

  const addSyntheticClip = useCallback((clip: Clip, trackKind: TrackKind, label: string) => {
    if (rendering) return;
    updateProject((p) => placeClipOnAvailableTrack(p, clip, trackKind, selectedTrackId), { label });
    setSelectedClipId(clip.id);
    setSelectedClipIds([clip.id]);
    setPlaying(false);
  }, [rendering, selectedTrackId, updateProject]);

  const createText = useCallback(() => {
    addSyntheticClip(defaultTextClip(time), 'overlay', 'テキストを追加');
  }, [addSyntheticClip, time]);

  const createLowerThird = useCallback((preset: LowerThirdPreset) => {
    addSyntheticClip(
      defaultLowerThirdClip(time, project.width, project.height, preset),
      'overlay',
      '下部テロップを追加',
    );
  }, [addSyntheticClip, project.height, project.width, time]);

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
    await deleteAssetStorageBeforeInvalidation(asset, waveformCacheKey(asset), capabilities.opfs);
    proxyAbort.current.get(assetId)?.abort('Asset deleted');
    proxyAbort.current.delete(assetId);
    clearTimelineThumbnailCache(assetId);
    clearWaveformMemoryCache(assetId);
    if (asset.objectUrl) URL.revokeObjectURL(asset.objectUrl);
    if (asset.proxyObjectUrl) URL.revokeObjectURL(asset.proxyObjectUrl);
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
    if (selectedClipIds.length === 0 || rendering) return;
    const ids = [...selectedClipIds];
    updateProject((p) => deleteSelectedClips(p, ids), {
      label: ids.length > 1 ? `${ids.length}クリップ削除` : 'クリップ削除',
    });
    clearClipSelection();
  }, [clearClipSelection, rendering, selectedClipIds, updateProject]);

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

  const copySelectedClip = useCallback(() => {
    if (!selectedClipId || rendering) return;
    const payload = copyClip(project, selectedClipId);
    if (!payload) return;
    clipClipboard.current = payload;
    setSaveState('クリップをコピーしました');
  }, [project, rendering, selectedClipId]);

  const pasteCopiedClip = useCallback(() => {
    if (!clipClipboard.current || rendering) return;
    const result = pasteClipAt(project, clipClipboard.current, time);
    if (!result.clipId || result.project === project) return;
    history.current.record(project, 'クリップ貼り付け');
    setPlaying(false);
    markProjectDirty();
    setProject(clampProjectDuration({ ...result.project, updatedAt: new Date().toISOString() }));
    setSelectedClipId(result.clipId);
    setSaveState('クリップを貼り付けました');
  }, [markProjectDirty, project, rendering, time]);

  const duplicateSelectedClip = useCallback(() => {
    if (!selectedClipId || rendering) return;
    const result = duplicateClipAfter(project, selectedClipId);
    if (!result.clipId || result.project === project) return;
    history.current.record(project, 'クリップ複製');
    setPlaying(false);
    markProjectDirty();
    setProject(clampProjectDuration({ ...result.project, updatedAt: new Date().toISOString() }));
    setSelectedClipId(result.clipId);
    setSaveState('クリップを複製しました');
  }, [markProjectDirty, project, rendering, selectedClipId]);

  const groupSelection = useCallback(() => {
    if (selectedClipIds.length < 2 || rendering) return;
    updateProject((p) => groupSelectedClips(p, selectedClipIds), { label: 'クリップをグループ化' });
    setSaveState('選択クリップをグループ化しました');
  }, [rendering, selectedClipIds, updateProject]);

  const ungroupSelection = useCallback(() => {
    if (selectedClipIds.length === 0 || rendering) return;
    updateProject((p) => ungroupSelectedClips(p, selectedClipIds), { label: 'グループを解除' });
    setSaveState('グループを解除しました');
  }, [rendering, selectedClipIds, updateProject]);

  const nudgeSelected = useCallback((frames: number) => {
    if (selectedClipIds.length === 0 || rendering) return;
    const ids = [...selectedClipIds];
    updateProject(
      (p) => ids.length > 1 ? nudgeSelectedClips(p, ids, frames) : nudgeClip(p, ids[0], frames),
      {
        label: ids.length > 1 ? '選択クリップをフレーム移動' : 'クリップをフレーム移動',
        key: ids.length > 1 ? `multi:nudge:${ids.join(',')}` : `clip:${ids[0]}:nudge`,
      },
    );
  }, [rendering, selectedClipIds, updateProject]);

  const updateShortcutOverrides = useCallback((next: ShortcutOverrides) => {
    setShortcutOverrides(next);
    saveShortcutOverrides(next);
    setSaveState('ショートカット設定を保存しました');
  }, []);

  const navigateSearchResult = useCallback((result: ProjectSearchResult) => {
    setPlaying(false);

    if (result.kind === 'clip' && result.clipId) {
      selectClip(result.clipId);
      if (typeof result.time === 'number') setTime(Math.max(0, Math.min(project.duration, result.time)));
      setSaveState(`検索: ${result.title}`);
      return;
    }

    if ((result.kind === 'marker' || result.kind === 'transcript') && typeof result.time === 'number') {
      clearClipSelection();
      setTime(Math.max(0, Math.min(project.duration, result.time)));
      setSaveState(result.kind === 'transcript' ? `トランスクリプトへ移動: ${result.title}` : `マーカーへ移動: ${result.title}`);
      return;
    }

    if (result.kind === 'track' && result.trackId) {
      const track = project.tracks.find((item) => item.id === result.trackId);
      const firstClip = track?.clips.slice().sort((a, b) => a.start - b.start)[0];
      if (firstClip) {
        selectClip(firstClip.id);
        setTime(Math.max(0, Math.min(project.duration, firstClip.start)));
      } else {
        clearClipSelection();
      }
      setSaveState(`トラック: ${result.title}`);
      return;
    }

    if (result.kind === 'asset' && result.assetId) {
      setMediaFocus((current) => ({ assetId: result.assetId, token: current.token + 1 }));
      setSaveState(`素材を表示: ${result.title}`);
      return;
    }

    if (result.kind === 'bin' && result.binId) {
      setMediaFocus((current) => ({ binId: result.binId, token: current.token + 1 }));
      setSaveState(`素材ビンを表示: ${result.title}`);
    }
  }, [clearClipSelection, project.duration, project.tracks, selectClip]);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (shortcutMatches(e, 'search', shortcutOverrides)) {
        e.preventDefault();
        setSearchOpen(true);
        return;
      }

      const target = e.target as HTMLElement | null;
      if (target?.matches('input, textarea, select, [contenteditable="true"]')) return;
      if (showRecovery || rendering || searchOpen) return;

      if (e.key === 'Escape' && selectedClipIds.length > 0) {
        e.preventDefault();
        clearClipSelection();
        return;
      }
      if (shortcutMatches(e, 'select-all', shortcutOverrides)) {
        e.preventDefault();
        const ids = project.tracks.flatMap((track) => track.clips.map((clip) => clip.id));
        setSelectedClipIds(ids);
        setSelectedClipId(ids.at(-1) ?? null);
        return;
      }
      if (shortcutMatches(e, 'undo', shortcutOverrides)) {
        e.preventDefault();
        undo();
        return;
      }
      if (shortcutMatches(e, 'redo', shortcutOverrides)) {
        e.preventDefault();
        redo();
        return;
      }
      if (shortcutMatches(e, 'split', shortcutOverrides)) {
        e.preventDefault();
        splitSelectedClip();
        return;
      }
      if (shortcutMatches(e, 'group', shortcutOverrides)) {
        e.preventDefault();
        groupSelection();
        return;
      }
      if (shortcutMatches(e, 'ungroup', shortcutOverrides)) {
        e.preventDefault();
        ungroupSelection();
        return;
      }
      if (shortcutMatches(e, 'duplicate', shortcutOverrides)) {
        e.preventDefault();
        duplicateSelectedClip();
        return;
      }
      if (shortcutMatches(e, 'copy', shortcutOverrides)) {
        e.preventDefault();
        copySelectedClip();
        return;
      }
      if (shortcutMatches(e, 'paste', shortcutOverrides)) {
        e.preventDefault();
        pasteCopiedClip();
        return;
      }
      if (shortcutMatches(e, 'nudge-left', shortcutOverrides)) {
        e.preventDefault();
        nudgeSelected(-1);
        return;
      }
      if (shortcutMatches(e, 'nudge-right', shortcutOverrides)) {
        e.preventDefault();
        nudgeSelected(1);
        return;
      }
      if (shortcutMatches(e, 'play-pause', shortcutOverrides)) {
        e.preventDefault();
        setPlaying((value) => !value);
        return;
      }
      if (selectedClipId && shortcutMatches(e, 'ripple-delete', shortcutOverrides)) {
        e.preventDefault();
        rippleDeleteSelectedClip();
        return;
      }
      if (selectedClipId && shortcutMatches(e, 'delete', shortcutOverrides)) {
        e.preventDefault();
        removeSelectedClip();
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [project.tracks, selectedClipIds.length, clearClipSelection, showRecovery, rendering, searchOpen, selectedClipId, removeSelectedClip, rippleDeleteSelectedClip, splitSelectedClip, duplicateSelectedClip, copySelectedClip, pasteCopiedClip, groupSelection, ungroupSelection, nudgeSelected, undo, redo, shortcutOverrides]);

  const manualSave = async () => {
    const generation = saveGeneration.current;
    try {
      await saveProject(project);
      if (saveGeneration.current !== generation) return;
      projectDirty.current = false;
      markEditorSessionClean();
      setSaveState('保存済み');
    } catch {
      if (saveGeneration.current === generation) setSaveState('保存エラー');
    }
  };

  const backupProject = () => {
    const clean = {
      ...project,
      assets: project.assets.map(({ objectUrl: _objectUrl, proxyObjectUrl: _proxyObjectUrl, ...asset }) => asset),
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
      const { exportProjectVideo } = await import('./render/projectExportEngine');
      const result = await exportProjectVideo(project, {
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
    setSaveState(request.timingCues?.length ? 'VOICEVOX timingを反映中…' : 'ずんだもん音声解析中…');
    try {
      const { timingCues, subtitlePayload, x, y, scale, ...zundamonRequest } = request;
      let cues = timingCues;
      if (!cues?.length) {
        let blob: Blob;
        if (capabilities.opfs) blob = await readAssetFile(audio.storageName);
        else if (audio.objectUrl) blob = await (await fetch(audio.objectUrl)).blob();
        else throw new Error('Audio source not available');
        cues = await analyzeMouthCues(blob);
      }
      const zClip: Clip = {
        id: uid('clip'),
        kind: 'zundamon',
        name: `ずんだもん / ${audio.name}`,
        start: time,
        duration: audio.duration,
        inPoint: 0,
        volume: 1,
        muted: false,
        transform: {
          x: typeof x === 'number' && Number.isFinite(x) ? x : 0,
          y: typeof y === 'number' && Number.isFinite(y) ? y : 0,
          scale: typeof scale === 'number' && Number.isFinite(scale) ? Math.max(0.05, scale) : 0.82,
          rotation: 0,
          opacity: 1,
          anchorX: 0.5,
          anchorY: 0.5,
        },
        blendMode: 'normal',
        speed: 1,
        reverse: false,
        effects: [],
        zundamon: { ...zundamonRequest, cues },
      };
      const audioClip = defaultClip(audio.name, audio.id, time, audio.duration);
      const subtitleClip = subtitlePayload?.text
        ? {
            ...defaultSubtitleClip(time, project.height * 0.34, audio.duration),
            name: `VOICEVOX字幕 / ${audio.name}`,
            subtitle: subtitlePayload,
          }
        : null;
      updateProject((p) => {
        let next = placeClipOnAvailableTrack(p, zClip, 'overlay');
        next = placeClipOnAvailableTrack(next, audioClip, 'audio');
        if (subtitleClip) next = placeClipOnAvailableTrack(next, subtitleClip, 'subtitle');
        return next;
      }, { label: subtitleClip ? 'ずんだもん + VOICEVOX字幕を生成' : 'ずんだもんを生成' });
      setSelectedClipId(zClip.id);
      setSelectedClipIds([zClip.id]);
      setSaveState(`${timingCues?.length ? 'VOICEVOX timing' : '音声解析'} / 口パク ${cues.length} 点${subtitleClip ? ' + 字幕' : ''}を生成`);
    } catch (error) {
      console.error(error);
      setSaveState('口パク生成エラー');
    } finally {
      setZBusy(false);
    }
  };

  const snapThreshold = snappingEnabled ? 8 / Math.max(20, zoom) : 0;

  return (
    <div className="appShell">
      <Suspense fallback={null}>
        {searchOpen && (
          <SearchEverythingPalette
            project={project}
            open
            onClose={() => setSearchOpen(false)}
            onNavigate={navigateSearchResult}
          />
        )}
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
      </Suspense>

      <TopBar
        projectName={project.name}
        onProjectName={(name) => updateProject((p) => ({ ...p, name }), { label: 'プロジェクト名変更', key: 'project-name' })}
        onSave={manualSave}
        onBackup={backupProject}
        onSearch={() => setSearchOpen(true)}
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

      <main
        className="editorGrid"
        aria-busy={rendering}
        style={{ gridTemplateColumns: `${mediaWidth}px 6px minmax(0,1fr) 6px ${inspectorWidth}px` }}
      >
        <MediaLibrary
          assets={project.assets}
          assetBins={project.assetBins ?? []}
          focusAssetId={mediaFocus.assetId}
          focusBinId={mediaFocus.binId}
          focusToken={mediaFocus.token}
          timelineTime={time}
          onImport={importFiles}
          onPunchInVoiceover={importPunchInVoiceover}
          onPunchInPlayback={setPunchInPlayback}
          onImportFolder={importFolder}
          folderImportSupported={supportsDirectoryPicker()}
          onAdd={addAssetToTimeline}
          onDelete={deleteAsset}
          onAssetMeta={updateAssetMeta}
          onCreateBin={createAssetBin}
          onRenameBin={renameMediaBin}
          onDeleteBin={deleteMediaBin}
          onAssignBin={setAssetBin}
          onRelink={relinkAsset}
          proxyProgress={proxyProgress}
          onGenerateProxy={generateAssetProxy}
          onCancelProxy={cancelAssetProxy}
          onRemoveProxy={removeAssetProxy}
          onCreateText={createText}
          onCreateLowerThird={createLowerThird}
          onCreateSubtitle={createSubtitle}
          onCreateGenerator={createGenerator}
        />
        <div
          className="panelResizeHandle vertical"
          role="separator"
          aria-orientation="vertical"
          title="メディアパネルの幅を変更"
          onPointerDown={(event) => startPointerResize(event.clientX, mediaWidth, setMediaWidth, 1, 210, 520, 'x')}
        />
        <div className="centerColumn">
          <Preview
            project={project}
            time={time}
            playing={playing}
            selectedClipId={selectedClipId}
            onSelectClip={(clipId) => {
              setPlaying(false);
              selectClip(clipId, false);
            }}
            onClearSelection={clearClipSelection}
            onTransformClip={updateClipTransform}
            onTogglePlay={() => setPlaying((v) => !v)}
            onTime={(v) => setTime(Math.max(0, Math.min(project.duration, v)))}
          />
          <ZundamonPanel assets={project.assets} busy={zBusy} onGenerate={generateZundamon} />
          <EngineStatus capabilities={capabilities} storageText={storageText} />
        </div>
        <div
          className="panelResizeHandle vertical"
          role="separator"
          aria-orientation="vertical"
          title="インスペクターの幅を変更"
          onPointerDown={(event) => startPointerResize(event.clientX, inspectorWidth, setInspectorWidth, -1, 250, 540, 'x')}
        />
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
          onSeek={(value) => {
            setPlaying(false);
            setTime(Math.max(0, Math.min(project.duration, value)));
          }}
          shortcutOverrides={shortcutOverrides}
          onShortcutOverrides={updateShortcutOverrides}
        />
      </main>

      <div
        className="panelResizeHandle horizontal"
        role="separator"
        aria-orientation="horizontal"
        title="タイムラインの高さを変更"
        onPointerDown={(event) => startPointerResize(event.clientY, timelineHeight, setTimelineHeight, -1, 180, 560, 'y')}
      />
      <div className="timelineSlot" style={{ height: timelineHeight }}>
      <Timeline
        project={project}
        time={time}
        zoom={zoom}
        selectedClipId={selectedClipId}
        selectedClipIds={selectedClipIds}
        snappingEnabled={snappingEnabled}
        onToggleSnapping={() => setSnappingEnabled((value) => !value)}
        onZoom={setZoom}
        onTime={(v) => { setPlaying(false); setTime(v); }}
        onSelect={selectClip}
        onClearSelection={clearClipSelection}
        onMoveSelectedByDelta={(delta) => updateProject(
          (p) => moveSelectedClipsByDelta(p, selectedClipIds, delta),
          { label: '選択クリップ移動', key: `multi:move:${selectedClipIds.join(',')}` },
        )}
        onSplitSelected={splitSelectedClip}
        onDeleteSelected={removeSelectedClip}
        onDuplicateSelected={duplicateSelectedClip}
        onCopySelected={copySelectedClip}
        onPasteCopied={pasteCopiedClip}
        onRippleDeleteSelected={rippleDeleteSelectedClip}
        onGroupSelected={groupSelection}
        onUngroupSelected={ungroupSelection}
        canGroup={selectedClipIds.length >= 2}
        canUngroup={selectedHasGroup(project, selectedClipIds)}
        onMoveClip={(id, start) => updateProject(
          (p) => moveClip(p, id, start, time, snapThreshold),
          { label: 'クリップ移動', key: `clip:${id}:move` },
        )}
        onMoveClipToTrack={(id, trackId, start) => updateProject(
          (p) => moveClipToTrack(p, id, trackId, start, time, snapThreshold),
          { label: 'クリップを別トラックへ移動', key: `clip:${id}:move-track` },
        )}
        onSlideClip={(id, start) => updateProject(
          (p) => slideEditClip(p, id, start),
          { label: 'スライド編集', key: `clip:${id}:slide` },
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
        onRippleTrimClip={(id, edge, boundary) => updateProject(
          (p) => rippleTrimClip(p, id, edge, boundary, time, snapThreshold),
          { label: 'リップルトリム', key: `clip:${id}:ripple-trim:${edge}` },
        )}
        onRollEditClip={(id, edge, boundary) => updateProject(
          (p) => rollEditBoundary(p, id, edge, boundary),
          { label: 'ロール編集', key: `clip:${id}:roll:${edge}` },
        )}
        onToggleMuteTrack={(id) => updateProject((p) => ({ ...p, tracks: p.tracks.map((t) => t.id === id ? { ...t, muted: !t.muted } : t) }), { label: 'トラックミュート' })}
        onToggleSoloTrack={(id) => updateProject((p) => ({ ...p, tracks: p.tracks.map((t) => t.id === id ? { ...t, solo: !t.solo } : t) }), { label: 'トラックSolo' })}
        onToggleVisibleTrack={(id) => updateProject((p) => ({ ...p, tracks: p.tracks.map((t) => t.id === id ? { ...t, visible: t.visible === false } : t) }), { label: 'トラック表示' })}
        onToggleLockTrack={(id) => updateProject((p) => ({ ...p, tracks: p.tracks.map((t) => t.id === id ? { ...t, locked: !t.locked } : t) }), { label: 'トラックロック' })}
      />
      </div>
    </div>
  );
}

function startPointerResize(
  startPointer: number,
  startSize: number,
  setSize: (value: number) => void,
  direction: 1 | -1,
  min: number,
  max: number,
  axis: 'x' | 'y',
) {
  const move = (event: PointerEvent) => {
    const pointer = axis === 'x' ? event.clientX : event.clientY;
    setSize(Math.max(min, Math.min(max, startSize + (pointer - startPointer) * direction)));
  };
  const up = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    document.body.classList.remove('resizingPanels');
  };
  document.body.classList.add('resizingPanels');
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up, { once: true });
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
    let next = { ...asset };
    try {
      const file = await readAssetFile(asset.storageName);
      next = { ...next, objectUrl: URL.createObjectURL(file) };
    } catch {
      // Missing original media is preserved as an offline asset reference.
    }

    if (asset.proxyStorageName) {
      try {
        const proxy = await readAssetFile(asset.proxyStorageName);
        next = { ...next, proxyObjectUrl: URL.createObjectURL(proxy) };
      } catch {
        next = { ...next, proxyStorageName: undefined, proxyObjectUrl: undefined };
      }
    }
    return next;
  }));
  return { ...input, assets };
}

function revokeProjectUrls(input: Project) {
  for (const asset of input.assets) {
    if (asset.objectUrl) URL.revokeObjectURL(asset.objectUrl);
    if (asset.proxyObjectUrl) URL.revokeObjectURL(asset.proxyObjectUrl);
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
