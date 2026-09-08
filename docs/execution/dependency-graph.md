# Dependency Graph (revised for the AI Studio Web App runtime)

**Revised 2026-09-09.** Adds **WP-13**; re-scopes WP-07/WP-10 external-deployment edges as
optional; adds the AI Studio verification edges.

---

## 1. Work-package dependencies

```
                    ┌──────────────────────────────────────────┐
                    │ WP-00  Verification & tooling baseline   │
                    └───┬──────────────────────────────────┬───┘
                        │                                  │
        ┌───────────────┘                                  └───────────────┐
        ▼                                                                  ▼
  WP-07 Server hardening                                        WP-13 AI Studio Runtime
  (adds /api/runtime/capabilities)                              Verification  ◄── evidence
        │                                                          ▲   │
        │                                                          │   │ capability
        │                                                          │   │ findings
   ┌────┴─────┐                                                    │   ▼
   ▼          ▼                                                    │  re-scopes
WP-01      WP-09                                                   ├──► WP-02, WP-05,
 P0          AI                                                    │    WP-06, WP-10
 │                                                                 │
 ├──► WP-05 Persistence ──┬──► WP-11 Resources                     │
 │                        │                                        │
 │                        └──► WP-02 Export independence ──► WP-03 Render parity ──► WP-04 Workflow
 │                                                                                        │
 ├──► WP-06 Behavioural tests ────────────────────────────────────────────────────────────┤
 │                                                                                        │
 └──► WP-08 Module layering (after 02,03,04,05) ────────────────────────┐                 │
                                                                        ▼                 ▼
                                                              WP-10 Recovery & runtime certification
                                                                        │
                                                                        ▼
                                                              WP-12 Hygiene, i18n, shim removal
```

Optional (non-blocking) edges:
```
WP-07 ── (optional) ──► external container/Docker path ──► Stage G of certification
```

## 2. Edge rationale (new or changed)

| Edge | Why |
|---|---|
| WP-00 → WP-13 | the capability probe harness and the report format must exist before verification runs |
| WP-07 ⇢ WP-13 | **OPTIONAL ENRICHMENT** — `/api/runtime/capabilities` is the server half of the probe. If WP-07 has landed, WP-13 consumes and correlates it. If it has not, WP-13 marks server-side capability evidence **unavailable** and continues every independent check |
| WP-13 → WP-02/05/06/10 | capability findings (P-01…P-06) may re-scope export delivery, storage strategy, the browser suite and certification |
| WP-01 → WP-09 | WP-09 migrates AI call sites onto the operations WP-01 creates |
| WP-05 → WP-02 | `ExportMediaPool` resolves by `AssetId` |
| WP-05 → WP-11 | measured duration comes from `AssetRegistry.measure()` |
| WP-07 ⇢ external container | **optional** — no longer on the critical path |

## 3. Concurrency matrix

|  | 00 | 01 | 02 | 03 | 04 | 05 | 06 | 07 | 08 | 09 | 10 | 11 | 12 | 13 |
|--|--|--|--|--|--|--|--|--|--|--|--|--|--|--|
| **00** | – | S | S | S | S | S | S | S | S | S | S | S | S | S |
| **01** | S | – | C | C | C | C | C | C | C | S | S | C | S | C |
| **02** | S | C | – | S | S | S | C | C | S | C | S | C | S | C |
| **03** | S | C | S | – | S | C | C | C | S | C | S | C | S | C |
| **04** | S | C | S | S | – | C | C | C | S | C | S | C | S | C |
| **05** | S | C | S | C | C | – | C | C | S | C | S | S | S | C |
| **06** | S | C | C | C | C | C | – | C | C | C | S | C | S | C |
| **07** | S | C | C | C | C | C | C | – | C | C | S | C | S | S |
| **08** | S | C | S | S | S | S | C | C | – | S | S | S | S | C |
| **09** | S | S | C | C | C | C | C | C | S | – | S | C | S | C |
| **10** | S | S | S | S | S | S | S | S | S | S | – | S | S | C |
| **11** | S | C | C | C | C | S | C | C | S | C | S | – | S | C |
| **12** | S | S | S | S | S | S | S | S | S | S | S | S | – | C |
| **13** | S | C | C | C | C | C | C | S | C | C | C | C | C | – |

`S` = serial · `C` = may run concurrently (disjoint ownership; rebase before merge)

## 4. Critical path

```
WP-00 → WP-13 → WP-05 → WP-02 → WP-03 → WP-04 → WP-10 → WP-12

**WP-13's only HARD dependency is WP-00** (probe harness + report schema). WP-07 is **optional
enrichment**: WP-13 must be executable in full without it.
```

Nine work packages. WP-13 sits early deliberately: its answers can change the shape of WP-02,
WP-05 and WP-10, so discovering them late would be expensive.

## 5. Defect → WP mapping (updated)

| Defect | WP | Change from the previous plan |
|---|---|---|
| D-001 export registry | WP-02 | – |
| D-002 Gemini passthrough | WP-01 | – |
| D-003 anonymous export API | WP-01 | – |
| D-004 transform order | WP-03 | – |
| D-005 missing clip | WP-03 | – |
| D-006 blob URLs persisted | WP-05 | – |
| D-007 `renderExportFrame` never called | WP-03 | – |
| D-008 ffmpeg absent | WP-01 | rationale corrected: unsupported **AI Studio capability**, not merely "absent from Cloud Run" |
| D-009 fabricated success | WP-09 | – |
| D-010 cancel defects | WP-04 | – |
| D-011 test suite | WP-06 | – |
| D-012 `better-sqlite3` | WP-07 | rationale strengthened: native builds are RUNTIME-UNKNOWN in the AI Studio environment |
| D-013 no error boundary | WP-07 | – |
| D-014 object URLs | WP-11 | – |
| **D-015 hard-coded port** | WP-07 | **reclassified P1 → P2**; it is the AI Studio convention; the fix is retained for portability |
| D-016 ondequeue leak | WP-11 | – |
| D-017 hard-coded Persian | WP-12 | – |
| D-018 state mutation | WP-08 | – |
| D-019 `(window as any)` | WP-08 | – |
| D-020 dual fps | WP-11 | – |
| D-021 latent key exposure | WP-07 | – |
| D-022 caption fps | WP-09 | – |
| **D-023 `/tmp` paths** | WP-01 | rationale corrected: no **durable** server storage in AI Studio; the Cloud Run RAM argument is supporting only |
| D-024 podcast duration | WP-11 | – |
| D-025 dead modules | WP-12 | – |
| D-026 preview vs sharp rounding | WP-03 | – |
| **D-027 scratch files** | WP-12 | **corrected**: `metadata.json`, `README.md` and `.env.example` are **protected AI Studio files** |
| **D-028 no ESLint/CI/Docker** | WP-07 | **narrowed**: `.env.example` exists; Docker/CI-container are **optional** |
| **D-029 (new) AI Studio manifest unexamined** | WP-12/WP-13 | The app manifest was not treated as architecture; now owned and protected |
| **D-030 (new) no runtime capability detection** | WP-07/WP-13 | Required capabilities are used without probing (AS-INV-09) |
