# Merge Strategy

## 1. Branching

* All work happens on `arena/01a08254-neural-pro` (this session's branch).
* One **commit series per work package**; a WP may be several commits, but no commit may
  contain work from two WPs.
* Rebase on the branch tip immediately before merging/pushing to avoid drift.
* No long-lived feature branches; a WP is merged as soon as its gate is green.

## 2. Commit message format

```
<type>(wp-XX): <imperative summary, ≤ 72 chars>

<body: what changed and why, root cause for fixes>

Verification:
  static:      <command> → exit <n>
  executable:  <command> → <passed>/<failed>
  browser:     <command> → <report>  | not run — <reason>
  live-service:<command> → <requestId> | not run — <reason>
  deployment:  <command> → <revision> | not run — <reason>

Refs: D-0XX, R-0XX, INV-0XX, ADR-0XX
```

**Types:** `feat` · `fix` · `test` · `docs` · `refactor` · `chore` · `perf`
`refactor`/`chore`/`perf` are permitted **only** inside the WP that owns the files.

**Forbidden:** mixed-type commits, `fix(wp-03): … and also some lint` , `wip`, `asdf`,
`Update file`.

## 3. Merge requirements

1. CI green: `npm ci` → `typecheck` → `lint` → `test` → `build`.
2. All reproductions owned by the WP exit 0; reproductions owned by others still exit at
   their recorded baseline (a regression blocks the merge).
3. Two approvals for anything touching `docs/contracts/**` or `server.ts`.
4. Review evidence recorded (see [../quality/code-review-policy.md](../quality/code-review-policy.md)).
5. Invariant and risk registers updated in the same series.

## 4. Conflict resolution

| Situation | Resolution |
|---|---|
| Two WPs need the same file | **Resequence.** The later WP rebases. Never concurrent edit. |
| A WP needs a file outside its allowlist | Escalate; the file's owner WP makes the change, or the ownership matrix is amended by ADR. |
| A repair reveals a second defect | Record it as `R-0xx`; fix it in its owning WP, not here. |
| A baseline verification changed | Stop. Identify which commit changed it. The owning WP is responsible. |
| A test must change | Only with a written reason: the test encoded the wrong expectation, and the correct expectation is stated with evidence. |

## 5. Revert policy

* Every WP must be revertible by reverting its commit series.
* If a WP includes a data migration (only WP-05 does), the revert must be accompanied by the
  documented forward-compatible read path — documents written by v2 remain readable by v1 via
  the shim, so a revert does not corrupt data.
* A revert is itself a commit: `revert(wp-XX): …` with the reason.

## 6. Tagging

| Tag | Meaning |
|---|---|
| `wp-00-complete` … `wp-12-complete` | work package merged and green |
| `gate-p0` | all P0 defects closed |
| `gate-p1` | `ENGINEERING READY` claimable |
| `gate-runtime` | `RUNTIME CERTIFIED` claimable |

## 7. Prohibited

* Force-pushing over another agent's commits.
* Squashing two WPs into one commit.
* Amending history that has been pushed and reviewed.
* Committing `dist/`, `node_modules/`, `.env*`, or scratch files.
* Committing generated artefacts (exported MP4s, diagnostic bundles, `inspect.txt`).
