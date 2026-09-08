export type PlaybackDirection = 1 | -1;

export function normalizePlaybackDirection(value: unknown): PlaybackDirection {
  return Number(value) < 0 ? -1 : 1;
}

export function comparePlaybackDirection(previousTime: number, nextTime: number): PlaybackDirection {
  if (nextTime < previousTime) return -1;
  return 1;
}

export function advancePlaybackTime(
  currentTime: number,
  elapsedSeconds: number,
  duration: number,
  direction: PlaybackDirection,
): number {
  const delta = Math.max(0, Number.isFinite(elapsedSeconds) ? elapsedSeconds : 0);
  const safeDuration = Math.max(0, Number.isFinite(duration) ? duration : 0);
  const next = currentTime + delta * direction;
  return Math.min(safeDuration, Math.max(0, next));
}

export function isPlaybackBoundaryReached(
  time: number,
  duration: number,
  direction: PlaybackDirection,
): boolean {
  if (direction < 0) return time <= 0;
  return time >= Math.max(0, duration);
}
