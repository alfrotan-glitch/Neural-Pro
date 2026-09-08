# Architecture Decision Records

| ADR | Title | Status |
|---|---|---|
| [ADR-000](ADR-000-source-of-truth-precedence.md) | Source-of-truth precedence | Accepted |
| [ADR-001](ADR-001-ai-studio-execution-model.md) | Google AI Studio execution model and deployment target | Accepted |
| [ADR-002](ADR-002-export-independent-of-preview-dom.md) | Export must not depend on the Preview DOM | Accepted |
| [ADR-003](ADR-003-in-app-workflow-runtime.md) | In-application workflow runtime (no external orchestrator) | Accepted |
| [ADR-004](ADR-004-remove-ffmpeg.md) | Remove the server-side FFmpeg export path | Accepted |
| [ADR-005](ADR-005-remove-generatecontent-passthrough.md) | Remove the generic Gemini passthrough | Accepted |
| [ADR-006](ADR-006-persistence-indexeddb.md) | IndexedDB + AssetId as the persistence model | Accepted |
| [ADR-007](ADR-007-single-canonical-render-plan.md) | One canonical render plan, two renderers | Accepted |
| [ADR-008](ADR-008-server-owned-ai-config.md) | Server-owned AI model registry and operation allowlist | Accepted |
| [ADR-009](ADR-009-no-fake-success.md) | No fabricated success (errors are typed and visible) | Accepted |
| [ADR-010](ADR-010-asset-registry-and-measured-duration.md) | Measured duration is authoritative | Accepted |
| [ADR-011](ADR-011-single-export-dispatch-authority.md) | A single export dispatch authority | Accepted |
| [ADR-012](ADR-012-layered-modules.md) | Four-layer module structure | Accepted |
| [ADR-013](ADR-013-compatibility-shim-policy.md) | Compatibility shim policy | Accepted |
| [ADR-014](ADR-014-session-token-auth.md) | Session-token authorisation (no user accounts) | Accepted |
| [ADR-015](ADR-015-ai-studio-web-app-primary-runtime.md) | Google AI Studio Web App runtime is the primary target | Accepted — **supersedes the Cloud-Run-targeting parts of ADR-001** |
| [ADR-016](ADR-016-browser-native-export.md) | Browser-native export is the canonical export path | Accepted |
| [ADR-017](ADR-017-canonical-core.md) | Canonical Core (domain kernel in `src/domain/core/**`) | Accepted |
| [AI-STUDIO-TARGET-RUNTIME-CORRECTION.md](AI-STUDIO-TARGET-RUNTIME-CORRECTION.md) | Target-runtime correction register | Accepted |

## Process

* An ADR is required for any decision that: changes a contract in `docs/contracts/`,
  introduces or removes a dependency, changes the deployment model, or resolves a conflict
  between two authoritative sources.
* Status values: `Proposed`, `Accepted`, `Superseded by ADR-nnn`, `Rejected`.
* An ADR is never edited after acceptance except to add a `Superseded by` link.
