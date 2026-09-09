import type { ClipNode, ProjectState, Track } from '../../project/types/project';
import { detectSceneCuts } from './sceneDetectionService';
import { getClipPlaybackRate, getClipSourceRange, getEffectiveClipTimelineDuration } from '../../playback/services/mediaTimeMapper';
import { extractAudioFromClip, type ExtractedAudioAsset } from '../../audio/services/audioExtractionService';
import { registerGeneratedMedia } from '../../project/services/projectPersistenceService';

/**
 * Stores extracted audio as a durable asset before it reaches the timeline.
 *
 * Detached/recovered audio is generated media: if it were written into the clip
 * as a `blob:` URL it would be dead after a reload while the save still reported
 * success (defect D-006). The bytes go to the asset store, the clip gets an
 * `audioAssetId`, and the object URL used for this session is the tracked one
 * minted by the registry — the untracked handle from the extractor is revoked.
 *
 * If storage is unavailable the extraction still succeeds for the session and the
 * clip simply has no `audioAssetId`; that shows up as a missing-media warning on
 * the next load rather than as a silent placeholder.
 */
async function persistExtractedAudio(
  clip: ClipNode,
  extracted: ExtractedAudioAsset,
): Promise<{ url: string; assetId: string | null }> {
  const name = `${String(clip.properties?.name ?? 'Clip')} — Audio.webm`;
  try {
    const registered = await registerGeneratedMedia({
      blob: extracted.blob,
      fileName: name,
      mimeType: extracted.mimeType,
      producer: 'audio-extraction',
      role: 'generated',
      measured: {
        duration: extracted.waveform.duration ?? null,
        sampleRate: extracted.waveform.sampleRate ?? null,
        channels: extracted.waveform.channels ?? null,
      },
    });
    try {
      URL.revokeObjectURL(extracted.url);
    } catch {
      /* already revoked */
    }
    return { url: registered.objectUrl, assetId: registered.assetId };
  } catch {
    return { url: extracted.url, assetId: null };
  }
}

export type TimelineActionResult = {
  tracks: Track[];
  affectedClipIds: string[];
  message?: string;
};

function cloneTracks(tracks: readonly Track[]): Track[] {
  return Array.from(structuredClone(tracks));
}

function getSelectedClips(
  state: ProjectState,
  clipIds: readonly string[],
): Array<{ clip: ClipNode; track: Track }> {
  const ids = new Set(clipIds);
  const result: Array<{ clip: ClipNode; track: Track }> = [];

  for (const track of state.tracks) {
    for (const clip of track.clips) {
      if (ids.has(clip.id)) {
        result.push({ clip, track });
      }
    }
  }

  return result;
}

function createDedicatedAudioTrack(tracks: Track[], role: 'audio' = 'audio'): Track {
  const count = tracks.filter((track) => (track.laneRole ?? track.type) === role).length + 1;
  const audioTrack: Track = {
    id: crypto.randomUUID(),
    type: 'audio',
    laneRole: 'audio',
    name: `Audio ${count}`,
    isLocked: false,
    isMuted: false,
    isVisible: true,
    clips: [],
  };
  return audioTrack;
}

export function toggleMirrored(
  state: ProjectState,
  clipIds: readonly string[],
): TimelineActionResult {
  const selected = new Set(clipIds);
  const tracks = cloneTracks(state.tracks);

  for (const track of tracks) {
    for (const clip of track.clips) {
      if (!selected.has(clip.id)) continue;
      clip.properties = {
        ...clip.properties,
        mirrored: clip.properties.mirrored !== true,
      };
    }
  }

  return {
    tracks,
    affectedClipIds: [...selected],
    message: 'Mirror state updated',
  };
}

export function toggleDeactivated(
  state: ProjectState,
  clipIds: readonly string[],
): TimelineActionResult {
  const selected = new Set(clipIds);
  const tracks = cloneTracks(state.tracks);

  for (const track of tracks) {
    for (const clip of track.clips) {
      if (!selected.has(clip.id)) continue;
      clip.properties = {
        ...clip.properties,
        deactivated: clip.properties.deactivated !== true,
      };
    }
  }

  return {
    tracks,
    affectedClipIds: [...selected],
    message: 'Clip active state updated',
  };
}

