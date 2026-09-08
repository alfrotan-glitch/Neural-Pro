# ADR-013 — Compatibility Shim Policy

**Status:** Accepted
**Date:** 2026-09-08

## Context

Three compatibility layers are required by this blueprint:
* a V1 project-document reader while the V2 writer lands (WP-05);
* re-export shims at old module paths while the layered move happens (WP-08);
* a `410 Gone` route for `/api/generateContent` and `/api/export/*` (WP-01/WP-09).

Shims have a documented tendency to become permanent, which is how a codebase ends up with
two of everything.

## Decision

Every compatibility shim must carry, in code and in the work package:

1. **An ID** (`SHIM-001` …);
2. **A named owner** (the WP that introduced it);
3. **A removal milestone** (the WP that deletes it — by default WP-12);
4. **A test that fails once the milestone passes** (a dated assertion in
   `tests/static/shim-expiry.test.ts` listing `SHIM` ids with removal milestones);
5. **A comment at the definition site** with the above, in the form:
   `// SHIM-003 owner=WP-08 remove=WP-12 reason=path-move`.

Rules:
* A shim is **never** the place where new behaviour is added.
* A shim may not be extended past its milestone without an ADR.
* The shim-expiry test is part of the release gate: an expired shim fails CI.

## Register

| ID | What | Owner | Remove by |
|---|---|---|---|
| SHIM-001 | V1 project document reader | WP-05 | WP-12 |
| SHIM-002 | `ExportMediaRegistry` re-export (debugging consumers) | WP-02 | WP-12 |
| SHIM-003 | Old-path re-exports after the layered move | WP-08 | WP-12 |
| SHIM-004 | `410 Gone` handlers for `/api/generateContent`, `/api/export/*` | WP-01 | WP-12 |
| SHIM-005 | `DEFAULT_CAPTION_FPS` deprecated alias | WP-07 | WP-12 |

## Consequences

* Compatibility is time-boxed and auditable.
* WP-12 has an explicit, testable definition of done.
