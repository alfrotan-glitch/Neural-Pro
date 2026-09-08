import type { ProjectState, UUID } from '../../features/video-studio/project/types/project';

/** Commands treat ProjectState as immutable input and return a fresh state.
 * Historical command instances must own private snapshots of mutable constructor data.
 * Undo/redo must never mutate data retained by the history stack. */
export interface Command {
  id: UUID;
  name: string;
  execute: (state: ProjectState) => ProjectState;
  undo: (state: ProjectState) => ProjectState;
}

export interface HistoryState {
  past: Command[];
  future: Command[];
  maxCapacity: number;
}