export function toggleVariableSpeedAnimation(
  state: ProjectState,
  clipIds: readonly string[],
): TimelineActionResult {
  const selected = new Set(clipIds);
  const tracks = cloneTracks(state.tracks);

  for (const track of tracks) {
    for (const clip of track.clips) {
      if (!selected.has(clip.id)) continue;

      const currentEnabled =
        clip.properties.variableSpeedEnabled === true;
      const currentSpeed =
        typeof clip.properties.speed === 'number' &&
        Number.isFinite(clip.properties.speed)
          ? clip.properties.speed
          : 1;

      clip.properties = {
        ...clip.properties,
        speed: Math.max(0.01, currentSpeed),
        variableSpeedEnabled: !currentEnabled,
      };
    }
  }

  return {
    tracks,
    affectedClipIds: [...selected],
    message: 'Variable speed animation toggled',
  };
}

export async function separateAudioFromVideoAsync(
  state: ProjectState,
  clipIds: readonly string[],
  signal?: AbortSignal,
): Promise<TimelineActionResult> {
  const selected = getSelectedClips(state, clipIds).filter(
    ({ clip, track }) =>
      track.type === 'video' &&
      typeof clip.properties.videoUrl === 'string' &&
      clip.properties.videoUrl.length > 0,
  );

  if (selected.length === 0) {
    return {
      tracks: cloneTracks(state.tracks),
      affectedClipIds: [],
      message: 'No video clip with an extractable audio source was selected',
    };
  }

  const tracks = cloneTracks(state.tracks);
  const affectedClipIds: string[] = [];

  for (const { clip } of selected) {
    if (signal?.aborted) throw signal.reason ?? new DOMException('Audio extraction aborted.', 'AbortError');

    const alreadyDetached = tracks.some((track) =>
      (track.laneRole ?? track.type) === 'audio' &&
      track.clips.some((candidate) =>
        candidate.properties.sourceVideoClipId === clip.id &&
        candidate.properties.detachedAudio === true,
      ),
    );
    if (alreadyDetached) continue;

    const extracted = await extractAudioFromClip(clip, signal);
    const stored = await persistExtractedAudio(clip, extracted);
    const audioClip: ClipNode = {
      ...structuredClone(clip),
      id: crypto.randomUUID(),
      properties: {
        ...structuredClone(clip.properties),
        name: `${String(clip.properties.name ?? 'Video')} — Audio`,
        audioUrl: stored.url,
        ...(stored.assetId ? { audioAssetId: stored.assetId } : {}),
        audioMimeType: extracted.mimeType,
        audioExtractionMethod: extracted.method,
        waveformData: extracted.waveform.peaks,
        waveformDuration: extracted.waveform.duration,
        waveformSampleRate: extracted.waveform.sampleRate,
        waveformChannels: extracted.waveform.channels,
        videoUrl: undefined,
        detachedAudio: true,
        sourceVideoClipId: clip.id,
        sourceVideoUrl: clip.properties.videoUrl,
      },
      transform: {
        x: 0,
        y: 0,
        scale: 1,
        rotation: 0,
        opacity: 1,
      },
    };

    const dedicatedTrack = createDedicatedAudioTrack(tracks);
    dedicatedTrack.clips.push(audioClip);
    tracks.push(dedicatedTrack);
    affectedClipIds.push(audioClip.id);
  }

  return {
    tracks,
    affectedClipIds,
    message:
      affectedClipIds.length > 0
        ? `Extracted audio from ${affectedClipIds.length} clip${affectedClipIds.length === 1 ? '' : 's'}`
        : 'Audio was already extracted for the selected clip(s)',
  };
}

