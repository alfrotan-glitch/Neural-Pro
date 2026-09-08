import type { ClipNode } from '../project/types/project';
import type { AnimatableProperty, AnimationEasing, ElementAnimation, AnimationKeyframe, PropertyAnimationTrack } from './types/animation';
import { getCanonicalClipTransform, type CanonicalClipTransform } from '../playback/services/clipTransformModel';

const EPSILON = 1e-7;

function finiteOr(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function easingProgress(t: number, easing: AnimationEasing): number {
  const x = clamp01(t);
  switch (easing) {
    case 'ease-in': return x * x;
    case 'ease-out': return 1 - (1 - x) * (1 - x);
    case 'ease-in-out': return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
    case 'back-in': {
      const c1 = 1.70158;
      const c3 = c1 + 1;
      return c3 * x * x * x - c1 * x * x;
    }
    case 'back-out': {
      const c1 = 1.70158;
      const c3 = c1 + 1;
      return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
    }
    case 'back-in-out': {
      const c1 = 1.70158;
      const c2 = c1 * 1.525;
      return x < 0.5
        ? (Math.pow(2 * x, 2) * ((c2 + 1) * 2 * x - c2)) / 2
        : (Math.pow(2 * x - 2, 2) * ((c2 + 1) * (x * 2 - 2) + c2) + 2) / 2;
    }
    case 'elastic-out': {
      if (x <= EPSILON || x >= 1 - EPSILON) return x;
      const c4 = (2 * Math.PI) / 3;
      return Math.pow(2, -10 * x) * Math.sin((x * 10 - 0.75) * c4) + 1;
    }
    case 'bounce-out': {
      const n1 = 7.5625;
      const d1 = 2.75;
      if (x < 1 / d1) return n1 * x * x;
      if (x < 2 / d1) { const y = x - 1.5 / d1; return n1 * y * y + 0.75; }
      if (x < 2.5 / d1) { const y = x - 2.25 / d1; return n1 * y * y + 0.9375; }
      const y = x - 2.625 / d1; return n1 * y * y + 0.984375;
    }
    case 'linear':
    default: return x;
  }
}

function normalizeKeyframes(track: PropertyAnimationTrack | undefined): AnimationKeyframe[] {
  if (!track?.enabled || !Array.isArray(track.keyframes)) return [];
  return track.keyframes
    .filter((k) => Number.isFinite(k.time) && Number.isFinite(k.value))
    .map((k) => ({ ...k }))
    .sort((a, b) => a.time - b.time || a.id.localeCompare(b.id));
}

function cubic(a: number, b: number, c: number, d: number, t: number): number {
  const u = 1 - t;
  return u*u*u*a + 3*u*u*t*b + 3*u*t*t*c + t*t*t*d;
}

function solveBezierTForX(xTarget: number, x1: number, x2: number): number {
  let lo = 0;
  let hi = 1;
  let t = clamp01(xTarget);
  for (let i = 0; i < 12; i += 1) {
    const x = cubic(0, x1, x2, 1, t);
    if (Math.abs(x - xTarget) < 1e-5) return t;
    if (x < xTarget) lo = t; else hi = t;
    t = (lo + hi) / 2;
  }
  return t;
}

function bezierProgress(t: number, left: AnimationKeyframe, right: AnimationKeyframe): number {
  const out = left.bezier?.out ?? { x: 0.25, y: 0.25 };
  const input = right.bezier?.in ?? { x: 0.75, y: 0.75 };
  const solvedT = solveBezierTForX(clamp01(t), clamp01(out.x), clamp01(input.x));
  return cubic(0, out.y, input.y, 1, solvedT);
}

function evaluateTrack(track: PropertyAnimationTrack, time: number, fallback: number): number {
  const keyframes = normalizeKeyframes(track);
  if (keyframes.length === 0) return fallback;
  if (time <= keyframes[0]!.time) return keyframes[0]!.value;
  const last = keyframes[keyframes.length - 1]!;
  if (time >= last.time) return last.value;
  let left = keyframes[0]!;
  let right = last;
  for (let index = 1; index < keyframes.length; index += 1) {
    const candidate = keyframes[index]!;
    if (time <= candidate.time + EPSILON) {
      right = candidate;
      left = keyframes[index - 1]!;
      break;
    }
  }
  const span = Math.max(EPSILON, right.time - left.time);
  const rawT = clamp01((time - left.time) / span);
  if (left.interpolation === 'hold') return left.value;
  const shaped = left.interpolation === 'bezier'
    ? bezierProgress(rawT, left, right)
    : easingProgress(rawT, left.easing ?? 'linear');
  return left.value + (right.value - left.value) * shaped;
}

function shortestAngleDelta(from: number, to: number): number {
  let delta = ((to - from + 180) % 360) - 180;
  if (delta < -180) delta += 360;
  return delta;
}

export interface EvaluatedClipTransform extends CanonicalClipTransform {}

export function evaluateElementAnimation(
  animations: readonly ElementAnimation[] | undefined,
  elementId: string,
  time: number,
  baseTransform: ClipNode['transform'],
): EvaluatedClipTransform {
  const base = getCanonicalClipTransform(baseTransform);
  const animation = animations?.find((entry) => entry.elementId === elementId);
  if (!animation) return base;

  const byProperty = new Map<AnimatableProperty, PropertyAnimationTrack>();
  for (const track of animation.tracks ?? []) {
    if (!byProperty.has(track.property)) byProperty.set(track.property, track);
  }

  const out: EvaluatedClipTransform = { ...base };
  out.x = evaluateTrack(byProperty.get('transform.x')!, time, base.x);
  out.y = evaluateTrack(byProperty.get('transform.y')!, time, base.y);
  out.scaleX = evaluateTrack(byProperty.get('transform.scaleX')!, time, base.scaleX);
  out.scaleY = evaluateTrack(byProperty.get('transform.scaleY')!, time, base.scaleY);
  out.opacity = Math.max(0, Math.min(100, evaluateTrack(byProperty.get('transform.opacity')!, time, base.opacity)));

  const rotationTrack = byProperty.get('transform.rotation');
  if (rotationTrack) {
    const keyframes = normalizeKeyframes(rotationTrack);
    if (keyframes.length >= 2) {
      const left = keyframes.find((k, i) => i > 0 && time <= k.time + EPSILON);
      const index = left ? keyframes.indexOf(left) : -1;
      if (index > 0) {
        const a = keyframes[index - 1]!;
        const b = keyframes[index]!;
        const span = Math.max(EPSILON, b.time - a.time);
        const rawT = clamp01((time - a.time) / span);
        const t = a.interpolation === 'hold'
          ? 0
          : a.interpolation === 'bezier'
            ? bezierProgress(rawT, a, b)
            : easingProgress(rawT, a.easing ?? 'linear');
        out.rotation = a.value + shortestAngleDelta(a.value, b.value) * t;
      } else {
        out.rotation = evaluateTrack(rotationTrack, time, base.rotation);
      }
    } else {
      out.rotation = evaluateTrack(rotationTrack, time, base.rotation);
    }
  }
  return out;
}

export function evaluateClipAnimation(
  animations: readonly ElementAnimation[] | undefined,
  clip: ClipNode,
  projectTime: number,
): EvaluatedClipTransform {
  const localTime = Math.max(0, projectTime - clip.startAt);
  return evaluateElementAnimation(animations, clip.id, localTime, clip.transform);
}
