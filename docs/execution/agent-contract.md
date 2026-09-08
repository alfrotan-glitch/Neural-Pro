# Agent Contract

Rules that bind every agent (human or AI) executing a work package in this repository.

---

## 1. Before you start

1. Read `docs/README.md` (precedence rules).
2. Read `docs/architecture/system-overview.md` and the architecture document for your area.
3. Read your handoff packet `docs/execution/agents/WP-XX.md` **in full**.
4. Read every contract named in the packet (`docs/contracts/**`).
5. Run the baseline: `npm run typecheck`, `npm test`, and the audit reproductions listed in
   your packet. **Record the exit codes.** If a baseline differs from this document, stop and
   report — do not assume this document is stale without evidence.

## 2. While you work

| Rule | Statement |
|---|---|
| A-1 | **Touch only your allowed files.** If you need another file, stop and escalate; do not edit it "temporarily". |
| A-2 | **Code is the source of truth.** Read the executing module before changing it. Do not trust filenames, comments, or test names (ADR-000). |
| A-3 | **Smallest safe change.** Fix the defect; do not refactor around it. A repair that also restructures is two changes and must be two commits (possibly two WPs). |
| A-4 | **Preserve healthy systems.** If a module is working, leave it alone even if you dislike its style. |
| A-5 | **No new authorities.** If a concept already has a canonical module, use it. If you believe the canonical module is wrong, escalate — do not shadow it. |
| A-6 | **No fake success.** Never convert a failure into a success path, a placeholder, or a default value. |
| A-7 | **No swallowed errors.** Every `catch` rethrows, returns a typed error, or logs with context. |
| A-8 | **Resources.** Every acquisition gets a release in `finally` or a disposer. |
| A-9 | **Determinism.** No `Math.random()` or `Date.now()` in anything persisted or asserted. |
| A-10 | **No secrets, no hosts, no ports, no absolute paths.** |
| A-11 | **Tests first for defects.** Write the failing test, record the failure, then fix, then record the pass. |
| A-12 | **Do not weaken tests.** No deleting, skipping, renaming, or loosening. Do not tune a tolerance to make a test pass. |
| A-13 | **Commits.** One WP per commit series. `type(wp-XX): summary`. No mixed content. |
| A-14 | **Documentation.** Update the architecture/contract/workflow docs your change invalidates, in the same commit series. |

## 3. Verification claims

Every claim must state its class and its command:

```
static        — lint / AST / grep / graph assertions
executable    — node:test / tsx / vitest run
browser       — Playwright against real Chromium
live-service  — a request against a running server (record the requestId)
deployment    — the built artefact booting in a container
```

Forbidden claims:
* "should work", "looks correct", "compiles therefore correct";
* a PASS for something that was never executed;
* a PASS derived from a build or typecheck exit code;
* a PASS produced by modifying the test rather than the code.

## 4. Escalation triggers

Stop and escalate (do not guess) when:

1. two sources conflict about the authoritative behaviour;
2. you need a file outside your allowed set;
3. a change requires a contract change;
4. a previously passing verification starts failing and the cause is unclear;
5. the fix would require deleting or weakening a test;
6. you find a **new** defect — **record it** (risk register, `R-0xx`) rather than silently
   fixing it inside your WP.

## 5. Handoff

On completion the agent delivers:

1. the commit series, gated by CI;
2. a verification block with every command and its exit code / report path;
3. updated rows in `docs/quality/invariant-register.md` and
   `docs/quality/risk-register.md`;
4. updated rows in `docs/quality/release-gates.md`;
5. docs updated;
6. any new risks or defects found, with evidence.

## 6. Prohibited behaviours (summary)

* Rewriting a healthy subsystem for stylistic reasons.
* Bundling an unrelated refactor into a defect fix.
* Editing an audit reproduction so it passes.
* Editing a golden/expected value to make a parity test pass.
* Adding a compatibility shim without `SHIM-` id, owner and removal milestone.
* Claiming certification at any level without executed evidence.
* Working on a branch other than `arena/01a08254-neural-pro`.
