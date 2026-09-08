import { create } from 'zustand';
import { Command, HistoryState } from '../core/commands/types';
import { useProjectStore } from './useProjectStore';
import { calculateProjectDuration, clampProjectTime } from '../core/engine/projectDuration';
import { assertValidProjectState, normalizeSelectedNodeIds, assertNoLockedTrackContentMutation } from '../features/video-studio/project/validation';
import { deriveTrackStates } from '../features/video-studio/project/services/trackStateService';

interface HistoryStore extends HistoryState {
  addCommand: (command: Command) => void;
  resetHistory: () => void;
  undo: () => void;
  redo: () => void;
}

export const useHistoryStore = create<HistoryStore>((set, get) => ({
  past: [],
  future: [],
  maxCapacity: 50,

  resetHistory: () => {
    set({ past: [], future: [] });
  },

  addCommand: (command: Command) => {
    set((state) => {
      const newPast = [...state.past, command];
      if (newPast.length > state.maxCapacity) {
        newPast.shift(); // Remove oldest
      }
      return {
        past: newPast,
        future: [], // Clear redo stack on new action
      };
    });
  },

  undo: () => {
    const { past, future } = get();
    if (past.length === 0) return;

    const command = past[past.length - 1];
    if (!command) return;
    
    // Execute undo on project store
    const currentProjectState = useProjectStore.getState();
    const previousProjectState = command.undo(currentProjectState);
    assertNoLockedTrackContentMutation(currentProjectState.tracks, previousProjectState.tracks);
    const totalDuration = calculateProjectDuration(previousProjectState.tracks);
    const normalizedPreviousState = {
      ...previousProjectState,
      totalDuration,
      currentTime: clampProjectTime(previousProjectState.currentTime, totalDuration),
      selectedNodeIds: normalizeSelectedNodeIds(previousProjectState.tracks, previousProjectState.selectedNodeIds),
    };
    assertValidProjectState(normalizedPreviousState);
    useProjectStore.setState({ ...normalizedPreviousState, trackStates: deriveTrackStates(normalizedPreviousState.tracks) });

    set({
      past: past.slice(0, -1),
      future: [command, ...future],
    });
  },

  redo: () => {
    const { past, future } = get();
    if (future.length === 0) return;

    const command = future[0];
    if (!command) return;

    // Execute redo on project store
    const currentProjectState = useProjectStore.getState();
    const nextProjectState = command.execute(currentProjectState);
    assertNoLockedTrackContentMutation(currentProjectState.tracks, nextProjectState.tracks);
    const totalDuration = calculateProjectDuration(nextProjectState.tracks);
    const normalizedNextState = {
      ...nextProjectState,
      totalDuration,
      currentTime: clampProjectTime(nextProjectState.currentTime, totalDuration),
      selectedNodeIds: normalizeSelectedNodeIds(nextProjectState.tracks, nextProjectState.selectedNodeIds),
    };
    assertValidProjectState(normalizedNextState);
    useProjectStore.setState({ ...normalizedNextState, trackStates: deriveTrackStates(normalizedNextState.tracks) });

    set({
      past: [...past, command],
      future: future.slice(1),
    });
  }
}));
