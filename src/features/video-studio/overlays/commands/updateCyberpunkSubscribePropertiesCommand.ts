import { generateUUID } from '../../../../lib/uuid';
import type { ProjectState, UUID } from '../../project/types/project';
import type { Command } from '../../../../core/commands/types';
import { assertClipEditable } from '../../project/validation';

export interface CyberpunkPropertySnapshot {
  present: boolean;
  value: unknown;
}

function applyPropertySnapshots(
  state: ProjectState,
  clipId: UUID,
  snapshots: Record<string, CyberpunkPropertySnapshot>,
): ProjectState {
  return {
    ...state,
    tracks: state.tracks.map((track) => ({
      ...track,
      clips: track.clips.map((clip) => {
        if (clip.id !== clipId) return clip;

        const properties = { ...(clip.properties ?? {}) };

        for (const [key, snapshot] of Object.entries(snapshots)) {
          if (snapshot.present) {
            properties[key] = structuredClone(snapshot.value);
          } else {
            delete properties[key];
          }
        }

        return { ...clip, properties };
      }),
    })),
  };
}

export class UpdateCyberpunkSubscribePropertiesCommand implements Command {
  private readonly previous: Record<string, CyberpunkPropertySnapshot>;
  private readonly next: Record<string, CyberpunkPropertySnapshot>;
  readonly id = generateUUID();
  readonly name = 'Update Cyberpunk Subscribe Properties';

  constructor(
    private readonly clipId: UUID,
    previous: Record<string, CyberpunkPropertySnapshot>,
    next: Record<string, CyberpunkPropertySnapshot>,
  ) {
    this.previous = structuredClone(previous);
    this.next = structuredClone(next);
  }

  execute(state: ProjectState): ProjectState {
    assertClipEditable(state.tracks, this.clipId);
    return applyPropertySnapshots(state, this.clipId, this.next);
  }

  undo(state: ProjectState): ProjectState {
    return applyPropertySnapshots(state, this.clipId, this.previous);
  }
}
