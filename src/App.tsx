import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Cpu, Database, Gauge, HardDrive, Sparkles } from 'lucide-react';
import { detectCapabilities } from './core/capabilities';
import { analyzeMouthCues, buildAssetMeta } from './core/media';
import { clampProjectDuration, createProject, defaultClip, trackKindForAsset, uid } from './core/project';
import { deleteAssetFile, loadProject, readAssetFile, requestPersistentStorage, saveAssetFile, saveProject, storageEstimate } from './core/storage';
import { Inspector } from './components/Inspector';
import { MediaLibrary } from './components/MediaLibrary';
import { Preview } from './components/Preview';
import { Timeline } from './components/Timeline';
import { TopBar } from './components/TopBar';
import { ZundamonPanel, type ZundamonRequest } from './components/ZundamonPanel';
import type { Clip, Project } from './types/editor';

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
  const capabilities = useMemo(() => detectCapabilities(), []);
  const lastFrame = useRef<number | null>(null);

  const selectedClip = useMemo(() => {
    for (const track of project.tracks) {
      const clip = track.clips.find((c) => c.id === selectedClipId);
      if (clip) return clip;
    }
    return null;
  }, [project.tracks, selectedClipId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await requestPersistentStorage();
        const saved = await loadProject();
        if (saved) {
          const assets = await Promise.all(saved.assets.map(async (asset) => {
            try {
              const file = await readAssetFile(asset.storageName);
              return { ...asset, objectUrl: URL.createObjectURL(file) };
            } catch {
              return asset;
            }
          }));
          if (!cancelled) setProject({ ...saved, assets });
        }
        const estimate = await storageEstimate();
        if (estimate?.quota) {
          const used = estimate.usage ?? 0;
          setStorageText(`${(used / 1024 / 1024).toFixed(0)} / ${(estimate.quota / 1024 / 1024 / 1024).toFixed(1)} GB`);
        }
        if (!cancelled) {
          setHydrated(true);
          setSaveState('保存済み');
        }
      } catch (error) {
        console.error(error);
        if (!cancelled) {
          setHydrated(true);
          setSaveState('一時モード');
        }
      }
    })();
    return () => { cancelled = true; };
  }, []);

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

  const updateProject = useCallback((mutator: (p: Project) => Project) => {
    setProject((current) => clampProjectDuration({ ...mutator(current), updatedAt: new Date().toISOString() }));
  }, []);

  const updateClip = useCallback((clipId: string, patch: Partial<Clip>) => {
    updateProject((p) => ({
      ...p,
      tracks: p.tracks.map((track) => ({
        ...track,
        clips: track.clips.map((clip) => clip.id === clipId ? { ...clip, ...patch } : clip),
      })),
    }));
  }, [updateProject]);

  const importFiles = async (files: File[]) => {
    setSaveState('素材を保存中…');
    for (const file of files) {
      try {
        const asset = await buildAssetMeta(file);
        if (capabilities.opfs) await saveAssetFile(asset.storageName, file);
        updateProject((p) => ({ ...p, assets: [...p.assets, asset] }));
      } catch (error) {
        console.error(`Failed to import ${file.name}`, error);
      }
    }
    setSaveState('素材追加済み');
  };

  const addAssetToTimeline = (assetId: string) => {
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
    });
  };

  const deleteAsset = async (assetId: string) => {
    const asset = project.assets.find((a) => a.id === assetId);
    if (!asset) return;
    if (capabilities.opfs) await deleteAssetFile(asset.storageName);
    if (asset.objectUrl) URL.revokeObjectURL(asset.objectUrl);
    updateProject((p) => ({
      ...p,
      assets: p.assets.filter((a) => a.id !== assetId),
      tracks: p.tracks.map((t) => ({ ...t, clips: t.clips.filter((c) => c.assetId !== assetId && !clipUsesAsset(c, assetId)) })),
    }));
    if (selectedClip && (selectedClip.assetId === assetId || clipUsesAsset(selectedClip, assetId))) setSelectedClipId(null);
  };

  const removeSelectedClip = useCallback(() => {
    if (!selectedClipId) return;
    updateProject((p) => ({
      ...p,
      tracks: p.tracks.map((t) => ({ ...t, clips: t.clips.filter((c) => c.id !== selectedClipId) })),
    }));
    setSelectedClipId(null);
  }, [selectedClipId, updateProject]);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.matches('input, textarea, select')) return;
      if (e.code === 'Space') {
        e.preventDefault();
        setPlaying((v) => !v);
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedClipId) removeSelectedClip();
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [selectedClipId, removeSelectedClip]);

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
    const a = document.createElement('a');
    const url = URL.createObjectURL(blob);
    a.href = url;
    a.download = `${sanitize(project.name)}.sveproj.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    setSaveState('プロジェクトを書き出しました');
  };

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
        transform: { x: 0, y: 0, scale: 0.82, rotation: 0, opacity: 1 },
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
      });
      setSelectedClipId(zClip.id);
      setSaveState(`口パク ${cues.length} 点を生成`);
    } catch (error) {
      console.error(error);
      setSaveState('口パク生成エラー');
    } finally {
      setZBusy(false);
    }
  };

  return (
    <div className="appShell">
      <TopBar
        projectName={project.name}
        onProjectName={(name) => updateProject((p) => ({ ...p, name }))}
        onSave={manualSave}
        onExport={backupProject}
        capabilities={capabilities}
        saveState={saveState}
      />

      {!capabilities.opfs && (
        <div className="warningBar"><AlertTriangle size={16} />このブラウザではOPFSが利用できないため、素材の永続保存が制限されます。Chrome系ブラウザ推奨です。</div>
      )}

      <main className="editorGrid">
        <MediaLibrary assets={project.assets} onImport={importFiles} onAdd={addAssetToTimeline} onDelete={deleteAsset} />
        <div className="centerColumn">
          <Preview project={project} time={time} playing={playing} onTogglePlay={() => setPlaying((v) => !v)} onTime={(v) => setTime(Math.max(0, Math.min(project.duration, v)))} />
          <ZundamonPanel assets={project.assets} busy={zBusy} onGenerate={generateZundamon} />
          <EngineStatus capabilities={capabilities} storageText={storageText} />
        </div>
        <Inspector
          project={project}
          selectedClip={selectedClip}
          onProject={(patch) => updateProject((p) => ({ ...p, ...patch }))}
          onClip={(patch) => selectedClipId && updateClip(selectedClipId, patch)}
          onTransform={(key, value) => selectedClipId && selectedClip && updateClip(selectedClipId, { transform: { ...selectedClip.transform, [key]: value } })}
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
        onMoveClip={(id, start) => updateClip(id, { start })}
        onTrimClip={(id, duration) => updateClip(id, { duration })}
        onToggleMuteTrack={(id) => updateProject((p) => ({ ...p, tracks: p.tracks.map((t) => t.id === id ? { ...t, muted: !t.muted } : t) }))}
        onToggleLockTrack={(id) => updateProject((p) => ({ ...p, tracks: p.tracks.map((t) => t.id === id ? { ...t, locked: !t.locked } : t) }))}
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

function clipUsesAsset(clip: Clip, assetId: string) {
  const z = clip.zundamon;
  return Boolean(z && [z.closedAssetId, z.halfAssetId, z.openAssetId, z.blinkAssetId, z.audioAssetId].includes(assetId));
}

function sanitize(name: string) {
  return name.replace(/[\\/:*?"<>|]/g, '_').trim() || 'project';
}
