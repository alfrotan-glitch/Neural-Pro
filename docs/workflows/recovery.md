# Workflow W5 — Recovery

**Owner WP:** WP-10
**Status:** **does not exist today.** This workflow is new.

---

## 1. Purpose

Bring an interrupted, stalled or error-terminated run to a defined state, and clean up
resources it leaked. Today there is no equivalent: a failed export leaves the store claiming
"rendering", a stale `isExporting`, orphaned object URLs, and (with D-016) hundreds of
accumulated event handlers.

## 2. Triggers

| Trigger | Action |
|---|---|
| Application start, after a prior session ended abnormally | scan checkpoints; offer resume for runs younger than `maxResumeAgeMs` |
| A run exceeds `runTimeoutMs` | force `expired`, run cleanup, notify |
| User clicks **Retry** on a failed run | new run, same `idempotencyKey`, `attempt + 1`, resume from valid checkpoints |
| User clicks **Clean up** | run cleanup only |
| Storage open with orphaned assets | offer eviction |

## 3. Steps (target)

| # | Step | Notes |
|---|---|---|
| 1 | `scan` | enumerate checkpoints + non-terminal runs persisted from the previous session |
| 2 | `validate` | snapshot hash unchanged; every referenced `AssetId` still resolvable; output shapes valid |
| 3 | `decide` | `resume-from-checkpoint` \| `restart` \| `manual` (when validation fails) |
| 4 | `resume`/`restart` | delegate to the owning workflow definition |
| 5 | `cleanup` | **always**: release media pool, revoke tracked object URLs, dispose encoders/muxers, remove listeners/timers, drop expired checkpoints, mark stale runs `failed` with `EXPIRED` |
| 6 | `report` | structured summary: resumed/restarted/abandoned, resources released, duration |

## 4. Stale-state detection rules

| Condition | Classification | Recovery |
|---|---|---|
| Run status non-terminal and `now − lastHeartbeat > runTimeoutMs` | `expired` | cleanup + notify |
| Run status `rendering` with no heartbeat and no in-flight promise | `zombie` → `failed` (`INTERNAL`) | cleanup |
| Checkpoint older than `retainCheckpointsMs` | expired | delete |
| Checkpoint references a missing asset | invalid | invalidate + (if required) `manual` |
| Object URL tracked but not released and the owning run is terminal | leaked | revoke + log `resource.leaked` |
| Asset unreferenced by any document and older than the grace window | orphan | evict (with user confirmation) |

## 5. Heartbeat

Every run writes `lastHeartbeat` (in-memory; persisted every 5 s for long runs). The recovery
workflow is the only reader that may classify a run as dead.

## 6. Invariants

| ID | Invariant |
|---|---|
| INV-007 | every run reaches a terminal state — recovery guarantees it for abandoned runs |
| INV-008 | every acquired resource is released — recovery is the last line of defence |
| INV-014 | no stale non-terminal state survives a restart |

## 7. Tests

| Test | Method |
|---|---|
| Abnormal termination is recovered | simulate: kill a run mid-step → restart → recovery marks it terminal |
| Resume from checkpoint | fail at step 4 of 6 → resume → steps 1-3 are not re-executed |
| Resume aborts when an asset is missing | delete the asset → recovery → `manual` + `ASSET_MISSING` |
| Leaked object URLs are revoked | instrument create/revoke; leak 3; run cleanup; assert balance |
| Expired checkpoints deleted | age the checkpoints; run cleanup; assert removal |
| Timers/listeners removed | instrument `setInterval`/`addEventListener`; assert balance |
