# ADR-000 — Source-of-Truth Precedence

**Status:** Accepted
**Date:** 2026-09-08

## Context

The codebase contains documentation and comments that describe behaviour the code does not
implement — and vice versa. Examples found during the audit:

* `clipTimelineDuration.ts` exists "without creating a feature/core import cycle" — a
  duplicate created to work around a structural problem rather than fix it;
* `renderSnapshotRegressionGate.ts` + `renderSnapshotDiagnostics.ts` (19 files / 2 087 LOC)
  implement a preview/export parity gate whose **only** caller is never invoked;
* the test suite contains 177 files that assert substrings in source files while claiming to
  test behaviour;
* `package.json` declares `better-sqlite3`, which has zero references.

Any agent working from prose will make decisions on false premises.

## Decision

Precedence, highest first:

1. **Executing code.** What runs at runtime is the truth.
2. **Executable tests that failed.** A reproduction that fails is stronger evidence than any
   document.
3. **`docs/contracts/`.** Normative interfaces.
4. **`docs/architecture/`.** Intent and rationale.
5. **ADRs.** Recorded decisions and their reasoning.
6. **Comments, JSDoc, test names, filenames, README prose.** Lowest. Advisory only.

Corollaries:
* A filename is not evidence of a responsibility (`AtomicRenderSnapshot` does not make the
  snapshot atomic).
* A passing test is not evidence of correctness; only a *failing-then-passing* test is.
* A green build is not evidence of correctness.
* When two sources conflict, the conflict is **recorded** (here or in the risk register), not
  silently resolved.

## Consequences

* Agents must read code before proposing changes and must cite file:line.
* Documentation that contradicts code is either corrected in the same commit or the
  contradiction is filed as an ADR/risk.
* No work package may be closed on documentation evidence alone.
