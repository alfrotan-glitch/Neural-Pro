// src/core/engine/exportConverter.ts

import { ProjectState, Track, ClipNode } from '../../features/video-studio/project/types/project';
import {
  ExportProject,
  ExportTrack,
  ExportClip,
  ExportAsset,
  ExportCaption,
  ExportEffect,
  ExportAssetType,
  ExportEffectType,
} from '../../features/video-studio/export/types/export';
import {
  getClipPlaybackRate,
  getClipSourceRange,
  getEffectiveClipTimelineDuration,
} from '../../features/video-studio/playback/services/mediaTimeMapper';

/**
 * Traverses all clips in the project to dynamically compile a unique,
 * deduplicated list of media assets used in the timeline.
 */
export function extractAssetsFromProject(tracks: Track[]): ExportAsset[] {
  const assetMap = new Map<string, ExportAsset>();

  for (const track of tracks) {
    for (const clip of track.clips) {
      if (!clip.sourceId) continue;

      const props = clip.properties || {};
      let assetType: ExportAssetType | null = null;
      let url = '';

      if (props.videoUrl) {
        assetType = 'video';
        url = props.videoUrl;
      } else if (props.imageUrl) {
        assetType = 'image';
        url = props.imageUrl;
      } else if (props.audioUrl) {
        assetType = 'audio';
        url = props.audioUrl;
      } else if (track.type === 'video') {
        // Fallback for video track clips
        assetType = 'video';
        url = props.videoUrl || '';
      } else if (track.type === 'audio') {
        assetType = 'audio';
        url = props.audioUrl || '';
      }

      if (assetType && url) {
        if (!assetMap.has(clip.sourceId)) {
          assetMap.set(clip.sourceId, {
            id: clip.sourceId,
            type: assetType,
            name: props.name || `Asset_${clip.sourceId}`,
            url,
            duration: clip.duration,
            width: props.width,
            height: props.height,
          });
        }
      }
    }
  }

  return Array.from(assetMap.values());
}

/**
 * Identifies and maps any special effects, transitions, or filters applied to a clip
 * based on its properties and type.
 */
export function extractEffectsFromClip(clip: ClipNode, trackType: string): ExportEffect[] {
  const effects: ExportEffect[] = [];
  const props = clip.properties || {};

  // 1. Root-level Opacity Effect
  const opacity = clip.transform?.opacity !== undefined ? clip.transform.opacity : 100;
  if (opacity < 100) {
    effects.push({
      id: `eff_opacity_${clip.id}`,
      type: 'opacity',
      properties: {
        name: 'Opacity Fade',
        intensity: opacity / 100,
        opacityValue: opacity,
      },
    });
  }

  // 2. Transform/Motion Effect if non-default
  const transform = clip.transform || { x: 0, y: 0, scale: 100, rotation: 0 };
  if (transform.x !== 0 || transform.y !== 0 || transform.scale !== 100 || (transform.scaleX ?? 100) !== 100 || (transform.scaleY ?? 100) !== 100 || transform.rotation !== 0) {
    effects.push({
      id: `eff_transform_${clip.id}`,
      type: 'transform',
      properties: {
        name: 'Spatial Transform',
        x: transform.x,
        y: transform.y,
        scale: transform.scale,
        scaleX: transform.scaleX ?? 100,
        scaleY: transform.scaleY ?? 100,
        rotation: transform.rotation,
      },
    });
  }

  // 3. Track-level specific effect parsing
  if (trackType === 'effect' || (trackType as string) === 'sticker' || clip.id.includes('effect') || clip.id.includes('sticker') || clip.id.includes('overlay')) {
    const sourceId = clip.sourceId || '';
    if (sourceId.includes('audio_wave') || props.type === 'audio_wave' || props.name?.toLowerCase().includes('wave')) {
      effects.push({
        id: `eff_audio_wave_${clip.id}`,
        type: 'filter',
        properties: {
          name: 'Audio Wave Equalizer Overlay',
          style: {
            waveColor: props.waveColor || 'cyan',
            sensitivity: props.sensitivity || 1.0,
          },
        },
      });
    } else if (sourceId.includes('cyber') || clip.id.includes('cyber') || props.name?.toLowerCase().includes('cyber')) {
      effects.push({
        id: `eff_sub_cyber_${clip.id}`,
        type: 'subscribe',
        properties: {
          name: 'Cyberpunk Subscribe Action',
          style: {
            theme: 'cyberpunk-neon',
            glowEnabled: true,
            primaryColor: '#06b6d4',
            secondaryColor: '#ec4899',
            textContent: props.textContent || 'SUBSCRIBE',
          },
        },
      });
    } else if (sourceId.includes('sub') || sourceId.includes('capsule') || sourceId.includes('outrun') || clip.id.includes('sub') || props.name?.toLowerCase().includes('sub')) {
      effects.push({
        id: `eff_sub_template_${clip.id}`,
        type: 'subscribe',
        properties: {
          name: props.name || 'Subscribe Action Overlay',
          templateId: sourceId,
          style: {
            theme: props.theme || 'custom-red',
            primaryColor: '#ef4444',
            textColor: '#ffffff',
            textContent: props.textContent || 'SUBSCRIBE',
          },
        },
      });
    } else {
      // Default fallback effect
      effects.push({
        id: `eff_custom_${clip.id}`,
        type: 'filter',
        properties: {
          name: props.name || 'Custom Visual Effect',
          metadata: props,
        },
      });
    }
  }

  // 4. Transitions Extraction (e.g. fade in/out if specified in clip properties)
  if (props.transitionInType || props.transitionOutType) {
    effects.push({
      id: `eff_transition_${clip.id}`,
      type: 'transition',
      properties: {
        name: 'Clip Transition',
        introType: props.transitionInType || 'fade',
        introDuration: props.transitionInDuration || 0.5,
        outroType: props.transitionOutType || 'fade',
        outroDuration: props.transitionOutDuration || 0.5,
      },
    });
  }

  return effects;
}

