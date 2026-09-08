# Code Review Policy

Review is a **gate**, not a formality. A review that says "looks good" without evidence is
rejected.

---

## 1. Reviewer checklist

Every PR must have a reviewer assertion for each item. Items marked **(blocking)** prevent
merge.

### Correctness
- [ ] **(blocking)** Every changed behaviour has a test that fails before and passes after.
- [ ] **(blocking)** No test was deleted, skipped, renamed, or loosened without a written
      reason.
- [ ] **(blocking)** No defect evidence (audit script, reproduction, failing test) was removed.
- [ ] The change does not alter a contract in `docs/contracts/` without an ADR.
- [ ] Derived values are not stored; state machines are not duplicated.

### Architecture
- [ ] **(blocking)** No new cross-layer import (see [../architecture/module-boundaries.md](../architecture/module-boundaries.md)).
- [ ] **(blocking)** No new canonical authority for a concept that already has one.
- [ ] No new `useEffect` containing multi-step orchestration.
- [ ] No new singleton with hidden state.
- [ ] No new compatibility shim without a `SHIM-` id, owner and removal milestone (ADR-013).

### Security
- [ ] **(blocking)** No client-controlled value reaches a metered or privileged operation
      unvalidated.
- [ ] **(blocking)** No authorisation is conditional on the environment.
- [ ] **(blocking)** No secret in client code, logs, or responses.
- [ ] Inputs are schema-validated; outputs are schema-validated where they come from AI.
- [ ] No new `spawn`, `eval`, `innerHTML`, or dynamic import of user-controlled data.

### Resources
- [ ] **(blocking)** Every acquired resource has a release on every terminal path.
- [ ] No new timer or listener without a disposal scope.

### Portability
- [ ] No hard-coded host, port, or absolute path.
- [ ] No new system dependency.
- [ ] New browser APIs are capability-probed.

### Verification honesty
- [ ] **(blocking)** Every PASS claim names the command that produced it and the verification
      class (static / executable / browser / live-service / deployment).
- [ ] **(blocking)** No claim of correctness based on a successful build or typecheck alone.
- [ ] Anything not executed is marked UNVERIFIED or BLOCKED, with the missing capability
      named.

## 2. Evidence requirements

A PR must contain, in its description:

```
Verification:
  static:      <command> → exit <n>
  executable:  <command> → <n> passed / <n> failed
  browser:     <command> → <report path>   (or "not run — <reason>")
  live-service:<command> → <request id>    (or "not run — <reason>")
  deployment:  <command> → <revision>      (or "not run — <reason>")
```

## 3. Review authority

| Change class | Required reviewer |
|---|---|
| Any contract (`docs/contracts/**`) | Principal Architect |
| Any ADR | Principal Architect |
| Security-relevant code (`server/**`, auth, AI) | Backend/API Security |
| Media/render/export | Media/Video Pipeline + Performance |
| Workflow runtime | Workflow/Execution Architect |
| Test strategy changes | QA/Test Architecture Lead |
| Dependency add/remove | DevOps + Principal Architect |
| UI behaviour | React Lead + UX/Accessibility |

Two approvals are required for any change touching `docs/contracts/**` or `server/**`.

## 4. Merge rules

* Squash merge; commit message follows
  `type(wp-XX): summary` (see [../execution/merge-strategy.md](../execution/merge-strategy.md)).
* No mixed work packages in one commit.
* CI must be green: install, typecheck, lint, test, build.
* The branch must be rebased on the target branch immediately before merge.

## 5. Rejection reasons (automatic)

1. "It compiles."
2. "The tests pass" — when those tests are grep assertions.
3. "The UI looks right" — without a browser verification record.
4. A diff that deletes or weakens a test.
5. A diff that changes a tolerance to make a parity test pass.
6. A diff that adds a shim with no removal milestone.
7. A diff that modifies an audit reproduction instead of fixing the production code.
