import type { Command } from '../../../core/commands/types';
import type { AnimatableProperty, AnimationEasing, ElementAnimation } from './types/animation';
import type { ProjectState } from '../project/types/project';
import { generateUUID } from '../../../lib/uuid';

const clone = (value: readonly ElementAnimation[] | undefined) => value ? structuredClone(Array.from(value)) : undefined;

function mapKeyframes(
  animations: readonly ElementAnimation[] | undefined,
  ids: ReadonlySet<string>,
  mutator: (track: any, index: number) => void,
): ElementAnimation[] | undefined {
  const next = clone(animations);
  if (!next) return next;
  for (const animation of next) {
    for (const track of animation.tracks ?? []) {
      (track.keyframes ?? []).forEach((_: any, index: number) => {
        const kfId = track.keyframes[index]?.id;
        if (kfId && ids.has(kfId)) mutator(track, index);
      });
      track.keyframes?.sort((a: any, b: any) => a.time - b.time || a.id.localeCompare(b.id));
    }
  }
  return next;
}

function canMoveKeyframes(animations: readonly ElementAnimation[] | undefined, ids: ReadonlySet<string>, delta: number): boolean {
  if (!animations) return false;
  for (const animation of animations) {
    for (const track of animation.tracks ?? []) {
      const selected = (track.keyframes ?? []).filter((k: any) => ids.has(k.id));
      if (!selected.length) continue;
      const selectedTargetTimes = selected.map((k: any) => Math.max(0, k.time + delta));
      const rounded = selectedTargetTimes.map((t: number) => t.toFixed(7));
      if (new Set(rounded).size !== rounded.length) return false;
      for (const keyframe of track.keyframes ?? []) {
        if (ids.has(keyframe.id)) continue;
        const target = Math.max(0, keyframe.time);
        if (selectedTargetTimes.some((t: number) => Math.abs(t - target) < 1e-7)) return false;
      }
    }
  }
  return true;
}

export class MoveAnimationKeyframesCommand implements Command {
  public readonly id = crypto.randomUUID();
  public readonly name = 'Move Animation Keyframes';
  private readonly before: ElementAnimation[] | undefined;
  private readonly after: ElementAnimation[] | undefined;
  constructor(animations: readonly ElementAnimation[] | undefined, keyframeIds: readonly string[], deltaTime: number) {
    this.before = clone(animations);
    const ids = new Set(keyframeIds);
    const delta = Number.isFinite(deltaTime) ? deltaTime : 0;
    this.after = canMoveKeyframes(animations, ids, delta)
      ? mapKeyframes(animations, ids, (track, index) => {
          track.keyframes[index] = { ...track.keyframes[index], time: Math.max(0, track.keyframes[index].time + delta) };
        })
      : clone(animations);
  }
  execute(state: ProjectState): ProjectState { return { ...state, animations: clone(this.after) }; }
  undo(state: ProjectState): ProjectState { return { ...state, animations: clone(this.before) }; }
}

export class MoveAnimationKeyframeCommand implements Command {
  public readonly id = crypto.randomUUID();
  public readonly name = 'Move Animation Keyframe';
  private readonly before: ElementAnimation[] | undefined;
  private readonly after: ElementAnimation[] | undefined;
  constructor(animations: readonly ElementAnimation[] | undefined, keyframeId: string, time: number) {
    this.before = clone(animations);
    const nextTime = Number.isFinite(time) ? time : 0;
    const source = animations ? clone(animations) : undefined;
    let valid = true;
    if (source) {
      for (const animation of source) for (const track of animation.tracks ?? []) {
        if (!(track.keyframes ?? []).some((k: any) => k.id === keyframeId)) continue;
        if ((track.keyframes ?? []).some((k: any) => k.id !== keyframeId && Math.abs(k.time - nextTime) < 1e-7)) valid = false;
      }
    }
    this.after = valid ? mapKeyframes(animations, new Set([keyframeId]), (track, index) => { track.keyframes[index] = { ...track.keyframes[index], time: Math.max(0, Number.isFinite(time) ? time : track.keyframes[index].time) }; }) : clone(animations);
  }
  execute(state: ProjectState): ProjectState { return { ...state, animations: clone(this.after) }; }
  undo(state: ProjectState): ProjectState { return { ...state, animations: clone(this.before) }; }
}


