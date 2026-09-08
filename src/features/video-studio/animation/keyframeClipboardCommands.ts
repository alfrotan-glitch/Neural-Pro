import type { Command } from '../../../core/commands/types';
import type { AnimatableProperty, AnimationEasing, ElementAnimation, KeyframeInterpolation, KeyframeBezierControls } from './types/animation';
import type { ProjectState } from '../project/types/project';
import { generateUUID } from '../../../lib/uuid';

type ClipboardEntry = { property: AnimatableProperty; relativeTime: number; value: number; interpolation: KeyframeInterpolation; easing: AnimationEasing; bezier?: KeyframeBezierControls };

const clone = (value: readonly ElementAnimation[] | undefined) => value ? structuredClone(Array.from(value)) : [];

export class PasteAnimationKeyframesCommand implements Command {
  public readonly id = generateUUID();
  public readonly name = 'Paste Animation Keyframes';
  private readonly before: ElementAnimation[] | undefined;
  private readonly after: ElementAnimation[] | undefined;
  constructor(animations: readonly ElementAnimation[] | undefined, elementId: string, entries: readonly ClipboardEntry[], pasteTime: number) {
    this.before = animations ? structuredClone(Array.from(animations)) : undefined;
    const next = clone(animations);
    let animation = next.find((a) => a.elementId === elementId);
    if (!animation) { animation = { id: generateUUID(), elementId, tracks: [] }; next.push(animation); }
    const baseTime = Math.max(0, Number.isFinite(pasteTime) ? pasteTime : 0);
    for (const entry of entries) {
      let track = animation.tracks.find((t) => t.property === entry.property);
      if (!track) { track = { id: generateUUID(), property: entry.property, enabled: true, keyframes: [] }; animation.tracks.push(track); }
      const time = Math.max(0, baseTime + entry.relativeTime);
      const existing = track.keyframes.findIndex((k) => Math.abs(k.time - time) < 1e-7);
      const keyframe = { id: generateUUID(), time, value: entry.value, interpolation: entry.interpolation, easing: entry.easing, bezier: entry.bezier ? structuredClone(entry.bezier) : undefined };
      if (existing >= 0) { keyframe.id = track.keyframes[existing]!.id; track.keyframes[existing] = keyframe; } else track.keyframes.push(keyframe);
      track.keyframes.sort((a,b) => a.time-b.time || a.id.localeCompare(b.id));
    }
    this.after = next;
  }
  execute(state: ProjectState): ProjectState { return { ...state, animations: structuredClone(this.after) }; }
  undo(state: ProjectState): ProjectState { return { ...state, animations: this.before ? structuredClone(this.before) : undefined }; }
}
