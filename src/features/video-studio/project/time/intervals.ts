/**
 * Canonical timeline interval semantics.
 *
 * Every clip occupies a half-open interval [startAt, endAt):
 * - startAt is active
 * - endAt is exclusive
 *
 * This prevents adjacent clips [0, 5) and [5, 10) from both being active
 * at exactly 5 seconds.
 */
export const getClipEnd = (startAt: number, duration: number): number =>
  startAt + Math.max(0, duration);

export const isTimeInInterval = (
  time: number,
  startAt: number,
  duration: number,
): boolean => {
  if (!Number.isFinite(time) || !Number.isFinite(startAt) || !Number.isFinite(duration)) {
    return false;
  }
  const endAt = getClipEnd(startAt, duration);
  return time >= startAt && time < endAt;
};

export const isTimeInClip = <T extends { startAt: number; duration: number }>(
  time: number,
  clip: T,
): boolean => isTimeInInterval(time, clip.startAt, clip.duration);
