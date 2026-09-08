import { isTimeInClip } from '../../project/time/intervals';

import type { ClipNode, Track } from '../../project/types/project';
import {
  applyOverwritePlacement,
  applyRipplePlacement,
  type TimelineEditPolicy,
} from './timelineEditingEngine';

const DEFAULT_POLICY: TimelineEditPolicy = {
  minClipDuration: 0.01,
  preserveLockedClips: true,
};

export function resolveRippleTrack(
  clips: readonly ClipNode[],
  activeClipId: string,
): ClipNode[] {
  const syntheticTrack: Track = {
    id: '__timeline_service__',
    type: 'video',
    name: 'Timeline Service',
    isLocked: false,
    isMuted: false,
    isVisible: true,
    clips: clips.map((clip) => structuredClone(clip)),
  };
  return applyRipplePlacement(syntheticTrack, activeClipId, DEFAULT_POLICY).clips;
}

export function resolveOverwriteTrack(
  clips: readonly ClipNode[],
  activeClipId: string,
): ClipNode[] {
  const syntheticTrack: Track = {
    id: '__timeline_service__',
    type: 'video',
    name: 'Timeline Service',
    isLocked: false,
    isMuted: false,
    isVisible: true,
    clips: clips.map((clip) => structuredClone(clip)),
  };
  return applyOverwritePlacement(syntheticTrack, activeClipId, DEFAULT_POLICY).clips;
}

export { applyOverwritePlacement, applyRipplePlacement } from './timelineEditingEngine';

export function getTimelineClipEnd(clip: ClipNode): number {
  return clip.startAt + clip.duration;
}

export function isTimeInsideClip(clip: ClipNode, time: number): boolean {
  return isTimeInClip(time, clip);
}