export class MoveAnimationKeyframeToPropertyCommand implements Command {
  public readonly id = crypto.randomUUID();
  public readonly name = 'Move Animation Keyframe To Property';
  private readonly before: ElementAnimation[] | undefined;
  private readonly after: ElementAnimation[] | undefined;

  constructor(
    animations: readonly ElementAnimation[] | undefined,
    keyframeId: string,
    destinationProperty: AnimatableProperty,
  ) {
    this.before = clone(animations);
    const next = clone(animations);
    if (!next) { this.after = next; return; }
    let found: { animation: ElementAnimation; sourceIndex: number; keyframeIndex: number } | null = null;
    for (const animation of next) {
      for (let ti = 0; ti < (animation.tracks ?? []).length; ti += 1) {
        const track = animation.tracks[ti]!;
        const ki = (track.keyframes ?? []).findIndex((k: any) => k.id === keyframeId);
        if (ki >= 0) { found = { animation, sourceIndex: ti, keyframeIndex: ki }; break; }
      }
      if (found) break;
    }
    if (!found) { this.after = next; return; }
    const sourceTrack = found.animation.tracks[found.sourceIndex]!;
    const moving = structuredClone(sourceTrack.keyframes[found.keyframeIndex]!);
    const destination = found.animation.tracks.find((t) => t.property === destinationProperty);
    if (destination && destination.keyframes.some((k) => k.id !== moving.id && Math.abs(k.time - moving.time) < 1e-7)) {
      this.after = next; return;
    }
    sourceTrack.keyframes = sourceTrack.keyframes.filter((k) => k.id !== keyframeId);
    let target = destination;
    if (!target) {
      target = { id: generateUUID(), property: destinationProperty, enabled: true, keyframes: [] };
      found.animation.tracks.push(target);
    }
    target.keyframes = [...(target.keyframes ?? []), moving];
    target.keyframes.sort((a,b) => a.time-b.time || a.id.localeCompare(b.id));
    this.after = next;
  }

  execute(state: ProjectState): ProjectState { return { ...state, animations: clone(this.after) }; }
  undo(state: ProjectState): ProjectState { return { ...state, animations: clone(this.before) }; }
}

export class SetAnimationKeyframeValueCommand implements Command {
  public readonly id = generateUUID();
  public readonly name = 'Set Animation Keyframe Value';
  private readonly before: ElementAnimation[] | undefined;
  private readonly after: ElementAnimation[] | undefined;
  constructor(animations: readonly ElementAnimation[] | undefined, keyframeId: string, value: number) {
    this.before = clone(animations);
    const safeValue = Number.isFinite(value) ? value : 0;
    this.after = mapKeyframes(animations, new Set([keyframeId]), (track, index) => {
      track.keyframes[index] = { ...track.keyframes[index], value: safeValue };
    });
  }
  execute(state: ProjectState): ProjectState { return { ...state, animations: clone(this.after) }; }
  undo(state: ProjectState): ProjectState { return { ...state, animations: clone(this.before) }; }
}

export class MoveAnimationKeyframeWithValueCommand implements Command {
  public readonly id = generateUUID();
  public readonly name = 'Move Animation Keyframe Value';
  private readonly before: ElementAnimation[] | undefined;
  private readonly after: ElementAnimation[] | undefined;
  constructor(animations: readonly ElementAnimation[] | undefined, keyframeId: string, time: number, value: number) {
    this.before = clone(animations);
    const safeTime = Math.max(0, Number.isFinite(time) ? time : 0);
    const safeValue = Number.isFinite(value) ? value : 0;
    this.after = mapKeyframes(animations, new Set([keyframeId]), (track, index) => {
      track.keyframes[index] = { ...track.keyframes[index], time: safeTime, value: safeValue };
    });
  }
  execute(state: ProjectState): ProjectState { return { ...state, animations: clone(this.after) }; }
  undo(state: ProjectState): ProjectState { return { ...state, animations: clone(this.before) }; }
}

