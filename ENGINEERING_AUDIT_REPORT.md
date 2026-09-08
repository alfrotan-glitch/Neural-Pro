# Neural-Pro — Complete Engineering Audit & Repair Report

**Audit date:** 2026-09-08  
**Repository:** Neural-Pro / `neuralpodcast-pro.zip`  
**Audit mode:** repository-wide static inspection, targeted source analysis, regression execution, repair, and post-repair verification  
**Final verdict:** **NOT READY**

## 1. EXECUTIVE VERDICT

**NOT READY for production deployment.**

The repository is substantially engineered and has a coherent domain model around a Zustand project store, command/transaction boundaries, a transport clock, timeline services, caption services, and a browser-oriented render pipeline. The audit also found and repaired several genuine defects, including a preview/export geometry mismatch, persisted-duration handling inconsistency, semantic timeline lane contamination, a stale Blob URL leak, oversized global JSON parsing, rate-limit ordering weaknesses, duplicate application trees, and competing package-manager metadata.

After repair, the repository's available automated regression suite passes under a controlled validation environment using the system TypeScript compiler. The source tree also passed a 260-file TypeScript/TSX syntax parse validation. However, a clean production build, dependency-resolved full typecheck, and real browser/runtime smoke test could not be completed because the container could not finish `npm ci` from the registry within the available execution window and Chromium/`tsx` runtime dependencies were not locally installed. Those are environment/tooling blockers, not proof of source failure, but they prevent an evidence-based production-ready declaration.

There is also an important remaining security/architecture risk: the AI/SRT HTTP endpoints are rate-limited and body-size limited after repair, but the AI endpoints are still unauthenticated. The server export/FFmpeg path is also a secondary implementation that is not referenced by the canonical frontend, so full end-to-end verification of that path was not possible.

### Production-readiness scores

| Dimension | Score |
|---|---:|
| Architecture | 8.0/10 |
| Correctness | 8.0/10 |
| Playback | 8.0/10 |
| Timeline | 8.5/10 |
| Rendering | 8.0/10 |
| Export | 7.0/10 |
| Security | 6.5/10 |
| Performance | 7.0/10 |
| Testing | 7.5/10 |
| Maintainability | 7.5/10 |
| **Overall** | **76.0/100** |

---

## 2. PROJECT ARCHITECTURE

### Repository structure discovered

The root contains the canonical application and supporting systems:

- `src/` — React/TypeScript application and domain/features
- `tests/` — unit/contract/regression suites
- `resolution-test/` — architecture/security/performance contract suites
- `scripts/` — validation and environment checks
- `server.ts` — Express/Vite development + production server and HTTP APIs
- `package.json` / `package-lock.json` — npm-managed build/runtime definition
- `vite.config.ts` / `tsconfig*.json` — frontend/build/type configuration
- `.env.example` — documented environment placeholders
- `public/` — static assets

The final repository contains **260 source files** (`258` TS/TSX among them) and **173 test files**.

### Frontend architecture

The application is React + TypeScript with Vite, Zustand, and feature-oriented source organization. `src/main.tsx` is the browser entry point and renders `App`. The principal studio surface is assembled through `VideoStudioPro` and the `components/VideoStudio` tree.

The state flow is centered on `useProjectStore` with command/service boundaries for domain mutation. Timeline edits are mediated through command/transaction services and transient draft state rather than direct UI mutation of persistent tracks.

### Backend/server architecture

`server.ts` is the root server entry point. It provides:

- Express HTTP APIs for AI/caption/SRT operations
- authenticated session-based export endpoints
- development Vite middleware
- production static serving from `dist`
- validation and rate limiting
- FFmpeg/child-process integration using `spawn`

Vite is now imported dynamically only in development, reducing production coupling to the dev server implementation.

### State ownership / single-source-of-truth assessment

