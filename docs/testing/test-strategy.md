# Test Strategy

**Status:** the current suite is not evidence of anything. This document defines what counts.

---

## 1. Why the current suite is not evidence

Measured (audit D-011):

```
tests/                     191 files
files containing a require of src/   0
files that are grep/file-existence assertions   177
real executable tests          ~14
```

Example of what passes today (`tests/phaseF_video_player.test.js`):

```js
const content = fs.readFileSync(path.join(__dirname,'../src/features/…/VideoPlayer.tsx'),'utf8');
assert(content.includes('useMediaPrepare'));
```

This asserts a **substring exists**. It cannot fail for a behavioural reason. It also does not
even check the *right* file: the audio-codec tests read
`src/features/video-studio/export/utils/webcodecs-export.ts` while the P0 code path lives in
`src/features/video-studio/export/services/webcodecsExport.ts`.

Consequences: `npm test` exiting 0 carries **no** information about correctness, and
`npm run build` / `tsc --noEmit` exiting 0 carries none either (they prove parseability and
type agreement, not semantics).

## 2. Policy

| Rule | Statement |
|---|---|
| T-1 | A test that asserts only that a string exists in a file is **not** a behavioural test. It may live in `tests/static/` and must be labelled `static` in its own header, and it never counts toward a work package's behavioural gate. |
| T-2 | Every defect fix ships with a test that **fails before** the fix and **passes after**. Evidence: commit the failing test first, record its exit code, then the fix. |
| T-3 | No test may be deleted, skipped, loosened, or renamed to make a gate pass. Removing a test requires a written reason in the PR and an ADR if it covered a defect. |
| T-4 | Tests must not depend on: wall-clock sleeps for synchronisation, network access, the presence of `ffmpeg`, or a specific absolute path. |
| T-5 | Every test declares its verification class (see §3) and its owning WP. |
| T-6 | Flaky tests are quarantined with an issue, never deleted. |
| T-7 | Determinism: no `Math.random()`, no `Date.now()` in fixtures or assertions (inject a clock and a seeded RNG). |

## 3. Verification classes (never conflated)

| Class | What it proves | What it does NOT prove |
|---|---|---|
| **static** | a property of source text/graph (lint, import boundaries, grep) | that anything runs |
| **executable** | code ran and produced asserted values under a harness | that it works in a browser |
| **browser** | a real browser executed it (media decode, WebCodecs, DOM) | that it works on the deployed service |
| **live-service** | the running server answered real requests | that the client renders |
| **deployment** | the built artefact boots in a container under the platform contract | that features are correct |

Every gate in [../quality/release-gates.md](../quality/release-gates.md) names the class(es) it
requires.

## 4. Test pyramid (target)

```
        ╱╲          e2e (Playwright, browser class)        — a handful
       ╱──╲         integration (workflow + server + DOM)  — tens
      ╱────╲        unit / property (pure domain)          — hundreds
     ╱──────╲       static (lint, boundaries, bundles)     — fast, many
```

## 5. Tooling

| Layer | Tool | Notes |
|---|---|---|
| Unit / property | `node:test` + `tsx` (already used by `audit/`), `fast-check` for properties | no new framework needed |
| Component / DOM | Vitest + `@testing-library/react` + `jsdom` | required to prove export works with the preview unmounted |
| Browser / media | Playwright (Chromium) with `--enable-features=WebCodecs` | the only way to prove real encode/parity |
| Server | `node:test` + `supertest` against the real Express app | proves auth/limits/validation |
| Static | ESLint + `eslint-plugin-boundaries` + `madge` (cycles) | |
| Parity | `pixelmatch` on rendered frames | see [media-parity-testing.md](media-parity-testing.md) |
| Resource | instrumentation of `createObjectURL`/`revokeObjectURL`, `setInterval`, `addEventListener` | see [resource-lifecycle-testing.md](resource-lifecycle-testing.md) |

## 6. The audit reproductions become the regression baseline

| Script | Command | Today | Must become |
|---|---|---|---|
| `repro-export-registry.mts` | `npx tsx …` | **exit 1** (P0) | exit 0 |
| `repro-transform-order.mts` | `npx tsx …` | **exit 1** (D-004) | exit 0 |
| `repro-media-cover-clip.mts` | `npx tsx …` | **exit 1** (D-005) | exit 0 |
| `repro-export-queue.mts` | `npx tsx …` | **exit 1** (D-010) | exit 0 |
| `repro-ondequeue-leak.cjs` | `node …` | **exit 1** (D-016) | exit 0 |
| `repro-queue-deadlock.mts` | `npx tsx …` | exit 0 (guard) | stays 0 |

These are **not** to be modified except to (a) make them execute the real production modules
rather than copies, or (b) update an assertion that was itself wrong, with the change recorded
in the PR.

## 7. Legitimate static assertions

A small set of properties genuinely cannot be executed. These are allowed in `tests/static/`
and are the **only** static checks permitted to satisfy a gate:

1. no `src/domain/**` file imports `react` or references `window`/`document`/`fetch`/timers;
2. no `server/**` file imports outside `src/domain/**` and `src/server/**`;
3. no `innerHTML`, `dangerouslySetInnerHTML`, `eval`, `new Function` anywhere in `src/`;
4. no `blob:` URL in a serialised project document helper's output type;
5. no hard-coded `localhost`/`127.0.0.1`/fixed port in `src/` (except dev-only config with a
   comment that names the exception);
6. no `/tmp` or other absolute POSIX path outside `server/`;
7. no secret pattern (`AIza…`) in `dist/**`.

## 8. Coverage policy

Coverage is a **diagnostic**, not a gate — except for `src/domain/**`, where the target is
≥ 80 % line coverage because that layer is pure and cheap to test. A coverage number never
substitutes for an executable test that would have caught a known defect.
