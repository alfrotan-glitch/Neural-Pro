import { generateUUID } from '../../../../lib/uuid';
import type { ClipNode, ProjectState, UUID } from '../types/project';
import type { Command } from '../../../../core/commands/types';
import { assertClipsEditable } from '../validation';

export interface PropertySnapshot {
  present: boolean;
  value?: unknown;
}

type ClipPropertySnapshots = Record<UUID, PropertySnapshot>;

function cloneValue<T>(value: T): T {
  return structuredClone(value);
}

function valuesEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  try {
    return JSON.stringify(left) === JSON.stringify(right);
  } catch {
    return false;
  }
}

function pathSegments(path: string): string[] {
  return path.split('.').map((segment) => segment.trim()).filter(Boolean);
}

function readPath(clip: ClipNode, path: string): PropertySnapshot {
  const segments = pathSegments(path);
  if (segments.length === 0) return { present: false };

  let cursor: unknown = clip;
  for (const segment of segments) {
    if (cursor === null || typeof cursor !== 'object' || !(segment in cursor)) {
      return { present: false };
    }
    cursor = (cursor as Record<string, unknown>)[segment];
  }

  return { present: true, value: cloneValue(cursor) };
}

function writePath(
  clip: ClipNode,
  path: string,
  snapshot: PropertySnapshot,
): ClipNode {
  const segments = pathSegments(path);
  if (segments.length === 0) return clip;

  const nextClip = cloneValue(clip);
  let cursor = nextClip as unknown as Record<string, unknown>;

  for (let index = 0; index < segments.length - 1; index += 1) {
    const segment = segments[index];
    if (segment === undefined) break;
    const current = cursor[segment];
    cursor[segment] = current && typeof current === 'object' ? cloneValue(current) : {};
    cursor = cursor[segment] as Record<string, unknown>;
  }

  const leaf = segments[segments.length - 1];
  if (leaf === undefined) return nextClip;
  if (snapshot.present) cursor[leaf] = cloneValue(snapshot.value);
  else delete cursor[leaf];

  return nextClip;
}

function updateClips(
  state: ProjectState,
  snapshots: ClipPropertySnapshots,
  path: string,
): ProjectState {
  return {
    ...state,
    tracks: state.tracks.map((track) => ({
      ...track,
      clips: track.clips.map((clip) => {
        const snapshot = snapshots[clip.id];
        return snapshot ? writePath(clip, path, snapshot) : clip;
      }),
    })),
  };
}

export function buildPropertySnapshots(
  clips: readonly ClipNode[],
  path: string,
  nextValue: unknown,
): { previous: ClipPropertySnapshots; next: ClipPropertySnapshots } {
  const previous: ClipPropertySnapshots = {};
  const next: ClipPropertySnapshots = {};

  for (const clip of clips) {
    const current = readPath(clip, path);
    if (current.present && valuesEqual(current.value, nextValue)) continue;

    previous[clip.id] = current;
    next[clip.id] = { present: true, value: cloneValue(nextValue) };
  }

  return { previous, next };
}

export class UpdateClipPropertiesCommand implements Command {
  private readonly previousSnapshots: ClipPropertySnapshots;
  private readonly nextSnapshots: ClipPropertySnapshots;
  readonly id = generateUUID();
  readonly name = 'Update Clip Properties';

  constructor(
    private readonly path: string,
    previousSnapshots: ClipPropertySnapshots,
    nextSnapshots: ClipPropertySnapshots,
  ) {
    this.previousSnapshots = cloneValue(previousSnapshots);
    this.nextSnapshots = cloneValue(nextSnapshots);
  }

  execute(state: ProjectState): ProjectState {
    assertClipsEditable(state.tracks, this.affectedClipIds);
    return updateClips(state, this.nextSnapshots, this.path);
  }

  undo(state: ProjectState): ProjectState {
    return updateClips(state, this.previousSnapshots, this.path);
  }

  get affectedClipIds(): UUID[] {
    return Object.keys(this.nextSnapshots);
  }

  get isNoop(): boolean {
    return Object.keys(this.nextSnapshots).length === 0;
  }
}
