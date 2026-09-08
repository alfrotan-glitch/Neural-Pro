# Runbooks

Every runbook states: symptom → diagnose → act → verify → escalate.

---

## RB-01 — Server will not start

**Symptom:** container exits, no TCP on `$PORT`.

1. Read the first error line: `logger.error('server.env_missing')` or a thrown config error.
2. `curl -fsS localhost:$PORT/api/health`.
3. Check `PORT` is set (Cloud Run injects it; local defaults to 3000).
4. Check `node -v` satisfies `engines` (`>=20.18.0 <23`).
5. If the log shows a native-module failure → `better-sqlite3` was reintroduced; remove it.
6. **Verify:** `/api/health` returns 200 with `status:'ok'`.
7. **Escalate:** deployment owner.

## RB-02 — AI features return "not configured"

1. `curl -fsS $APP_URL/api/health/ai` → `configured:false`.
2. Confirm `GEMINI_API_KEY` is present in the service environment (AI Studio: Settings →
   Secrets; Cloud Run: revision env). Never print the value.
3. Redeploy/restart so the process picks it up (the server reads env at boot).
4. **Verify:** `/api/health/ai` → `configured:true` with the expected `operations` list.
5. **Do NOT** enable `AI_ALLOW_SIMULATION` to "fix" this. Simulation returns fabricated
   content and must never be the answer to a missing key.

## RB-03 — Suspected AI abuse / cost spike

1. Dashboard: AI calls/min by operation, token totals.
2. Identify the top talkers by `tokenId` and IP.
3. Revoke/restart to invalidate session tokens if needed.
4. Tighten limits (per-token buckets) or set `AI_DAILY_TOKEN_BUDGET`.
5. If the passthrough route is still reachable in any environment, **remove it** (D-002).
6. **Verify:** call rate returns to baseline; error mix normalises.
7. **Escalate:** security owner + billing owner.

## RB-04 — Exports fail for all users

1. Determine the phase from the client's `export.failed` event (`validate` / `prepareMedia` /
   `renderAudio` / `encodeVideo` / `finalize`).
2. `validate` failures with `ASSET_MISSING` → the project references a missing asset; this is
   a **client/persistence** issue, not a server one.
3. `encodeVideo` failures with `ENCODE_FAILED` → check browser capability support
   (`VideoEncoder.isConfigSupported`); most likely a browser/version regression.
4. Check whether a recent commit touched `buildCanonicalRenderPlan`, the renderer, or the
   media pool → roll the revision forward/back.
5. **Verify:** run the L1 parity suite and the headless export test.

## RB-05 — Export stuck in "rendering"

1. This is D-010 if it happens after a cancel. Confirm the workflow runtime is in use
   (post-WP-04): a run in `rendering` with no heartbeat for `> runTimeoutMs` must be
   reclassified `expired`.
2. Trigger the recovery workflow (W5) manually from the UI or console.
3. **Verify:** the run reaches a terminal state and `resource.leaked` shows no new leaks.

## RB-06 — White screen after an action

1. Open the console; capture the thrown invariant (`assertValidProjectState`,
   `assertNoLockedTrackContentMutation`, …).
2. This is D-013: there is no error boundary. Install one (WP-07) — then the user gets
   "Undo last action" instead of a blank page.
3. Recover the user's project from the previous persisted version.
4. **Verify:** the saved document loads; the failing command is reproduced in a test.

## RB-07 — Users report media missing after reload

1. Confirm the project document version and whether clips carry `assetId` or `blob:` URLs.
2. If `blob:` → D-006; run the V1→V2 migration (WP-05) and relink.
3. If `assetId` but the asset is gone → quota eviction or IndexedDB cleared (private mode).
4. **Verify:** reload restores media; `saveProject` returns no `MediaMissingWarning`.

## RB-08 — Deployment succeeds but the page is blank / 403

1. Vite dev proxy: ensure `server.allowedHosts` permits the preview host (already set to
   `true` in this repo).
2. Production: ensure `express.static(dist)` + SPA fallback are active
   (`NODE_ENV=production`).
3. Check the CSP header is not blocking inline assets.
4. **Verify:** fetch `/`, then a deep route, then `/api/health`.

## RB-09 — Rollback

1. Cloud Run: pin the previous revision. No data migration is required (server stateless;
   export client-side).
2. Project documents are forward-compatible-by-default: an older client refuses a newer
   `schemaVersion` with a clear message rather than corrupting it.
3. **Verify:** health probe green, smoke test of one AI operation and one export.
