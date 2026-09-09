/**
 * Removed surfaces — ADR-004 (server-side FFmpeg export) and ADR-005
 * (`/api/generateContent` passthrough).
 *
 * `SHIM-004` — owner: WP-01, removal milestone: WP-12. These handlers exist only
 * so an old client receives an explicit, diagnosable `410 Gone` with a migration
 * note instead of a 404 or, worse, a silent success.
 */
import type { Request, Response, Router } from 'express';
import { requestIdOf } from '../middleware/respond';

export const SHIM_GENERATE_CONTENT = 'SHIM-004';
export const GONE_STATUS = 410;

function sendGone(res: Response, replacement: string): void {
  res.status(GONE_STATUS).json({
    ok: false,
    requestId: requestIdOf(res.req as Request),
    error: {
      code: 'NOT_IMPLEMENTED',
      message: 'This API was removed. The client must call the allowlisted operation instead.',
      retryable: false,
      detail: `${SHIM_GENERATE_CONTENT}: use ${replacement}. See docs/contracts/api.md.`,
    },
  });
}

export function registerGoneRoutes(router: Router): void {
  const gone = (replacement: string) => (_req: Request, res: Response) => sendGone(res, replacement);

  router.all('/generateContent', gone('/api/ai/script or /api/ai/speech'));

  router.all('/export/start', gone('browser-native export (ADR-004)'));
  router.all('/export/upload-frame', gone('browser-native export (ADR-004)'));
  router.all('/export/upload-frames', gone('browser-native export (ADR-004)'));
  router.all('/export/upload-audio', gone('browser-native export (ADR-004)'));
  router.all('/export/finish', gone('browser-native export (ADR-004)'));

  // Legacy caption paths, replaced by the /api/captions/* allowlist.
  router.all('/generate-captions', gone('/api/captions/generate'));
  router.all('/refine-captions', gone('/api/captions/refine'));
  router.all('/parse-srt', gone('/api/captions/parse-srt'));
  router.all('/export-srt', gone('/api/captions/export-srt'));
}
