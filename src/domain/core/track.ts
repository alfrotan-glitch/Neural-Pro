import type { ClipId, TrackId } from './identity';
import type { CanonicalClip, PersistedClip } from './clip';
import { normalizeClips } from './clip';

/**
 * Canonical track.
 *
 * Two axes are kept separate on purpose:
 *
 *  - **`kind`** — the render/authority axis. Four values only; this is what
 *    compositing, audio mixing and validation branch on.
 *  - **`laneRole`** — the presentation axis. Thirteen values that decide which
 *    dedicated timeline row a track occupies. It never affects rendering.
 *
 * Collapsing them (or branching render logic on `laneRole`) is what produced
 * the current ambiguity; `docs/contracts/project-state.md` §1 keeps them
 * separate and this kernel enforces it with types.
 */

export type TrackKind = 'video' | 'audio' | 'text' | 'effect';

/**
 * Presentation lane role.
 *
 * SHIM-006 owner=core-architecture remove=WP-08 reason=canonical-relocation
 * An identical union is currently declared in
 * `src/features/video-studio/project/types/project.ts` (`TimelineTrackLaneRole`).
 * The kernel copy is canonical; WP-08 replaces the old declaration with a
 * re-export. Values are identical, so no behaviour changes during the overlap.
 */
export type LaneRole =
  | 'video'
  | 'image'
  | 'audio'
  | 'text'
  | 'caption'
  | 'element'
  | 'overlay'
  | 'subscribe'
  | 'effect'
  | 'sticker'
  | 'transition'
  | 'filter'
  | 'adjustment';

export const LANE_ROLES: readonly LaneRole[] = Object.freeze([
  'video', 'image', 'audio', 'text', 'caption', 'element', 'overlay',
  'subscribe', 'effect', 'sticker', 'transition', 'filter', 'adjustment',
]);

export const TRACK_KINDS: readonly TrackKind[] = Object.freeze(['video', 'audio', 'text', 'effect']);

/**
 * Track control state.
 *
 * Invariant (from `lockedTrackInvariants.ts`): a locked track is immutable with
 * respect to its clip payload; lock/mute/visibility/collapse controls remain
 * legal while locked, because they are track state, not content.
 */
export interface TrackState {
  readonly isLocked: boolean;
  readonly isMuted: boolean;
  readonly isVisible: boolean;
  readonly isCollapsed: boolean;
}

export interface PersistedTrack {
  readonly id: TrackId;
  readonly kind: TrackKind;
  readonly laneRole?: LaneRole;
  readonly name?: string;
  readonly state: TrackState;
  readonly clips: readonly PersistedClip[];
}

export interface CanonicalTrack {
  readonly id: TrackId;
  readonly kind: TrackKind;
  readonly laneRole: LaneRole | null;
  readonly name: string | null;
  readonly state: TrackState;
  readonly clips: readonly CanonicalClip[];
}

function normalizeState(state: TrackState | null | undefined): TrackState {
  return {
    isLocked: state?.isLocked === true,
    isMuted: state?.isMuted === true,
    isVisible: state?.isVisible !== false,
    isCollapsed: state?.isCollapsed === true,
  };
}

export function normalizeTrack(track: PersistedTrack): CanonicalTrack {
  return {
    id: track.id,
    kind: track.kind,
    laneRole: track.laneRole ?? null,
    name: typeof track.name === 'string' && track.name.length > 0 ? track.name : null,
    state: normalizeState(track.state),
    clips: normalizeClips(track.clips),
  };
}

export function normalizeTracks(tracks: readonly PersistedTrack[]): CanonicalTrack[] {
  return tracks.map(normalizeTrack);
}

/** Content mutation is forbidden on a locked track. */
export function canMutateTrackContent(track: { readonly state: TrackState }): boolean {
  return !track.state.isLocked;
}

/**
 * A track contributes audio only when it is visible and unmuted.
 *
 * `isCollapsed` deliberately does **not** affect audibility: collapsing is a
 * presentation gesture that hides the lane, it does not take the track out of
 * the mix. (An earlier comment claimed otherwise; the code was right and the
 * comment was wrong, so the comment was corrected.)
 */
export function isTrackAudible(track: { readonly state: TrackState }): boolean {
  return track.state.isVisible && !track.state.isMuted;
}

export function findClip(
  tracks: readonly CanonicalTrack[],
  clipId: ClipId,
): { readonly track: CanonicalTrack; readonly clip: CanonicalClip } | null {
  for (const track of tracks) {
    for (const clip of track.clips) {
      if (clip.id === clipId) return { track, clip };
    }
  }
  return null;
}
