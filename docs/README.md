# Neural-Pro Engineering Documentation

**Status:** Blueprint phase (PHASE 1). No implementation of the target architecture has
started. This tree is the authoritative engineering map; the source tree is the authoritative
implementation. Where they disagree, that is a defect in one of them — record it, do not guess.

**Source of truth precedence (see
[decisions/ADR-000](decisions/ADR-000-source-of-truth-precedence.md)):**

1. Executing code (what actually runs)
2. Executable tests that fail when behaviour regresses
3. Contracts in `docs/contracts/`
4. Architecture in `docs/architecture/`
5. Comments and prose (lowest — see `audit/` for how badly this can mislead)

---

## Read this first

| If you are… | Start here |
|---|---|
| A new engineer | [architecture/system-overview.md](architecture/system-overview.md) |
| Implementing a Work Package | `docs/execution/agents/WP-XX.md` **and** [execution/agent-contract.md](execution/agent-contract.md) |
| Reviewing a merge | [quality/definition-of-done.md](quality/definition-of-done.md) + [execution/merge-strategy.md](execution/merge-strategy.md) |
| Asking "can we ship?" | [execution/verification-matrix.md](execution/verification-matrix.md) + [execution/runtime-certification-plan.md](execution/runtime-certification-plan.md) |
| Asking "why is it like this?" | [decisions/](decisions/) |
| Tracking a defect | `AUDIT_REPORT.md` (audit baseline) + [quality/invariant-register.md](quality/invariant-register.md) |
| Tracking a risk | [quality/risk-register.md](quality/risk-register.md) |

---

## Tree

```
docs/
├── architecture/     How the system is built and why
│   system-overview.md  runtime-topology.md  module-boundaries.md
│   dependency-direction.md  state-architecture.md  media-pipeline.md
│   rendering-architecture.md  export-architecture.md  workflow-architecture.md
│   persistence-architecture.md  ai-architecture.md  deployment-architecture.md
├── contracts/        Normative interfaces. Breaking these requires an ADR.
│   project-state.md  media-assets.md  rendering.md  workflows.md
│   api.md  errors.md  ai-integration.md  persistence.md  environment.md
├── workflows/        Formal workflow definitions
│   export.md (W4)  podcast-generation.md (W1)  tts.md (W2)  caption.md (W3)
│   recovery.md (W5)
├── security/         Trust boundaries, threat model, limits
│   security-model.md  threat-model.md  ai-abuse-surface.md
├── testing/          Strategy, pyramid, certification
│   test-strategy.md  media-parity-testing.md  resource-lifecycle-testing.md
├── operations/       Logging, observability, deployment, recovery
│   logging.md  monitoring.md  runbooks.md  local-development.md  i18n.md
├── decisions/        ADR-000 … ADR-014 + README
├── quality/          Standards, invariants, risks, release gates, DoD
│   engineering-standards.md  code-review-policy.md  definition-of-done.md
│   release-gates.md  invariant-register.md  risk-register.md
└── execution/        Master plan, work packages, agent packets, certification
    master-plan.md  work-packages.md  dependency-graph.md  agent-contract.md
    merge-strategy.md  verification-matrix.md  file-ownership-matrix.md
    runtime-certification-plan.md  agents/WP-00.md … WP-12.md
```

### Document index (§16 of the directive)

| # | Document | Path |
|---|---|---|
| 1 | Master architecture overview | [architecture/system-overview.md](architecture/system-overview.md) |
| 2 | Runtime topology | [architecture/runtime-topology.md](architecture/runtime-topology.md) |
| 3 | Module boundaries | [architecture/module-boundaries.md](architecture/module-boundaries.md) |
| 4 | Dependency direction | [architecture/dependency-direction.md](architecture/dependency-direction.md) |
| 5 | State architecture | [architecture/state-architecture.md](architecture/state-architecture.md) |
| 6 | Media pipeline | [architecture/media-pipeline.md](architecture/media-pipeline.md) |
| 7 | Rendering architecture | [architecture/rendering-architecture.md](architecture/rendering-architecture.md) |
| 8 | Export architecture | [architecture/export-architecture.md](architecture/export-architecture.md) |
| 9 | Workflow architecture | [architecture/workflow-architecture.md](architecture/workflow-architecture.md) |
| 10 | Persistence architecture | [architecture/persistence-architecture.md](architecture/persistence-architecture.md) |
| 11 | AI architecture | [architecture/ai-architecture.md](architecture/ai-architecture.md) |
| 12 | Deployment architecture | [architecture/deployment-architecture.md](architecture/deployment-architecture.md) |
| 13 | Contract set | [contracts/](contracts/) (9 documents) |
| 14 | Workflow definitions W1–W5 | [workflows/](workflows/) (5 documents) |
| 15 | Security model, threat model, AI abuse surface | [security/](security/) |
| 16 | Test strategy, parity, resources | [testing/](testing/) |
| 17 | Operations | [operations/](operations/) |
| 18 | ADRs | [decisions/](decisions/) |
| 19 | Invariant register | [quality/invariant-register.md](quality/invariant-register.md) |
| 20 | Risk register | [quality/risk-register.md](quality/risk-register.md) |
| 21 | Definition of Done | [quality/definition-of-done.md](quality/definition-of-done.md) |
| 22 | Engineering standards | [quality/engineering-standards.md](quality/engineering-standards.md) |
| 23 | Code review policy | [quality/code-review-policy.md](quality/code-review-policy.md) |
| 24 | Release gates | [quality/release-gates.md](quality/release-gates.md) |
| 25 | Master execution plan | [execution/master-plan.md](execution/master-plan.md) |
| 26 | Work packages WP-00…WP-12 | [execution/work-packages.md](execution/work-packages.md) |
| 27 | Dependency graph | [execution/dependency-graph.md](execution/dependency-graph.md) |
| 28 | File ownership matrix | [execution/file-ownership-matrix.md](execution/file-ownership-matrix.md) |
| 29 | Agent contract | [execution/agent-contract.md](execution/agent-contract.md) |
| 30 | Merge strategy | [execution/merge-strategy.md](execution/merge-strategy.md) |
| 31 | Verification matrix | [execution/verification-matrix.md](execution/verification-matrix.md) |
| 32 | Runtime certification plan | [execution/runtime-certification-plan.md](execution/runtime-certification-plan.md) |
| 33 | Agent handoff packets | [execution/agents/](execution/agents/WP-00.md) |

