import type { ProjectState, Track, ClipNode } from '../../features/video-studio/project/types/project';
import type { CanonicalRenderPlan, CanonicalRenderLayer, CanonicalRenderSource } from './types';
import { getCanonicalTransformMatrix, getCanonicalClipTransform } from './transform';
import { getMediaFrameGeometry, MEDIA_FRAME_CORNER_RADIUS } from './geometry';
import { getMediaVisualEffects } from '../../features/video-studio/playback/services/mediaVisualEffects';
import { getImageToVideoAnimationState } from '../../features/video-studio/playback/services/imageToVideoAnimation';
import { evaluateClipAnimation } from '../../features/video-studio/animation/services';
import { buildPreviewCompositorIndex, selectActivePreviewCompositorPlan } from '../../features/video-studio/playback/compositor/previewCompositorIndex';
import { projectTimeToSourceTime } from '../../features/video-studio/playback/services/mediaTimeMapper';
import { RenderFpsAuthority } from './fpsAuthority';

export interface BuildRenderPlanOptions {
  state: ProjectState;
  time: number;
  width: number;
  height: number;
  fps?: number;
  background?: string;
}

/**
 * Single canonical producer of a render plan (INV-003, ADR-007).
 * Pure function: (options) => CanonicalRenderPlan.
 *
 * Both Preview and Export renderers consume this same plan to guarantee visual,
 * transform, temporal, and geometric parity.
 */
export function buildCanonicalRenderPlan(options: BuildRenderPlanOptions): CanonicalRenderPlan {
  const { state, time, width, height } = options;
  const fps = RenderFpsAuthority.resolveFps({
    projectFps: state.metadata?.fps,
    settingsFps: options.fps,
  });
  const background = options.background || '#06070a';

  const compositorIndex = buildPreviewCompositorIndex(state.tracks);
  const activePlan = selectActivePreviewCompositorPlan(compositorIndex, time);
  const mediaFrame = getMediaFrameGeometry(width, height);

  const layers: CanonicalRenderLayer[] = [];

  // 1. Video and Image layers
  for (const item of activePlan.byRole.video) {
    const clip = item.clip;
    const canonicalTransform = evaluateClipAnimation(state.animations, clip, time);
    const imageToVideoState = getImageToVideoAnimationState(clip, time);
    const combinedTransform = {
      ...canonicalTransform,
      x: canonicalTransform.x + imageToVideoState.x,
      y: canonicalTransform.y + imageToVideoState.y,
      scale: (canonicalTransform.scale * imageToVideoState.scale) / 100,
    };

    const matrix = getCanonicalTransformMatrix(combinedTransform, width, height);
    const effects = getMediaVisualEffects(clip.properties || {});
    const sourceTime = projectTimeToSourceTime(clip, time);

    let source: CanonicalRenderSource;
    if (clip.properties?.videoUrl || clip.properties?.videoAssetId) {
      source = {
        kind: 'video',
        clipId: clip.id,
        assetId: clip.properties?.videoAssetId,
        url: clip.properties?.videoUrl,
        sourceTime,
      };
    } else {
      source = {
        kind: 'image',
        assetId: clip.properties?.imageAssetId,
        url: clip.properties?.imageUrl,
      };
    }

    layers.push({
      clipId: clip.id,
      role: 'video',
      matrix,
      frame: { ...mediaFrame },
      clipPath: {
        x: -mediaFrame.width / 2,
        y: -mediaFrame.height / 2,
        width: mediaFrame.width,
        height: mediaFrame.height,
        radius: MEDIA_FRAME_CORNER_RADIUS,
      },
      opacity: Math.max(0, Math.min(1, canonicalTransform.opacity / 100)),
      filter: effects.cssFilter || 'none',
      compositeOperation: (effects.canvasCompositeOperation as GlobalCompositeOperation) || 'source-over',
      source,
      zIndex: item.zIndex,
    });
  }

  // 2. Overlay layers
  for (const item of activePlan.byRole.overlay) {
    const clip = item.clip;
    const canonicalTransform = evaluateClipAnimation(state.animations, clip, time);
    const matrix = getCanonicalTransformMatrix(canonicalTransform, width, height);

    layers.push({
      clipId: clip.id,
      role: 'overlay',
      matrix,
      frame: { ...mediaFrame },
      clipPath: {
        x: -mediaFrame.width / 2,
        y: -mediaFrame.height / 2,
        width: mediaFrame.width,
        height: mediaFrame.height,
        radius: MEDIA_FRAME_CORNER_RADIUS,
      },
      opacity: Math.max(0, Math.min(1, canonicalTransform.opacity / 100)),
      filter: 'none',
      compositeOperation: 'source-over',
      source: {
        kind: 'overlay',
        sourceId: clip.sourceId || '',
        props: clip.properties || {},
      },
      zIndex: item.zIndex,
    });
  }

  // 3. Text / Caption layers
  for (const item of activePlan.byRole.text) {
    const clip = item.clip;
    const canonicalTransform = evaluateClipAnimation(state.animations, clip, time);
    const matrix = getCanonicalTransformMatrix(canonicalTransform, width, height);

    layers.push({
      clipId: clip.id,
      role: 'text',
      matrix,
      frame: { ...mediaFrame },
      clipPath: {
        x: -mediaFrame.width / 2,
        y: -mediaFrame.height / 2,
        width: mediaFrame.width,
        height: mediaFrame.height,
        radius: Number(clip.properties?.radius) || MEDIA_FRAME_CORNER_RADIUS,
      },
      opacity: Math.max(0, Math.min(1, canonicalTransform.opacity / 100)),
      filter: 'none',
      compositeOperation: 'source-over',
      source: {
        kind: 'text',
        content: clip.properties?.textContent || '',
        style: clip.properties || {},
      },
      zIndex: item.zIndex,
    });
  }

  // Sort strictly ascending by zIndex
  layers.sort((a, b) => a.zIndex - b.zIndex);

  return Object.freeze({
    time,
    width,
    height,
    fps,
    background,
    layers: Object.freeze(layers),
  });
}
