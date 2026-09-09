/**
 * Hydration: durable identity → runtime media handles.
 *
 * On load every clip that references an asset gets a FRESH object URL minted by
 * the registry (INV-008: only `resolveUrl` mints). A clip whose asset cannot be
 * resolved is marked `mediaMissing` with a machine-readable reason — it is never
 * dropped, never silently replaced by a placeholder, and export refuses to run.
 *
 * Track and clip order are preserved index-for-index: array position is z-order
 * (`playback/compositor/layerOrder.ts`), so reordering on load would change what
 * the user sees.
 */

import type { Track } from '../../features/video-studio/project/types/project';
import {
  applyRuntimeMediaBindings,
  isClipMediaUnresolved,
  markClipMediaMissing,
  readClipMediaReference,
  type ClipLike,
  type RuntimeMediaBinding,
} from '../../domain/assets/mediaReferences';
import type { AssetId } from '../../domain/assets/types';
import type { AssetRegistry } from '../../domain/assets/AssetRegistry';
import { PersistenceError } from './errors';

export type MediaMissingReason =
  | 'ASSET_MISSING'
  | 'ASSET_BYTES_MISSING'
  | 'TRANSIENT_URL_UNRESOLVED'
  | 'NO_MEDIA_REFERENCE';

export interface MediaMissingWarning {
  readonly clipId: string;
  readonly trackId: string;
  readonly clipName: string | null;
  readonly assetId: AssetId | null;
  readonly reason: MediaMissingReason;
  readonly message: string;
}

export interface HydrateMediaInput {
  readonly tracks: readonly Track[];
  readonly registry: Pick<AssetRegistry, 'getRecord' | 'resolveUrl'>;
}

export interface HydrateMediaResult {
  readonly tracks: Track[];
  readonly warnings: MediaMissingWarning[];
  /** Every minted URL, so the caller can revoke exactly these on close. */
  readonly bindings: RuntimeMediaBinding[];
}

const URL_KEY_FOR_ASSET = {
  videoAssetId: 'videoUrl',
  audioAssetId: 'audioUrl',
  imageAssetId: 'imageUrl',
} as const;

/** Resolves every clip media reference in a set of tracks. Never throws for a missing asset. */
export async function hydrateProjectMedia(input: HydrateMediaInput): Promise<HydrateMediaResult> {
  const warnings: MediaMissingWarning[] = [];
  const bindings: RuntimeMediaBinding[] = [];

  const tracks = await Promise.all(
    input.tracks.map(async (track) => {
      const clips = await Promise.all(
        track.clips.map(async (clip) => {
          const properties: Record<string, unknown> = { ...(clip.properties ?? {}) };
          const reference = readClipMediaReference(clip as ClipLike);
          const applied: Array<{ urlKey: 'videoUrl' | 'audioUrl' | 'imageUrl' | 'fileUrl'; assetId: AssetId; url: string }> = [];
          let failure: { reason: MediaMissingReason; message: string; assetId: AssetId | null } | null = null;

          for (const assetKey of ['videoAssetId', 'audioAssetId', 'imageAssetId'] as const) {
            const assetId = reference[assetKey];
            if (!assetId) continue;
            try {
              const record = await input.registry.getRecord(assetId);
              if (!record) {
                failure = {
                  reason: 'ASSET_MISSING',
                  message: `Media for "${describeClip(clip)}" is not in this browser profile (asset ${assetId}).`,
                  assetId,
                };
                break;
              }
              const url = await input.registry.resolveUrl(assetId);
              applied.push({ urlKey: URL_KEY_FOR_ASSET[assetKey], assetId, url });
              bindings.push({ clipId: clip.id, urlKey: URL_KEY_FOR_ASSET[assetKey], assetId, url });
            } catch (error) {
              failure = {
                reason: error instanceof PersistenceError && error.code === 'ASSET_MISSING'
                  ? 'ASSET_BYTES_MISSING'
                  : 'ASSET_MISSING',
                message: `Media for "${describeClip(clip)}" could not be loaded (${describeFailure(error)}).`,
                assetId,
              };
              break;
            }
          }

          if (!failure && Object.keys(reference.transientUrls).length > 0 && applied.length === 0) {
            failure = {
              reason: 'TRANSIENT_URL_UNRESOLVED',
              message: `Media for "${describeClip(clip)}" referenced a browser-local URL that did not survive the session.`,
              assetId: null,
            };
          }

          if (!failure && applied.length === 0 && isClipMediaUnresolved(properties)) {
            // The durable record already knew this clip is waiting for media.
            // Restoring the flag on reload is what keeps "missing media" from
            // silently becoming an empty clip.
            const durableReason = properties.mediaUnresolvedReason;
            failure = {
              reason: typeof durableReason === 'string' ? (durableReason as MediaMissingReason) : 'ASSET_MISSING',
              message: `Media for "${describeClip(clip)}" is still unlinked. Relink the file to restore it.`,
              assetId: null,
            };
          }

          if (failure) {
            markClipMediaMissing(properties, failure.reason);
            warnings.push({
              clipId: clip.id,
              trackId: track.id,
              clipName: describeClip(clip),
              assetId: failure.assetId,
              reason: failure.reason,
              message: failure.message,
            });
          } else if (applied.length > 0) {
            applyRuntimeMediaBindings(properties, applied);
            properties.mediaResolvedAt = Date.now();
          }

          return { ...clip, properties };
        }),
      );
      return { ...track, clips };
    }),
  );

  return { tracks, warnings, bindings };
}

function describeClip(clip: { id: string; properties?: Record<string, unknown> | null }): string {
  const name = clip.properties?.name;
  if (typeof name === 'string' && name.trim() !== '') return name;
  const text = clip.properties?.textContent;
  if (typeof text === 'string' && text.trim() !== '') return text.slice(0, 40);
  return clip.id;
}

function describeFailure(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

/** Revokes exactly the URLs minted by `hydrateProjectMedia`. */
export function releaseProjectMedia(
  registry: Pick<AssetRegistry, 'releaseUrl'>,
  bindings: readonly RuntimeMediaBinding[],
): number {
  let released = 0;
  for (const binding of bindings) {
    registry.releaseUrl(binding.assetId, binding.url);
    released += 1;
  }
  return released;
}

/** Blocks export when media is unresolvable, naming the offending clips (contract §8). */
export function assertMediaResolvable(warnings: readonly MediaMissingWarning[]): void {
  if (warnings.length === 0) return;
  const names = warnings.slice(0, 5).map((warning) => warning.clipName ?? warning.clipId).join(', ');
  throw new PersistenceError(
    'ASSET_MISSING',
    `Export blocked: ${warnings.length} clip(s) have unresolvable media (${names}). Relink the media or remove the clip.`,
    { references: warnings.map((warning) => warning.clipId) },
  );
}
