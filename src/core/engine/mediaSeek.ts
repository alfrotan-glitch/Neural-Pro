export interface MediaSeekOptions {
  timeoutMs?: number;
  toleranceSeconds?: number;
}

function createAbortError(signal?: AbortSignal): Error {
  if (signal?.reason instanceof Error) {
    return signal.reason;
  }

  return new Error('Media seek cancelled.');
}

export function seekMediaElement(
  media: HTMLMediaElement,
  targetTime: number,
  options: MediaSeekOptions = {},
  signal?: AbortSignal,
): Promise<void> {
  const timeoutMs = options.timeoutMs ?? 15_000;
  const toleranceSeconds = options.toleranceSeconds ?? 0.001;

  if (signal?.aborted) {
    return Promise.reject(createAbortError(signal));
  }

  const target = Math.max(0, targetTime);
  if (
    !media.seeking &&
    media.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
    Math.abs(media.currentTime - target) <= toleranceSeconds
  ) {
    return Promise.resolve();
  }

  return new Promise<void>((resolve, reject) => {
    let settled = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const cleanup = () => {
      media.removeEventListener('seeked', onSeeked);
      media.removeEventListener('error', onError);
      media.removeEventListener('loadeddata', onLoadedData);
      signal?.removeEventListener('abort', onAbort);
      if (timeoutId !== undefined) {
        globalThis.clearTimeout(timeoutId);
      }
    };

    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    };

    const onSeeked = () => {
      if (signal?.aborted) return finish(createAbortError(signal));
      finish();
    };

    const onLoadedData = () => {
      if (
        !media.seeking &&
        media.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
        Math.abs(media.currentTime - target) <= toleranceSeconds
      ) {
        finish();
      }
    };

    const onError = () => {
      finish(
        new Error(
          `Media seek failed: ${media.error?.message ?? 'unknown media error'}`,
        ),
      );
    };

    const onAbort = () => {
      finish(createAbortError(signal));
    };

    media.addEventListener('seeked', onSeeked);
    media.addEventListener('loadeddata', onLoadedData);
    media.addEventListener('error', onError);
    signal?.addEventListener('abort', onAbort, { once: true });

    timeoutId = globalThis.setTimeout(() => {
      finish(
        new Error(
          `Media seek timed out after ${timeoutMs}ms at ${target.toFixed(3)}s.`,
        ),
      );
    }, timeoutMs);

    try {
      if (signal?.aborted) return finish(createAbortError(signal));
      media.currentTime = target;
    } catch (error) {
      finish(
        error instanceof Error
          ? error
          : new Error('Unable to seek media element.'),
      );
    }
  });
}
