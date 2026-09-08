import type { ProjectId } from './identity';
import type { Seconds } from './time';
import { clampToDuration } from './time';
import type { Fps } from './fps';
import { normalizeFps, DEFAULT_FPS } from './fps';
import type { Size } from './geometry';
import type { CanonicalTrack, PersistedTrack } from './track';
import { normalizeTracks } from './track';
import { calculateProjectDuration } from './duration';

/**
 * Canonical project.
 *
 * `totalDuration` is **derived** and is recomputed by every mutator in this
 * module. INV-001: no caller may write it independently — `withCurrentTime`
 * and `withTracks` both recompute it, which is why there is no
 * `setTotalDuration` on this type at all.
 */

export interface Composition {
  readonly size: Size;
  readonly fps: Fps;
}

export interface PersistedProject {
  readonly id: ProjectId;
  readonly title: string;
  readonly composition: Composition;
  readonly tracks: readonly PersistedTrack[];
  readonly currentTime: Seconds;
}

export interface CanonicalProject {
  readonly id: ProjectId;
  readonly title: string;
  readonly composition: Composition;
  readonly tracks: readonly CanonicalTrack[];
  readonly currentTime: Seconds;
  /** DERIVED — `calculateProjectDuration(tracks)`. Never written independently. */
  readonly totalDuration: Seconds;
}

function normalizeComposition(composition: Composition | null | undefined): Composition {
  const width = Number(composition?.size?.width);
  const height = Number(composition?.size?.height);
  return {
    size: {
      width: Number.isFinite(width) && width > 0 ? width : 1920,
      height: Number.isFinite(height) && height > 0 ? height : 1080,
    },
    fps: composition ? normalizeFps(composition.fps, DEFAULT_FPS) : DEFAULT_FPS,
  };
}

/** Total: builds a valid project from any persisted (or legacy) input. */
export function normalizeProject(project: PersistedProject): CanonicalProject {
  const tracks = normalizeTracks(project.tracks ?? []);
  const totalDuration = calculateProjectDuration(tracks);
  return {
    id: project.id,
    title: typeof project.title === 'string' ? project.title : '',
    composition: normalizeComposition(project.composition),
    tracks,
    currentTime: clampToDuration(project.currentTime, totalDuration),
    totalDuration,
  };
}

/** Replace the tracks and recompute every derived value. */
export function withTracks(project: CanonicalProject, tracks: readonly CanonicalTrack[]): CanonicalProject {
  const totalDuration = calculateProjectDuration(tracks);
  return {
    ...project,
    tracks,
    totalDuration,
    currentTime: clampToDuration(project.currentTime, totalDuration),
  };
}

/** Move the playhead. Out-of-range values clamp; the duration is never changed. */
export function withCurrentTime(project: CanonicalProject, time: unknown): CanonicalProject {
  return { ...project, currentTime: clampToDuration(time, project.totalDuration) };
}

/** Every clip in the project, in track order. */
export function allClips(project: CanonicalProject) {
  return project.tracks.flatMap((track) => track.clips);
}

export function clipCount(project: CanonicalProject): number {
  return project.tracks.reduce((total, track) => total + track.clips.length, 0);
}
