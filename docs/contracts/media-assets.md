# Contract: Media Assets

**Normative.** Owns **INV-009** (no transient identifiers as durable state).

---

## 1. Identity

```ts
export type AssetId = string;    // 'as_<uuid>'
```

An `AssetId` is:
* stable for the lifetime of the asset,
* the **only** value stored in a project document,
* the only value an export request may reference.

**Forbidden as durable identity:** `blob:` URLs, `data:` URLs, filesystem paths, array
indices, object identity.

## 2. Record

```ts
export interface AssetRecord {
  readonly id: AssetId;
  readonly kind: 'video' | 'audio' | 'image';
  readonly name: string;
  readonly mimeType: string;
  readonly byteSize: number;
  readonly duration: number | null;     // seconds; measured once, authoritative
  readonly width: number | null;
  readonly height: number | null;
  readonly sampleRate: number | null;   // audio
  readonly channels: number | null;     // audio
  readonly createdAt: number;
  readonly source: { type: 'file'; fileName: string }
                | { type: 'url'; href: string };
  readonly contentHash: string | null;  // dedupe on re-import
}
```

`duration`, `width`, `height`, `sampleRate`, `channels` are **measured once at import** by
`AssetRegistry.measure()` and cached. They are then authoritative for: clip duration,
timeline bounds, export frame count, audio render length, WAV header construction.

## 3. Registry interface

```ts
export interface AssetRegistry {
  put(blob: Blob, meta: NewAssetMeta): Promise<AssetId>;
  get(id: AssetId): Promise<Blob | null>;
  resolveUrl(id: AssetId): Promise<string>;        // mints and TRACKS an object URL
  releaseUrl(id: AssetId, url: string): void;      // revokes and untracks
  measure(id: AssetId): Promise<MediaProbe>;
  probeFrom(blob: Blob, mime: string): Promise<MediaProbe>;  // measure before persisting
  list(): Promise<readonly AssetRecord[]>;
  delete(id: AssetId): Promise<void>;
  orphaned(): Promise<readonly AssetId[]>;
}
```

### Object-URL rules (INV-008)

1. `resolveUrl` is the **only** place that calls `URL.createObjectURL`.
2. Every minted URL is recorded in a `Map<AssetId, Set<string>>` alongside its owner.
3. `releaseUrl` calls `URL.revokeObjectURL` and removes the entry.
4. On project close / asset delete / page unload, all tracked URLs are revoked.
5. A test instruments `createObjectURL`/`revokeObjectURL` and asserts balance per operation
   (required test invariant #15).

## 4. Lifecycle

```
created   put() writes bytes + AssetRecord
   ↓
persisted bytes in IndexedDB; record in the manifest
   ↓
referenced  a clip holds assetId
   ↓
loaded      resolveUrl() → object URL → <video>/<img>/decodeAudioData
   ↓
replaced*   a different asset is assigned; previous reference count decremented
   ↓
released    releaseUrl() for every minted URL
   ↓
deleted     bytes removed when unreferenced AND beyond a grace window (so undo can restore)
```

\* Replacement must release the previous asset's URLs and update `clip.duration` / `trim.out`
from the new asset's measured duration.

## 5. Remote assets

`source: { type:'url', href }` records the origin for re-fetch and for display. The bytes may
optionally be cached locally; if not cached, `resolveUrl` returns `href` directly and
**no object URL is minted** (so nothing needs revoking). `crossOrigin` and CORS failure must
surface as `MEDIA_LOAD_FAILED` naming the clip, never a silent placeholder.

## 6. Failure semantics

| Condition | Behaviour |
|---|---|
| Asset missing at hydrate | clip marked `mediaMissing`; UI offers Relink; export **refuses** to start (or, with explicit opt-in, excludes the clip and reports it) |
| Measurement fails | asset is `durationUnknown`; clip cannot be created with a duration; UI states it |
| Quota exceeded | `PERSISTENCE_QUOTA`; offer orphan eviction |
| IndexedDB unavailable | metadata-only mode, **explicitly** degraded and surfaced in the UI |
| CORS failure on a remote asset | `MEDIA_CORS_FAILED` naming the clip and URL |

## 7. Migration from the current shape

Today `clip.properties.{videoUrl,audioUrl,imageUrl}` hold `blob:` or `https:` strings.
Migration shim (WP-05):

* on save: for every clip, if the URL starts with `blob:` and the live object still resolves,
  `put()` the blob, write `videoAssetId`, and **drop** `videoUrl`; if it does not resolve,
  mark the clip `mediaMissing`. `https:` URLs are kept as-is and recorded as
  `source: {type:'url'}`.
* on load: accept `schemaVersion` 1 and 2; V1 documents are migrated in memory.
* shim removal: WP-12 (tracked ticket, ADR-006).

## 8. Registry ↔ export

`ExportMediaPool` requests assets by `AssetId` only. It never reads `clip.properties.*Url`
directly; it asks the resolver:

```ts
resolveMediaForClip(clip): MediaSourceRequest | null
```

This is what makes **INV-004** ("all exported media is independently resolvable") testable
without a browser UI: a test can register a fake `AssetRegistry` and assert that every clip in
a project resolves.
