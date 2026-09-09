# Persistence Architecture

**Status:** implemented (WP-05). Owns **INV-009** (durable state never depends on transient
blob URLs) and the durability half of **INV-008** (object-URL ownership).

---

## 1. What is durable, and where it lives

| Data | Store | Key | Why |
|---|---|---|---|
| Project document (tracks, clips, timing, selection, settings, asset manifest, generated-media records) | IndexedDB `neuralpro` / `projects` | `project:<projectId>` | large, structured, must survive reload and browser restart |
| Previous revision of the document | IndexedDB `neuralpro` / `projects` | `project:<projectId>#rollback` | crash and corruption recovery |
| Project index (name → id, revision, savedAt, duration) | IndexedDB `neuralpro` / `projects` | `project-index` | "Continue where you left off" |
| Asset bytes | IndexedDB `neuralpro` / `assets` | `AssetId` | `Blob` storage, no base64 bloat |
| Asset manifest records | IndexedDB `neuralpro` / `assetRecords` | `AssetId` | measured metadata, provenance, soft-delete marker |
| UI preferences (theme, zoom, snapping, tool, last opened project) | localStorage `neuralpro:ui` | – | tiny, replaceable, never a source of truth |
| Object URLs, media elements, `AudioBuffer`s, `ImageBitmap`s, export job progress | **memory only** | – | ephemeral by nature; persisting them is a defect |

`localStorage` is *only* used for UI preferences (and pre-existing preset/diagnostic keys).
`UiPreferencesStore.assertPreferencesAreUiOnly` throws if a caller tries to store `tracks`,
`clips`, `project`, `assets`, `document` or `state` there.

### 1.1 Identity

```
AssetId = 'as_<uuid>'                       (stable, content-hash deduped)
projectId = 'proj_<slug>_<sha256(name)[:12]>'   (deriveProjectId)
```

