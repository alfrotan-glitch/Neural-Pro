import type { Track } from '../../project/types/project';
export interface ActiveDrag {
  pointerId: number;
  clipId: string;
  trackId: string;
  trackType: 'video' | 'audio' | 'text' | 'effect';
  trackLaneRole?: string;
  dragMode: 'move' | 'trim-left' | 'trim-right' | 'rate-stretch' | 'roll-left' | 'roll-right' | 'roll' | 'slip';
  pairedClipId?: string;
  initialStartAt: number;
  initialDuration: number;
  initialSpeed: number;
  startMouseTime: number;
  initialTracks: Track[];
  initialSelectedClips?: Array<{ clipId: string; trackId: string; initialStartAt: number; initialDuration: number }>;
}
