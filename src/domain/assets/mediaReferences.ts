/**
 * Canonical model for how a clip references media.
 *
 * A clip carries BOTH:
 *   - durable identity  (`videoAssetId` / `audioAssetId` / `imageAssetId`, or a remote URL)
 *   - a runtime handle  (`videoUrl` / `audioUrl` / `imageUrl` — a freshly minted object URL)
 *
 * Only the first is persisted. The second is minted on hydrate by
 * `AssetRegistry.resolveUrl()` and revoked on release. Keeping them in separate
 * keys is what makes INV-009 ("durable state never depends on transient blob
 * URLs") mechanically checkable instead of a code-review hope.
 *
 * Pure module: works on plain property bags so it never has to import React,
 * the store, or a browser API.
 */

import {
  CLIP_MEDIA_ASSET_KEYS,
  CLIP_MEDIA_URL_KEYS,
  RUNTIME_ONLY_CLIP_PROPERTY_KEYS,
  RUNTIME_ONLY_CLIP_STATE_KEYS,
  classifyMediaUrl,
  type AssetId,
  type ClipMediaAssetKey,
  type ClipMediaUrlKey,
} from './types';

/** Structural view of a clip: identity plus an open property bag. */
export interface ClipLike {
  id: string;
  sourceId?: string;
  properties?: Record<string, unknown> | null;
}

export interface ClipMediaReference {
  readonly videoAssetId: AssetId | null;
  readonly audioAssetId: AssetId | null;
  readonly imageAssetId: AssetId | null;
  /** Remote (http/https) URLs that are legitimately durable. */
  readonly remoteUrls: Readonly<Partial<Record<ClipMediaUrlKey, string>>>;
  /** Transient (blob:/file:) URLs found on the clip. Never durable. */
  readonly transientUrls: Readonly<Partial<Record<ClipMediaUrlKey, string>>>;
  /** data: URLs found on the clip. */
  readonly inlineDataUrls: Readonly<Partial<Record<ClipMediaUrlKey, string>>>;
  readonly mediaMissing: boolean;
}

const ASSET_KEY_FOR_URL: Record<ClipMediaUrlKey, ClipMediaAssetKey> = {
  videoUrl: 'videoAssetId',
  audioUrl: 'audioAssetId',
  imageUrl: 'imageAssetId',
  fileUrl: 'videoAssetId',
};

export function getAssetKeyForUrlKey(urlKey: ClipMediaUrlKey): ClipMediaAssetKey {
  return ASSET_KEY_FOR_URL[urlKey];
}

function readString(properties: Record<string, unknown>, key: string): string | null {
  const value = properties[key];
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

/** Reads the durable + runtime media reference of a clip without mutating it. */
export function readClipMediaReference(clip: ClipLike): ClipMediaReference {
  const properties = clip.properties ?? {};
  const remoteUrls: Partial<Record<ClipMediaUrlKey, string>> = {};
  const transientUrls: Partial<Record<ClipMediaUrlKey, string>> = {};
  const inlineDataUrls: Partial<Record<ClipMediaUrlKey, string>> = {};

  for (const key of CLIP_MEDIA_URL_KEYS) {
    const url = readString(properties, key);
    if (url === null) continue;
    const classification = classifyMediaUrl(url);
    if (classification === 'remote') remoteUrls[key] = url;
    else if (classification === 'inline-data') inlineDataUrls[key] = url;
    else if (classification === 'transient' || classification === 'local-file') transientUrls[key] = url;
  }

  return {
    videoAssetId: readString(properties, 'videoAssetId'),
    audioAssetId: readString(properties, 'audioAssetId'),
    imageAssetId: readString(properties, 'imageAssetId'),
    remoteUrls,
    transientUrls,
    inlineDataUrls,
    mediaMissing: properties.mediaMissing === true,
  };
}

/**
 * URLs that cannot be persisted and must be imported as assets first:
 * browser-local handles (blob:/file:) and inline `data:` payloads.
 */
export function collectImportableMediaUrls(
  reference: ClipMediaReference,
): Array<{ urlKey: ClipMediaUrlKey; url: string }> {
  const entries: Array<{ urlKey: ClipMediaUrlKey; url: string }> = [];
  for (const [urlKey, url] of Object.entries(reference.transientUrls) as Array<[ClipMediaUrlKey, string]>) {
    entries.push({ urlKey, url });
  }
  for (const [urlKey, url] of Object.entries(reference.inlineDataUrls) as Array<[ClipMediaUrlKey, string]>) {
    entries.push({ urlKey, url });
  }
  return entries;
}

/** Every durable asset id a clip depends on. */
export function collectClipAssetIds(clip: ClipLike): AssetId[] {
  const reference = readClipMediaReference(clip);
  return [reference.videoAssetId, reference.audioAssetId, reference.imageAssetId].filter(
    (id): id is AssetId => typeof id === 'string' && id.length > 0,
  );
}

/**
 * True when the clip is supposed to show media at all (as opposed to a text or
 * shape clip). Used to decide whether a missing asset is a defect worth
 * surfacing, or simply not applicable.
 */
export function clipExpectsMedia(clip: ClipLike): boolean {
  const properties = clip.properties ?? {};
  if (properties.textContent !== undefined) return false;
  return (
    readString(properties, 'videoUrl') !== null ||
    readString(properties, 'audioUrl') !== null ||
    readString(properties, 'imageUrl') !== null ||
    readString(properties, 'fileUrl') !== null ||
    readString(properties, 'videoAssetId') !== null ||
    readString(properties, 'audioAssetId') !== null ||
    readString(properties, 'imageAssetId') !== null
  );
}

/**
 * Returns a property bag containing only durable media state.
 *
 * Dropped: object URLs, `data:`/`file:` URLs, and the derived runtime flags.
 * Kept:   `http(s)` remote URLs (contract R2 — a remote reference IS durable) and
 *         the durable `mediaUnresolved` markers.
 *
 * This is the serialisation gate for R1/R7; it must never discard a reference
 * that is still the only pointer to a clip's media.
 */
export function toDurableMediaProperties(
  properties: Record<string, unknown>,
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...properties };
  for (const key of CLIP_MEDIA_URL_KEYS) {
    const classification = classifyMediaUrl(next[key]);
    if (classification === 'remote') continue;
    delete next[key];
  }
  for (const key of RUNTIME_ONLY_CLIP_STATE_KEYS) {
    delete next[key];
  }
  return next;
}