## Absolute rules for this documentation

1. **No PASS without evidence.** Every status is `PASS`, `FAIL`, `BLOCKED` or `UNVERIFIED`,
   and `PASS` requires the verification to have actually executed.
2. **Contracts are normative.** If code violates a contract in `docs/contracts/`, the code
   is wrong (or the contract needs an ADR to change).
3. **Every invariant needs a test.** An invariant in
   [quality/invariant-register.md](quality/invariant-register.md) without an executable
   verification is a wish, not an invariant.
4. **Document decisions, not outcomes.** An ADR records *what was chosen, why, what was
   rejected, and what it costs*.

---

## Current certification status

**NOT READY** — see `AUDIT_REPORT.md`. Baseline evidence:

| Gate | Result |
|---|---|
| Clean install | **FAIL** (`better-sqlite3` native build) |
| Typecheck | PASS |
| Production build | PASS |
| Real executable tests | **FAIL** (177/191 tests are source-text greps) |
| Export correctness | **FAIL** (P0 — 795/1350 frames of the default project) |
| API security | **FAIL** (P0 — anonymous Gemini invocation, anonymous ffmpeg spawn) |
| Preview/export parity | **FAIL** (two reproduced divergences) |
| Browser E2E | **BLOCKED** (no Chrome in the audit environment) |
| Live AI integration | **BLOCKED** (no egress to the Gemini API) |
| Deployment startup | **BLOCKED** (PORT hard-coded; not exercised on Cloud Run) |

Reproductions that currently **fail** (they are the regression baseline):

```
audit/repro-export-registry.mts     P0  D-001
audit/repro-transform-order.mts     P1  D-004
audit/repro-media-cover-clip.mts    P1  D-005
audit/repro-export-queue.mts        P1  D-010
audit/repro-ondequeue-leak.cjs      P2  D-016
audit/repro-queue-deadlock.mts      —   (hypotheses disproved; kept as a guard, see below)
```

`audit/repro-queue-deadlock.mts` currently **passes**. It is retained deliberately: two
deadlock hypotheses about the three competing export dispatch authorities were tested and
**disproved**, and the test records that evidence so a future agent does not re-litigate it.
The underlying structural smell (three dispatch authorities + a polling orchestrator) is
tracked as risk `R-014`, not as a confirmed defect.

---

## Blueprint status (end of PHASE 1)

**PHASE 0 discovery and PHASE 1 target architecture are complete. No implementation has been
started, by directive.** The programme stops here pending reconciliation and approval.

What PHASE 0 established (all of it by executing code, not by reading prose):

* **Scale:** 258 TypeScript/TSX files under `src/`; ~41 000 LOC; `server.ts` 1 172 LOC;
  `VideoStudioPro.tsx` 1 855 LOC; `VirtualizedTimeline.tsx` 1 605 LOC; `App.tsx` 1 005 LOC.
* **Four structural facts** drive the whole blueprint:
  * **F1** export is a DOM parasite of Preview (`document.querySelectorAll` in
    `ExportMediaRegistry`);
  * **F2** the parity/diagnostics subsystem (19 files / 2 087 LOC) is unreachable — its only
    caller is never invoked;
  * **F3** two renderers with divergent semantics (`T·S·R` vs `T·R·S`, no `ctx.clip()`);
  * **F4** there is no workflow engine — a 480-line `useEffect`, a `setInterval(1500)` poller
    and a hand-rolled promise tail.
* **Five dependency violations** (V1–V5), including a true `core ↔ features` cycle and a
  server → browser-feature import.
* **Three P0 defects**, reproduced: export registry (795/1350 broken frames), anonymous
  verbatim Gemini passthrough, anonymous export API with file write and `spawn`.
* **Two hypotheses tested and disproved** (export-queue deadlock) — recorded as evidence, not
  discarded.
* **Google AI Studio reconciled:** Build mode (React client + Node server runtime → Cloud Run,
  server-side `GEMINI_API_KEY`) is the deployment target; there is **no** platform workflow
  runtime, so W1–W5 are built in-repo.

### Certification answer

```
NO — NOT READY
```

Justification, in one line per axis:

| Axis | Status |
|---|---|
| Static (typecheck, build) | PASS — but proves parseability, not correctness |
| Executable | **FAIL** — 5 of 6 reproductions fail; 3 P0 defects open; the suite is 92.7 % grep |
| Browser | **BLOCKED** — no browser runtime provisioned; no pixel-parity evidence exists |
| Live service | **BLOCKED** — no egress to the Gemini API; no live operation has succeeded |
| Deployment | **BLOCKED** — `PORT` hard-coded; no container has ever booted; install fails |

No claim above the evidence is made. The next permitted claim, after WP-00…WP-11 with their
gates executed, is `ENGINEERING READY`; `RUNTIME CERTIFIED` additionally requires Stages D–F of
[runtime-certification-plan.md](execution/runtime-certification-plan.md) to have been run.
