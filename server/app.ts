/**
 * Express application factory.
 *
 * Pure wiring: no `listen`, no filesystem, no Vite. That keeps the whole API
 * surface executable in a test (`tests/server/*.test.mts`) without binding a
 * port or touching the client build.
 */
import express from 'express';
import type { Express, Router } from 'express';
import { readServerEnv } from './config/env';
import type { ServerEnv } from './config/env';
import { createLogger, requestContext, securityHeaders } from './middleware/requestContext';
import type { ServerLogger } from './middleware/requestContext';
import { apiNotFound, errorHandler } from './middleware/respond';
import { createRateLimiter } from './middleware/rateLimit';
import type { RateLimiter } from './middleware/rateLimit';
import { ConcurrencyGuard } from './middleware/rateLimit';
import { createSessionIssuer } from './auth/session';
import type { SessionIssuer } from './auth/session';
import { ALL_SCOPES } from './auth/session';
import { createAiClient } from './ai/geminiClient';
import type { AiClient, GeminiTransport } from './ai/geminiClient';
import { AI_MODELS } from './config/models';
import { registerHealthRoutes, SERVER_CONTRACT_VERSION } from './operations/health';
import { registerGoneRoutes } from './operations/gone';
import { registerAiRoutes } from './operations/ai';
import { registerCaptionRoutes } from './operations/captions';
import { rateLimit } from './middleware/rateLimit';
import { asyncHandler, sendSuccess } from './middleware/respond';

/** 10 MB for every JSON route (contracts/api.md §5). */
export const MAX_TEXT_REQUEST_BYTES = '10mb';

export interface CreateAppOptions {
  readonly env?: ServerEnv;
  readonly logger?: ServerLogger;
  readonly now?: () => number;
  readonly aiClient?: AiClient;
  readonly transport?: GeminiTransport;
  readonly limiter?: RateLimiter;
  readonly secure?: boolean;
}

export interface CreatedApp {
  readonly app: Express;
  readonly env: ServerEnv;
  readonly issuer: SessionIssuer;
  readonly limiter: RateLimiter;
  readonly aiClient: AiClient;
  readonly logger: ServerLogger;
}

export function createApp(options: CreateAppOptions = {}): CreatedApp {
  const env = options.env ?? readServerEnv();
  const now = options.now ?? Date.now;
  const logger = options.logger ?? createLogger({ now });
  const limiter = options.limiter ?? createRateLimiter();
  const issuer = createSessionIssuer({ secret: env.sessionSecret, ttlMs: env.sessionTtlMs, now });
  const concurrency = new ConcurrencyGuard(AI_MODELS.script.maxConcurrentPerToken);
  const aiClient =
    options.aiClient ??
    createAiClient({
      apiKey: env.geminiApiKey,
      ...(options.transport ? { transport: options.transport } : {}),
      logger,
      concurrency,
      now,
    });

  const app = express();
  app.disable('x-powered-by');
  if (env.trustProxy) app.set('trust proxy', true);

  app.use(securityHeaders({ secure: options.secure ?? env.nodeEnv === 'production' }));
  app.use(requestContext({ logger, now }));

  const api: Router = express.Router();
  api.use(express.json({ limit: MAX_TEXT_REQUEST_BYTES }));

  registerHealthRoutes(api, { aiClient });
  registerGoneRoutes(api);

  api.get(
    '/session',
    rateLimit({ limiter, rule: { perIpPerMinute: 120, perTokenPerMinute: 120 }, operation: 'session', now }),
    asyncHandler(async (req, res) => {
      req.requestContext!.operation = 'session.issue';
      const { token, claims } = issuer.issue(ALL_SCOPES);
      sendSuccess(res, { token, expiresAt: claims.exp, scopes: claims.scopes, contractVersion: SERVER_CONTRACT_VERSION });
    }),
  );

  registerAiRoutes(api, { aiClient, issuer, limiter, concurrency, now });
  registerCaptionRoutes(api, { aiClient, issuer, limiter, now });

  api.use(apiNotFound());
  app.use('/api', api);

  app.use(errorHandler({ logger, exposeDetail: env.nodeEnv !== 'production' }));

  return { app, env, issuer, limiter, aiClient, logger };
}
