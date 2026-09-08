# Definition of Done

Applies to **every** work package. A WP is not "done" because its code is written.

---

## 1. Per-work-package DoD

A work package is DONE when **all** of the following hold:

1. **Scope respected.** Only files listed in its `allowed files` were modified; no file in its
   `prohibited files` was touched.
2. **Behaviour implemented and verified.** Every acceptance criterion in its handoff packet has
   an executable verification, and the verification **ran** with a recorded result.
3. **Tests added.** Behavioural tests exist for every behaviour added or changed; for a defect
   fix, a test that failed before and passes after, with both runs recorded.
4. **No regressions.** The full suite passes, including all `audit/repro-*.{mts,cjs}` scripts
   that are not owned by this WP.
5. **Contracts honoured.** No contract in `docs/contracts/**` changed without an ADR; any
   deviation is recorded as a risk with an owner.
6. **Invariants checked.** Every invariant the WP touches is re-verified and its row in
   [invariant-register.md](invariant-register.md) updated with the verification command and
   result.
7. **Risk register updated.** Affected risks moved to `MITIGATING`/`CLOSED` with evidence, or
   left `OPEN` with an explicit reason.
8. **Resources released.** The balance probe is zero for the WP's operations across
   success/failure/cancel/timeout/unmount.
9. **Docs updated.** Architecture, contract, workflow, security, testing or operations
   documents affected by the change are updated in the same commit series.
10. **Static gates green.** `npm ci`, `npm run typecheck`, `npm run lint`, `npm test`,
    `npm run build` all succeed.
11. **Commits clean.** One work package per commit series, messages of the form
    `type(wp-XX): summary`, no mixed ownership.
12. **Review passed.** Per [code-review-policy.md](code-review-policy.md), with evidence.
13. **Rollback known.** The rollback procedure in the handoff packet has been reviewed and is
    feasible (a single revert, or a documented data migration).

## 2. Anti-DoD — these do NOT constitute done

| Claim | Why it fails |
|---|---|
| "It compiles / typechecks" | proves parseability and type agreement, not semantics |
| "The build succeeded" | proves bundling, not behaviour |
| "The tests pass" | 177 of 191 current tests assert substrings |
| "It looks right in the UI" | not recorded, not repeatable, and the preview is not the product |
| "I read the code and it is correct" | not evidence |
| "The reproduction now exits 0" | only if the reproduction was **not modified** instead of the production code |
| "Coverage went up" | coverage is diagnostic, not proof |
| "No defects were reported" | absence of reports is not absence of defects |

## 3. Per-defect DoD

A defect is closed when:

1. the root cause is identified and stated in terms of executing code (file:line);
2. a minimal safe repair is implemented (no opportunistic refactor bundled in);
3. a regression test fails on the pre-fix commit and passes on the post-fix commit, both
   recorded;
4. the audit reproduction (if one exists) exits 0 **unchanged**;
5. the invariant register row is updated with the new verification run;
6. the risk register entry is `CLOSED` with the verification referenced.

## 4. Programme-level DoD (release)

See [release-gates.md](release-gates.md). No release claim may be made before every gate in
that document has an executed verification or an explicit, documented `BLOCKED` with an owner.
