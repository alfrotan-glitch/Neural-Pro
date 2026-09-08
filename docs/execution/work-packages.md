# Work Packages

Index. Each WP has a self-contained handoff packet in [agents/](agents/WP-00.md).

| WP | Name | Objective | Depends on | Priority | Est. risk |
|---|---|---|---|---|---|
| [WP-00](agents/WP-00.md) | Verification & tooling baseline | Make "done" verifiable | – | **P0** | Low |
| [WP-01](agents/WP-01.md) | Server security boundary | Remove P0 surfaces; allowlist operations | WP-00 | **P0** | High |
| [WP-02](agents/WP-02.md) | Export independence | Export resolves media without the Preview DOM | WP-00, WP-05 | **P0** | High |
| [WP-03](agents/WP-03.md) | Render parity | One canonical render plan; D-004, D-005, D-020 closed | WP-02 | P1 | Medium |
| [WP-04](agents/WP-04.md) | Workflow runtime | W4 runs on a real state machine; D-010 closed | WP-03 | P1 | Medium |
| [WP-05](agents/WP-05.md) | Persistence & AssetRegistry | Durable assets; D-006 closed | WP-00 | P1 | High |
| [WP-06](agents/WP-06.md) | Behavioural test architecture | A suite that can fail for behavioural reasons | WP-00 | P1 | Medium |
| [WP-07](agents/WP-07.md) | Server hardening & runtime contract | AI Studio server contract, env, boundary, capability probe; container/packaging **optional** | WP-00 | P1 | Medium |
| [WP-08](agents/WP-08.md) | Module layering & decomposition | Layers, cycles broken, god-components split | WP-02,03,04,05 | P2 | High |
| [WP-09](agents/WP-09.md) | AI hardening | Typed failures, validated TTS, injection boundary | WP-01 | P1 | Medium |
| [WP-10](agents/WP-10.md) | Recovery & runtime certification | W5 + executed certification | WP-06, all repairs | P1 | Medium |
| [WP-11](agents/WP-11.md) | Resource lifecycle & duration authority | INV-008, INV-011, INV-013 | WP-05 | P1 | Medium |
| [WP-12](agents/WP-12.md) | Hygiene, i18n, determinism, shim removal | Clean tree, localised strings, shims gone | WP-11 | P2 | Low |
| [WP-13](agents/WP-13.md) | AI Studio Runtime Verification | Resolve every RUNTIME-UNKNOWN by execution inside AI Studio; produce **G-31-P** and **G-31-U** evidence | **WP-00 (hard)**; WP-07 = *optional enrichment* | P1 | Medium |

## Runtime reconciliation (2026-09-09)

All work packages were reviewed against the corrected target runtime. Result:
**no WP depends on Cloud Run**, no WP assumes unrestricted Node.js in ways the AI Studio runtime
does not support, and no WP assumes FFmpeg (WP-01 *removes* it). Eight WPs needed modification —
see the per-WP tables in [master-plan.md](master-plan.md) §4 and the "Runtime reconciliation"
section appended to each packet.

New: **WP-13** (AI Studio Runtime Verification), added because twelve capability items are
RUNTIME-UNKNOWN and must be resolved by execution, not reasoning.

## Common contract for every WP

Every handoff packet contains: ID, name, objective, scope, allowed files, prohibited files,
dependencies, prerequisites, contracts, outputs, tests, docs, acceptance criteria, commit
requirement, merge strategy, conflict risks, rollback.

## Cross-cutting rules

1. **No WP may modify an `audit/repro-*.{mts,cjs}` script** except WP-00, and only to make it
   import the real production module. If a reproduction's assertion is wrong, that is an ADR,
   not an edit.
2. **No WP may change a contract in `docs/contracts/**`** without an ADR merged first.
3. **No WP may add a dependency** without DevOps + Principal Architect approval.
4. **No WP may delete a test**; deprecation requires a written reason and a replacement.
5. **Every WP updates** the invariant register, the risk register and the release gates for the
   rows it affects.
