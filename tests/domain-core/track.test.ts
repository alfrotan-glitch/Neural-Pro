import { check, equal, suite } from './harness';
import {
  LANE_ROLES,
  TRACK_KINDS,
  canMutateTrackContent,
  findClip,
  isTrackAudible,
  normalizeTrack,
  normalizeTracks,
  type PersistedTrack,
} from '../../src/domain/core/track';
import type { PersistedClip } from '../../src/domain/core/clip';

const clip = (id: string, overrides: Partial<PersistedClip> = {}): PersistedClip => ({
  id,
  sourceId: `src-${id}`,
  startAt: 0,
  duration: 4,
  trim: null,
  transform: null,
  properties: null,
  ...overrides,
});

const track = (overrides: Partial<PersistedTrack> = {}): PersistedTrack => ({
  id: 'track-1',
  kind: 'video',
  state: { isLocked: false, isMuted: false, isVisible: true, isCollapsed: false },
  clips: [clip('c1')],
  ...overrides,
});

export default suite('track — kind is the authority, lane role is presentation', () => {
  // ---- the two axes are deliberately separate ---------------------------
  equal(TRACK_KINDS.length, 4, 'there are exactly four render authorities');
  equal(LANE_ROLES.length, 13, 'there are thirteen presentation lanes');
  for (const kind of TRACK_KINDS) {
    check(LANE_ROLES.includes(kind), `every kind (${kind}) also exists as a lane role — which is why they were easy to conflate`);
  }
  check(LANE_ROLES.length > TRACK_KINDS.length, 'the lane vocabulary is strictly larger, so it can never be the render authority');

  // ---- normalisation -----------------------------------------------------
  const plain = normalizeTrack(track());
  equal(plain.laneRole, null, 'a missing lane role is null, not a guess');
  equal(plain.name, null, 'a missing name is null, not an empty string');
  equal(plain.clips.length, 1, 'clips are normalised with the track');

  const named = normalizeTrack(track({ laneRole: 'caption', name: 'Captions' }));
  equal(named.laneRole, 'caption', 'an explicit lane role is preserved');
  equal(named.name, 'Captions', 'an explicit name is preserved');
  equal(normalizeTrack(track({ name: '' })).name, null, 'an empty name normalises to null');

  const defaults = normalizeTrack(track({ state: undefined as never }));
  equal(defaults.state.isLocked, false, 'a missing state is unlocked by default');
  equal(defaults.state.isMuted, false, 'a missing state is unmuted by default');
  equal(defaults.state.isVisible, true, 'a missing state is visible by default (only an explicit false hides)');
  equal(defaults.state.isCollapsed, false, 'a missing state is expanded by default');
  equal(normalizeTrack(track({ state: { isLocked: true, isMuted: true, isVisible: false, isCollapsed: true } })).state.isVisible, false,
    'an explicit false is honoured');

  equal(normalizeTracks([track({ id: 'a' }), track({ id: 'b' })]).length, 2, 'tracks normalise in a batch');

  // ---- lock semantics ----------------------------------------------------
  check(canMutateTrackContent(plain), 'an unlocked track accepts content mutation');
  check(!canMutateTrackContent(normalizeTrack(track({ state: { isLocked: true, isMuted: false, isVisible: true, isCollapsed: false } }))),
    'a locked track rejects content mutation');

  // ---- audio -------------------------------------------------------------
  const audible = normalizeTrack(track({ state: { isLocked: false, isMuted: false, isVisible: true, isCollapsed: false } }));
  check(isTrackAudible(audible), 'a visible, unmuted track is audible');
  const muted = normalizeTrack(track({ state: { isLocked: false, isMuted: true, isVisible: true, isCollapsed: false } }));
  check(!isTrackAudible(muted), 'a muted track is silent');
  const hidden = normalizeTrack(track({ state: { isLocked: false, isMuted: false, isVisible: false, isCollapsed: false } }));
  check(!isTrackAudible(hidden), 'a hidden track is silent');
  const collapsed = normalizeTrack(track({ state: { isLocked: false, isMuted: false, isVisible: true, isCollapsed: true } }));
  check(isTrackAudible(collapsed), 'collapsing hides the lane but does NOT take the track out of the mix');

  // ---- lookup ------------------------------------------------------------
  const tracks = normalizeTracks([track({ id: 't1', clips: [clip('a')] }), track({ id: 't2', clips: [clip('b')] })]);
  equal(findClip(tracks, 'b')?.track.id, 't2', 'a clip is found across tracks');
  equal(findClip(tracks, 'missing'), null, 'an unknown clip id resolves to null, not undefined');
  equal(findClip([], 'a'), null, 'an empty track list yields null');
});