/**
 * Extracts and compiles a list of formatted caption objects from text tracks
 */
export function extractCaptionsFromProject(tracks: Track[]): ExportCaption[] {
  const captions: ExportCaption[] = [];

  const textTracks = tracks.filter((t) => t.type === 'text' || (t.type as string) === 'caption' || t.id.includes('caption') || t.id.includes('text'));
  for (const track of textTracks) {
    for (const clip of track.clips) {
      const props = clip.properties || {};
      if (props.textContent) {
        const words = (props.words || []).map((w: any) => ({
          word: w.word || w.text,
          start: w.start !== undefined ? w.start : clip.startAt,
          end: w.end !== undefined ? w.end : (clip.startAt + clip.duration),
        }));

        captions.push({
          id: `cap_${clip.id}`,
          startAt: clip.startAt,
          duration: clip.duration,
          text: props.textContent,
          fontFamily: props.fontFamily || 'Inter',
          fontSize: props.fontSize || 24,
          textColor: props.textColor || '#ffffff',
          words: words.length > 0 ? words : undefined,
        });
      }
    }
  }

  return captions.sort((a, b) => a.startAt - b.startAt);
}

/**
 * Maps an existing project track to a standard export track representation
 */
export function mapTrackToExportTrack(track: Track, index: number): ExportTrack {
  const clips: ExportClip[] = track.clips.map((clip) => {
    const props = clip.properties || {};
    
    // Categorize audio volume & pan safely
    const volume = props.levelDb !== undefined ? props.levelDb : 0;
    const isMuted = props.isMuted || false;

    // Build the ExportClip object
    const playbackRate = getClipPlaybackRate(clip);
    const { start: trimIn, end: trimOut } = getClipSourceRange(clip);
    const effectiveDuration = getEffectiveClipTimelineDuration(clip);
    const effectiveTrimOut = trimOut ?? trimIn + effectiveDuration * playbackRate;

    const exportClip: ExportClip = {
      id: clip.id,
      assetId: clip.sourceId ? clip.sourceId : undefined,
      startAt: clip.startAt,
      duration: effectiveDuration,
      trim: {
        in: trimIn,
        out: effectiveTrimOut,
      },
      transform: {
        x: clip.transform?.x || 0,
        y: clip.transform?.y || 0,
        scale: clip.transform?.scale || 100,
        rotation: clip.transform?.rotation || 0,
        opacity: clip.transform?.opacity !== undefined ? clip.transform.opacity : 100,
      },
      effects: extractEffectsFromClip(clip, track.type),
      properties: {
        ...props,
        volume,
        isMuted,
      },
    };

    return exportClip;
  });

  return {
    id: track.id,
    type: track.type,
    order: index,
    isMuted: track.isMuted,
    clips,
  };
}

/**
 * Main entrance point of the Export Data Layer.
 * Conforms to the structured specification, converting editor project states
 * into a clean, complete JSON render instruction.
 */
export function convertToExportProject(projectState: ProjectState): ExportProject {
  const assets = extractAssetsFromProject(projectState.tracks);
  const tracks = projectState.tracks.map((track, idx) => mapTrackToExportTrack(track, idx));
  const captions = extractCaptionsFromProject(projectState.tracks);

  return {
    projectId: projectState.projectId || 'project_default',
    title: projectState.metadata?.title || 'Untitled Project',
    resolution: {
      width: projectState.metadata?.resolution?.width || 1920,
      height: projectState.metadata?.resolution?.height || 1080,
    },
    fps: projectState.metadata?.fps || 30,
    duration: projectState.totalDuration || 0,
    assets,
    tracks,
    captions,
  };
}
