# Master Execution Plan

**Scope:** the NEURAL-PRO remediation and hardening programme.
**Method:** PHASE 0 (discovery) → PHASE 1 (this blueprint) → **STOP** → reconciliation →
PHASE 2 (execution, work package by work package).

---

## 1. Ordering principles

1. **Verification before repair.** WP-00 establishes tooling so that every later WP can prove
   its claims. Without it, "done" is unverifiable.
2. **P0 security before features.** WP-01 removes the two P0 surfaces (arbitrary Gemini
   passthrough, anonymous export API) before anything is deployed anywhere.
3. **Structural repair before semantic repair.** WP-02 (export independence) must land before
   WP-03 (parity), because parity cannot be asserted against a renderer that cannot resolve
   its own media.
4. **Infrastructure before decomposition.** WP-08 moves files; it must not move them into a
   structure that is about to change again. It runs after the contracts and pools exist.
5. **Cleanup last.** WP-12 removes shims after everything that depends on them is stable.

## 2. Sequence

```
WP-00  Verification & tooling baseline                    (unblocks everything)
  │
  ├──► WP-01  Server security boundary        [P0]  ──┐
  │                                                   │
  ├──► WP-02  Export independence             [P0]  ──┤
  │             └──► WP-03  Render parity     [P1]  ──┤
  │                                                   │
  ├──► WP-04  Workflow runtime                [P1]  ──┤
  │                                                   │
  ├──► WP-05  Persistence & AssetRegistry     [P1]  ──┤
  │                                                   │
  ├──► WP-06  Behavioural test architecture   [P1]  ──┼──► WP-10 Recovery + certification
  │                                                   │
  ├──► WP-07  Server hardening & deployment   [P1]  ──┤
  │                                                   │
  ├──► WP-08  Module layering & decomposition [P2]  ──┤
  │                                                   │
  ├──► WP-09  AI hardening                    [P1]  ──┘
  │
  └──► WP-11  Resource lifecycle & duration   [P1]
                │
                └──► WP-12  Hygiene, i18n, determinism, shim removal  [P2/P3]
```

Concurrent-safe pairs (disjoint file ownership):
`WP-01 ∥ WP-05`, `WP-01 ∥ WP-08`, `WP-03 ∥ WP-05`, `WP-07 ∥ WP-09`, `WP-06 ∥ any`.

Hard serialisations (shared files):
`WP-02 → WP-03 → WP-04` (render + export),
`WP-05 → WP-11` (asset measurement feeds duration authority),
`WP-08 after WP-02/03/04/05` (do not move files mid-repair),
`WP-12 last`.

## 3. Phase gates

| Gate | Requirement | Decision point |
|---|---|---|
| **G-PHASE1** | This blueprint is complete and reconciled with the user | **STOP — awaiting approval (current state)** |
| **G-P0** | WP-00 + WP-01 + WP-02 merged; 3 P0 defects closed; G-05 partially green | Authorises any deployment of a *non-export* build |
| **G-P1** | All P1 defects closed; G-01…G-08, G-10…G-20, G-27…G-30 PASS | Authorises `ENGINEERING READY` claim |
| **G-RT** | WP-06 + WP-10 complete; G-09, G-21…G-26 executed and PASS | Authorises `RUNTIME CERTIFIED` claim |
| **G-PROD** | Monitoring live, rollback rehearsed, soak period clean | Authorises `PRODUCTION READY` claim |

## 4. Commit and merge discipline

See [merge-strategy.md](merge-strategy.md). Summary: one WP per commit series;
`type(wp-XX): summary`; no mixed ownership; CI green; review evidence recorded.

## 5. Agent model

See [agent-contract.md](agent-contract.md). One agent owns one work package at a time; file
ownership is exclusive (see [file-ownership-matrix.md](file-ownership-matrix.md)); handoff
packets are self-contained ([agents/WP-XX.md](agents/WP-00.md)).

## 6. Stop conditions

The programme stops and escalates if any of the following is true:

1. A WP requires a contract change and the change has not been approved via an ADR.
2. Two WPs contend for the same file (resolve by resequencing, never by concurrent edit).
3. A verification that previously passed begins failing and the cause is not identified
   within the WP.
4. A defect reproduction is modified instead of the production code.
5. Any claim of PASS cannot be reproduced by running the recorded command.