The editor's identity for a project is its **name**; `ProjectState.projectId` was a shared
sentinel for every new project, so keying documents by it would let two projects overwrite
each other. `deriveProjectId` is deterministic and collision-resistant, and the migrated
legacy path uses the derived id too (a V1 document's own `projectId` is not trusted).

A clip references media by `videoAssetId` / `audioAssetId` / `imageAssetId`. An `https:`
remote URL is also a legal durable reference (contract R2) and is preserved verbatim; the
demo project therefore round-trips unchanged.

## 2. The write path

```
saveProject({projectId, name, state, settings, exports})
  1. importRuntimeMediaHandles(tracks)        // blob:/data: → asset store, clip → AssetId
                                              // dead handle  → clip marked mediaUnresolved
  2. assertValidProjectState(normalised)
  3. resolve the asset manifest (every referenced AssetId must have a record)
  4. serializeProjectDocument                 // strips runtime handles (R1/R7)
       └─ assertNoTransientReferences         // blob:/data:/file:/filesystem: ⇒ hard failure
  5. sealDocument                             // sha-256 checksum + order fingerprint + duration
  6. documents.save  →  ONE atomic transaction:
         revision guard (PERSISTENCE_CONFLICT if another writer landed)
         current  → rollback slot
         envelope → primary slot
         index    → updated
  7. collectOrphanedAssets (deferred, best-effort)
  → { ok, revision, warnings[], degraded, estimate }
```

`saveProject` never throws for a user-facing condition. Quota, conflict and serialisation
failures come back as `{ ok: false, error }`; missing media comes back as `warnings`.
A green "Saved" toast for a project whose media is unrecoverable would violate INV-010.

### 2.1 Determinism (R5)

`savedAt` and `revision` live in the **envelope**, not the document, so
`serializeProjectDocument` is a pure function of its inputs: saving the same state twice
produces byte-identical canonical JSON and the same checksum. The waveform preview that used
to be `Math.random()` is now derived from the clip id
(`core/engine/deterministicWaveform.ts`) — persisted randomness made documents
non-reproducible and made the timeline appear to change on reload.

### 2.2 Crash safety

A save is one IndexedDB `readwrite` transaction covering the primary slot, the rollback slot
and the index. IndexedDB commits atomically, so a crash at any point leaves the previous
document byte-identical and the revision unadvanced — there is no window in which the project
is half-written. `tests/persistence/03-crash-and-corruption.test.mjs` simulates the crash
between staging and commit and asserts exactly that, including that the rollback slot and the
index were not touched by the failed write.

The revision guard closes the concurrent-writer hole: if another tab committed between the
read and the transaction, the losing save aborts with `PERSISTENCE_CONFLICT` instead of
silently clobbering the other tab's work.

## 3. The read path

```
loadProject({projectId, name, fallbackState})
  1. documents.load(projectId)  (or loadByName via the index)
  2. openEnvelope:
        parse → schemaVersion ∈ {1,2} → sha-256 checksum → order fingerprint → duration
        any failure ⇒ PERSISTENCE_CORRUPT / PERSISTENCE_UNSUPPORTED_VERSION
        on failure, retry the rollback slot ⇒ { recovered: true, recoveredFrom: 'rollback' }
  3. schemaVersion 1 ⇒ SHIM-001 migration (in memory, then re-saved as V2)
  4. hydrateProjectMedia:
        AssetId → registry.resolveUrl() → a FRESH object URL, tracked
        unresolvable ⇒ mediaMissing + a named warning; the clip and its geometry are kept
  5. recompute totalDuration, clamp currentTime, reconcile selection
  6. assertValidProjectState
```

Nothing is partially hydrated and a corrupt document is never replaced by an empty project.
If no V2 document exists, the legacy `localStorage` save is migrated (SHIM-001): the raw V1
JSON is seeded into the durable rollback slot **before** the localStorage key is removed, so
migration can never be the step that loses the user's only copy.

### 3.1 Integrity checks

| Check | Catches |
|---|---|
| `sha-256` over canonical JSON | torn writes, truncation, any external tampering |
| `orderFingerprint` over `trackId > clipIds` | a payload rewritten without its fingerprint (writer bug); reordering would silently change preview/export z-order |
| `duration` cross-check against `calculateProjectDuration(tracks)` | a document whose timeline disagrees with its own declared duration |
| `schemaVersion` allow-list | a document from a newer build — refused, never guessed (R4) |

The checksum is a **corruption detector, not a signature**: it proves the bytes read back are
the bytes written. A forged envelope with a recomputed checksum and fingerprint is
indistinguishable from a genuine one; that threat model is out of scope for browser storage.

## 4. Asset lifecycle

```
created    put() writes bytes + AssetRecord (deduped by sha-256 of the content)
persisted  bytes in `assets`, record in `assetRecords`, AssetId in the document
referenced clips hold the AssetId; the manifest lists the record
loaded     resolveUrl() mints a fresh object URL, tracked in Map<AssetId, Set<string>>
replaced   the new asset's measured duration re-derives clip.duration / trim.out
released   releaseUrl() / releaseAll() revoke and untrack
deleted    soft delete (deletedAt) → grace window (7 days) → purge
```

Orphan collection is deliberately conservative: an asset is reclaimed only when no document
references it **and** it is past the grace window. When no reference information is available
the collector deletes nothing — guessing would be data loss.

`measure()` measures once (video/audio element, `decodeAudioData`, `createImageBitmap`) and
caches on the record; the measured value is then authoritative (contract R3). Where a runtime
cannot measure (Node, a locked-down frame) the asset is `durationUnknown` and the UI says so
instead of inventing a duration.

## 5. Failure semantics

| Condition | Code | UI behaviour |
|---|---|---|
| Document unreadable, previous revision exists | `PERSISTENCE_CORRUPT` + `recovered: true` | "the last save was unreadable; the previous version was restored" |
| Document unreadable, no previous revision | `PERSISTENCE_CORRUPT` | explicit failure; the editor keeps its current state |
| Unknown `schemaVersion` | `PERSISTENCE_UNSUPPORTED_VERSION` | names both versions |
| Transient reference reached the writer | `PERSISTENCE_TRANSIENT_REFERENCE` | save refused, names the JSON path |
| Another writer committed first | `PERSISTENCE_CONFLICT` | reload and retry |
| Quota | `PERSISTENCE_QUOTA` | eviction offer, `navigator.storage.estimate()` surfaced |
| Asset missing at hydrate | `ASSET_MISSING` | Relink dialog; export refuses to start and names the clip |
| IndexedDB unavailable | runtime `storageMode: 'session'` | explicit degraded warning: survives the session, not a restart |

Degradation is never silent: `saveCurrentProject` appends "Durable storage is unavailable —
this project will NOT survive a browser restart" to the toast when `storageMode === 'session'`,
and `describeStorageCapability()` reports whether `navigator.storage.persist()` was granted.

## 6. Portable bundle (`.neuralpro`)

IndexedDB is the right default, but it is still *profile* storage: denied in some private
modes, partitioned in some embedded frames, evictable under storage pressure. A bundle is the
durability mechanism that depends on none of that — one file the user owns. It is also the only
way to move a project between profiles or machines.

A `.neuralpro` file is a ZIP archive using the **STORE** method (no compression), so the writer
is small, dependency-free and byte-deterministic (R5). Compression buys nothing here: media is
already compressed, and determinism is what makes the format testable.

```
manifest.json          BundleManifestV1: format, bundleVersion, createdAt, projectId, name,
                       the whole ProjectDocumentV2, orderFingerprint, documentChecksum(+algo),
                       the asset index, and the ids that could not be exported
assets/<AssetId>       raw bytes, one entry per asset
```

`src/infra/persistence/projectBundle.ts` owns the format. It is a serialisation of the same two
halves the store already uses — one document, N asset records + bytes — not a second model.

**Export** reads the durable document, never the editor state, and writes every referenced
asset. An asset whose bytes are gone does **not** abort the export: a partial backup beats no
backup. It is recorded in `manifest.missingAssets` and returned as a warning, so the user is
told the file is incomplete instead of discovering it later.

**Import** verifies first, writes second:

1. ZIP CRC-32 for every entry,
2. `manifest.format` and `bundleVersion` — unknown ⇒ `PERSISTENCE_UNSUPPORTED_VERSION`, never
   guessed (R4),
3. the document checksum, then `assertOrderFingerprint` and `assertDocumentInternals`: the same
   guarantees as the IndexedDB read path, applied on the bundle path too,
4. each asset's byte size **and** content hash against the manifest (the CRC catches truncation,
   the hash catches a payload swapped for something the same length),