export class SetAnimationKeyframeEasingCommand implements Command {
  public readonly id = crypto.randomUUID();
  public readonly name = 'Set Animation Keyframe Easing';
  private readonly before: ElementAnimation[] | undefined;
  private readonly after: ElementAnimation[] | undefined;
  constructor(animations: readonly ElementAnimation[] | undefined, keyframeIds: readonly string[], easing: AnimationEasing) {
    this.before = clone(animations);
    this.after = mapKeyframes(animations, new Set(keyframeIds), (track, index) => { track.keyframes[index] = { ...track.keyframes[index], easing }; });
  }
  execute(state: ProjectState): ProjectState { return { ...state, animations: clone(this.after) }; }
  undo(state: ProjectState): ProjectState { return { ...state, animations: clone(this.before) }; }
}

export class SetAnimationKeyframeInterpolationCommand implements Command {
  public readonly id = crypto.randomUUID();
  public readonly name = 'Set Animation Keyframe Interpolation';
  private readonly before: ElementAnimation[] | undefined;
  private readonly after: ElementAnimation[] | undefined;
  constructor(animations: readonly ElementAnimation[] | undefined, keyframeIds: readonly string[], interpolation: 'linear'|'bezier'|'hold') {
    this.before = clone(animations);
    this.after = mapKeyframes(animations, new Set(keyframeIds), (track, index) => {
      track.keyframes[index] = { ...track.keyframes[index], interpolation };
    });
  }
  execute(state: ProjectState): ProjectState { return { ...state, animations: clone(this.after) }; }
  undo(state: ProjectState): ProjectState { return { ...state, animations: clone(this.before) }; }
}


export class SetAnimationKeyframeBezierControlsCommand implements Command {
  public readonly id = generateUUID();
  public readonly name = 'Set Animation Keyframe Bezier Controls';
  private readonly before: ElementAnimation[] | undefined;
  private readonly after: ElementAnimation[] | undefined;
  constructor(animations: readonly ElementAnimation[] | undefined, keyframeIds: readonly string[], bezier: { in?: {x:number;y:number}; out?: {x:number;y:number} }) {
    this.before = animations ? structuredClone(Array.from(animations)) : undefined;
    this.after = mapKeyframes(animations, new Set(keyframeIds), (track, index) => {
      const current = track.keyframes[index]!;
      const sanitize = (h: {x:number;y:number} | undefined) => h ? { x: Math.max(0, Math.min(1, Number.isFinite(h.x) ? h.x : 0.5)), y: Math.max(-2, Math.min(3, Number.isFinite(h.y) ? h.y : 0.5)) } : undefined;
      track.keyframes[index] = { ...current, bezier: { ...(current.bezier ?? {}), ...(bezier.in ? { in: sanitize(bezier.in) } : {}), ...(bezier.out ? { out: sanitize(bezier.out) } : {}) } };
    });
  }
  execute(state: ProjectState): ProjectState { return { ...state, animations: this.after ? structuredClone(this.after) : undefined }; }
  undo(state: ProjectState): ProjectState { return { ...state, animations: this.before ? structuredClone(this.before) : undefined }; }
}

export class DeleteAnimationKeyframesCommand implements Command {
  public readonly id = crypto.randomUUID();
  public readonly name = 'Delete Animation Keyframes';
  private readonly before: ElementAnimation[] | undefined;
  private readonly after: ElementAnimation[] | undefined;
  constructor(animations: readonly ElementAnimation[] | undefined, keyframeIds: readonly string[]) {
    this.before = clone(animations);
    const ids = new Set(keyframeIds);
    const next = clone(animations);
    if (next) for (const animation of next) for (const track of animation.tracks ?? []) track.keyframes = (track.keyframes ?? []).filter((k: any) => !ids.has(k.id));
    this.after = next;
  }
  execute(state: ProjectState): ProjectState { return { ...state, animations: clone(this.after) }; }
  undo(state: ProjectState): ProjectState { return { ...state, animations: clone(this.before) }; }
}

export type AnimationKeyframeEntry = {
  id: string;
  elementId: string;
  property: AnimatableProperty;
  time: number;
  value: number;
};