- **Project document:** Zustand `useProjectStore` is the active application authority; persistence serializes a canonical document through project services.
- **Timeline:** project-store tracks are persistent authority; draft/transaction services own transient pointer-preview state until commit.
- **Playback time:** `TransportClock` is the runtime playback clock; `useProjectStore.currentTime` is the persisted/editor/UI position mirror. The split is explicit rather than accidental, but the bridge between runtime media time and persistent UI state remains a complexity hotspot.
- **Media duration:** `getCanonicalClipTimelineDuration` is the central duration helper. The repaired implementation now honors persisted source duration metadata when live media metadata is unavailable.
- **Clip duration:** clip/timeline duration is reconciled against source duration and trim state.
- **Transforms:** transform data is stored on `ClipNode` and shared resolution/render paths are used by preview/export.
- **Captions:** caption timing/theme/word data is stored with text-track content and shared caption rendering contracts are exercised by tests.
- **Audio:** clip audio properties plus centralized runtime mix control are used for playback; waveform visualizations consume actual audio signal data.
- **Export state:** `useExportStore` and `RenderPipeline` represent the primary browser export path. A separate server FFmpeg export path also exists and remains a secondary/unverified path.

### Dependency direction / coupling

The repository has strong domain/service separation in the areas covered by architecture contracts. No automated SCC/cycle result is claimed because one exploratory dependency-graph script itself had a bug and therefore did not produce a valid cycle report. The architecture contract suite passed, and no obvious import-cycle defect was identified manually, but the cycle claim remains **not formally proven**.

---

## 3. CANONICAL SOURCE DECISION

### `src/` vs `Video Stodeo/`

The archive contained a **second complete application tree** under `Video Stodeo/`, including its own source, tests, scripts, `server.ts`, package metadata, lockfile, logs, and an `.env` file.

Evidence used to determine the canonical implementation:

1. Root `package.json` defines the active build/dev/test commands.
2. Root `src/main.tsx` is the application entry point used by the root Vite build.
3. Root source contains a unique current `srtImporter.ts` that was absent from the nested source tree.
4. Root and nested package definitions were effectively duplicates, indicating the nested tree was a copied application rather than a separate supported product.
5. **52 shared source files differed**, with the root implementation consistently containing the newer behavior/fixes in the areas compared.
6. No root imports or runtime paths referenced `Video Stodeo/`.
7. The nested tree contained no source files required by the root after dependency comparison.

**Decision:** root `src/` is canonical. The obsolete duplicate `Video Stodeo/` application tree was removed after comparison and unique-functionality review. Its valuable root-side changes were already the stronger/current implementation and therefore remained in root.

### Package-manager duplication

Both `package-lock.json` and `bun.lock` were present, but `package.json` explicitly declares `npm@10.9.2` and contains npm scripts. No Bun runtime or Bun scripts were present. The Bun lockfile represented a competing dependency graph.

**Repair:** removed `bun.lock`; kept npm as the single supported package manager.

---

## 4. CRITICAL FINDINGS

### F-001 — Preview/export media geometry divergence

- **Severity:** P1
- **Subsystem:** Playback / rendering
- **File:** `src/features/video-studio/playback/services/mediaFrameGeometry.ts`
- **Problem:** preview media-frame sizing used `100%`, while overlay/export contracts expected an 85% media frame. This could cause visible framing divergence between studio preview and final render.
- **Root cause:** competing geometry authority after earlier evolution of the export/preview contract.
- **Impact:** crop/framing mismatch and incorrect visual parity.
- **Evidence:** targeted phase P1 geometry contract failed before repair.
- **Fix:** restored the shared `MEDIA_FRAME_SIZE_PERCENT` contract to **85** and kept preview/export consumers on the same helper.
- **Regression test:** `tests/export/phaseP1-media-frame-geometry.cjs`.
- **Validation:** PASS after repair.

### F-002 — Persisted media duration ignored in canonical timeline-duration calculation

