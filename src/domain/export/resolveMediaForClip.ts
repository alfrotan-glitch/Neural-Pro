import type { ClipNode } from '../../features/video-studio/project/types/project';

export interface MediaSourceRequest {
  readonly clipId: string;
  readonly assetId?: string;
  readonly kind: 'video' | 'audio' | 'image';
  readonly sourceRange: {
    readonly start: number;
    readonly end: number | null;
  };
  readonly url?: string;
}

/**
 * Single translation authority from a ClipNode to a MediaSourceRequest (INV-004).
 * Used by ExportMediaPool to resolve every media asset deterministically
 * without touching the DOM.
 */
export function resolveMediaForClip(clip: ClipNode): MediaSourceRequest | null {
  if (!clip || !clip.properties) return null;
  if (clip.properties.deactivated === true) return null;

  const rawTrimIn = clip.trim?.in ?? (clip as any).trimIn;
  const rawTrimOut = clip.trim?.out ?? (clip as any).trimOut;

  const trimIn = Math.max(0, Number.isFinite(rawTrimIn) ? Number(rawTrimIn) : 0);
  const trimOut = Number.isFinite(rawTrimOut) ? Number(rawTrimOut) : null;
  const sourceRange = { start: trimIn, end: trimOut };

  // 1. Video asset
  if (clip.properties.videoUrl || clip.properties.videoAssetId) {
    return {
      clipId: clip.id,
      assetId: clip.properties.videoAssetId,
      url: clip.properties.videoUrl,
      kind: 'video',
      sourceRange,
    };
  }

  // 2. Image asset
  if (clip.properties.imageUrl || clip.properties.imageAssetId) {
    return {
      clipId: clip.id,
      assetId: clip.properties.imageAssetId,
      url: clip.properties.imageUrl,
      kind: 'image',
      sourceRange,
    };
  }

  // 3. Audio asset
  if (clip.properties.audioUrl || clip.properties.audioAssetId) {
    return {
      clipId: clip.id,
      assetId: clip.properties.audioAssetId,
      url: clip.properties.audioUrl,
      kind: 'audio',
      sourceRange,
    };
  }

  return null;
}
