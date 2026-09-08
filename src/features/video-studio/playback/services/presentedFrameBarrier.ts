export interface PresentedFrameBarrierInput {
  clipIds: string[];
  presentedFrameTimes: Record<string, number>;
  transportTime: number;
  maxFrameSkewSeconds?: number;
  maxTransportLagSeconds?: number;
  fallbackTime?: number;
}

export interface PresentedFrameBarrierResult {
  ready: boolean;
  time: number;
  minTime: number | null;
  maxTime: number | null;
  skewSeconds: number | null;
  missingClipIds: string[];
}

const DEFAULT_MAX_FRAME_SKEW_SECONDS = 1 / 24;
const DEFAULT_MAX_TRANSPORT_LAG_SECONDS = 0.125;

/**
 * Deterministic presentation barrier for concurrently active video elements.
 *
 * All videos must have reported finite project-time presentation points and
 * remain sufficiently close to the shared transport and to each other.
 * The barrier time is the oldest presented frame so every active video has
 * reached at least that project time. Callers may hold this time between
 * coherent barriers to avoid mixing frames from different presentation epochs.
 */
export function resolvePresentedFrameBarrier(
  input: PresentedFrameBarrierInput,
): PresentedFrameBarrierResult {
  const clipIds = [...new Set(input.clipIds)];
  const maxFrameSkew = input.maxFrameSkewSeconds ?? DEFAULT_MAX_FRAME_SKEW_SECONDS;
  const maxTransportLag = input.maxTransportLagSeconds ?? DEFAULT_MAX_TRANSPORT_LAG_SECONDS;
  const fallbackTime = Number.isFinite(input.fallbackTime)
    ? Number(input.fallbackTime)
    : Number(input.transportTime);

  if (clipIds.length === 0) {
    return {
      ready: true,
      time: fallbackTime,
      minTime: null,
      maxTime: null,
      skewSeconds: 0,
      missingClipIds: [],
    };
  }

  const missingClipIds = clipIds.filter((clipId) => !Number.isFinite(input.presentedFrameTimes[clipId]));
  if (missingClipIds.length > 0 || !Number.isFinite(input.transportTime)) {
    return {
      ready: false,
      time: fallbackTime,
      minTime: null,
      maxTime: null,
      skewSeconds: null,
      missingClipIds,
    };
  }

  const times = clipIds.map((clipId) => Number(input.presentedFrameTimes[clipId]));
  const minTime = Math.min(...times);
  const maxTime = Math.max(...times);
  const skewSeconds = maxTime - minTime;
  const transportLag = Math.max(
    Math.abs(input.transportTime - minTime),
    Math.abs(input.transportTime - maxTime),
  );
  const ready = skewSeconds <= Math.max(0, maxFrameSkew)
    && transportLag <= Math.max(0, maxTransportLag);

  return {
    ready,
    time: ready ? minTime : fallbackTime,
    minTime,
    maxTime,
    skewSeconds,
    missingClipIds: [],
  };
}
