/**
 * Health and capability endpoints (contracts/api.md §2).
 * `/api/health/ai` is the only authority the UI may use to claim AI is available
 * — the hard-coded "API Connected" badge is gone (INV-010).
 */
import type { Router } from 'express';
import { AI_OPERATIONS } from '../config/models';
import type { AiClient } from '../ai/geminiClient';
import { sendSuccess } from '../middleware/respond';

export const SERVER_CONTRACT_VERSION = '2026-09-09-aistudio';

export function registerHealthRoutes(router: Router, options: { aiClient: AiClient }): void {
  router.get('/health', (_req, res) => {
    sendSuccess(res, {
      status: 'ok',
      contractVersion: SERVER_CONTRACT_VERSION,
      capabilities: {
        ai: { configured: options.aiClient.configured, operations: AI_OPERATIONS },
        export: 'browser-native',
        persistence: 'browser-indexeddb',
        serverJobs: false,
        serverMediaProcessing: false,
      },
    });
  });

  router.get('/health/ai', (_req, res) => {
    sendSuccess(res, {
      configured: options.aiClient.configured,
      operations: AI_OPERATIONS,
      // There is no simulation path in this server: a missing key is a 503,
      // never fabricated content (ADR-009 / INV-010).
      simulation: false,
    });
  });
}