5. conflict check — an `AssetId` already present here with *different* bytes ⇒
   `PERSISTENCE_CONFLICT`. Silently overwriting would corrupt the project that owns it.

Only then are asset bytes written, and the document last, in one atomic transaction. A failure
anywhere before the document write therefore leaves **no** half-imported project — only
unreferenced bytes, which the orphan collector reclaims. Imported assets are stored with
`preserveIdentity: true`, because the content-hash dedupe must not hand back somebody else's
`AssetId` and leave the imported document pointing at nothing.

UI paths: **Bundle** (`createCurrentProjectBundle`) saves the project first, on purpose, so the
file cannot lag behind the editor; **Open Bundle** (`importProjectBundleIntoStore`) restores
through the ordinary `loadProject` read path, so an imported project is hydrated, validated and
warning-reported by the same code as any other open.

## 7. Migration (SHIM-001)

| | |
|---|---|
| ID | `SHIM-001` |
| Owner | WP-05 |
| Removal milestone | WP-12 |
| Behaviour | reads `schemaVersion: 1` and pre-schema documents; imports live blob URLs; marks dead ones `mediaUnresolved`; re-saves as V2 |
| Guard | `tests/persistence/04-migration.test.mjs` asserts the owner/milestone are still declared, so the shim cannot outlive its ticket unnoticed |

Migrations are forward-only: a V2 document is never re-migrated.

## 8. Module map

```
src/domain/assets/types.ts              AssetId, AssetRecord, MediaProbe, URL classification
src/domain/assets/AssetRegistry.ts      the interface (no browser APIs)
src/domain/assets/mediaReferences.ts    durable vs runtime clip media state

src/infra/persistence/errors.ts                 typed PersistenceError codes
src/infra/persistence/integrity.ts              canonical JSON, sha-256, FNV fallback
src/infra/persistence/documentContract.ts       ProjectDocumentV2, seal/open, transient gate
src/infra/persistence/objectUrlTracker.ts       the ONLY mint/revoke site (INV-008)
src/infra/persistence/mediaProbe.ts             measure once (element/decode + RIFF/WAVE header)
src/infra/persistence/assetRegistryCore.ts      registry semantics, shared by both backends
src/infra/persistence/IndexedDbAssetRegistry.ts durable backend
src/infra/persistence/indexedDbBackend.ts       `neuralpro` database + atomic transactions
src/infra/persistence/memoryBackend.ts          tests + degraded mode (crash injection hook)
src/infra/persistence/projectDocumentStore.ts   atomic save, recover, rollback, index
src/infra/persistence/mediaHydration.ts         AssetId → runtime handle, missing-media warnings
src/infra/persistence/migrateV1toV2.ts          SHIM-001
src/infra/persistence/transientMediaImporter.ts blob:/data: → asset
src/infra/persistence/uiPreferencesStore.ts     the only localStorage consumer
src/infra/persistence/storageLifecycle.ts       capability probe, orphan GC, purge
src/infra/persistence/projectBundle.ts          .neuralpro portable bundle writer/reader

src/features/video-studio/project/services/projectPersistenceService.ts   coordinator
src/features/video-studio/project/services/projectSaveController.ts       store ⇄ persistence
src/ui/workspace/RelinkMediaDialog.tsx                                    recovery affordance
```

`src/domain/**` is pure by rule and verified by a static test. `src/infra/**` owns every
browser storage API.

