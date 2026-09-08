# Contract: Persistence

**Normative.** Owns **INV-009**.

---

## 1. Document

```ts
export interface ProjectDocumentV2 {
  readonly schemaVersion: 2;
  readonly project: ProjectState;             // clips reference AssetIds
  readonly assets: readonly AssetRecord[];    // manifest (no bytes)
}
```

Bytes live in IndexedDB (`neuralpro-assets`); the document lives in IndexedDB
(`neuralpro-projects`) keyed by `projectId`. localStorage remains for **UI preferences only**
(theme, zoom, last opened project id) — never project data, never blobs.

## 2. Durability rules

| Rule | Statement |
|---|---|
| R1 | No `blob:` URL, `data:` URL, or absolute filesystem path may appear in a persisted document |
| R2 | Every clip media reference is an `AssetId` (or an `https:` remote URL recorded as such) |
| R3 | `duration`/`width`/`height`/`sampleRate`/`channels` are stored once, measured, never re-derived differently |
| R4 | Documents are forward-compatible-by-default: an unknown `schemaVersion` is **refused** with `PERSISTENCE_UNSUPPORTED_VERSION`, never guessed |
| R5 | No persisted value may be random or depend on `Date.now()` for correctness |
| R6 | `isPlaying` is never persisted as `true` |
| R7 | Object URLs are runtime handles, tracked by `AssetRegistry`, never serialised |

## 3. Write path

```
saveProject(state, assets)
  → assertValidProjectState(state)
  → serialize(state)                 // structuredClone
  → assertNoBlobUrls(serialized)     // throws PERSISTENCE_FAILED if a blob: URL is found
  → write document (IndexedDB, transactional)
  → write/refresh asset records
  → on quota error → PERSISTENCE_QUOTA + offer orphan eviction
```

## 4. Read path

```
loadProject(projectId)
  → read document
  → switch schemaVersion:
       2 → hydrate
       1 → migrateV1toV2 (compat shim, WP-05; removed in WP-12)
       n ∉ {1,2} → PERSISTENCE_UNSUPPORTED_VERSION
  → for each clip: if assetId → registry.get(id) → null ⇒ clip.mediaMissing = true
  → assertValidProjectState
  → normalizeSelectedNodeIds
  → resolve media URLs (freshly minted, tracked)
```

## 5. Migration policy (ADR-006)

1. A writer for version N+1 and a reader for version N coexist for at most one development
   cycle.
2. Every compat shim has: an ID, an owner (WP), a removal milestone (WP-12), and a test that
   fails if the shim is still present after the milestone.
3. Migrations are **forward-only** and never executed on a document the writer produced in the
   current version.

## 6. Asset storage

| Store | DB | Object store | Key | Value |
|---|---|---|---|---|
| Documents | `neuralpro` | `projects` | `projectId` | `ProjectDocumentV2` |
| Asset bytes | `neuralpro` | `assets` | `AssetId` | `Blob` |
| Asset records | `neuralpro` | `assetRecords` | `AssetId` | `AssetRecord` |
| UI prefs | localStorage | – | `neuralpro:ui` | JSON |

Versioned by `neuralpro` DB version; `onupgradeneeded` creates stores and indexes.

## 7. Quota and eviction

* `put` catches `QuotaExceededError` → `PERSISTENCE_QUOTA`.
* Eviction candidates: orphaned assets (unreferenced by any document) older than a grace
  window (default 7 days, or immediately on explicit user action).
* `navigator.storage.estimate()` is surfaced in the UI when a save fails.

## 8. Failure semantics

| Condition | Error | UI |
|---|---|---|
| Document corrupt | `PERSISTENCE_CORRUPT` | "This project could not be read. Restore previous version or start fresh." |
| Unknown version | `PERSISTENCE_UNSUPPORTED_VERSION` | names both versions |
| Asset missing | `ASSET_MISSING` | relink affordance; export blocked |
| Quota | `PERSISTENCE_QUOTA` | eviction offer |
| IndexedDB unavailable | `DEPENDENCY_UNAVAILABLE` | explicit degraded banner: metadata-only mode |

## 9. Never-fake rule

Saving must not report success when the document contains unresolvable references. Target:
`saveProject` returns `{ ok: true, warnings: MediaMissingWarning[] }` and the toast reflects
warnings. Reporting `"💾 Saved project successfully!"` while user media is unrecoverable is a
violation of INV-010.
