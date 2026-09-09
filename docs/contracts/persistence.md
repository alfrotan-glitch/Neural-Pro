# Contract: Persistence

**Normative.** Owns **INV-009**.
**Status:** implemented (WP-05); verified by `tests/persistence/**`.

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
| R1 | No `blob:` URL, `data:` URL, `file:`/`filesystem:` URL, or absolute filesystem path may appear in a persisted document |
| R2 | Every clip media reference is an `AssetId` (or an `https:` remote URL recorded as such) |
| R3 | `duration`/`width`/`height`/`sampleRate`/`channels` are stored once, measured, never re-derived differently |
| R4 | Documents are forward-compatible-by-default: an unknown `schemaVersion` is **refused** with `PERSISTENCE_UNSUPPORTED_VERSION`, never guessed |
| R5 | No persisted value may be random or depend on `Date.now()` for correctness |
| R6 | `isPlaying` is never persisted as `true` |
| R7 | Object URLs are runtime handles, tracked by `AssetRegistry`, never serialised |
| R8 | A save is a single atomic transaction; a crash mid-save leaves the previous document byte-identical and the revision unadvanced |
| R9 | A stored envelope is verified on read (checksum, track/clip order fingerprint, duration cross-check) before any part of it is used |
| R10 | Durability degradation is surfaced to the user; a session-only save is never presented as a durable one |

## 3. Write path

```
saveProject({projectId, name, state, settings, exports})
  → importRuntimeMediaHandles(tracks)   // blob:/data: → asset store ⇒ AssetId on the clip
                                        // dead handle ⇒ clip.mediaUnresolved + warning
  → assertValidProjectState(state)
  → resolve the asset manifest          // every referenced AssetId must have a record
  → serializeProjectDocument(state)     // strips runtime handles, keeps remote URLs
  → assertNoTransientReferences(doc)    // ⇒ PERSISTENCE_TRANSIENT_REFERENCE, naming the path
  → sealDocument                        // sha-256 + order fingerprint + duration
  → documents.save                      // ONE transaction: revision guard, rollback slot,
                                        // primary slot, index
  → on quota error → PERSISTENCE_QUOTA + offer orphan eviction
  → { ok, revision, warnings[], degraded, estimate }   // never a fake success
```

## 4. Read path

```
loadProject({projectId, name, fallbackState})
  → read document (by projectId, else by name via the index)
  → verify envelope: parse → schemaVersion → checksum → order fingerprint → duration
       failure → try the rollback slot ⇒ { recovered: true, recoveredFrom: 'rollback' }
       no rollback → PERSISTENCE_CORRUPT, state: null (never an empty project)
  → switch schemaVersion:
       2 → hydrate
       1 → migrateV1toV2 (SHIM-001, WP-05; removed in WP-12), then re-save as V2
       n ∉ {1,2} → PERSISTENCE_UNSUPPORTED_VERSION
  → for each clip: assetId → registry.resolveUrl(id) → fresh tracked object URL
                   unresolvable ⇒ mediaMissing + a named warning; clip geometry preserved
  → recompute totalDuration, clamp currentTime
  → normalizeSelectedNodeIds
  → assertValidProjectState
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
| Documents | `neuralpro` | `projects` | `project:<projectId>` | sealed `DocumentEnvelope` (JSON string) |
| Previous revision | `neuralpro` | `projects` | `project:<projectId>#rollback` | previous envelope |
| Project index | `neuralpro` | `projects` | `project-index` | `ProjectSummary[]` |
| Asset bytes | `neuralpro` | `assets` | `AssetId` | `Blob` |
| Asset records | `neuralpro` | `assets`/`assetRecords` | `AssetId` | `AssetRecord` |
| UI prefs | localStorage | – | `neuralpro:ui` | JSON |

Versioned by `neuralpro` DB version; `onupgradeneeded` creates the three object stores.

The document is stored as a JSON **string** rather than a structured clone so that a torn or
tampered value is observable and the checksum has a single canonical byte sequence.

## 7. Quota and eviction

* `put` catches `QuotaExceededError` → `PERSISTENCE_QUOTA`.
* Eviction candidates: orphaned assets (unreferenced by any document) older than a grace
  window (default 7 days, or immediately on explicit user action).
* `navigator.storage.estimate()` is surfaced in the UI when a save fails.

## 8. Failure semantics

