/**
 * Neural-Pro server bootstrap — AI Studio Node.js runtime.
 *
 * This file is intentionally thin: every route, schema, policy and AI operation
 * lives in `server/**`. What remains here is process wiring — environment, the
 * HTTP listener, and mounting the client build.
 *
 * Removed by ADR-004 / ADR-005 (see `server/operations/gone.ts`):
 *   • `/api/export/*` (frame uploads, sessions, `spawn('ffmpeg')`, `/tmp` paths)
 *   • `/api/generateContent` (unauthenticated model/config passthrough)
 * There is no server-side media processing, no filesystem persistence and no
 * background job runner in this runtime (ARCHITECTURE FREEZE).
 */
import path from 'path';
import { createApp } from './server/app';
import { readServerEnv, redact } from './server/config/env';
import { createLogger } from './server/middleware/requestContext';
import { errorHandler } from './server/middleware/respond';

async function startServer(): Promise<void> {
  const logger = createLogger();
  const env = readServerEnv(process.env, { warn: (message) => logger.warn('env.warning', { message }) });
  const { app } = createApp({ env, logger });

  logger.info('server.boot', {
    nodeEnv: env.nodeEnv,
    port: env.port,
    aiConfigured: Boolean(env.geminiApiKey),
    aiKey: redact(env.geminiApiKey),
    sessionSecretConfigured: env.sessionSecretConfigured,
  });

  // Vite is a development-only runtime. Keep it out of the production server
  // dependency graph by loading it only when the development middleware is used.
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    const express = (await import('express')).default;
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // The API error handler is registered inside `createApp`; this second one only
  // covers failures raised by the static/client middleware mounted above.
  app.use(errorHandler({ logger, exposeDetail: env.nodeEnv !== 'production' }));

  app.listen(env.port, env.host, () => {
    logger.info('server.listening', { port: env.port, host: env.host });
  });
}

void startServer();