- **Severity:** P1
- **Subsystem:** Timeline / media duration
- **Files:** `src/core/engine/clipTimelineDuration.ts`, `src/features/video-studio/timeline/services/timelineResizeService.ts`
- **Problem:** when live media URLs/metadata were unavailable, persisted source-duration metadata was not consistently used. This created different answers for clip playability/resizing depending on whether a live media element existed.
- **Root cause:** duration logic was implicitly dependent on live URL metadata despite persisted source metadata already being part of the project model.
- **Impact:** inconsistent timeline bounds and resize behavior for loaded/offline projects.
- **Evidence:** boundary/geometry regression suite exposed the inconsistency.
- **Fix:** canonical duration calculation now consults persisted `sourceMediaDuration`/`mediaDuration`/`sourceDuration` and applies trim-in correctly. Resize classification now treats persisted media duration as sufficient media-backed evidence even without a live URL.
- **Regression test:** repaired-defect regression suite + existing P1/P2 timeline contracts.
- **Validation:** PASS.

### F-003 — Semantic lane contamination in smart insertion

- **Severity:** P1
- **Subsystem:** Timeline insertion
- **File:** `src/features/video-studio/project/services/projectService.ts`
- **Problem:** tracks sharing the broad `type === 'effect'` category could be selected for assets whose semantic `laneRole` did not match, allowing e.g. one effect-family asset to land on another effect-family lane.
- **Root cause:** smart insertion used broad track type instead of exact semantic lane role.
- **Impact:** incorrect project semantics and later editing/export behavior.
- **Fix:** smart insertion now resolves `track.laneRole ?? track.type` and requires exact role equality.
- **Regression test:** `tests/phase118-repaired-defect-regressions.cjs` plus updated universal asset-drop contract.
- **Validation:** PASS.

### F-004 — Stale render Blob URL leak

- **Severity:** P2
- **Subsystem:** Render pipeline
- **File:** `src/core/engine/RenderPipeline.ts`
- **Problem:** a stale/cancelled render could create a Blob URL and exit without revoking it.
- **Root cause:** stale-run guard returned before URL cleanup.
- **Impact:** cumulative memory/object-URL leakage during repeated exports or cancellation races.
- **Fix:** stale-run branch now calls `URL.revokeObjectURL(downloadUrl)` before returning.
- **Regression test:** repaired-defect regression suite.
- **Validation:** PASS.

### F-005 — Oversized global JSON parser and weak request-cost controls

- **Severity:** P1/P2
- **Subsystem:** Server/API security
- **File:** `server.ts`
- **Problem:** a broad 50 MB JSON parser applied at application level exposed large request parsing cost to unrelated endpoints. AI/SRT routes also lacked route-specific controls.
- **Root cause:** global parser configuration instead of route-scoped limits.
- **Impact:** avoidable memory/CPU pressure and easier DoS abuse.
- **Fix:** moved to route-scoped limits: 10 MB for AI/SRT text APIs and 72 MB for binary export JSON. Added per-IP/per-route in-memory rate limiting. Rate limiting now executes **before body parsing**, and export authentication executes before the large export JSON parser.
- **Regression test:** `tests/phase118-repaired-defect-regressions.cjs`, `resolution-test/security-stage12.cjs`.
- **Validation:** PASS.

### F-006 — Duplicate application tree and competing Bun lockfile

- **Severity:** P2
- **Subsystem:** Repository architecture / build reproducibility
- **Files:** `Video Stodeo/` entire tree, `bun.lock`
- **Problem:** the archive contained a second complete application and an unsupported second dependency graph.
- **Impact:** silent drift, divergent bug fixes, ambiguous ownership, and build reproducibility risk.
- **Fix:** canonical root implementation retained; duplicate application removed after comparison; `bun.lock` removed because npm is the declared supported package manager.
- **Validation:** root build paths/imports verified; final tree contains no `Video Stodeo/` and no `bun.lock`.

