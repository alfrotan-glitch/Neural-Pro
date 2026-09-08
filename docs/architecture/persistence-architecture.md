# Persistence Architecture

**Status:** current (fundamentally broken for user media) + target.
Owns **INV-009** (durable state never depends on transient blob URLs).

---

## 1. Current state

### 1.1 What is persisted

`src/features/video-studio/project/services/projectPersistenceService.ts`:

```
localStorage['video_studio_pro_project_v1_<urlencoded name>'] =
  { schemaVersion: 1, project: { projectId, metadata, currentTime, totalDuration,
                                 tracks, selectedNodeIds, isPlaying:false, animations } }
```

Good properties worth preserving:
* explicit `schemaVersion` with a rejection path for unknown versions ✔
* legacy migration path for pre-schema saves ✔
* `normalizePersistedTransform` clamps scale/opacity ✔
* `assertValidProjectState` on hydrate ✔
* selection is filtered against known clip ids ✔

### 1.2 The defect (D-006)

Clip properties hold **blob: URLs**:

```ts
// ResourceSidebar.tsx:506
const fileUrl = URL.createObjectURL(file);
// VirtualizedTimeline.tsx:904 handleLinkOrReplaceMediaFile
properties.videoUrl = objectUrl;  properties.audioUrl = objectUrl;
properties.imageUrl = objectUrl;  properties.fileUrl  = objectUrl;
```

These are serialised verbatim into `localStorage`. A `blob:` URL is scoped to the document
that created it and is invalidated on reload. Therefore:

```
save → localStorage contains  "videoUrl":"blob:http://localhost:3000/8f3c…-44a1"
reload → deserializeProject → clip.properties.videoUrl is a dead URL
       → <video src="blob:…dead…"> → media error → placeholder / silent export
```

The demo project (remote HTTPS URLs) survives; **every user-uploaded asset does not.**
The save toast still says `"💾 Saved project successfully!"`.

Secondary leaks: `ResourceSidebar` tracks `ownedObjectUrlsRef` and revokes unreferenced ones
on unmount (✔ pattern), but `handleLinkOrReplaceMediaFile` (timeline) creates URLs with **no**
tracking and **no** revoke, and each invocation adds another.

### 1.3 Other persistence facts

| Fact | Detail |
|---|---|
| No asset storage | There is no IndexedDB, no Cache API, no origin-private file system |
| `better-sqlite3` is a declared dependency with **0 references** | it also breaks `npm install` (D-012) |
| `waveformData` is `Math.random()`-generated | persisted randomness → non-deterministic reload (D-027/Z) |
| Auto-load on mount | `VideoStudioPro` hydrates from `localStorage` by project name |
| No quota handling | `setItem` exceeding quota throws into a toast; no eviction policy |

---

## 2. Target: separate metadata from binary assets

### 2.1 Principle

> A project document references assets by **stable identity**. Object URLs are a runtime
> rendering detail, never durable state.

### 2.2 Model

```ts
export type AssetId = string;   // 'as_<uuid>'

export interface AssetRecord {
  readonly id: AssetId;
  readonly kind: 'video' | 'audio' | 'image';
  readonly name: string;
  readonly mimeType: string;
  readonly byteSize: number;
  readonly duration: number | null;      // measured once, then authoritative
  readonly width: number | null;
  readonly height: number | null;
  readonly createdAt: number;
  readonly source: { type: 'file'; fileName: string } | { type: 'url'; href: string };
  readonly contentHash?: string;         // dedupe on re-import
}

export interface ProjectDocumentV2 {
  readonly schemaVersion: 2;
  readonly project: ProjectMetadata;        // tracks, clips reference assetId
  readonly assets: readonly AssetRecord[];  // manifest
}
```

Clip properties change:

```diff
- properties.videoUrl: string            // blob: or https:
+ properties.videoAssetId: AssetId | null
+ properties.videoUrl?: string            // remote/https only; never a blob URL
```

### 2.3 Storage technology choice — **IndexedDB**

| Option | Verdict |
|---|---|
| **IndexedDB (native)** | **Chosen.** Stores `Blob`/`File` natively (no base64 bloat), ~hundreds of MB to GB quota, transactional, async, no dependency, works offline, survives reload and browser restart. |
| Cache API | Semantically wrong (HTTP responses), awkward keying, weaker quota guarantees |
| OPFS (Origin Private File System) | Good but less broadly supported and more complex for random-access blobs |
| localStorage base64 | Rejected: 5 MB limit, synchronous, base64 +33 % overhead |
| Server-side (Cloud Run + GCS) | Rejected for v1: introduces auth, cost, and a network dependency into an offline-first editor; **may be added later behind the same `AssetRegistry` interface** |