export interface RuntimeMediaBinding {
  readonly clipId: string;
  readonly urlKey: ClipMediaUrlKey;
  readonly assetId: AssetId;
  readonly url: string;
}

/**
 * Writes freshly minted object URLs onto a clip's property bag.
 * Returns the bindings that were applied so the caller can revoke them later.
 */
export function applyRuntimeMediaBindings(
  properties: Record<string, unknown>,
  bindings: ReadonlyArray<{ urlKey: ClipMediaUrlKey; assetId: AssetId; url: string }>,
): void {
  for (const binding of bindings) {
    properties[binding.urlKey] = binding.url;
    if (binding.urlKey !== 'fileUrl' && properties.fileUrl === undefined) {
      // `fileUrl` mirrors the primary media handle for the generic media code paths.
      properties.fileUrl = binding.url;
    }
  }
  clearClipMediaMissing(properties);
  properties.mediaMissing = false;
}

/**
 * Marks a clip as having an unresolvable asset.
 *
 * Writes BOTH layers:
 *   - `mediaMissing` / `mediaMissingReason`: runtime, drives the current session's UI;
 *   - `mediaUnresolved` / `mediaUnresolvedReason` / `mediaOriginalName`: DURABLE, so a
 *     reload still knows the clip is waiting for media instead of quietly turning
 *     into an empty clip. Losing that distinction would be silent data loss.
 *
 * The clip itself is never dropped: geometry, trim and timing stay intact.
 */
export function markClipMediaMissing(
  properties: Record<string, unknown>,
  reason: string,
  options: { durable?: boolean; originalName?: string | null } = {},
): void {
  properties.mediaMissing = true;
  properties.mediaMissingReason = reason;
  if (options.durable !== false) {
    properties.mediaUnresolved = true;
    properties.mediaUnresolvedReason = reason;
    const originalName = options.originalName ?? properties.mediaFileName ?? properties.name;
    if (typeof originalName === 'string' && originalName.trim() !== '') {
      properties.mediaOriginalName = originalName;
    }
  }
  for (const key of CLIP_MEDIA_URL_KEYS) {
    const classification = classifyMediaUrl(properties[key]);
    if (classification === 'transient' || classification === 'local-file' || classification === 'inline-data') {
      delete properties[key];
    }
  }
}

/** Clears both layers once media has been relinked. */
export function clearClipMediaMissing(properties: Record<string, unknown>): void {
  delete properties.mediaMissing;
  delete properties.mediaMissingReason;
  delete properties.mediaUnresolved;
  delete properties.mediaUnresolvedReason;
}

/** True when the durable record says this clip is still waiting for media. */
export function isClipMediaUnresolved(properties: Record<string, unknown> | null | undefined): boolean {
  return properties?.mediaUnresolved === true;
}
