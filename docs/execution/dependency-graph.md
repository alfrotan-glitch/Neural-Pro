# Dependency Graph

## 1. Work-package dependencies

```
WP-00 ─┬─► WP-01 ─────────────────────────┐
       │                                   │
       ├─► WP-02 ─► WP-03 ─► WP-04 ────────┤
       │                                   │
       ├─► WP-05 ─┬────────► WP-11 ────────┤
       │          └────────► WP-02 (media) │
       │                                   │
       ├─► WP-06 ──────────────────────────┼─► WP-10
       │                                   │
       ├─► WP-07 ──────────────────────────┤
       │                                   │
       ├─► WP-09 ──────────────────────────┘
       │
       ├─► WP-08 (after 02,03,04,05) ──────┐
       │                                   │
       └─► WP-11 ─► WP-12 ◄────────────────┘
```

## 2. Edge rationale

| Edge | Why |
|---|---|
| WP-00 → all | CI, lint, test harness and the reproduction runner must exist to verify anything |
| WP-01 → WP-09 | WP-09 migrates AI call sites onto the allowlisted operations WP-01 creates |
| WP-02 → WP-03 | parity cannot be asserted while the renderer cannot resolve media |
| WP-03 → WP-04 | the export workflow consumes the canonical render plan |
| WP-05 → WP-02 | `ExportMediaPool` resolves by `AssetId`, which WP-05 introduces |
| WP-05 → WP-11 | measured duration comes from `AssetRegistry.measure()` |
| WP-02/03/04/05 → WP-08 | never move files that are mid-repair |
| WP-06 → WP-10 | runtime certification needs the parity + browser harness |
| WP-11 → WP-12 | shim removal after the resource/duration work settles |
| all → WP-10/WP-12 | certification and cleanup are terminal activities |

## 3. Concurrency matrix

|  | 00 | 01 | 02 | 03 | 04 | 05 | 06 | 07 | 08 | 09 | 10 | 11 | 12 |
|--|--|--|--|--|--|--|--|--|--|--|--|--|--|
| **00** | – | S | S | S | S | S | S | S | S | S | S | S | S |
| **01** | S | – | C | C | C | C | C | C | C | S | S | C | S |
| **02** | S | C | – | S | S | C | C | C | S | C | S | C | S |
| **03** | S | C | S | – | S | C | C | C | S | C | S | C | S |
| **04** | S | C | S | S | – | C | C | C | S | C | S | C | S |
| **05** | S | C | C | C | C | – | C | C | S | C | S | S | S |
| **06** | S | C | C | C | C | C | – | C | C | C | S | C | S |
| **07** | S | C | C | C | C | C | C | – | C | C | S | C | S |
| **08** | S | C | S | S | S | S | C | C | – | S | S | S | S |
| **09** | S | S | C | C | C | C | C | C | S | – | S | C | S |
| **10** | S | S | S | S | S | S | S | S | S | S | – | S | S |
| **11** | S | C | C | C | C | S | C | C | S | C | S | – | S |
| **12** | S | S | S | S | S | S | S | S | S | S | S | S | – |

`S` = must be serial (shared files or semantic dependency) · `C` = may run concurrently
(file ownership disjoint; rebase before merge)

## 4. Critical path

```
WP-00 → WP-05 → WP-02 → WP-03 → WP-04 → WP-10
```

Six work packages. WP-08, WP-07, WP-09, WP-11 and WP-12 have float but must respect the
serialisation rules above.

## 5. Defect → WP mapping

| Defect | WP |
|---|---|
| D-001 export registry | WP-02 |
| D-002 Gemini passthrough | WP-01 |
| D-003 anonymous export API | WP-01 |
| D-004 transform order | WP-03 |
| D-005 missing clip | WP-03 |
| D-006 blob URLs persisted | WP-05 |
| D-007 `renderExportFrame` never called | WP-03 |
| D-008 ffmpeg absent | WP-01 (ADR-004) |
| D-009 fabricated success | WP-09 |
| D-010 cancel defects | WP-04 |
| D-011 test suite | WP-06 |
| D-012 better-sqlite3 | WP-07 |
| D-013 no error boundary | WP-07 |
| D-014 object URLs | WP-11 |
| D-015 hard-coded port | WP-07 |
| D-016 ondequeue leak | WP-11 |
| D-017 hard-coded Persian | WP-12 |
| D-018 state mutation | WP-08 |
| D-019 `(window as any)` | WP-08 |
| D-020 dual fps | WP-11 |
| D-021 latent key exposure | WP-07 |
| D-022 caption fps | WP-09 |
| D-023 `/tmp` paths | WP-01 |
| D-024 podcast duration | WP-11 |
| D-025 dead modules | WP-12 |
| D-026 preview vs sharp rounding | WP-03 |
| D-027 scratch files | WP-12 |
| D-028 no ESLint/CI/Docker | WP-07 |
