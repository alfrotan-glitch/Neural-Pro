# Neural-Pro Engineering Documentation

**Status:** Blueprint (PHASE 1) **+ target-runtime reconciliation and architecture re-freeze**
(2026-09-09). No implementation has started. This tree is the authoritative engineering map;
the source tree is the authoritative implementation. Where they disagree, that is a defect in
one of them — record it, do not guess.

> ### TARGET RUNTIME (authoritative)
> **Neural-Pro's primary runtime target is the Google AI Studio Web App environment.
> Cloud Run is not a mandatory runtime dependency.**
> Correction record: [decisions/AI-STUDIO-TARGET-RUNTIME-CORRECTION.md](decisions/AI-STUDIO-TARGET-RUNTIME-CORRECTION.md)
> · ADR: [ADR-015](decisions/ADR-015-ai-studio-web-app-primary-runtime.md)
> · Freeze: [execution/ARCHITECTURE-FREEZE.md](execution/ARCHITECTURE-FREEZE.md)

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
| Asking "does it work in AI Studio?" | [quality/AI-STUDIO-COMPATIBILITY-GATE.md](quality/AI-STUDIO-COMPATIBILITY-GATE.md) (gate G-31) + [architecture/AI-STUDIO-MEDIA-RUNTIME.md](architecture/AI-STUDIO-MEDIA-RUNTIME.md) |
| Asking "what may I assume about the runtime?" | [contracts/AI-STUDIO-RUNTIME-INVARIANTS.md](contracts/AI-STUDIO-RUNTIME-INVARIANTS.md) |
| Asking "where is this concept defined?" | [architecture/canonical-core.md](architecture/canonical-core.md) + [ADR-017](decisions/ADR-017-canonical-core.md) |
| Asking "why is it like this?" | [decisions/](decisions/) |
| Tracking a defect | `AUDIT_REPORT.md` (audit baseline) + [quality/invariant-register.md](quality/invariant-register.md) |
| Tracking a risk | [quality/risk-register.md](quality/risk-register.md) |

---

## Tree

```
docs/
├── architecture/     How the system is built and why
│   AI-STUDIO-MEDIA-RUNTIME.md   ← capability classification A–E + canonical export strategy
│   system-overview.md  runtime-topology.md  module-boundaries.md
│   dependency-direction.md  state-architecture.md  media-pipeline.md
│   rendering-architecture.md  export-architecture.md  workflow-architecture.md
│   persistence-architecture.md  ai-architecture.md  deployment-architecture.md
├── contracts/        Normative interfaces. Breaking these requires an ADR.
│   AI-STUDIO-RUNTIME-INVARIANTS.md  ← runtime/secret/AI/export/media invariants
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
│   AI-STUDIO-COMPATIBILITY-GATE.md  ← first-class gate G-31
│   engineering-standards.md  code-review-policy.md  definition-of-done.md
│   release-gates.md  invariant-register.md  risk-register.md
└── execution/        Master plan, work packages, agent packets, certification
    master-plan.md  work-packages.md  dependency-graph.md  agent-contract.md
    merge-strategy.md  verification-matrix.md  file-ownership-matrix.md
    runtime-certification-plan.md  ARCHITECTURE-FREEZE.md
    agents/WP-00.md … WP-13.md
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
| 34 | Target-runtime correction register | [decisions/AI-STUDIO-TARGET-RUNTIME-CORRECTION.md](decisions/AI-STUDIO-TARGET-RUNTIME-CORRECTION.md) |
| 35 | AI Studio media runtime | [architecture/AI-STUDIO-MEDIA-RUNTIME.md](architecture/AI-STUDIO-MEDIA-RUNTIME.md) |
| 36 | AI Studio compatibility gate | [quality/AI-STUDIO-COMPATIBILITY-GATE.md](quality/AI-STUDIO-COMPATIBILITY-GATE.md) |
| 37 | AI Studio runtime invariants | [contracts/AI-STUDIO-RUNTIME-INVARIANTS.md](contracts/AI-STUDIO-RUNTIME-INVARIANTS.md) |
| 38 | Architecture freeze | [execution/ARCHITECTURE-FREEZE.md](execution/ARCHITECTURE-FREEZE.md) |

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


---

## Runtime reconciliation summary (2026-09-09)

| Question | Answer |
|---|---|
| Primary target runtime | **Google AI Studio Web App** |
| Cloud Run | **Optional / non-required** — the substrate AI Studio uses when publishing, never a prerequisite |
| Server runtime | AI Studio-supported Node.js: npm, secrets, network. **No media processing, no durable writes, no background jobs** |
| Gemini | Server-side secret + controlled operation allowlist |
| Export | **Browser-native** (Canvas2D + WebCodecs + Web Audio + mp4-muxer); FFmpeg rejected by capability |
| Persistence | Browser-side IndexedDB + `AssetId`; network stores are optional adapters |
| Workflow engine | Application-level state machine (W1–W5) |

**Capability classes:** A 14 · B 6 · **C 12 (RUNTIME-UNKNOWN — must be resolved by execution
inside AI Studio)** · D 6 · E 4.

**No compatibility claim is made.** The AI Studio compatibility gate is **UNVERIFIED**
(`G-31-P` and `G-31-U` both): no execution inside Google AI Studio has been performed from this
environment. Twelve capability items and six frame-specific unknowns (`P-01…P-06`) await WP-13.

WP-13's only hard dependency is WP-00; WP-07 is optional enrichment. Every observation is
classified (`EXECUTED-RUNTIME` / `EXECUTED-BROWSER` / `STATIC-EVIDENCE` / `DOCUMENTED-PLATFORM` /
`INFERRED` / `BLOCKED` / `UNKNOWN`), and **no runtime criterion passes on static or documentary
evidence alone**. `G-31 = PASS` only if both contexts pass.

### New defects discovered during reconciliation

| ID | Defect |
|---|---|
| **D-029** | The AI Studio app manifest (`metadata.json`) was never examined as architecture and was scheduled for deletion as a scratch file |
| **D-030** | No runtime capability detection: WebCodecs/Canvas/IndexedDB are used without probing |

### Corrections to the audit baseline

| ID | Correction |
|---|---|
| **D-015** | Reclassified **P1 → P2**. `const PORT = 3000` is the AI Studio convention; the app runs there today. The fix is retained for optional external deployment |
| **D-023** | Rationale corrected: the AI Studio runtime has **no durable storage**; the Cloud Run RAM argument is supporting only. Conclusion unchanged |
| **D-027** | Narrowed: `metadata.json`, `README.md` and `.env.example` are **protected AI Studio files**, not scratch |
| **D-028** | Narrowed: `.env.example` **exists** and documents AI Studio-injected `GEMINI_API_KEY` + `APP_URL`; Docker/CI-container are **optional** |