| Condition | Error | UI |
|---|---|---|
| Document corrupt, previous revision usable | `PERSISTENCE_CORRUPT` + `recovered: true` | "The last save was unreadable; the previous version was restored." |
| Document corrupt, no previous revision | `PERSISTENCE_CORRUPT` | "This project could not be read. Start fresh or restore a backup." The editor keeps its current state |
| Unknown version | `PERSISTENCE_UNSUPPORTED_VERSION` | names both versions |
| Transient reference reached the writer | `PERSISTENCE_TRANSIENT_REFERENCE` | save refused; the offending JSON path is named |
| Concurrent writer | `PERSISTENCE_CONFLICT` | reload and retry; the other writer's document is preserved |
| Asset missing | `ASSET_MISSING` | relink affordance; export blocked, naming the clip |
| Quota | `PERSISTENCE_QUOTA` | eviction offer + `navigator.storage.estimate()` |
| IndexedDB unavailable | runtime `storageMode: 'session'` | explicit degraded warning: survives the session, not a restart |
| Bundle unreadable / tampered | `BUNDLE_CORRUPT` | import refused, nothing written; the current project is untouched |

## 9. Never-fake rule

Saving must not report success when the document contains unresolvable references.
`saveProject` returns `{ ok, warnings: MediaMissingWarning[], degraded, error }` and the toast
reflects all three. Reporting `"💾 Saved project successfully!"` while user media is
unrecoverable is a violation of INV-010.

Verified by `tests/persistence/06-editor-round-trip.test.mjs`: a quota failure produces
`ok: false` and a toast containing "Save failed"; a save with unresolvable media produces
`ok: true` **plus** a warning naming the clip.

## 10. Portable bundle (`.neuralpro`)

**Normative.** A bundle is a real second copy of a project, not a metadata export: it contains
the sealed document **and** the bytes of every asset the document references.

```
<name>.neuralpro   (ZIP, STORE method — no compression, byte-deterministic per R5)
├── manifest.json          BundleManifestV1
└── assets/<AssetId>       raw bytes, one entry per asset

interface BundleManifestV1 {
  format: 'neuralpro-project-bundle';
  bundleVersion: 1;
  createdAt: number;
  projectId: string;
  name: string;
  document: ProjectDocumentV2;              // identical to the stored document
  orderFingerprint: string;
  documentChecksum: string;
  documentChecksumAlgorithm: 'sha-256' | 'fnv1a-64';
  assets: { id: AssetId; entry: string; byteSize: number; contentHash: string | null }[];
  missingAssets: AssetId[];                 // referenced, but no bytes at export time
}
```

### B1 — export rules

* The document comes from the **store**, never from the editor state, so a bundle can never
  contain something that was not already durable.
* Every referenced `AssetId` gets an entry. An asset with no bytes does **not** fail the export:
  it is listed in `missingAssets` and returned as an `ASSET_MISSING` warning. A partial backup
  is better than none, and the user is told.
* Bytes for the same project state produce the same file: fixed DOS timestamps, no compression,
  no random ids in the archive.

### B2 — import rules

Verification happens before any write, in this order; each step is a hard stop:

| # | Check | Failure |
|---|---|---|
| 1 | ZIP CRC-32 of every entry | `BUNDLE_CORRUPT` |
| 2 | `manifest.json` present and parseable | `BUNDLE_CORRUPT` |
| 3 | `format` is `neuralpro-project-bundle` | `BUNDLE_CORRUPT` |
| 4 | `bundleVersion` is supported | `PERSISTENCE_UNSUPPORTED_VERSION` (R4 — never guessed) |
| 5 | document checksum | `BUNDLE_CORRUPT` |
| 6 | `assertOrderFingerprint` | `PERSISTENCE_CORRUPT` |
| 7 | `assertDocumentInternals` (duration cross-check) | `PERSISTENCE_CORRUPT` |
| 8 | per-asset `byteSize` and `contentHash` | `BUNDLE_CORRUPT` |
| 9 | same `AssetId` already present with different bytes | `PERSISTENCE_CONFLICT` |

Writes happen only after all nine: asset bytes first, the document last in one atomic
transaction. Consequences that are tested, not assumed:

* **No half-import.** If the document write fails, no project exists; only unreferenced asset
  bytes remain, reclaimable by the orphan collector.
* **Identity is preserved.** Imported assets are stored with `preserveIdentity: true`, so the
  content-hash dedupe cannot substitute another `AssetId` and leave the document dangling.
* **Idempotent.** Re-importing an unchanged bundle reports the assets as `reusedAssets` and
  writes nothing.
* **Restoration is an ordinary open.** After the write the project is read back through
  `loadProject`, so hydration, validation and warnings use the same code path as any other load.

Verified by `tests/persistence/08-project-bundle.test.mjs` (17 groups), including a round trip
into a completely empty profile and four tamper cases.
