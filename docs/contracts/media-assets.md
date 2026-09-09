# Contract: Media Assets

**Normative.** Owns **INV-009** (no transient identifiers as durable state).
**Status:** implemented (WP-05) in `src/domain/assets/**` + `src/infra/persistence/**`.

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
                | { type: 'url'; href: string }
                | { type: 'generated'; producer: string; jobId?: string };
  readonly contentHash: string | null;  // sha-256 of the bytes; dedupes a re-import
  readonly role: 'source' | 'generated' | 'export';
  readonly deletedAt: number | null;    // soft delete; bytes survive the grace window
}
```

`source: 'generated'` covers media the app produced itself — extracted/detached audio,
stitched podcast WAVs, rendered outputs — so generated media has the same durable identity as
imported media instead of living on as a `blob:` URL in a clip property.

`role` and `deletedAt` are extensions to the original record shape; both are additive and
optional for readers.

`duration`, `width`, `height`, `sampleRate`, `channels` are **measured once at import** by
`AssetRegistry.measure()` and cached. They are then authoritative for: clip duration,
timeline bounds, export frame count, audio render length, WAV header construction.

Measurement sources, in priority order:

1. a media element / `decodeAudioData` / `createImageBitmap`, when the runtime has one;
2. the container's own header — `probeContainerAudio` walks RIFF/WAVE chunks (`fmt `, `fact`,
   `data`) and derives `duration = dataSize / byteRate`, exact for PCM and IEEE float;
3. nothing: the field stays `null` (`durationUnknown`), which the UI must surface.

Source 2 is what makes generated audio measurable where no decoder exists (a locked-down frame,
a worker, Node). **Guessing is not a source**: an unmeasurable asset is `durationUnknown`, never
`0` and never an inherited project duration (that guess was D-024).

## 3. Registry interface

```ts
export interface AssetRegistry {
  put(blob: Blob, meta: NewAssetMeta): Promise<AssetId>;   // dedupes on contentHash
  get(id: AssetId): Promise<Blob | null>;
  getRecord(id: AssetId): Promise<AssetRecord | null>;
  resolveUrl(id: AssetId): Promise<string>;        // mints and TRACKS an object URL
  releaseUrl(id: AssetId, url: string): void;      // revokes and untracks (idempotent)
  releaseAll(): number;                            // revokes everything (close/unload)
  trackedUrlCount(): number;                       // test seam for the balance probe
  measure(id: AssetId): Promise<MediaProbe>;
  probeFrom(blob: Blob, mime: string): Promise<MediaProbe>;  // measure before persisting
  list(): Promise<readonly AssetRecord[]>;
  delete(id: AssetId): Promise<void>;              // soft delete
  orphaned(): Promise<readonly AssetId[]>;
}
```

`put` is content-addressed: importing the same bytes twice returns the SAME `AssetId`, so a
re-import cannot duplicate storage. `orphaned()` returns nothing when the registry has no
reference provider — with no evidence, deleting is worse than keeping.

**The one exception to dedupe is `NewAssetMeta.preserveIdentity`.** Bundle import and restore
supply an explicit `id`, because the document being restored references that exact `AssetId`.
Letting dedupe substitute an existing `AssetId` would store the bytes under somebody else's
identity and leave the restored document pointing at nothing — a silent reference break. With
`preserveIdentity: true` the write always lands under `meta.id`; the registry still records the
`contentHash`, so later dedupe is unaffected. Cost: the same bytes may exist twice under two
ids. That is the correct trade — identity is referenced by durable state, storage is not.

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

* on save: for every clip, if the URL starts with `blob:` (or is a `data:` payload) and the
  live object still resolves, `put()` the blob, write `videoAssetId`, and **drop** the URL; if
  it does not resolve, mark the clip durably `mediaUnresolved` (with `mediaOriginalName`) and
  raise a `MediaMissingWarning`. `https:` URLs are kept as-is — a remote reference is durable.
  The live session keeps its working object URL; only the serialised document drops it.
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
