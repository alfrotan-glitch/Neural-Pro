import type { Track, ClipNode } from '../types/project';

export interface TimelineValidationResult {
  valid: boolean;
  errors: string[];
}

const TRACK_TYPES = new Set<Track['type']>(['video', 'audio', 'text', 'effect']);

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function validateClip(clip: ClipNode, trackId: string, seenIds: Set<string>, errors: string[]): void {
  if (!clip || typeof clip !== 'object') {
    errors.push(`Track ${trackId}: clip must be an object`);
    return;
  }

  if (typeof clip.id !== 'string' || clip.id.trim() === '') {
    errors.push(`Track ${trackId}: clip id is required`);
  } else if (seenIds.has(clip.id)) {
    errors.push(`Duplicate clip id: ${clip.id}`);
  }
  if (typeof clip.id === 'string' && clip.id.trim() !== '') seenIds.add(clip.id);

  if (typeof clip.sourceId !== 'string' || clip.sourceId.trim() === '') {
    errors.push(`Clip ${clip.id || '<unknown>'}: sourceId is required`);
  }

  if (!isFiniteNumber(clip.startAt) || clip.startAt < 0) {
    errors.push(`Clip ${clip.id}: startAt must be a finite number >= 0`);
  }
  if (!isFiniteNumber(clip.duration) || clip.duration <= 0) {
    errors.push(`Clip ${clip.id}: duration must be a finite number > 0`);
  }

  if (!clip.trim || typeof clip.trim !== 'object') {
    errors.push(`Clip ${clip.id}: trim is required`);
  } else {
    if (!isFiniteNumber(clip.trim.in) || !isFiniteNumber(clip.trim.out)) {
      errors.push(`Clip ${clip.id}: trim values must be finite numbers`);
    } else {
      if (clip.trim.in < 0) errors.push(`Clip ${clip.id}: trim.in must be >= 0`);
      if (clip.trim.out <= clip.trim.in) errors.push(`Clip ${clip.id}: trim.out must be > trim.in`);
    }
  }

  if (!clip.transform || typeof clip.transform !== 'object') {
    errors.push(`Clip ${clip.id}: transform is required`);
  } else {
    if (!isFiniteNumber(clip.transform.x)) errors.push(`Clip ${clip.id}: transform.x must be finite`);
    if (!isFiniteNumber(clip.transform.y)) errors.push(`Clip ${clip.id}: transform.y must be finite`);
    if (!isFiniteNumber(clip.transform.scale) || clip.transform.scale <= 0) {
      errors.push(`Clip ${clip.id}: transform.scale must be finite and > 0`);
    }
    if (clip.transform.scaleX !== undefined && (!isFiniteNumber(clip.transform.scaleX) || clip.transform.scaleX <= 0)) {
      errors.push(`Clip ${clip.id}: transform.scaleX must be finite and > 0`);
    }
    if (clip.transform.scaleY !== undefined && (!isFiniteNumber(clip.transform.scaleY) || clip.transform.scaleY <= 0)) {
      errors.push(`Clip ${clip.id}: transform.scaleY must be finite and > 0`);
    }
    if (!isFiniteNumber(clip.transform.rotation)) errors.push(`Clip ${clip.id}: transform.rotation must be finite`);
    if (clip.transform.opacity !== undefined &&
      (!isFiniteNumber(clip.transform.opacity) || clip.transform.opacity < 0 || clip.transform.opacity > 100)) {
      errors.push(`Clip ${clip.id}: transform.opacity must be between 0 and 100`);
    }
  }

  if (!clip.properties || typeof clip.properties !== 'object' || Array.isArray(clip.properties)) {
    errors.push(`Clip ${clip.id}: properties must be an object`);
  }
}

export function validateTimelineTracks(tracks: readonly Track[]): TimelineValidationResult {
  const errors: string[] = [];
  const trackIds = new Set<string>();
  const clipIds = new Set<string>();

  if (!Array.isArray(tracks)) return { valid: false, errors: ['tracks must be an array'] };

  for (const track of tracks) {
    if (!track || typeof track !== 'object') {
      errors.push('Track must be an object');
      continue;
    }

    if (typeof track.id !== 'string' || track.id.trim() === '') {
      errors.push('Track id is required');
    } else if (trackIds.has(track.id)) {
      errors.push(`Duplicate track id: ${track.id}`);
    }
    if (typeof track.id === 'string' && track.id.trim() !== '') trackIds.add(track.id);

    if (!TRACK_TYPES.has(track.type)) errors.push(`Track ${track.id}: invalid track type`);
    if (typeof track.isLocked !== 'boolean') errors.push(`Track ${track.id}: isLocked must be boolean`);
    if (typeof track.isMuted !== 'boolean') errors.push(`Track ${track.id}: isMuted must be boolean`);
    if (typeof track.isVisible !== 'boolean') errors.push(`Track ${track.id}: isVisible must be boolean`);
    if (track.isCollapsed !== undefined && typeof track.isCollapsed !== 'boolean') {
      errors.push(`Track ${track.id}: isCollapsed must be boolean when present`);
    }

    if (!Array.isArray(track.clips)) {
      errors.push(`Track ${track.id}: clips must be an array`);
      continue;
    }

    for (const clip of track.clips) validateClip(clip, track.id, clipIds, errors);
  }

  return { valid: errors.length === 0, errors };
}

export function assertValidTimelineTracks(tracks: readonly Track[]): void {
  const result = validateTimelineTracks(tracks);
  if (!result.valid) throw new Error(`Invalid timeline mutation:\n${result.errors.join('\n')}`);
}

export function findClipTrack(tracks: readonly Track[], clipId: string): Track | undefined {
  return tracks.find((track) => track.clips.some((clip) => clip.id === clipId));
}

export function assertClipEditable(tracks: readonly Track[], clipId: string): void {
  const track = findClipTrack(tracks, clipId);
  if (!track) throw new Error(`Cannot edit missing clip: ${clipId}`);
  if (track.isLocked) throw new Error(`Cannot edit clip ${clipId}: track ${track.id} is locked`);
}

export function assertClipsEditable(tracks: readonly Track[], clipIds: readonly string[]): void {
  for (const clipId of clipIds) assertClipEditable(tracks, clipId);
}

export function assertTrackEditable(tracks: readonly Track[], trackId: string): void {
  const track = tracks.find((candidate) => candidate.id === trackId);
  if (!track) throw new Error(`Cannot edit missing track: ${trackId}`);
  if (track.isLocked) throw new Error(`Cannot edit track ${trackId}: track is locked`);
}
