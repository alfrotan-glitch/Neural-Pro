export interface SceneDetectionOptions {
  sampleIntervalSeconds?: number;
  threshold?: number;
  minimumSceneDurationSeconds?: number;
  startTimeSeconds?: number;
}

export interface SceneCut {
  time: number;
  score: number;
}

function waitForEvent(
  target: EventTarget,
  eventName: string,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const onDone = () => {
      cleanup();
      resolve();
    };

    const onError = () => {
      cleanup();
      reject(new Error(`Media event "${eventName}" failed.`));
    };

    const cleanup = () => {
      target.removeEventListener(eventName, onDone);
      target.removeEventListener('error', onError);
    };

    target.addEventListener(eventName, onDone, { once: true });
    target.addEventListener('error', onError, { once: true });
  });
}

async function seekVideo(
  video: HTMLVideoElement,
  time: number,
): Promise<void> {
  if (Math.abs(video.currentTime - time) < 0.001) return;
  video.currentTime = Math.max(0, Math.min(time, video.duration || time));
  await waitForEvent(video, 'seeked');
}

function frameDifference(
  previous: Uint8ClampedArray,
  current: Uint8ClampedArray,
): number {
  const length = Math.min(previous.length, current.length);
  if (length === 0) return 0;

  let total = 0;
  for (let index = 0; index < length; index += 4) {
    const p0 = previous[index] ?? 0;
    const c0 = current[index] ?? 0;
    const p1 = previous[index + 1] ?? 0;
    const c1 = current[index + 1] ?? 0;
    const p2 = previous[index + 2] ?? 0;
    const c2 = current[index + 2] ?? 0;
    total += Math.abs(p0 - c0);
    total += Math.abs(p1 - c1);
    total += Math.abs(p2 - c2);
  }

  const pixels = Math.max(1, Math.floor(length / 4));
  return total / (pixels * 3 * 255);
}

export async function detectSceneCuts(
  videoUrl: string,
  duration: number,
  options: SceneDetectionOptions = {},
): Promise<SceneCut[]> {
  if (typeof document === 'undefined') {
    throw new Error('Scene detection requires a browser environment.');
  }

  const sampleIntervalSeconds = Math.max(
    0.1,
    options.sampleIntervalSeconds ?? 0.5,
  );
  const threshold = Math.max(
    0.01,
    Math.min(1, options.threshold ?? 0.28),
  );
  const minimumSceneDurationSeconds = Math.max(
    0.2,
    options.minimumSceneDurationSeconds ?? 1.0,
  );
  const requestedStart = Math.max(0, options.startTimeSeconds ?? 0);

  const video = document.createElement('video');
  video.preload = 'auto';
  video.muted = true;
  video.playsInline = true;
  video.crossOrigin = 'anonymous';
  video.src = videoUrl;

  try {
    await waitForEvent(video, 'loadedmetadata');
    await waitForEvent(video, 'loadeddata');

    const width = 160;
    const height = 90;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) {
      throw new Error('Scene detection canvas context is unavailable.');
    }

    const mediaDuration = Number.isFinite(video.duration) && video.duration > 0
      ? video.duration
      : requestedStart + Math.max(0.001, duration);
    const start = Math.min(requestedStart, Math.max(0, mediaDuration - 0.001));
    const end = Math.min(
      start + Math.max(0.001, duration),
      mediaDuration,
    );

    const cuts: SceneCut[] = [];
    let previousFrame: Uint8ClampedArray | null = null;
    let lastAcceptedCut = 0;

    for (
      let time = 0;
      time <= end + 0.001;
      time += sampleIntervalSeconds
    ) {
      const sampleTime = Math.min(end, start + time);
      await seekVideo(video, sampleTime);

      ctx.drawImage(video, 0, 0, width, height);
      const frame = ctx.getImageData(0, 0, width, height).data;

      if (previousFrame) {
        const score = frameDifference(previousFrame, frame);
        if (
          score >= threshold &&
          sampleTime - lastAcceptedCut >= minimumSceneDurationSeconds
        ) {
          cuts.push({ time: Number((sampleTime - start).toFixed(3)), score });
          lastAcceptedCut = sampleTime;
        }
      }

      previousFrame = new Uint8ClampedArray(frame);
    }

    return cuts;
  } finally {
    video.pause();
    video.removeAttribute('src');
    video.load();
  }
}
