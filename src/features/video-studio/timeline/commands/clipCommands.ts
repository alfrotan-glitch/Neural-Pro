import { generateUUID } from '../../../../lib/uuid';
import type { ClipNode, ProjectState, UUID } from '../../project/types/project';
import type { Command } from '../../../../core/commands/types';
import { assertClipEditable, assertTrackEditable } from '../../project/validation';
import { pruneEmptyTracks } from '../../project/services/projectService';

export class UpdateClipTransformCommand implements Command {
  private readonly prevTransform: ClipNode['transform'];
  private readonly nextTransform: ClipNode['transform'];
  readonly id = generateUUID();
  readonly name = 'Update Clip Transform';

  constructor(
    private readonly clipId: UUID,
    prevTransform: ClipNode['transform'],
    nextTransform: ClipNode['transform'],
  ) {
    this.prevTransform = structuredClone(prevTransform);
    this.nextTransform = structuredClone(nextTransform);
  }

  execute(state: ProjectState): ProjectState {
    assertClipEditable(state.tracks, this.clipId);
    return {
      ...state,
      tracks: state.tracks.map((track) => ({
        ...track,
        clips: track.clips.map((clip) =>
          clip.id === this.clipId
            ? { ...clip, transform: structuredClone(this.nextTransform) }
            : clip,
        ),
      })),
    };
  }

  undo(state: ProjectState): ProjectState {
    return {
      ...state,
      tracks: state.tracks.map((track) => ({
        ...track,
        clips: track.clips.map((clip) =>
          clip.id === this.clipId
            ? { ...clip, transform: structuredClone(this.prevTransform) }
            : clip,
        ),
      })),
    };
  }
}

export class MoveClipCommand implements Command {
  readonly id = generateUUID();
  readonly name = 'Move Clip';

  constructor(
    private readonly clipId: UUID,
    private readonly prevStart: number,
    private readonly nextStart: number,
    private readonly prevTrackId: string,
    private readonly nextTrackId: string,
  ) {}

  execute(state: ProjectState): ProjectState {
    assertClipEditable(state.tracks, this.clipId);
    assertTrackEditable(state.tracks, this.nextTrackId);
    return this.moveClip(state, this.prevTrackId, this.nextTrackId, this.nextStart);
  }

  undo(state: ProjectState): ProjectState {
    return this.moveClip(state, this.nextTrackId, this.prevTrackId, this.prevStart);
  }

  private moveClip(
    state: ProjectState,
    fromTrackId: string,
    toTrackId: string,
    targetStart: number,
  ): ProjectState {
    const sourceTrack = state.tracks.find((track) => track.id === fromTrackId);
    const targetClip = sourceTrack?.clips.find((clip) => clip.id === this.clipId);
    if (!sourceTrack || !targetClip) return state;

    const cleanedTracks = state.tracks.map((track) =>
      track.id === fromTrackId
        ? { ...track, clips: track.clips.filter((clip) => clip.id !== this.clipId) }
        : track,
    );

    const movedClip = structuredClone({ ...targetClip, startAt: targetStart });
    const nextTracks = cleanedTracks.map((track) =>
      track.id === toTrackId
        ? { ...track, clips: [...track.clips, movedClip] }
        : track,
    );

    return {
      ...state,
      tracks: pruneEmptyTracks(nextTracks),
    };
  }
}

export class SplitClipCommand implements Command {
  private readonly originalClip: ClipNode;
  private readonly leftClip: ClipNode;
  private readonly rightClip: ClipNode;
  readonly id = generateUUID();
  readonly name = 'Split Clip';

  constructor(
    private readonly trackId: string,
    originalClip: ClipNode,
    leftClip: ClipNode,
    rightClip: ClipNode,
  ) {
    this.originalClip = structuredClone(originalClip);
    this.leftClip = structuredClone(leftClip);
    this.rightClip = structuredClone(rightClip);
  }

  execute(state: ProjectState): ProjectState {
    assertClipEditable(state.tracks, this.originalClip.id);
    assertTrackEditable(state.tracks, this.trackId);
    return {
      ...state,
      tracks: state.tracks.map((track) =>
        track.id === this.trackId
          ? {
              ...track,
              clips: [
                ...track.clips.filter((clip) => clip.id !== this.originalClip.id),
                structuredClone(this.leftClip),
                structuredClone(this.rightClip),
              ],
            }
          : track,
      ),
      selectedNodeIds: [this.rightClip.id],
    };
  }

  undo(state: ProjectState): ProjectState {
    return {
      ...state,
      tracks: state.tracks.map((track) =>
        track.id === this.trackId
          ? {
              ...track,
              clips: [
                ...track.clips.filter(
                  (clip) => clip.id !== this.leftClip.id && clip.id !== this.rightClip.id,
                ),
                structuredClone(this.originalClip),
              ],
            }
          : track,
      ),
      selectedNodeIds: [this.originalClip.id],
    };
  }
}
