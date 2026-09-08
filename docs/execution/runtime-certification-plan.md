# Runtime Certification Plan (AI Studio)

**Revised 2026-09-09.** Certification is now based on the **Google AI Studio Web App runtime**.
External deployment (container/Cloud Run) is demoted to an **optional** stage.

---

## 1. What certification means

| Level | Requires |
|---|---|
| ENGINEERING READY | static + executable gates pass; AI Studio and browser gates may be `BLOCKED` with named owners |
| **RUNTIME CERTIFIED** | ENGINEERING READY **and** every stage below executed with a recorded result — **including G-31 (AI Studio compatibility) PASS in both contexts** |
| PRODUCTION READY | RUNTIME CERTIFIED + monitoring/alerting live + rollback rehearsed + soak clean |

Certification is **per-surface**. `RUNTIME CERTIFIED` without a surface qualifier means every
surface passed.

**Hard rule:** a claim of RUNTIME CERTIFIED is impossible while the AI Studio compatibility gate
G-31 is not PASS, because "runtime" *means* the AI Studio Web App runtime.

## 2. Certification sequence

### Stage A — Environment readiness (WP-00 / WP-07)
1. Node matching `engines`; `npm ci` in a clean environment. Record exit code.
2. Chromium (Playwright) with WebCodecs enabled; record the version and the
   `VideoEncoder.isConfigSupported` matrix.
3. **Access to Google AI Studio Build mode for this project**
   (`ai.studio/apps/bdf5ad65-6c0d-48f4-8ba5-1e1a337f20ce`). If unavailable, Stage C is BLOCKED.
4. Confirm whether the environment can reach `generativelanguage.googleapis.com`. If not, the
   live-AI items are BLOCKED — record them, do not substitute.

### Stage B — Static gates (WP-00 / WP-07 / WP-08)
5. `npm run typecheck` → 0
6. `npm run lint` → 0 (boundaries included)
7. Layer-graph test: no cycle; domain purity
8. No secret / no host / no absolute path; **no `spawn` and no native dependency**
9. `metadata.json` parses and matches the AI Studio manifest schema (AS-INV-13)
10. `npm run build` → success; inspect `dist/` size and asset list; assert no secret in assets

### Stage C — **AI Studio compatibility gate (WP-13)** — the decisive stage
11. Open the project in AI Studio Build mode; run `GET /api/runtime/capabilities`.
12. Execute **G-31 / AS-01…AS-16** in the **preview frame** (context P). Record per-criterion
    evidence.
13. **Publish** the app (Starter Tier suffices). Re-execute AS-01…AS-16 against the published
    URL (context U).
14. Resolve every `P-01…P-06` runtime unknown with the recorded result.
15. Write `reports/ai-studio-compatibility-<date>.json` + evidence artefacts.
16. Any FAIL becomes a defect with an owning WP. Any BLOCKED names the missing capability and an
    owner.

### Stage D — Executable gates (WP-02 … WP-11)
17. All six audit reproductions exit 0
18. Full behavioural suite green; report archived
19. Parity suite L1 green with a recorded `maxGeometricError`
20. Resource balance zero across success/failure/cancel/timeout/unmount
21. Persistence round-trip, missing-asset, quota, corrupt-document tests green
22. Workflow terminal-state tests green for W1–W5
23. Server contract tests green: auth, validation, limits, error mapping, bounded timeouts

### Stage E — Browser certification (WP-06 / WP-10)
24. Launch the app in Chromium with a **local** fixture project (no network media).
25. Headless-export test: export with Preview unmounted; assert the MP4 decodes to the expected
    frame count and duration.
26. Pixel-parity suite; archive the report with `cases`, `passed`, `failed`, `maxPixelDiffRatio`.
27. Memory-growth test: 50 export iterations; no monotonic heap growth.
28. Interaction smoke: import → edit → save → reload → export; no console errors, no unhandled
    rejections, no error-boundary triggers.
29. Accessibility smoke: keyboard traversal, labels, contrast.
30. Repeat 25–28 on Firefox/Safari **where WebCodecs exists**; otherwise record BLOCKED per
    browser with capability evidence.

### Stage F — Live-service certification (WP-10)
31. Against the **published AI Studio app**: `/api/health` → 200 with the capability block.
32. `/api/health/ai` → `configured: true`.
33. One real `/api/ai/script` → 200, schema-valid, non-simulated; record `requestId` + latency.
34. One real `/api/ai/speech` → 200; declared sample rate/channels match the decoded audio;
    record duration.
35. Negative tests on the live service: no token ⇒ 401; crafted model id ⇒ 400; N+1 ⇒ 429;
    removed routes ⇒ 410/404.
36. Verify no key material appears in any response or log line.

### Stage G — **Optional external deployment** (WP-07) — NOT required for certification
37. `PORT=8080` boot → `/api/health` 200
38. `NODE_ENV=production` static serving + deep route
39. `SIGTERM` → exit 0 within 10 s
40. Rollback rehearsal

Failing Stage G downgrades the optional external path only. It never affects the AI Studio
certification.

## 3. Evidence artefact

```json
{ "stage":"C", "surface":"ai-studio", "context":"preview",
  "status":"PASS",
  "criteria":[ {"id":"AS-09","status":"PASS","evidence":"reports/…/export-09.mp4",
                "frames":1350,"durationSec":45.0} ],
  "unknowns": {"P-01":"download permitted","P-02":"storage not partitioned"},
  "environment": { "aiStudioAppId":"bdf5ad65-…", "browser":"Chrome 14x" },
  "commit":"<sha>", "executedAt":"2026-09-…", "executedBy":"<role>" }
```

## 4. Blockers known today

| Stage | Blocker | Unblock owner |
|---|---|---|
| A/C | **No access to Google AI Studio from this environment** | WP-13 (must be run by a human/agent with AI Studio access) |
| A/F | No egress to `generativelanguage.googleapis.com` | WP-10 / Stage F in an environment with egress |
| E | No browser runtime provisioned here | WP-00 |
| E | No local fixture media (default project streams from remote hosts) | WP-06 |
| G | No container runtime exercised | WP-07 (optional stage) |

A stage that cannot run is recorded **BLOCKED** with the blocker and the owner.
**BLOCKED is not PASS.** With Stage C blocked, the honest claim is
`ENGINEERING READY — RUNTIME CERTIFICATION PENDING`.

## 5. Re-certification triggers

Re-run Stage C after any change to: the export path, the server boundary, persistence,
`metadata.json`, `vite.config.ts`, the AI surface, or the publish configuration.
Re-run Stage E after any change to `VideoPlayer.tsx`, `VideoStudioPro.tsx` or either renderer.