export async function recoverAudioFromVideoAsync(
  state: ProjectState,
  clipIds: readonly string[],
  signal?: AbortSignal,
): Promise<TimelineActionResult> {
  const selected = getSelectedClips(state, clipIds).filter(
    ({ clip, track }) =>
      track.type === 'video' &&
      typeof clip.properties.videoUrl === 'string' &&
      clip.properties.videoUrl.length > 0,
  );

  if (selected.length === 0) {
    return {
      tracks: cloneTracks(state.tracks),
      affectedClipIds: [],
      message: 'No video clip with a recoverable audio source was selected',
    };
  }

  const tracks = cloneTracks(state.tracks);
  const affectedClipIds: string[] = [];

  for (const { clip } of selected) {
    if (signal?.aborted) throw signal.reason ?? new DOMException('Audio extraction aborted.', 'AbortError');

    const existing = tracks.flatMap((track) => track.clips).find(
      (candidate) =>
        candidate.properties.sourceVideoClipId === clip.id &&
        candidate.properties.recoveredAudio === true,
    );
    if (existing) {
      affectedClipIds.push(existing.id);
      continue;
    }

    const extracted = await extractAudioFromClip(clip, signal);
    const stored = await persistExtractedAudio(clip, extracted);
    const audioClip: ClipNode = {
      ...structuredClone(clip),
      id: crypto.randomUUID(),
      properties: {
        ...structuredClone(clip.properties),
        name: `${String(clip.properties.name ?? 'Video')} — Recovered Audio`,
        audioUrl: stored.url,
        ...(stored.assetId ? { audioAssetId: stored.assetId } : {}),
        audioMimeType: extracted.mimeType,
        audioExtractionMethod: extracted.method,
        waveformData: extracted.waveform.peaks,
        waveformDuration: extracted.waveform.duration,
        waveformSampleRate: extracted.waveform.sampleRate,
        waveformChannels: extracted.waveform.channels,
        videoUrl: undefined,
        recoveredAudio: true,
        sourceVideoClipId: clip.id,
        detachedAudio: true,
        sourceVideoUrl: clip.properties.videoUrl,
      },
      transform: {
        x: 0,
        y: 0,
        scale: 1,
        rotation: 0,
        opacity: 1,
      },
    };

    const dedicatedTrack = createDedicatedAudioTrack(tracks);
    dedicatedTrack.clips.push(audioClip);
    tracks.push(dedicatedTrack);
    affectedClipIds.push(audioClip.id);
  }

  return {
    tracks,
    affectedClipIds,
    message:
      affectedClipIds.length > 0
        ? `Recovered audio for ${affectedClipIds.length} clip${affectedClipIds.length === 1 ? '' : 's'}`
        : 'Audio was already recovered for the selected clip(s)',
  };
}

export function convertImageToVideo(
  state: ProjectState,
  clipIds: readonly string[],
  durationSeconds = 5,
): TimelineActionResult {
  const selected = getSelectedClips(state, clipIds).filter(
    ({ clip, track }) =>
      track.type === 'video' &&
      typeof clip.properties.imageUrl === 'string' &&
      clip.properties.imageUrl.length > 0,
  );

  if (selected.length === 0) {
    return {
      tracks: cloneTracks(state.tracks),
      affectedClipIds: [],
      message: 'Select an image clip to convert it to a video timeline clip',
    };
  }

  const tracks = cloneTracks(state.tracks);
  const affectedClipIds: string[] = [];

  for (const { clip } of selected) {
    const duration = Math.max(
      0.1,
      Number.isFinite(clip.duration) && clip.duration > 0
        ? clip.duration
        : durationSeconds,
    );

    const startScale = Number.isFinite(clip.transform.scale)
      ? clip.transform.scale
      : 100;

    for (const track of tracks) {
      for (const candidate of track.clips) {
        if (candidate.id !== clip.id) continue;
        candidate.properties = {
          ...candidate.properties,
          imageToVideoEnabled: true,
          imageToVideoPreset: 'ken-burns',
          imageToVideoDuration: duration,
          imageToVideoStartScale: startScale,
          imageToVideoEndScale: Math.max(startScale, startScale * 1.08),
          imageToVideoStartX: candidate.transform.x,
          imageToVideoStartY: candidate.transform.y,
          imageToVideoEndX: candidate.transform.x + 4,
          imageToVideoEndY: candidate.transform.y - 3,
        };
        candidate.duration = duration;
        candidate.trim = {
          ...candidate.trim,
          out: (candidate.trim?.in || 0) + duration,
        };
        affectedClipIds.push(candidate.id);
      }
    }
  }

  return {
    tracks,
    affectedClipIds,
    message: `Converted ${affectedClipIds.length} image clip${affectedClipIds.length === 1 ? '' : 's'} to animated video`,
  };
}