The `AssetRegistry` interface hides the backing store, so a future server-backed adapter does
not require touching domain code.

### 2.4 Asset lifecycle

```
created ─► persisted ─► referenced ─► loaded ─► (replaced)* ─► released ─► deleted
              │             │            │
              │             │            └─ object URL minted per load; revoked on release
              │             └─ project document holds AssetId
              └─ bytes written to IndexedDB; AssetRecord appended to manifest

* replaced: previous AssetRecord is dereferenced; if unreferenced, scheduled for deletion
  (with a grace period so undo can restore it)
```

```ts
export interface AssetRegistry {
  put(file: Blob, meta: Omit<AssetRecord,'id'|'createdAt'>): Promise<AssetId>;
  get(id: AssetId): Promise<Blob | null>;
  resolveUrl(id: AssetId): Promise<string>;      // mints + tracks an object URL
  releaseUrl(id: AssetId, url: string): void;    // revokes
  measure(id: AssetId): Promise<MediaProbe>;     // duration/dimensions, cached on the record
  list(): Promise<readonly AssetRecord[]>;
  delete(id: AssetId): Promise<void>;
  orphaned(): Promise<readonly AssetId[]>;       // unreferenced by any document
}
```

### 2.5 Hydration on load

```
loadProjectFromStorage → ProjectDocumentV2
  → for each clip: if videoAssetId → registry.resolveUrl(id) → fresh object URL
  → if the asset is missing/damaged → clip enters state `mediaMissing`
     → UI shows an explicit "Relink media" affordance
     → export REFUSES to start (or excludes the clip with an explicit warning)
     → NEVER silently renders a placeholder
```

### 2.6 Failure semantics

| Situation | Behaviour |
|---|---|
| Asset missing on load | clip flagged `mediaMissing`; explicit UI; export blocked with a named clip |
| Quota exceeded on `put` | typed `PERSISTENCE_QUOTA` error; user offered eviction of orphaned assets |
| IndexedDB unavailable (private mode) | project saves metadata only; assets are session-scoped; **explicitly** degraded, never silent |
| Corrupt document | `deserializeProject` throws a typed `PERSISTENCE_CORRUPT` error; user offered a previous version or a fresh project |

---

## 3. Migration (staged — per the migration policy)

```
V1 (current)
  → V2 writer + V1 reader (compatibility shim)
      · on save, write schemaVersion 2 with AssetIds for any blob: URLs that can still be
        resolved in this session; unresolvable URLs become `mediaMissing`
      · on load, accept both versions
  → backfill: import existing blobs into IndexedDB where the live object URL still resolves
  → verification: round-trip test, reload test, relink test
  → remove the V1 reader (WP-12), tracked by an explicit removal ticket
```

The shim has a **named removal owner (WP-05) and a removal milestone (WP-12)** — no
compatibility layer survives indefinitely (ADR-006).

## 4. Required tests (WP-05 / WP-06)

| # | Test |
|---|---|
| 13 | Blob URLs are not persisted as durable assets (assert no `blob:` string in any saved document) |
| 14 | Project reload restores media (save → reload → resolve → play) |
| 15 | Every object URL is revoked (instrument `createObjectURL`/`revokeObjectURL`, assert balance per operation) |
| + | Quota handling, corrupt document, missing asset, orphan eviction, V1→V2 migration |

---

## Runtime reconciliation note (2026-09-09)

The choice of **IndexedDB** is now justified by the target runtime, not only by comparison with
alternatives: the **Google AI Studio Web App runtime provides no server-side durable storage**
("We are working on adding direct support for storage in the future"). Browser-side storage is
the only runtime-appropriate durable default.

Consequences recorded after reconciliation:

* Network stores (Firebase/Firestore, Supabase) are **optional adapters** behind
  `AssetRegistry`, available but **not in v1 scope** and never a prerequisite.
* If in-frame storage proves restricted (runtime unknown `P-02`), **project export/import
  bundles** become the primary durability mechanism and IndexedDB becomes an accelerator.
* Ephemeral state (blob/object URLs, media elements, WebCodecs objects, `AudioBuffer`s,
  `ImageBitmap`s, transient export state) is **never** persisted — unchanged.
