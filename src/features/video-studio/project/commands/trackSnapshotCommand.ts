import { generateUUID } from '../../../../lib/uuid';
import type { Track, ProjectState } from '../types/project';
import type { Command } from '../../../../core/commands/types';
import { assertValidTimelineTracks } from '../validation';

/** Generic project-level snapshot command used when a compound UI action changes tracks. */
export class TrackSnapshotCommand implements Command {
  private readonly previousTracks: Track[];
  private readonly nextTracks: Track[];
  readonly id = generateUUID();

  constructor(
    public readonly name: string,
    previousTracks: readonly Track[],
    nextTracks: readonly Track[],
  ) {
    this.previousTracks = [...structuredClone(previousTracks)];
    this.nextTracks = [...structuredClone(nextTracks)];
  }

  execute(state: ProjectState): ProjectState {
    assertValidTimelineTracks(this.nextTracks);
    return {
      ...state,
      tracks: [...structuredClone(this.nextTracks)],
    };
  }

  undo(state: ProjectState): ProjectState {
    assertValidTimelineTracks(this.previousTracks);
    return {
      ...state,
      tracks: [...structuredClone(this.previousTracks)],
    };
  }
}

export function createTrackSnapshotCommand(
  name: string,
  previousTracks: readonly Track[],
  nextTracks: readonly Track[],
): TrackSnapshotCommand {
  return new TrackSnapshotCommand(
    name,
    structuredClone(previousTracks),
    structuredClone(nextTracks),
  );
}