export async function splitVideoIntoScenes(
  state: ProjectState,
  clipIds: readonly string[],
): Promise<TimelineActionResult> {
  const selected = getSelectedClips(state, clipIds).filter(
    ({ clip, track }) =>
      track.type === 'video' &&
      typeof clip.properties.videoUrl === 'string' &&
      clip.properties.videoUrl.length > 0,
  );

  if (selected.length === 0) {
    return {
      tracks: cloneTracks(state.tracks),
      affectedClipIds: [],
      message: 'Select at least one video clip for scene detection',
    };
  }

  const tracks = cloneTracks(state.tracks);
  const affectedClipIds: string[] = [];

  for (const { clip } of selected) {
    const speed = getClipPlaybackRate(clip);
    const { start: sourceStart, end: sourceEnd } = getClipSourceRange(clip);
    const sourceDuration = sourceEnd === null
      ? getEffectiveClipTimelineDuration(clip) * speed
      : Math.max(0, sourceEnd - sourceStart);
    const timelineDuration = Math.min(
      getEffectiveClipTimelineDuration(clip),
      sourceDuration / speed,
    );

    const cuts = await detectSceneCuts(
      clip.properties.videoUrl,
      sourceDuration,
      { startTimeSeconds: sourceStart },
    );

    if (cuts.length === 0) {
      continue;
    }

    const boundaries = [0, ...cuts.map((cut) => cut.time / speed), timelineDuration]
      .filter((value, index, values) => {
        const previous = values[index - 1];
        return index === 0 || (previous !== undefined && value > previous + 0.001);
      })
      .filter((value) => value >= 0 && value <= timelineDuration);

    for (const track of tracks) {
      const sourceClipIndex = track.clips.findIndex((candidate) => candidate.id === clip.id);
      if (sourceClipIndex < 0) continue;

      const segments: ClipNode[] = [];
      for (let index = 0; index < boundaries.length - 1; index += 1) {
        const localStart = boundaries[index];
        const localEnd = boundaries[index + 1];
        if (localStart === undefined || localEnd === undefined) continue;
        const segmentDuration = localEnd - localStart;
        if (segmentDuration < 0.05) continue;

        const segment = structuredClone(clip);
        segment.id = crypto.randomUUID();
        segment.startAt = clip.startAt + localStart;
        segment.duration = segmentDuration;
        segment.trim = {
          in: sourceStart + localStart * speed,
          out: sourceStart + localEnd * speed,
        };
        segment.properties = {
          ...segment.properties,
          sceneSplitSourceClipId: clip.id,
          sceneIndex: index,
          sceneDetectionScore: cuts[index - 1]?.score,
        };
        segments.push(segment);
        affectedClipIds.push(segment.id);
      }

      if (segments.length >= 2) {
        track.clips.splice(sourceClipIndex, 1, ...segments);
      }
    }
  }

  return {
    tracks,
    affectedClipIds,
    message:
      affectedClipIds.length > 0
        ? `Detected and created ${affectedClipIds.length} scene segments`
        : 'No scene changes above the detection threshold were found',
  };
}

export function syncVideoAndAudio(
  state: ProjectState,
  clipIds: readonly string[],
): TimelineActionResult {
  const selected = getSelectedClips(state, clipIds);
  const video = selected.find(({ track }) => track.type === 'video');
  const audio = selected.find(({ track }) => track.type === 'audio');

  if (!video || !audio) {
    return {
      tracks: cloneTracks(state.tracks),
      affectedClipIds: [],
      message: 'Select one video clip and one audio clip to synchronize',
    };
  }

  const syncGroupId =
    typeof video.clip.properties.syncGroupId === 'string'
      ? video.clip.properties.syncGroupId
      : crypto.randomUUID();

  const tracks = cloneTracks(state.tracks);

  for (const track of tracks) {
    for (const clip of track.clips) {
      if (clip.id === video.clip.id || clip.id === audio.clip.id) {
        clip.properties = {
          ...clip.properties,
          syncGroupId,
        };
      }
    }
  }

  const nextAudioTrack = tracks.find((track) => track.id === audio.track.id);
  const nextAudioClip = nextAudioTrack?.clips.find(
    (clip) => clip.id === audio.clip.id,
  );

  if (nextAudioClip) {
    nextAudioClip.startAt = video.clip.startAt;
  }

  return {
    tracks,
    affectedClipIds: [video.clip.id, audio.clip.id],
    message: 'Video and audio synchronized',
  };
}
