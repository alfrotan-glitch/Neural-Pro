import { generateUUID } from '../../../../lib/uuid';
import type { Command } from '../../../../core/commands/types';
import type { ProjectState, Track } from '../types/project';

export type TrackStateProperty = 'visible' | 'locked' | 'muted' | 'collapsed';

function mapTrackState(track: Track, property: TrackStateProperty, value: boolean): Track {
  if (property === 'visible') return { ...track, isVisible: value };
  if (property === 'locked') return { ...track, isLocked: value };
  if (property === 'muted') return { ...track, isMuted: value };
  return { ...track, isCollapsed: value };
}

export class UpdateTrackStateCommand implements Command {
  readonly id = generateUUID();
  readonly name: string;

  constructor(
    private readonly trackId: string,
    private readonly property: TrackStateProperty,
    private readonly previousValue: boolean,
    private readonly nextValue: boolean,
  ) {
    this.name = `${nextValue ? 'Enable' : 'Disable'} Track ${property}`;
  }

  execute(state: ProjectState): ProjectState {
    return {
      ...state,
      tracks: state.tracks.map((track) =>
        track.id === this.trackId
          ? mapTrackState(track, this.property, this.nextValue)
          : track,
      ),
    };
  }

  undo(state: ProjectState): ProjectState {
    return {
      ...state,
      tracks: state.tracks.map((track) =>
        track.id === this.trackId
          ? mapTrackState(track, this.property, this.previousValue)
          : track,
      ),
    };
  }
}