### F-007 — Brittle/incorrect regression fixtures hiding real signal

- **Severity:** P3
- **Subsystem:** Test quality
- **Files:** several phase tests under `tests/`
- **Problem:** some tests encoded source formatting or obsolete semantics rather than behavior; one audio-fade fixture claimed a clip was external media without a media source URL.
- **Impact:** false negatives and developer pressure toward symptom-based code changes.
- **Fix:** updated tests to validate semantic behavior and corrected invalid fixture setup.
- **Validation:** Phase 9 suite PASS under the controlled validation environment.

---

## 5. SECURITY

### Confirmed security posture improvements

- Export authentication remains strict and production fail-closed when the export token is not configured.
- Session identifiers are validated and TTL-bound.
- Export operations use `spawn` with shell execution disabled rather than shell string execution.
- Export input validation includes frame indices, FPS, format allowlisting, data-URL validation, and output-size safeguards.
- AI/SRT request bodies now have route-scoped size limits.
- AI/SRT endpoints now have route-aware rate limiting.
- Rate-limiting and export authorization are performed before expensive JSON body parsing.

### Secret audit

**SECRET FOUND: NO populated secret value was identified.**

A credentials-bearing `.env` file existed inside the obsolete `Video Stodeo/` tree. Its checked secret fields were empty; no secret value is disclosed in this report. The duplicate tree, including that file, was removed. The final repository contains only `.env.example`.

### Remaining security risk — unauthenticated AI endpoints

The AI/SRT endpoints are still callable without application authentication. Rate limiting and size limits reduce abuse cost, but a publicly exposed deployment could still allow direct clients to consume the server's configured Gemini key and quota through these routes.

**Status:** unresolved.  
**Production impact:** this is a deployment-level blocker if the server is directly internet-facing without an upstream authentication/gateway layer.

A future hardening step should establish explicit application authorization (or trusted reverse-proxy authentication) for the AI endpoints and constrain the accepted Gemini model/config surface to the application's intended capabilities.

---

## 6. PLAYBACK / TIMELINE RELIABILITY

### Playback assessment

The playback design has a recognizable authoritative runtime clock: `TransportClock` drives elapsed playback, while project-store `currentTime` acts as persisted/editor state. Media elements are treated as slaves through synchronization/mapping services instead of being allowed to become independent application clocks.

Boundary conditions are explicitly represented in the domain helpers and targeted tests include zero, clip-end, short clips, seeking, and synchronization-oriented contracts.

**Assessment:** strong architecture, but real browser frame-accuracy and multi-media drift behavior remain **unverified in this environment** because browser dependencies could not be installed/launched.

### Timeline assessment

Timeline editing is organized around commands, draft interaction, transaction boundaries, resize/placement services, and domain validation. Targeted contracts passed for drag coordinate integrity, dynamic track geometry, universal asset insertion, resize/snap feasibility, multi-selection atomic geometry, transform integrity, auto-keyframe behavior, and the repaired duration semantics.

The repaired persisted-duration path removes an important source of offline/project-load divergence.

**Assessment:** **8.5/10** — reliable design with good invariant coverage; browser pointer-concurrency behavior is still not empirically profiled here.

---

## 7. RENDER / EXPORT RELIABILITY

### Primary browser render path

The browser-side `RenderPipeline` and renderer contract are the stronger/canonical path in the repository. Preview/export geometry and caption animation contracts pass the available regression suites. The repaired Blob URL cleanup closes a concrete stale-run resource leak.

### Secondary server FFmpeg path

`server.ts` also defines an authenticated FFmpeg/export path with stronger production security controls. However, no frontend import/call path references that server export route in the canonical client, so it functions as a secondary or externally callable path.

**Risk:** two physically distinct export implementations can drift. This has not been removed because external consumers may exist outside this repository, but it lowers maintainability and makes full parity harder to prove.

### Preview == Export

