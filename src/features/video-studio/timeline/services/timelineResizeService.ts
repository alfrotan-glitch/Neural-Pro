import type { ClipNode, Track } from '../../project/types/project';

const MIN_TIMELINE_CLIP_DURATION = 0.05;
const DEFAULT_SPEED = 1;

export interface ResizeOptions {
  deltaTime: number;
  side: 'left' | 'right';
  preserveSourceRate?: boolean;
  minimumDuration?: number;
}

export interface ResizeResult {
  tracks: Track[];
  changed: boolean;
  durationByClipId: ReadonlyMap<string, number>;
}

function speedOf(clip: ClipNode): number {
  const raw = Number(clip.properties?.speed);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_SPEED;
}

function sourceTrimIn(clip: ClipNode): number {
  return Number.isFinite(clip.trim?.in) ? Math.max(0, Number(clip.trim.in)) : 0;
}

function sourceTrimOut(clip: ClipNode): number {
  return Number.isFinite(clip.trim?.out)
    ? Math.max(sourceTrimIn(clip), Number(clip.trim.out))
    : sourceTrimIn(clip) + clip.duration * speedOf(clip);
}

function isInfiniteStaticAsset(clip: ClipNode): boolean {
  if (clip.properties?.imageUrl) return true;
  if (clip.properties?.textContent !== undefined) return true;
  const laneRole = clip.properties?.timelineLaneRole;
  if (laneRole === 'image' || laneRole === 'text' || laneRole === 'caption' || laneRole === 'effect' || laneRole === 'sticker' || laneRole === 'subtitle') return true;
  const hasVideo = typeof clip.properties?.videoUrl === 'string' && clip.properties.videoUrl.trim().length > 0;
  const hasAudio = typeof clip.properties?.audioUrl === 'string' && clip.properties.audioUrl.trim().length > 0;
  const hasPersistedMediaDuration = [
    clip.properties?.sourceMediaDuration,
    clip.properties?.mediaDuration,
    clip.properties?.sourceDuration,
  ].some((value) => Number.isFinite(Number(value)) && Number(value) > 0);
  if (!hasVideo && !hasAudio && !hasPersistedMediaDuration) {
    return true;
  }
  return false;
}

function sourceMediaDuration(clip: ClipNode): number | null {
  if (isInfiniteStaticAsset(clip)) return null;
  const candidates = [
    clip.properties?.sourceMediaDuration,
    clip.properties?.mediaDuration,
    clip.properties?.sourceDuration,
  ];
  const candidate = candidates.find((value) => Number.isFinite(Number(value)) && Number(value) > 0);
  return candidate === undefined ? null : Number(candidate);
}

function isExternallySourcedMedia(clip: ClipNode): boolean {
  return Boolean(
    typeof clip.properties?.videoUrl === 'string' && clip.properties.videoUrl.trim(),
  ) || Boolean(
    typeof clip.properties?.audioUrl === 'string' && clip.properties.audioUrl.trim(),
  );
}

function resizeOneClip(clip: ClipNode, options: ResizeOptions): ClipNode {
  const speed = speedOf(clip);
  const minDuration = Math.max(MIN_TIMELINE_CLIP_DURATION, options.minimumDuration ?? MIN_TIMELINE_CLIP_DURATION);
  const sourceIn = sourceTrimIn(clip);
  const sourceOut = sourceTrimOut(clip);
  const mediaDuration = sourceMediaDuration(clip);
  // A current trim.out is not the media boundary. It only describes the clip's
  // present visible source window. If authoritative media duration is unknown,
  // do not falsely cap a custom resize at the current trim.out.
  const sourceAvailableEnd = mediaDuration !== null
    ? Math.max(sourceIn, mediaDuration)
    : null;
  const sourceAvailableTimeline = sourceAvailableEnd !== null
    ? Math.max(0, (sourceAvailableEnd - sourceIn) / speed)
    : Number.POSITIVE_INFINITY;
  const sourceBounded = mediaDuration !== null;

  if (options.side === 'right') {
    let nextDuration = Math.max(minDuration, clip.duration + options.deltaTime);
    if (sourceAvailableEnd !== null) {
      // If the current source position leaves less than the minimum legal
      // timeline duration, there is no valid right-resize target. Never commit
      // zero/negative duration merely to honor the media boundary.
      if (sourceAvailableTimeline < minDuration) return clip;
      nextDuration = Math.min(nextDuration, sourceAvailableTimeline);
      nextDuration = Math.max(minDuration, nextDuration);
    }
    if (nextDuration === clip.duration) return clip;

    const next = structuredClone(clip);
    next.duration = nextDuration;
    if (!next.trim) {
      next.trim = { in: sourceIn, out: sourceIn + nextDuration * speed };
    } else {
      next.trim.out = sourceIn + nextDuration * speed;
    }
    return next;
  }

  const requestedStart = clip.startAt + options.deltaTime;
  const nextStart = Math.max(0, Math.min(clip.startAt + clip.duration - minDuration, requestedStart));
  const actualDelta = nextStart - clip.startAt;
  const candidateTrimIn = Math.max(0, sourceIn + actualDelta * speed);
  const maxTrimIn = sourceBounded
    ? Math.max(0, sourceAvailableEnd! - minDuration * speed)
    : candidateTrimIn;
  const boundedTrimIn = sourceBounded
    ? Math.min(candidateTrimIn, maxTrimIn)
    : candidateTrimIn;
  const boundedActualDelta = (boundedTrimIn - sourceIn) / speed;
  let nextDuration = Math.max(minDuration, clip.duration - boundedActualDelta);
  if (sourceBounded && sourceAvailableEnd !== null) nextDuration = Math.min(nextDuration, Math.max(minDuration, (sourceAvailableEnd - boundedTrimIn) / speed));

  const next = structuredClone(clip);
  next.startAt = Math.max(0, clip.startAt + boundedActualDelta);
  next.duration = nextDuration;
  if (!next.trim) {
    next.trim = { in: boundedTrimIn, out: boundedTrimIn + nextDuration * speed };
  } else {
    next.trim.in = boundedTrimIn;
    next.trim.out = next.trim.in + nextDuration * speed;
  }
  return next;
}

export function resizeSelectedClips(
  tracks: readonly Track[],
  selectedClipIds: readonly string[],
  options: ResizeOptions,
): ResizeResult {
  const selected = new Set(selectedClipIds);
  const durationByClipId = new Map<string, number>();
  let changed = false;

  const nextTracks = tracks.map((track) => {
    if (track.isLocked) return { ...track, clips: track.clips.map((clip) => structuredClone(clip)) };
    const clips = track.clips.map((clip) => {
      if (!selected.has(clip.id)) return structuredClone(clip);
      const resized = resizeOneClip(clip, options);
      durationByClipId.set(clip.id, resized.duration);
      if (resized.startAt !== clip.startAt || resized.duration !== clip.duration || resized.trim.in !== clip.trim.in || resized.trim.out !== clip.trim.out) {
        changed = true;
      }
      return resized;
    });
    return { ...track, clips };
  });

  return { tracks: nextTracks, changed, durationByClipId };
}
