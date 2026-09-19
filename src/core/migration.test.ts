import { describe, expect, it } from 'vitest';
import { migrateProject } from './migration';

describe('migrateProject', () => {
  it('migrates a minimal v1 project to the current schema with safe defaults', () => {
    const project = migrateProject({
      version: 1,
      id: 'legacy-project',
      name: 'Legacy',
      width: 1280,
      height: 720,
      fps: 60,
      duration: 12,
      assets: [
        {
          id: 'asset-1',
          name: 'clip.mp4',
          kind: 'video',
          mime: 'video/mp4',
          size: 1000,
          duration: 4,
          storageName: 'asset-1.mp4',
          tags: ['B-roll', 'game'],
          rating: 99,
          favorite: true,
          notes: 'usable shot',
        },
      ],
      audioBuses: [
        { id: 'master', gain: 2, muted: false },
        { id: 'voice', gain: 0.5, muted: true },
        { id: 'voice', gain: 3, muted: false },
        { id: 'invalid', gain: 1, muted: false },
      ],
      audioDucking: {
        enabled: true,
        sourceBus: 'voice',
        targetBus: 'music',
        reductionDb: -99,
        attack: 9,
        release: -2,
      },
      tracks: [
        {
          id: 'track-1',
          name: 'Video',
          kind: 'video',
          gain: 99,
          pan: -99,
          busId: 'voice',
          clips: [
            {
              id: 'clip-1',
              name: 'Clip',
              assetId: 'asset-1',
              start: 1,
              duration: 3,
              inPoint: 0.5,
              volume: 0.8,
              transform: { x: 12, y: -4, scale: 1.2, rotation: 5, opacity: 0.75 },
            },
          ],
        },
      ],
    });

    expect(project.version).toBe(2);
    expect(project.id).toBe('legacy-project');
    expect(project.markers).toEqual([]);
    expect(project.exportSettings).toBeUndefined();
    expect(project.assets[0]).toMatchObject({
      tags: ['B-roll', 'game'],
      rating: 5,
      favorite: true,
      notes: 'usable shot',
    });
    expect(project.audioBuses).toEqual([
      { id: 'master', gain: 2, muted: false },
      { id: 'voice', gain: 0.5, muted: true },
    ]);
    expect(project.audioDucking).toEqual({
      enabled: true,
      sourceBus: 'voice',
      targetBus: 'music',
      reductionDb: -36,
      attack: 2,
      release: 0,
    });
    expect(project.tracks[0]).toMatchObject({
      muted: false,
      locked: false,
      visible: true,
      solo: false,
      gain: 4,
      pan: -1,
      busId: 'voice',
    });
    expect(project.tracks[0].clips[0]).toMatchObject({
      id: 'clip-1',
      kind: 'asset',
      start: 1,
      duration: 3,
      inPoint: 0.5,
      volume: 0.8,
      muted: false,
      transform: {
        x: 12,
        y: -4,
        scale: 1.2,
        rotation: 5,
        opacity: 0.75,
      },
    });
  });

  it('preserves valid export settings and normalizes clip fades', () => {
    const project = migrateProject({
      version: 2,
      width: 1920,
      height: 1080,
      fps: 30,
      duration: 10,
      assets: [],
      exportSettings: {
        container: 'webm',
        outputHeight: 2160,
        quality: 'high',
        includeAudio: false,
      },
      tracks: [{
        kind: 'audio',
        clips: [{
          id: 'clip',
          kind: 'asset',
          name: 'voice',
          start: 0,
          duration: 4,
          inPoint: 0,
          volume: 1,
          muted: false,
          fadeIn: -3,
          fadeOut: 99,
          freezeFrameAt: -2,
          transitionIn: { kind: 'dissolve', duration: 99 },
          transitionOut: { kind: 'dip-black', duration: 1 },
          transform: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 },
        }],
      }],
    });

    expect(project.exportSettings).toEqual({
      container: 'webm',
      outputHeight: 2160,
      quality: 'high',
      includeAudio: false,
    });
    expect(project.tracks[0].clips[0]).toMatchObject({
      fadeIn: 0,
      fadeOut: 4,
      freezeFrameAt: 0,
      transitionIn: { kind: 'dissolve', duration: 4 },
    });
    expect(project.tracks[0].clips[0].transitionOut).toEqual({ kind: 'dip-black', duration: 1 });
  });

  it('drops invalid bus assignments and malformed bus lists safely', () => {
    const project = migrateProject({
      version: 2,
      assets: [],
      audioBuses: [{ id: 'unknown', gain: 9 }, null],
      tracks: [{ kind: 'audio', busId: 'unknown', clips: [] }],
    });
    expect(project.audioBuses).toBeUndefined();
    expect(project.audioDucking).toBeUndefined();
    expect(project.tracks[0].busId).toBeUndefined();
  });

  it('drops unknown export settings instead of trusting invalid persisted values', () => {
    const project = migrateProject({
      version: 2,
      assets: [],
      tracks: [],
      exportSettings: {
        container: 'avi',
        outputHeight: 'not-a-number',
        quality: 'ultra',
        includeAudio: 'yes',
      },
    });
    expect(project.exportSettings).toBeUndefined();
  });

  it('clamps unsafe numeric values while preserving valid optional metadata', () => {
    const project = migrateProject({
      version: 2,
      fps: 999,
      width: 0,
      height: -20,
      duration: 0,
      assets: [],
      tracks: [
        {
          kind: 'video',
          clips: [
            {
              id: 'clip',
              kind: 'asset',
              name: 'Clip',
              start: -10,
              duration: 0,
              inPoint: -5,
              volume: -2,
              muted: false,
              transform: { x: 0, y: 0, scale: -1, rotation: 0, opacity: 7, anchorX: 0.25, anchorY: 0.75 },
            },
          ],
        },
      ],
      markers: [{ id: 'm', time: -3, duration: 2, name: 'Marker' }],
    });

    expect(project.fps).toBe(240);
    expect(project.width).toBe(1);
    expect(project.height).toBe(1);
    expect(project.duration).toBe(0.1);
    expect(project.tracks[0].clips[0]).toMatchObject({
      start: 0,
      duration: 0.1,
      inPoint: 0,
      volume: 0,
      transform: { scale: 0, opacity: 1, anchorX: 0.25, anchorY: 0.75 },
    });
    expect(project.markers?.[0]).toMatchObject({ time: 0, duration: 2 });
  });

  it('migrates asset bins and clears dangling asset assignments', () => {
    const project = migrateProject({
      version: 2,
      assets: [
        { id: 'a', name: 'A', kind: 'video', mime: 'video/mp4', size: 1, duration: 1, storageName: 'a.mp4', binId: 'bin-a' },
        { id: 'b', name: 'B', kind: 'audio', mime: 'audio/wav', size: 1, duration: 1, storageName: 'b.wav', binId: 'missing' },
      ],
      assetBins: [
        { id: 'bin-a', name: '  B-roll   Main ' },
        { id: 'bin-a', name: 'duplicate id' },
        { id: 'bin-b', name: 'B-roll Main' },
      ],
      tracks: [],
    });

    expect(project.assetBins).toEqual([{ id: 'bin-a', name: 'B-roll Main' }]);
    expect(project.assets[0].binId).toBe('bin-a');
    expect(project.assets[1].binId).toBeUndefined();
  });

  it('sanitizes persisted transcript documents during migration', () => {
    const project = migrateProject({
      version: 2,
      assets: [],
      tracks: [],
      transcript: {
        id: 'transcript',
        source: 'stt',
        language: ' ja-JP ',
        updatedAt: '2026-01-01T00:00:00.000Z',
        segments: [
          {
            id: 'segment',
            start: -3,
            end: 4,
            text: '  speech text  ',
            speaker: '  narrator ',
            words: [
              { text: 'speech', start: -2, end: 1, confidence: 9 },
              { text: '', start: 1, end: 2 },
            ],
          },
          { id: 'invalid', start: 5, end: 5, text: 'drop me' },
        ],
      },
    });

    expect(project.transcript).toMatchObject({
      id: 'transcript',
      source: 'stt',
      language: 'ja-JP',
      segments: [{
        id: 'segment',
        start: 0,
        end: 4,
        text: 'speech text',
        speaker: 'narrator',
      }],
    });
    expect(project.transcript?.segments[0].words).toEqual([
      { text: 'speech', start: 0, end: 1, confidence: 1 },
    ]);
  });

  it('rejects unsupported future project versions instead of silently corrupting them', () => {
    expect(() => migrateProject({ version: 99 })).toThrow('Unsupported project version: 99');
  });

  it('rejects non-object project payloads', () => {
    expect(() => migrateProject(null)).toThrow('Project is not an object');
    expect(() => migrateProject([])).toThrow('Project is not an object');
  });
  it('sanitizes persisted clip masks during migration', () => {
    const project = migrateProject({
      version: 2,
      assets: [],
      tracks: [{
        kind: 'video',
        clips: [{
          id: 'clip',
          kind: 'asset',
          name: 'masked',
          start: 0,
          duration: 5,
          inPoint: 0,
          volume: 1,
          muted: false,
          transform: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 },
          masks: [
            { id: 'r', kind: 'rectangle', x: -2, y: 0.25, width: 5, height: 0.5 },
            { id: 'e', kind: 'ellipse', x: 0.8, y: 0.9, width: 1, height: 1 },
            { id: 'bad', kind: 'polygon', x: 0, y: 0, width: 1, height: 1 },
          ],
        }],
      }],
    });

    const masks = project.tracks[0].clips[0].masks;
    expect(masks?.[0]).toEqual({ id: 'r', kind: 'rectangle', x: 0, y: 0.25, width: 1, height: 0.5 });
    expect(masks?.[1]).toMatchObject({ id: 'e', kind: 'ellipse', x: 0.8, y: 0.9 });
    expect(masks?.[1].width).toBeCloseTo(0.2, 10);
    expect(masks?.[1].height).toBeCloseTo(0.1, 10);
  });

});
