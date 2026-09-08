# Runtime Certification Plan

**Purpose:** the scripted sequence that turns `ENGINEERING READY` into `RUNTIME CERTIFIED`.
Nothing here may be claimed before it is executed.

---

## 1. What certification means

| Level | Requires |
|---|---|
| ENGINEERING READY | all static + executable gates pass; browser/deployment gates may be BLOCKED with named owners |
| **RUNTIME CERTIFIED** | ENGINEERING READY **and** every step in §2 executed with a recorded result |
| PRODUCTION READY | RUNTIME CERTIFIED + monitoring/alerting live + rollback rehearsed + soak clean |

Certification is **per-surface**. Partial certification is recorded per surface; a claim of
`RUNTIME CERTIFIED` without a surface qualifier means every surface in §2 passed.

## 2. Certification sequence

### Stage A — Environment readiness (WP-00 / WP-07)
1. Provision Node matching `engines`; run `npm ci` in a **clean container**. Record exit code.
2. Provision Chromium (Playwright) with WebCodecs enabled. Record the version and
   `VideoEncoder.isConfigSupported` output for the codec matrix.
3. Confirm network egress policy: can the environment reach
   `generativelanguage.googleapis.com`? If not, Stage E is BLOCKED — record it.

### Stage B — Static gates (WP-00 / WP-07 / WP-08)
4. `npm run typecheck` → 0
5. `npm run lint` → 0 (boundaries included)
6. Layer-graph test: no cycle; domain purity
7. No secret / no host / no port / no absolute path tests
8. `npm run build` → success; inspect `dist/` size and asset list

### Stage C — Executable gates (WP-02 … WP-11)
9. All six audit reproductions exit 0
10. Full behavioural suite green; report archived
11. Parity suite L1 green with a recorded `maxGeometricError`
12. Resource balance zero across success/failure/cancel/timeout/unmount
13. Persistence round-trip, missing-asset, quota, corrupt-document tests green
14. Workflow terminal-state tests green for W1–W5
15. Server contract tests green (auth, validation, limits, error mapping)

### Stage D — Browser certification (WP-06 / WP-10)
16. Launch the app in Chromium with a **local** fixture project (no network media).
17. Run the **headless-export test**: export with the Preview unmounted; assert the MP4
    exists, is non-trivial in size, and decodes to the expected frame count and duration.
18. Run the **pixel-parity suite**; archive the report with `cases`, `passed`, `failed`,
    `maxPixelDiffRatio`.
19. Run the **memory-growth test**: 50 export iterations; assert no monotonic heap growth.
20. Run the **interaction smoke**: import media → edit → save → reload → export; assert no
    console errors, no unhandled rejections, no error-boundary triggers.
21. Accessibility smoke: keyboard traversal of the primary flows; label/contrast audit.
22. Repeat 17 on Firefox and Safari **if** WebCodecs is available there; otherwise record
    `BLOCKED` per browser with the capability evidence.

### Stage E — Live-service certification (WP-10)
23. Deploy to Cloud Run (or run the container locally with a real `GEMINI_API_KEY`).
24. `GET /api/health` → 200 with the capability block.
25. `GET /api/health/ai` → `configured: true`.
26. One real `/api/ai/script` call → 200, schema-valid, record `requestId` and latency.
27. One real `/api/ai/speech` call → 200; assert the declared sample rate/channels match the
    decoded audio; record the duration.
28. Negative tests against the live service: no token ⇒ 401; crafted model id ⇒ 400;
    N+1 requests ⇒ 429; removed routes ⇒ 410/Gone or 404.
29. Verify no key material appears in any response or log line.

### Stage F — Deployment certification (WP-07)
30. Container boot with `PORT=8080` → `/api/health` 200.
31. `NODE_ENV=production npm start` → fetch `/` and a deep route → 200 + SPA HTML.
32. `SIGTERM` → exit 0 within 10 s.
33. Rollback rehearsal: pin the previous revision, re-run 30.
34. Scale-to-zero and cold-start check.

## 3. Evidence artefact

Each stage writes a machine-readable record:

```json
{ "stage":"D", "surface":"export", "status":"PASS",
  "commands":[ {"cmd":"npm run test:parity:browser","exit":0,"report":"reports/parity-2026-09-08.json"} ],
  "cases": 128, "passed": 128, "failed": 0,
  "environment": { "node":"v22.x", "chromium":"13x", "egress": false },
  "commit":"<sha>", "executedAt":"2026-09-08T…", "executedBy":"<agent/role>" }
```

## 4. Blockers known today

| Stage | Blocker | Unblock owner |
|---|---|---|
| D | No browser runtime provisioned in this environment | WP-00 |
| E | No egress to `generativelanguage.googleapis.com` | WP-10 (run in an environment with egress) |
| F | No container runtime exercised yet | WP-07 |
| D | No local fixture media (default project streams from remote hosts) | WP-06 |

A stage that cannot run is recorded `BLOCKED` with the blocker and the owner. **BLOCKED is not
PASS.** Certification of a surface that depends on a BLOCKED stage is impossible; the honest
answer is `ENGINEERING READY — RUNTIME CERTIFICATION PENDING`.

## 5. Re-certification triggers

Re-run the full sequence after any change to: the render plan, either renderer, the media
pool, the encoder path, the persistence schema, the AI operation contracts, or the deployment
configuration. Re-run Stage D after any change to `VideoPlayer.tsx` or `VideoStudioPro.tsx`.
