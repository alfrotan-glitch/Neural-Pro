export type MediaHealthStatus = 'idle' | 'loading' | 'ready' | 'buffering' | 'error';

export interface MediaHealthSnapshot {
  status: MediaHealthStatus;
  message?: string;
  errorCode?: number;
  retryCount: number;
}

export interface MediaHealthCallbacks {
  onChange: (snapshot: MediaHealthSnapshot) => void;
}

export interface MediaHealthController {
  attach: () => void;
  detach: () => void;
  retry: () => void;
  getSnapshot: () => MediaHealthSnapshot;
}

const BUFFERING_GRACE_MS = 300;
const MAX_AUTO_RETRIES = 2;

function describeMediaError(error: MediaError | null): string {
  switch (error?.code) {
    case MediaError.MEDIA_ERR_ABORTED:
      return 'Media loading was aborted.';
    case MediaError.MEDIA_ERR_NETWORK:
      return 'Network error while loading media.';
    case MediaError.MEDIA_ERR_DECODE:
      return 'The browser could not decode this media.';
    case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
      return 'This media format or source is not supported.';
    default:
      return 'The media could not be loaded.';
  }
}

export function createMediaHealthController(
  media: HTMLMediaElement,
  callbacks: MediaHealthCallbacks,
): MediaHealthController {
  let snapshot: MediaHealthSnapshot = {
    status: 'idle',
    retryCount: 0,
  };
  let bufferingTimer: number | null = null;
  let retryTimer: number | null = null;
  let disposed = false;

  const emit = (next: MediaHealthSnapshot) => {
    if (disposed) return;
    snapshot = next;
    callbacks.onChange(next);
  };

  const clearBufferingTimer = () => {
    if (bufferingTimer !== null) {
      window.clearTimeout(bufferingTimer);
      bufferingTimer = null;
    }
  };

  const clearRetryTimer = () => {
    if (retryTimer !== null) {
      window.clearTimeout(retryTimer);
      retryTimer = null;
    }
  };

  const performRetry = () => {
    if (disposed) return;
    clearRetryTimer();
    const nextRetryCount = snapshot.retryCount + 1;
    emit({ status: 'loading', retryCount: nextRetryCount });
    try {
      media.load();
    } catch {
      emit({
        status: 'error',
        message: 'Media reload failed.',
        errorCode: media.error?.code,
        retryCount: nextRetryCount,
      });
      return;
    }
  };

  const handleLoadStart = () => emit({ status: 'loading', retryCount: snapshot.retryCount });
  const handleLoadedData = () => {
    clearBufferingTimer();
    emit({ status: 'ready', retryCount: snapshot.retryCount });
  };
  const handleCanPlay = () => {
    clearBufferingTimer();
    emit({ status: 'ready', retryCount: snapshot.retryCount });
  };
  const handlePlaying = () => {
    clearBufferingTimer();
    emit({ status: 'ready', retryCount: snapshot.retryCount });
  };
  const handleWaiting = () => {
    clearBufferingTimer();
    bufferingTimer = window.setTimeout(() => {
      if (disposed || media.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) return;
      emit({ status: 'buffering', retryCount: snapshot.retryCount });
    }, BUFFERING_GRACE_MS);
  };
  const handleStalled = () => {
    handleWaiting();
  };
  const handleError = () => {
    clearBufferingTimer();
    const errorCode = media.error?.code;
    const shouldAutoRetry =
      (errorCode === MediaError.MEDIA_ERR_NETWORK || errorCode === MediaError.MEDIA_ERR_ABORTED) &&
      snapshot.retryCount < MAX_AUTO_RETRIES;

    if (shouldAutoRetry) {
      emit({
        status: 'loading',
        message: describeMediaError(media.error),
        errorCode,
        retryCount: snapshot.retryCount,
      });
      retryTimer = window.setTimeout(performRetry, 250 * (snapshot.retryCount + 1));
      return;
    }

    emit({
      status: 'error',
      message: describeMediaError(media.error),
      errorCode,
      retryCount: snapshot.retryCount,
    });
  };

  return {
    attach: () => {
      if (disposed) return;
      media.addEventListener('loadstart', handleLoadStart);
      media.addEventListener('loadeddata', handleLoadedData);
      media.addEventListener('canplay', handleCanPlay);
      media.addEventListener('playing', handlePlaying);
      media.addEventListener('waiting', handleWaiting);
      media.addEventListener('stalled', handleStalled);
      media.addEventListener('error', handleError);
    },
    detach: () => {
      if (disposed) return;
      disposed = true;
      clearBufferingTimer();
      clearRetryTimer();
      media.removeEventListener('loadstart', handleLoadStart);
      media.removeEventListener('loadeddata', handleLoadedData);
      media.removeEventListener('canplay', handleCanPlay);
      media.removeEventListener('playing', handlePlaying);
      media.removeEventListener('waiting', handleWaiting);
      media.removeEventListener('stalled', handleStalled);
      media.removeEventListener('error', handleError);
    },
    retry: performRetry,
    getSnapshot: () => snapshot,
  };
}
