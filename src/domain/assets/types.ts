/**
 * Asset identity + record contract (WP-05).
 *
 * Normative source: docs/contracts/media-assets.md (owns INV-009).
 *
 * The single rule this module exists to encode:
 *
 *   Durable state references media by AssetId. Never by blob: URL, data: URL,
 *   filesystem path, array index or object identity.
 *
 * This layer is pure: no `window`, `document`, `indexedDB`, `localStorage` or `fetch`.
 * Anything that touches a browser API lives in `src/infra/persistence/**`.
 */

/** Stable, opaque asset identity. Format: `as_<uuid>`. */
export type AssetId = string;

export type AssetKind = 'video' | 'audio' | 'image';

/**
 * Provenance class of the bytes.
 * - `source`   user-supplied media imported into the project
 * - `generated` media produced by the app itself (extracted audio, stitched WAV, ...)
 * - `export`    a rendered output the user chose to keep
 */
export type AssetRole = 'source' | 'generated' | 'export';

export type AssetSource =
  | { readonly type: 'file'; readonly fileName: string }
  | { readonly type: 'url'; readonly href: string }
  | { readonly type: 'generated'; readonly producer: string; readonly jobId?: string };

/**
 * Measured media characteristics. Measured exactly once, at import, by
 * `AssetRegistry.probeFrom()` / `AssetRegistry.measure()`, then authoritative
 * forever after (contract R3: never re-derived differently).
 */
export interface MediaProbe {
  readonly kind: AssetKind;
  readonly mimeType: string;
  /** Seconds. `null` when the container could not be measured (durationUnknown). */
  readonly duration: number | null;
  readonly width: number | null;
  readonly height: number | null;
  readonly sampleRate: number | null;
  readonly channels: number | null;
}

/** Durable asset manifest entry. Bytes live outside the document. */
export interface AssetRecord extends MediaProbe {
  readonly id: AssetId;
  readonly name: string;
  readonly byteSize: number;
  readonly createdAt: number;
  readonly source: AssetSource;
  /** Content hash used to dedupe a re-import. `null` when hashing is unavailable. */
  readonly contentHash: string | null;
  readonly role: AssetRole;
  /**
   * Soft-delete marker. Bytes survive deletion for a grace window so an undo or a
   * crashed session can still restore them; the collector reclaims them afterwards.
   */
  readonly deletedAt: number | null;
}

/** Input for `AssetRegistry.put`. Identity/timestamp/hash are assigned by the registry. */
export interface NewAssetMeta {
  readonly kind: AssetKind;
  readonly mimeType: string;
  readonly name: string;
  readonly duration?: number | null;
  readonly width?: number | null;
  readonly height?: number | null;
  readonly sampleRate?: number | null;
  readonly channels?: number | null;
  readonly source: AssetSource;
  readonly role?: AssetRole;
  /** Pre-computed by `probeFrom`; omit to let the registry probe. */
  readonly contentHash?: string | null;
  /** Only for bundle import / restore, where identity must survive the round trip. */
  readonly id?: AssetId;
  readonly createdAt?: number;
  /**
   * Store under `meta.id` even when identical bytes already exist under another
   * AssetId. Bundle/restore import needs this: the imported document references
   * these exact ids, so the default content-hash dedupe would silently hand back
   * somebody else's AssetId and leave the document pointing at nothing.
   */
  readonly preserveIdentity?: boolean;
}

/** A durable rendered-output record (Generated Media). */
export interface ExportRecord {
  readonly id: string;
  readonly projectId: string;
  readonly assetId: AssetId | null;
  readonly createdAt: number;
  readonly settings: Readonly<Record<string, unknown>>;
  readonly byteSize: number | null;
  readonly duration: number | null;
  /** Runtime-only object URL is never stored here (R7). */
  readonly fileName: string;
}

export type MediaUrlClassification = 'transient' | 'remote' | 'inline-data' | 'local-file' | 'invalid';

/**
 * Classifies a media URL by its durability.
 *
 * Only `remote` may appear in a persisted document. `transient` (blob:) and
 * `local-file` (file:/filesystem:) die with the document; `inline-data` bloats
 * the document and belongs in the asset store instead.
 */
export function classifyMediaUrl(url: unknown): MediaUrlClassification {
  if (typeof url !== 'string') return 'invalid';
  const trimmed = url.trim();
  if (trimmed === '') return 'invalid';
  const lowered = trimmed.toLowerCase();
  if (lowered.startsWith('blob:')) return 'transient';
  if (lowered.startsWith('data:')) return 'inline-data';
  if (lowered.startsWith('file:') || lowered.startsWith('filesystem:')) return 'local-file';
  if (lowered.startsWith('https:') || lowered.startsWith('http:')) return 'remote';
  return 'invalid';
}

export function isTransientMediaUrl(url: unknown): boolean {
  const classification = classifyMediaUrl(url);
  return classification === 'transient' || classification === 'local-file';
}

/** Canonical clip-property keys that hold a media URL. Runtime-only unless remote. */
export const CLIP_MEDIA_URL_KEYS = ['videoUrl', 'audioUrl', 'imageUrl', 'fileUrl'] as const;
export type ClipMediaUrlKey = (typeof CLIP_MEDIA_URL_KEYS)[number];

/** Canonical clip-property keys that hold durable asset identity. */
export const CLIP_MEDIA_ASSET_KEYS = ['videoAssetId', 'audioAssetId', 'imageAssetId'] as const;
export type ClipMediaAssetKey = (typeof CLIP_MEDIA_ASSET_KEYS)[number];

/** Property keys that describe runtime media state and must never be serialised. */
export const RUNTIME_ONLY_CLIP_PROPERTY_KEYS = [
  ...CLIP_MEDIA_URL_KEYS,
  'mediaMissing',
  'mediaMissingReason',
  'mediaResolvedAt',
] as const;

/**
 * Derived per-session flags. The URL keys are classified individually instead of
 * being dropped wholesale, because an `https:` remote URL IS durable (R2).
 */
export const RUNTIME_ONLY_CLIP_STATE_KEYS = [
  'mediaMissing',
  'mediaMissingReason',
  'mediaResolvedAt',
] as const;

export function isAssetId(value: unknown): value is AssetId {
  return typeof value === 'string' && /^as_[0-9a-fA-F-]{8,}$/.test(value);
}

export function createAssetId(uuid: string): AssetId {
  return `as_${uuid}`;
}