## 9. Verification

`npm test` runs `tests/persistence/run.cjs` (10 files, 109 assertion groups):

| File | Covers |
|---|---|
| `01-round-trip.test.mjs` | identity, track/clip order, z-order, durations, selection, settings, animations, per-name isolation |
| `02-media-identity.test.mjs` | blob import, fresh handle on reload, transient-reference gate, dedupe, URL balance, missing media, relink |
| `03-crash-and-corruption.test.mjs` | crash before commit, atomicity, corruption recovery, tamper detection, rollback restore, version refusal, conflict, quota |
| `04-migration.test.mjs` | SHIM-001: live and dead blob URLs, normalisation, legacy localStorage, corrupt legacy JSON |
| `05-lifecycle.test.mjs` | orphan GC and grace windows, purge, preferences, determinism, generated media, deletion |
| `06-editor-round-trip.test.mjs` | the real zustand store + controller: edit → save → wipe → reload; failed-save messaging; export blocking |
| `07-static-guards.test.mjs` | no media path mints an object URL into clip properties; no project data in localStorage; domain purity |
| `08-project-bundle.test.mjs` | bundle round trip into an EMPTY profile, identity/order/duration/bytes preservation, deterministic bytes, CRC + checksum + order + content-hash tamper refusal, version refusal, asset conflict, no half-import, partial bundles |
| `09-measure.test.mjs` | measurement authority (R3): a synthetic 12.345 s WAV measures exactly, through the app's own `audioBufferToWav`; chunk-walking past `LIST`; unmeasurable audio stays `durationUnknown`; duration identical before save and after reload |
| `10-bundle-controller.test.mjs` | the two header buttons: save-then-bundle ordering, `.neuralpro` naming, no file when the save fails, reuse vs restore into a fresh profile, a non-bundle file leaves the open project untouched, partial bundles import with the clip intact and flagged |

Every test imports the real modules through `tsx`; none of them greps source for behaviour.
Eight mutation probes were used to prove the suite can fail — each one reverted afterwards and
re-run to green:

| Mutation | Suite that catches it |
|---|---|
| Re-persist transient URLs in `mediaReferences.ts` | `02` (2 groups) |
| Inject `properties.audioUrl = URL.createObjectURL(file)` | `07` |
| Drop `preserveIdentity` from bundle import | `08` |
| Delete the CRC check from `readZip` | `08` |
| Re-scope orphan collection to the saved project only | `05` |
| Restore `sourceMediaDuration: … ?? clip.duration` | `07` |
| Bundle anyway when the save failed | `10` |
| Clear the editor before the import is validated | `10` |

One probe is recorded because it did **not** work. Guarding a speculative
`hydrateProject(result.state)` with `if (result.state)` left `10` passing — not because the test
is weak, but because `importProjectBundleFile` returns `state: null` on every failure path, so
the mutation was unreachable and semantically identical to the original. Re-written to clear the
editor unconditionally, it failed as intended. A mutant that survives says something about the
mutant until the code path has been checked; it does not automatically mean the test is blind.

Acceptance criterion 1 ("#10 and #11 fail before the change") was demonstrated the same way:
restoring the two pre-change files from `b67e408` and re-running `07` gives FAIL (3/8).

## 10. Known gaps

| Gap | Owner |
|---|---|
| `ExportMediaPool` resolving clips by `AssetId` instead of reading `clip.properties.*Url` | WP-02 |
| Podcast audio clip duration still derived from `totalDuration` (D-024) | WP-11 |
| Object-URL revocation in `App.tsx` (D-014) | WP-09 |
| Browser-context verification of the IndexedDB backend in Chromium | WP-06 |

## Runtime reconciliation note (2026-09-09)

The choice of **IndexedDB** is justified by the target runtime, not only by comparison with
alternatives: the **Google AI Studio Web App runtime provides no server-side durable storage**
("We are working on adding direct support for storage in the future"). Browser-side storage is
the only runtime-appropriate durable default.

* Network stores (Firebase/Firestore, Supabase) are **optional adapters** behind
  `AssetRegistry`, available but **not in v1 scope** and never a prerequisite.
* If in-frame storage proves restricted (runtime unknown `P-02`), **project export/import
  bundles** become the primary durability mechanism and IndexedDB becomes an accelerator —
  the document/asset split above is designed so a bundle is a serialisation of the same two
  halves, not a new model. **Implemented** as `.neuralpro` (§6): document + every asset's bytes
  in one file, importable into an empty profile.
* Ephemeral state (blob/object URLs, media elements, WebCodecs objects, `AudioBuffer`s,
  `ImageBitmap`s, transient export state) is **never** persisted — unchanged.
