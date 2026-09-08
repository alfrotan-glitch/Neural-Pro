import type { ProjectState } from '../types/project';
import { calculateProjectDuration } from '../../../../core/engine/projectDuration';
import { validateTimelineTracks } from './timelineInvariants';

const EPSILON = 1e-6;

export interface ProjectStateValidationResult {
  valid: boolean;
  errors: string[];
}

function isFinitePositive(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function nearlyEqual(a: number, b: number): boolean {
  return Math.abs(a - b) <= EPSILON;
}

/**
 * Reconciles UI selection against the canonical clip set after a project mutation.
 * Selection is editor state, not an editable timeline entity, so removed clip ids
 * must be discarded at the same transaction boundary as the track mutation.
 */
export function normalizeSelectedNodeIds(
  tracks: readonly { clips: readonly { id: string }[] }[],
  selectedNodeIds: readonly string[],
): string[] {
  const knownClipIds = new Set(tracks.flatMap((track) => track.clips.map((clip) => clip.id)));
  const seen = new Set<string>();

  return selectedNodeIds.filter((id): id is string => {
    if (typeof id !== 'string' || !knownClipIds.has(id) || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

export function validateProjectState(state: ProjectState): ProjectStateValidationResult {
  const errors: string[] = [];

  if (!state || typeof state !== 'object') {
    return { valid: false, errors: ['Project state must be an object'] };
  }

  if (typeof state.projectId !== 'string' || state.projectId.trim() === '') {
    errors.push('projectId is required');
  }

  if (!state.metadata || typeof state.metadata !== 'object') {
    errors.push('metadata is required');
  } else {
    if (typeof state.metadata.title !== 'string') errors.push('metadata.title must be a string');
    if (!isFinitePositive(state.metadata.resolution?.width)) errors.push('metadata.resolution.width must be > 0');
    if (!isFinitePositive(state.metadata.resolution?.height)) errors.push('metadata.resolution.height must be > 0');
    if (!isFinitePositive(state.metadata.fps)) errors.push('metadata.fps must be > 0');
  }

  const timeline = validateTimelineTracks(state.tracks);
  errors.push(...timeline.errors);

  const actualDuration = calculateProjectDuration(state.tracks ?? []);
  if (typeof state.totalDuration !== 'number' || !Number.isFinite(state.totalDuration) || state.totalDuration < 0) {
    errors.push('totalDuration must be a finite number >= 0');
  } else if (!nearlyEqual(state.totalDuration, actualDuration)) {
    errors.push(`totalDuration ${state.totalDuration} does not match timeline duration ${actualDuration}`);
  }

  if (typeof state.currentTime !== 'number' || !Number.isFinite(state.currentTime)) {
    errors.push('currentTime must be finite');
  } else if (state.currentTime < -EPSILON || state.currentTime > state.totalDuration + EPSILON) {
    errors.push(`currentTime ${state.currentTime} is outside project duration ${state.totalDuration}`);
  }

  if (!Array.isArray(state.selectedNodeIds)) {
    errors.push('selectedNodeIds must be an array');
  } else {
    const knownClipIds = new Set((state.tracks ?? []).flatMap((track) => track.clips.map((clip) => clip.id)));
    for (const id of state.selectedNodeIds) {
      if (typeof id !== 'string' || !knownClipIds.has(id)) {
        errors.push(`selectedNodeIds contains unknown clip: ${String(id)}`);
      }
    }
  }

  if (typeof state.isPlaying !== 'boolean') errors.push('isPlaying must be boolean');

  return { valid: errors.length === 0, errors };
}

export function assertValidProjectState(state: ProjectState): void {
  const result = validateProjectState(state);
  if (!result.valid) throw new Error(`Invalid project state:\n${result.errors.join('\n')}`);
}
