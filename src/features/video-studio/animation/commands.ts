import type { Command } from '../../../core/commands/types';
import type { AnimatableProperty, AnimationEasing, AnimationKeyframe, ElementAnimation, KeyframeInterpolation, KeyframeBezierControls } from './types/animation';
import type { ProjectState } from '../project/types/project';
import { generateUUID } from '../../../lib/uuid';

export interface SetAnimationKeyframeInput {
  elementId: string;
  property: AnimatableProperty;
  time: number;
  value: number;
  interpolation?: KeyframeInterpolation;
  easing?: AnimationEasing;
  bezier?: KeyframeBezierControls;
}

function finiteOr(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function snapshotAnimations(animations: readonly ElementAnimation[] | undefined): ElementAnimation[] | undefined {
  return animations ? structuredClone(Array.from(animations)) : undefined;
}

function withKeyframe(
  animations: readonly ElementAnimation[] | undefined,
  input: SetAnimationKeyframeInput,
): ElementAnimation[] {
  const next = snapshotAnimations(animations) ?? [];
  const safeTime = Math.max(0, finiteOr(input.time, 0));
  const safeValue = finiteOr(input.value, 0);
  let animation = next.find((entry) => entry.elementId === input.elementId);
  if (!animation) {
    animation = { id: generateUUID(), elementId: input.elementId, tracks: [] };
    next.push(animation);
  }
  let track = animation.tracks.find((entry) => entry.property === input.property);
  if (!track) {
    track = { id: generateUUID(), property: input.property, enabled: true, keyframes: [] };
    animation.tracks.push(track);
  }
  const existingIndex = track.keyframes.findIndex((entry) => Math.abs(entry.time - safeTime) < 1e-7);
  const existing = existingIndex >= 0 ? track.keyframes[existingIndex] : undefined;
  const keyframe: AnimationKeyframe = {
    id: existing?.id ?? generateUUID(),
    time: safeTime,
    value: safeValue,
    interpolation: input.interpolation ?? existing?.interpolation ?? 'linear',
    easing: input.easing ?? existing?.easing ?? 'linear',
    bezier: input.bezier ?? existing?.bezier,
  };
  if (existingIndex >= 0) track.keyframes[existingIndex] = keyframe;
  else track.keyframes.push(keyframe);
  track.keyframes.sort((a, b) => a.time - b.time || a.id.localeCompare(b.id));
  return next;
}

export class SetAnimationKeyframeCommand implements Command {
  public readonly id = generateUUID();
  public readonly name = 'Set Animation Keyframe';
  private readonly before: ElementAnimation[] | undefined;
  private readonly after: ElementAnimation[] | undefined;

  public constructor(input: SetAnimationKeyframeInput, animations: readonly ElementAnimation[] | undefined) {
    this.before = snapshotAnimations(animations);
    this.after = withKeyframe(animations, input);
  }

  public execute(state: ProjectState): ProjectState {
    return { ...state, animations: snapshotAnimations(this.after) };
  }

  public undo(state: ProjectState): ProjectState {
    return { ...state, animations: snapshotAnimations(this.before) };
  }
}

export interface SetAnimationKeyframesInput {
  elementId: string;
  entries: Array<Pick<SetAnimationKeyframeInput, 'property' | 'time' | 'value' | 'interpolation' | 'easing'>>;
}

function withKeyframes(animations: readonly ElementAnimation[] | undefined, input: SetAnimationKeyframesInput): ElementAnimation[] {
  let next = snapshotAnimations(animations) ?? [];
  for (const entry of input.entries) {
    next = withKeyframe(next, { elementId: input.elementId, ...entry });
  }
  return next;
}

export class SetAnimationKeyframesCommand implements Command {
  public readonly id = generateUUID();
  public readonly name = 'Set Animation Keyframes';
  private readonly before: ElementAnimation[] | undefined;
  private readonly after: ElementAnimation[] | undefined;

  public constructor(input: SetAnimationKeyframesInput, animations: readonly ElementAnimation[] | undefined) {
    this.before = snapshotAnimations(animations);
    this.after = withKeyframes(animations, input);
  }

  public execute(state: ProjectState): ProjectState {
    return { ...state, animations: snapshotAnimations(this.after) };
  }

  public undo(state: ProjectState): ProjectState {
    return { ...state, animations: snapshotAnimations(this.before) };
  }
}

export interface AutoKeyframeTransformCommandInput {
  previousTracks: readonly ProjectState['tracks'][number][];
  nextTracks: readonly ProjectState['tracks'][number][];
  previousAnimations: readonly ElementAnimation[] | undefined;
  elementIds: readonly string[];
  projectTime: number;
}

function transformEntriesAtProjectTime(
  tracks: readonly ProjectState['tracks'][number][],
  elementIds: readonly string[],
  projectTime: number,
): { elementId: string; entries: SetAnimationKeyframesInput['entries'] }[] {
  const ids = new Set(elementIds);
  const safeProjectTime = Number.isFinite(projectTime) ? Math.max(0, projectTime) : 0;
  const output: { elementId: string; entries: SetAnimationKeyframesInput['entries'] }[] = [];
  for (const track of tracks) {
    for (const clip of track.clips) {
      if (!ids.has(clip.id)) continue;
      const rawLocalTime = safeProjectTime - clip.startAt;
      if (rawLocalTime < -1e-7 || rawLocalTime > clip.duration + 1e-7) continue;
      const localTime = Math.max(0, Math.min(clip.duration, rawLocalTime));
      const scaleX = finiteOr(clip.transform.scaleX, finiteOr(clip.transform.scale, 100));
      const scaleY = finiteOr(clip.transform.scaleY, finiteOr(clip.transform.scale, 100));
      output.push({
        elementId: clip.id,
        entries: [
          { property: 'transform.x', time: localTime, value: finiteOr(clip.transform.x, 0) },
          { property: 'transform.y', time: localTime, value: finiteOr(clip.transform.y, 0) },
          { property: 'transform.scaleX', time: localTime, value: scaleX },
          { property: 'transform.scaleY', time: localTime, value: scaleY },
          { property: 'transform.rotation', time: localTime, value: finiteOr(clip.transform.rotation, 0) },
          { property: 'transform.opacity', time: localTime, value: finiteOr(clip.transform.opacity, 100) },
        ],
      });
    }
  }
  return output;
}

export class AutoKeyframeTransformCommand implements Command {
  public readonly id = generateUUID();
  public readonly name = 'Transform + Auto-Keyframe';
  private readonly beforeTracks: ProjectState['tracks'];
  private readonly afterTracks: ProjectState['tracks'];
  private readonly beforeAnimations: ElementAnimation[] | undefined;
  private readonly afterAnimations: ElementAnimation[] | undefined;

  public constructor(input: AutoKeyframeTransformCommandInput) {
    this.beforeTracks = structuredClone(input.previousTracks) as ProjectState['tracks'];
    this.afterTracks = structuredClone(input.nextTracks) as ProjectState['tracks'];
    this.beforeAnimations = snapshotAnimations(input.previousAnimations);
    let next = snapshotAnimations(input.previousAnimations) ?? [];
    const changedIds = input.elementIds.filter((id) => {
      const before = input.previousTracks.flatMap((t) => t.clips).find((clip) => clip.id === id);
      const after = input.nextTracks.flatMap((t) => t.clips).find((clip) => clip.id === id);
      return Boolean(before && after && JSON.stringify(before.transform) !== JSON.stringify(after.transform));
    });
    for (const item of transformEntriesAtProjectTime(input.nextTracks, changedIds, input.projectTime)) {
      next = withKeyframes(next, { elementId: item.elementId, entries: item.entries });
    }
    this.afterAnimations = next;
  }

  public execute(state: ProjectState): ProjectState {
    return { ...state, tracks: structuredClone(this.afterTracks), animations: snapshotAnimations(this.afterAnimations) };
  }

  public undo(state: ProjectState): ProjectState {
    return { ...state, tracks: structuredClone(this.beforeTracks), animations: snapshotAnimations(this.beforeAnimations) };
  }
}

