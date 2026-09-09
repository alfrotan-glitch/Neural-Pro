/**
 * Project frame rate for caption timecode conversion (D-022).
 *
 * There is no default fps anywhere: an unreadable project frame rate is a typed
 * failure, so a 24 or 60 fps project can never be silently converted at 30.
 */
import { useProjectStore } from '../../../../store/useProjectStore';
import { createAppError } from '../../../../domain/errors/appError';

export function getProjectFps(): number {
  const fps = useProjectStore.getState().metadata?.fps;
  if (typeof fps !== 'number' || !Number.isFinite(fps) || fps <= 0 || fps > 120) {
    throw createAppError({
      code: 'VALIDATION_FAILED',
      message: 'The project frame rate is not valid, so caption timecodes cannot be converted.',
      retryable: false,
      context: { fps: String(fps) },
    });
  }
  return fps;
}
