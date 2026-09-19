import type { Project } from '../types/editor';

export type ProjectSearchResultKind = 'asset' | 'clip' | 'track' | 'marker' | 'bin' | 'transcript';

export interface ProjectSearchResult {
  id: string;
  kind: ProjectSearchResultKind;
  title: string;
  subtitle: string;
  score: number;
  time?: number;
  clipId?: string;
  trackId?: string;
  assetId?: string;
  binId?: string;
  transcriptSegmentId?: string;
}

export function searchProject(project: Project, query: string, limit = 60): ProjectSearchResult[] {
  const tokens = tokenize(query);
  if (tokens.length === 0) return [];

  const results: ProjectSearchResult[] = [];
  const binsById = new Map((project.assetBins ?? []).map((bin) => [bin.id, bin.name]));

  for (const bin of project.assetBins ?? []) {
    pushMatch(results, tokens, {
      id: `bin:${bin.id}`,
      kind: 'bin',
      title: bin.name,
      subtitle: '素材ビン',
      binId: bin.id,
    }, [bin.name, '素材ビン', 'bin']);
  }

  for (const asset of project.assets) {
    const binName = asset.binId ? binsById.get(asset.binId) ?? '' : '';
    pushMatch(results, tokens, {
      id: `asset:${asset.id}`,
      kind: 'asset',
      title: asset.name,
      subtitle: [asset.kind, binName, ...(asset.tags ?? [])].filter(Boolean).join(' · '),
      assetId: asset.id,
    }, [
      asset.name,
      asset.kind,
      binName,
      ...(asset.tags ?? []),
      asset.notes ?? '',
      asset.favorite ? 'favorite お気に入り' : '',
    ]);
  }

  for (const [trackIndex, track] of project.tracks.entries()) {
    pushMatch(results, tokens, {
      id: `track:${track.id}`,
      kind: 'track',
      title: track.name,
      subtitle: `${track.kind} track · ${track.clips.length} clips`,
      trackId: track.id,
      time: track.clips.length ? Math.min(...track.clips.map((clip) => clip.start)) : undefined,
    }, [track.name, track.kind, 'track トラック']);

    for (const clip of track.clips) {
      const asset = clip.assetId ? project.assets.find((item) => item.id === clip.assetId) : undefined;
      const content = clip.text?.text ?? clip.subtitle?.text ?? '';
      const effectKinds = (clip.effects ?? []).map((effect) => effect.kind);
      pushMatch(results, tokens, {
        id: `clip:${clip.id}`,
        kind: 'clip',
        title: clip.name || content || `Clip ${trackIndex + 1}`,
        subtitle: [track.name, content && content !== clip.name ? content : '', asset?.name ?? '', ...effectKinds]
          .filter(Boolean)
          .join(' · '),
        clipId: clip.id,
        trackId: track.id,
        assetId: clip.assetId,
        time: clip.start,
      }, [
        clip.name,
        clip.kind,
        content,
        asset?.name ?? '',
        track.name,
        ...effectKinds,
        clip.subtitle?.speaker ?? '',
      ]);
    }
  }

  for (const marker of project.markers ?? []) {
    pushMatch(results, tokens, {
      id: `marker:${marker.id}`,
      kind: 'marker',
      title: marker.name,
      subtitle: [formatTime(marker.time), marker.note ?? ''].filter(Boolean).join(' · '),
      time: marker.time,
    }, [marker.name, marker.note ?? '', 'marker マーカー']);
  }

  for (const segment of project.transcript?.segments ?? []) {
    const title = compactTranscriptTitle(segment.text);
    pushMatch(results, tokens, {
      id: `transcript:${segment.id}`,
      kind: 'transcript',
      title,
      subtitle: [segment.speaker ?? '', formatTime(segment.start), segment.text !== title ? segment.text : '']
        .filter(Boolean)
        .join(' · '),
      time: segment.start,
      transcriptSegmentId: segment.id,
    }, [
      segment.text,
      segment.speaker ?? '',
      ...(segment.words ?? []).map((word) => word.text),
      'transcript transcript トランスクリプト 書き起こし',
    ]);
  }

  return results
    .sort((a, b) => b.score - a.score || kindPriority(a.kind) - kindPriority(b.kind) || a.title.localeCompare(b.title, 'ja'))
    .slice(0, Math.max(1, Math.min(200, Math.round(limit))));
}

function pushMatch(
  results: ProjectSearchResult[],
  tokens: string[],
  result: Omit<ProjectSearchResult, 'score'>,
  fields: string[],
) {
  const normalizedFields = fields.map(normalize).filter(Boolean);
  const title = normalize(result.title);
  let score = 0;

  for (const token of tokens) {
    let best = 0;
    if (title === token) best = 120;
    else if (title.startsWith(token)) best = 90;
    else if (title.includes(token)) best = 70;

    for (const field of normalizedFields) {
      if (field === token) best = Math.max(best, 80);
      else if (field.startsWith(token)) best = Math.max(best, 55);
      else if (field.includes(token)) best = Math.max(best, 35);
    }
    if (best === 0) return;
    score += best;
  }

  score += Math.max(0, 12 - result.title.length * 0.05);
  results.push({ ...result, score });
}

function tokenize(value: string) {
  return normalize(value).split(/\s+/).filter(Boolean).slice(0, 8);
}

function normalize(value: string) {
  return value.normalize('NFKC').trim().toLocaleLowerCase('ja');
}

function kindPriority(kind: ProjectSearchResultKind) {
  if (kind === 'clip') return 0;
  if (kind === 'transcript') return 1;
  if (kind === 'marker') return 2;
  if (kind === 'asset') return 3;
  if (kind === 'track') return 4;
  return 5;
}

function compactTranscriptTitle(value: string) {
  const singleLine = value.replace(/\s+/g, ' ').trim();
  return singleLine.length > 72 ? `${singleLine.slice(0, 69)}…` : singleLine;
}

function formatTime(value: number) {
  const safe = Math.max(0, Number.isFinite(value) ? value : 0);
  const minutes = Math.floor(safe / 60);
  const seconds = safe - minutes * 60;
  return `${String(minutes).padStart(2, '0')}:${seconds.toFixed(2).padStart(5, '0')}`;
}