The audit verified a number of shared visual contracts, including media-frame geometry and caption parity. The targeted parity suites pass. Full audiovisual frame-by-frame equivalence was **not** runtime verified in a real browser/export environment.

**Assessment:** **7.0/10** because code-level parity is good, but end-to-end real export evidence is incomplete.

---

## 8. PERFORMANCE

The codebase contains explicit protections around several known hot paths:

- no per-frame media query pattern in the reviewed clock path
- centralized audio routing
- RAF-based pointer/mousemove handling
- cached geometry for lasso interaction
- no JSON deep-clone pattern in the reviewed drag hot path
- waveform uses actual signal data rather than synthetic rendering

Static complexity review did not uncover a confirmed catastrophic O(n²) defect in the audited paths.

### Remaining performance risk

`VideoStudioPro` and its descendants have many subscriptions to current playback state and the top-level studio is re-rendered around transport updates. The repository lacks a completed browser performance profile with a large project, so render-frequency/memory behavior under hundreds of clips remains a **measurement gap**, not a proven regression.

**Assessment:** **7.0/10**.

---

## 9. TEST QUALITY

### What was actually executed

The repaired regression and architecture/security/performance contracts were executed under a controlled environment using the system TypeScript compiler through temporary validation shims. The temporary shims were removed afterward.

The resulting Phase 9 suite concluded:

`PHASE9_TEST_SUITE=PASS`

The repaired defect suite concluded:

`PHASE118_REPAIRED_DEFECT_REGRESSIONS=PASS`

Additional targeted contracts reported PASS for domain integrity, API route integrity, cross-feature integration, caption animation parity, persistence schema safety, media-frame geometry, audio fade duration, timeline interaction geometry, universal asset insertion, resize/snap feasibility, preview transforms, and auto-keyframe contracts.

### Test quality limitations

- Browser-level execution was unavailable.
- Full dependency-resolved TypeScript compilation was unavailable.
- No evidence was obtained from a real production encoder/browser on long/large projects.
- Some historical tests were brittle and were repaired to test behavior instead of exact source formatting.
- The repository still contains broad `any` usage; this weakens compiler-assisted test confidence in several areas.

**Assessment:** **7.5/10**.

---

## 10. REPAIRS PERFORMED

1. Restored the shared media-frame geometry constant to 85% for preview/export parity.
2. Reworked canonical clip-duration calculation to honor persisted source-duration metadata and apply trim-in correctly.
3. Updated timeline resize media classification to recognize persisted media duration without a live URL.
4. Enforced exact semantic `laneRole` matching in smart insertion.
5. Revoked stale Blob URLs in render race/cancellation paths.
6. Replaced broad global JSON parsing with route-specific request limits.
7. Added route-aware per-IP API rate limiting for AI/SRT operations.
8. Moved rate limiting ahead of request-body parsing.
9. Moved export authentication ahead of the large export JSON parser.
10. Dynamically imported Vite only in development server mode.
11. Moved Vite/Tailwind/Vite React plugin packages from production dependencies to devDependencies.
12. Removed unsupported/competing `bun.lock`.
13. Removed obsolete `Video Stodeo/` duplicate application tree after canonical-source reconciliation.
14. Added `tests/phase118-repaired-defect-regressions.cjs` and integrated it into Phase 9.
15. Repaired several brittle/incorrect legacy test contracts and fixtures to assert behavior rather than implementation formatting.

---

## 11. VALIDATION RESULTS

