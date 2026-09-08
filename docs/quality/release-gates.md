# Release Gates

Each gate names the required verification **class**. A gate is `PASS` only when the named
command ran and succeeded. `BLOCKED` requires a named missing capability and an owner.

**Status legend:** `PASS` · `FAIL` · `PARTIAL` · `BLOCKED` · `UNVERIFIED`

---

## Gate table

| # | Gate | Required class | Command / evidence | Current | WP |
|---|---|---|---|---|---|
| G-01 | Clean, reproducible install | executable | `npm ci` in a clean container | **FAIL** (D-012) | WP-07 |
| G-02 | Typecheck | static | `npm run typecheck` | **PASS** | – |
| G-03 | Lint + layer boundaries | static | `npm run lint` | **ABSENT** | WP-07 |
| G-04 | Behavioural test suite | executable | `npm test` (post WP-06) | **FAIL** (177/191 greps) | WP-06 |
| G-05 | Audit reproductions | executable | `repro-export-registry`, `repro-transform-order`, `repro-media-cover-clip`, `repro-export-queue`, `repro-ondequeue-leak` all exit 0 | **FAIL** (5/5 fail) | WP-02/03/04/11 |
| G-06 | Deadlock guard | executable | `repro-queue-deadlock.mts` exits 0 | **PASS** (guard) | WP-04 |
| G-07 | Export independence | executable | export with Preview unmounted | **FAIL** | WP-02 |
| G-08 | Render parity L1 (semantic) | executable | parity suite | **FAIL** | WP-03 |
| G-09 | Render parity L2 (pixel) | browser | Playwright + pixelmatch report | **BLOCKED** (no browser runtime) | WP-06 |
| G-10 | Resource balance | executable | probe zero across all scenarios | **FAIL** | WP-11 |
| G-11 | Workflow terminal states | executable | cancel/fault at every step | **FAIL** | WP-04 |
| G-12 | Persistence round-trip | executable | save → reload → resolve | **FAIL** (D-006) | WP-05 |
| G-13 | No blob URLs persisted | executable | serialise assertion | **FAIL** | WP-05 |
| G-14 | FPS single authority | executable | fps propagation at 24/30/60 | **FAIL** | WP-11 |
| G-15 | Measured duration authority | executable | import + generated-audio duration | **FAIL** (D-024) | WP-11 |
| G-16 | AI abuse surface closed | executable + static | crafted body ⇒ 400; no model id outside registry | **FAIL** | WP-01 |
| G-17 | Authorisation unconditional | executable | dev-mode privileged request ⇒ 401 | **FAIL** | WP-01 |
| G-18 | No fabricated success | executable | five failure modes ⇒ non-2xx | **FAIL** | WP-09 |
| G-19 | No secret in client bundle | static | `grep` over `dist/**` | **PASS** (value) / mechanism present | WP-07 |
| G-20 | No host-specific path/port | static | grep for `/tmp`, `localhost`, literal ports | **FAIL** | WP-07 |
| **G-31-P** | **Preview Compatibility Gate** — AS-01…AS-16 in Context P (AI Studio Preview / Build mode) | **AI Studio + browser + live-service** | per-criterion record: status + evidence class + evidence ref + timestamp + context + reproducibility | **UNVERIFIED** | WP-13 |
| **G-31-U** | **Published App Compatibility Gate** — AS-01…AS-16 in Context U (published AI Studio app) | **AI Studio + browser + live-service** | same, recorded separately | **UNVERIFIED** | WP-13 |
| **G-31** | **AI Studio compatibility gate** | derivation | **PASS iff G-31-P = PASS AND G-31-U = PASS**; otherwise FAIL (evidence of incompatibility), BLOCKED (runtime access/evidence unavailable) or UNKNOWN (incomplete evidence but execution possible) | **UNVERIFIED** | WP-13 |
| G-21 | Server boots under `PORT` | deployment (**optional external**) | optional container run with `PORT=8080` → `/api/health` 200 | **BLOCKED** (optional) | WP-07 |
| G-32 | No mandatory external-platform dependency (static + runtime) | static + AI Studio | no unauthorised external **media-processing/rendering/export** dependency; Gemini AI operations are permitted. Static: no `spawn`, no native dep | **FAIL** today (`spawn('ffmpeg')`) | WP-01 |
| G-22 | Production static serving | deployment (**optional external**) | `NODE_ENV=production` + deep-route fetch | **UNVERIFIED** (optional) | WP-07 |
| G-23 | Graceful shutdown | deployment (**optional external**) | `SIGTERM` → exit 0 within 10 s | **UNVERIFIED** (optional) | WP-07 |
| G-24 | Live AI smoke | live-service | real script + TTS call recorded | **BLOCKED** (no egress) | WP-10 |
| G-25 | Browser capability matrix | browser | Chromium + Firefox/Safari where applicable | **UNVERIFIED** | WP-07 |
| G-26 | Accessibility baseline | browser | keyboard traversal + contrast + labels audit | **UNVERIFIED** | WP-12 |
| G-27 | i18n: no hard-coded locale | static | script detection outside `i18n`/`prompts` | **FAIL** | WP-12 |
| G-28 | Determinism | executable | same input ⇒ identical document hash | **FAIL** | WP-12 |
| G-29 | Repo hygiene | static | root-file allowlist; `package.json` name | **FAIL** | WP-12 |
| G-30 | CI green end-to-end | executable | full pipeline on a clean checkout | **ABSENT** | WP-07 |

## Certification levels

| Level | Requirements |
|---|---|
| **NOT READY** | Any P0 gate FAIL, or the behavioural suite does not exist |
| **ENGINEERING READY** | G-01…G-08, G-10…G-20, G-27…G-30 PASS; G-09/G-21…G-26 may be BLOCKED/UNVERIFIED with named owners |
| **RUNTIME CERTIFIED** | ENGINEERING READY **and G-31 = PASS** (which requires **G-31-P = PASS AND G-31-U = PASS**) and G-09, G-24, G-25 executed and PASS. G-21…G-23 are **optional external-deployment** gates and are not required |
| **PRODUCTION READY** | RUNTIME CERTIFIED, plus monitoring/alerting live (RB-01…RB-09 exercised), a rollback rehearsed, and a soak period with no P0/P1 |

## Current assessment

**NOT READY.** 5 of 6 executable reproductions fail; 3 P0 defects are open (D-001, D-002,
D-003); the test suite is 92.7 % non-behavioural; **no execution inside Google AI Studio has
been performed (G-31 UNVERIFIED)**; no browser verification has been executed.

**Target note (2026-09-09).** G-21…G-23 are now **optional external-deployment** gates. They
no longer gate the AI Studio target. G-31 does.

## Rules

1. A gate may not be reclassified by editing this table alone — the command must run.
2. Moving a gate from `FAIL` to `PASS` requires the recorded command output in the PR.
3. `BLOCKED` gates must name the missing capability and the owner who will unblock it.
4. No deployment claim may be made while G-21 is BLOCKED.