| Command / Check | Result | Classification | Important output |
|---|---|---|---|
| `npm ci --dry-run --offline` | PASS | Code/config | npm lockfile/package metadata consistent; dry run planned 352 packages |
| `node tests/phase9/test-runner.cjs` | PASS under controlled TS validation shim | Code | `PHASE9_TEST_SUITE=PASS` |
| repaired defect suite | PASS | Code | `PHASE118_REPAIRED_DEFECT_REGRESSIONS=PASS` |
| TypeScript/TSX syntax parse across 260 source files | PASS | Code | `TYPE_SYNTAX_FILES=260`, `TYPE_SYNTAX=PASS` |
| `npm run build` | BLOCKED | Environment/tooling | `vite: not found` because local dependencies could not be installed |
| `npm run typecheck` | BLOCKED | Environment/tooling | missing local dependency/type packages; incomplete `node_modules` |
| `npm test` | BLOCKED in clean environment | Environment/tooling | several test helpers require local `node_modules/typescript` |
| browser runtime smoke | BLOCKED | Environment/tooling | `BROWSER_E2E=BLOCKED: local tsx runtime is not installed` |
| `npm ci` real install | BLOCKED | Network/environment | registry install did not complete within execution window |
| dependency/build environment verification | BLOCKED | Environment/tooling | local Vite/native optional deps unavailable |
| targeted architecture/security/performance contracts | PASS | Code | security-stage12, performance-stage11, API route integrity, domain integrity, cross-feature contracts pass under controlled validation |

### Important distinction

The blocked `npm run build`, `npm run typecheck`, `npm test`, and browser smoke checks are **not being reported as application code failures**. They are environment/tooling failures caused by missing installable local dependencies in this execution environment. Because those checks did not run in a normal dependency-resolved environment, production readiness cannot be asserted.

---

## 12. REMAINING RISKS

### Blockers

1. **Full dependency-resolved build/typecheck not completed.** The repository needs to be validated in an environment where `npm ci` can finish successfully.
2. **Browser/runtime verification not completed.** Real playback, rapid seeks, frame timing, multi-source synchronization, and actual export should be exercised with Chromium and the required runtime dependencies.
3. **AI endpoint authorization remains unresolved.** If the Express server is public, AI routes need application authorization or a trusted upstream gate.
4. **Secondary FFmpeg export path is not end-to-end verified against the canonical browser export contract.**

### Non-blocking but material risks

- broad `any` usage remains in the TypeScript codebase (`~120` token occurrences in the audited source/server text, including `~13` explicit `as any` casts); this should be reduced around core domain boundaries.
- only limited browser-performance evidence exists for very large timelines.
- dependency vulnerability scanning against a fully installed lockfile was not possible because dependency installation was blocked.
- the automated dependency-cycle script used during exploratory audit contained its own path-concatenation bug, so no formal SCC result is claimed.

---

## 13. PRODUCTION READINESS SCORE

**Overall: 76.0 / 100**

The application is materially above prototype quality and has several professional-grade architectural controls, but the combination of incomplete runtime evidence and unresolved public AI API authorization keeps it below a defensible production-ready threshold.

---

## 14. FINAL VERDICT

# NOT READY

The repaired repository is the **canonical root implementation**, has no silently competing `Video Stodeo/` application tree, has npm as the single declared package manager, and passes the available controlled regression/architecture/security/performance validation.

It should **not** yet be declared production-ready.

### Exact blockers before production

**BLOCKER 1 — Clean install + build/typecheck:** run `npm ci`, `npm run typecheck`, `npm test`, and `npm run build` in a normal network-enabled CI environment and require clean results.

**BLOCKER 2 — Browser/runtime certification:** run browser smoke tests and real media scenarios with Chromium, including rapid seek/play/pause, multi-media synchronization, short clips, media metadata delays, captions, transforms, and actual export.

**BLOCKER 3 — AI API authorization:** protect `/api/generateContent`, `/api/generate-captions`, `/api/refine-captions`, and related AI/SRT endpoints with application authorization or a trusted gateway before exposing the server publicly.

**BLOCKER 4 — Export-path reconciliation:** decide whether the server FFmpeg export is a supported second product path. If yes, add end-to-end parity tests; if not, document/decommission it after checking external consumers.

With those blockers resolved and clean runtime evidence obtained, the repository is a strong candidate for a further production-hardening pass rather than a rewrite.
