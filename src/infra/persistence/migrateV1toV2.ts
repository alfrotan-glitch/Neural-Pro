/**
 * SHIM-001 — V1 → V2 project document migration (WP-05).
 *
 *   Owner:            WP-05
 *   Removal milestone: WP-12 (tracked; a test fails if this shim outlives it)
 *   Policy:           docs/contracts/persistence.md §5, ADR-006, ADR-013
 *
 * A V1 document is `localStorage['video_studio_pro_project_v1_<name>']` holding
 * `{ schemaVersion: 1, project }` — or, for pre-schema saves, the bare project
 * object. Its clips carry `blob:` URLs that are already dead by the time a
 * reload happens.
 *
 * Migration therefore does three things, in this order:
 *   1. import every transient URL that STILL resolves into the asset store,
 *      rewriting the clip to reference an AssetId;
 *   2. mark clips whose handle is dead as durably `mediaUnresolved` — visible,
 *      relinkable, and never silently dropped;
 *   3. rebuild duration/selection with the same canonical functions the editor
 *      uses, so the migrated project is indistinguishable from a native V2 one.
 *
 * Migrations are forward-only and are never applied to a document this build
 * wrote itself.
 */

import type { AssetId } from '../../domain/assets/types';
import {
  collectImportableMediaUrls,
  getAssetKeyForUrlKey,
  markClipMediaMissing,
  readClipMediaReference,
  type ClipLike,
} from '../../domain/assets/mediaReferences';
import type { ProjectState, Track } from '../../features/video-studio/project/types/project';
import { normalizeSelectedNodeIds } from '../../features/video-studio/project/validation';
import { calculateProjectDuration, clampProjectTime } from '../../core/engine/projectDuration';
import { PersistenceError } from './errors';
import { normalizeTracksForPersistence, type PersistedProjectState } from './documentContract';
import type { MediaMissingWarning } from './mediaHydration';
import type { TransientMediaImporter } from './transientMediaImporter';

export const SHIM_001_ID = 'SHIM-001';
export const SHIM_001_OWNER = 'WP-05';
export const SHIM_001_REMOVAL_MILESTONE = 'WP-12';

export interface MigrateV1Options {
  readonly projectId: string;
  readonly name: string;
  readonly importer?: TransientMediaImporter | null;
  /** Used when the legacy document has no usable projectId. */
  readonly fallbackState?: Pick<ProjectState, 'projectId' | 'metadata'>;
}

export interface MigrationOutcome {
  readonly shim: typeof SHIM_001_ID;
  readonly project: PersistedProjectState;
  readonly warnings: MediaMissingWarning[];
  readonly importedAssetIds: AssetId[];
  readonly sourceSchemaVersion: number;
}

interface LegacyProjectShape {
  projectId?: unknown;
  metadata?: unknown;
  currentTime?: unknown;
  totalDuration?: unknown;
  tracks?: unknown;
  selectedNodeIds?: unknown;
  selectedKeyframeIds?: unknown;
  animations?: unknown;
}

/** Extracts the project payload from any recognised V1/legacy envelope. */
export function readLegacyProjectPayload(raw: unknown): {
  project: LegacyProjectShape;
  sourceSchemaVersion: number;
} {
  if (!raw || typeof raw !== 'object') {
    throw new PersistenceError('PERSISTENCE_CORRUPT', 'Legacy project document is not an object.');
  }
  const candidate = raw as Record<string, unknown>;

  if (candidate.schemaVersion === 1 && candidate.project && typeof candidate.project === 'object') {
    return { project: candidate.project as LegacyProjectShape, sourceSchemaVersion: 1 };
  }
  if (candidate.schemaVersion === undefined) {
    // Pre-schema save: the root object IS the project.
    return { project: candidate as LegacyProjectShape, sourceSchemaVersion: 0 };
  }
  throw new PersistenceError(
    'PERSISTENCE_UNSUPPORTED_VERSION',
    `Legacy migration cannot read schemaVersion ${String(candidate.schemaVersion)}.`,
    { foundVersion: candidate.schemaVersion, supportedVersions: [0, 1] },
  );
}

const DEFAULT_METADATA = { title: 'Imported Project', resolution: { width: 1920, height: 1080 }, fps: 30 };

function normalizeMetadata(metadata: unknown, fallback: ProjectState['metadata']): ProjectState['metadata'] {
  const source = metadata && typeof metadata === 'object' ? (metadata as Record<string, unknown>) : {};
  const resolution = source.resolution && typeof source.resolution === 'object'
    ? (source.resolution as Record<string, unknown>)
    : {};
  const width = Number(resolution.width);
  const height = Number(resolution.height);
  const fps = Number(source.fps);
  return {
    title: typeof source.title === 'string' && source.title.trim() !== '' ? source.title : fallback.title,
    resolution: {
      width: Number.isFinite(width) && width > 0 ? width : fallback.resolution.width,
      height: Number.isFinite(height) && height > 0 ? height : fallback.resolution.height,
    },
    fps: Number.isFinite(fps) && fps > 0 ? fps : fallback.fps,
  };
}

/**
 * Imports transient media out of a track list, in place-safe fashion.
 * Returns new tracks (never mutates the input) plus the warnings/ids produced.
 */
export async function importTransientTrackMedia(
  tracks: readonly Track[],
  importer: TransientMediaImporter | null,
): Promise<{ tracks: Track[]; warnings: MediaMissingWarning[]; importedAssetIds: AssetId[] }> {
  const warnings: MediaMissingWarning[] = [];
  const importedAssetIds: AssetId[] = [];

  const nextTracks: Track[] = [];
  for (const track of tracks) {
    const nextClips: Track['clips'] = [];
    for (const clip of track.clips ?? []) {
      const properties: Record<string, unknown> = { ...(clip.properties ?? {}) };
      const reference = readClipMediaReference(clip as ClipLike);
      const transientEntries = collectImportableMediaUrls(reference);

      for (const { urlKey, url } of transientEntries) {
        const assetKey = getAssetKeyForUrlKey(urlKey);
        const isAudioTrack = track.type === 'audio';
        const resolvedKey = urlKey === 'fileUrl'
          ? (isAudioTrack ? 'audioAssetId' : 'videoAssetId')
          : assetKey;

        const imported = importer
          ? await importer.importUrl(url, {
              clipId: clip.id,
              fileName: typeof properties.mediaFileName === 'string' ? properties.mediaFileName : null,
              mimeType: typeof properties.mediaMimeType === 'string' ? properties.mediaMimeType : null,
              kind: resolvedKey === 'audioAssetId' ? 'audio' : resolvedKey === 'imageAssetId' ? 'image' : 'video',
            })
          : null;

        delete properties[urlKey];

        if (imported) {
          properties[resolvedKey] = imported.assetId;
          if (!properties.mediaFileName && imported.record.source.type === 'file') {
            properties.mediaFileName = imported.record.source.fileName;
          }
          properties.mediaMimeType = imported.record.mimeType;
          importedAssetIds.push(imported.assetId);
        } else {
          markClipMediaMissing(properties, 'TRANSIENT_URL_UNRESOLVED', {
            durable: true,
            originalName: typeof properties.name === 'string' ? properties.name : null,
          });
          warnings.push({
            clipId: clip.id,
            trackId: track.id,
            clipName: typeof properties.name === 'string' ? properties.name : clip.id,
            assetId: null,
            reason: 'TRANSIENT_URL_UNRESOLVED',
            message: `The media for "${String(properties.name ?? clip.id)}" was stored as a browser-local URL and did not survive. Relink the file to restore it.`,
          });
        }
      }

      nextClips.push({ ...clip, properties });
    }
    nextTracks.push({ ...track, clips: nextClips });
  }

  return { tracks: nextTracks, warnings, importedAssetIds };
}

/** Migrates a V1/legacy payload into a V2 project state (runtime shape). */
export async function migrateV1toV2(raw: unknown, options: MigrateV1Options): Promise<MigrationOutcome> {
  const { project: legacy, sourceSchemaVersion } = readLegacyProjectPayload(raw);

  if (!Array.isArray(legacy.tracks)) {
    throw new PersistenceError('PERSISTENCE_CORRUPT', 'Legacy project document has no tracks array.');
  }

  const imported = await importTransientTrackMedia(legacy.tracks as Track[], options.importer ?? null);
  const tracks = normalizeTracksForPersistence(imported.tracks);
  const totalDuration = calculateProjectDuration(tracks);

  const fallback = options.fallbackState ?? { projectId: options.projectId, metadata: DEFAULT_METADATA };
  const projectId = typeof legacy.projectId === 'string' && legacy.projectId.trim() !== ''
    ? legacy.projectId
    : fallback.projectId;

  const currentTime = clampProjectTime(typeof legacy.currentTime === 'number' ? legacy.currentTime : 0, totalDuration);

  const project: PersistedProjectState = {
    projectId,
    metadata: normalizeMetadata(legacy.metadata, fallback.metadata),
    currentTime,
    totalDuration,
    tracks,
    selectedNodeIds: normalizeSelectedNodeIds(tracks, Array.isArray(legacy.selectedNodeIds) ? legacy.selectedNodeIds : []),
    ...(Array.isArray(legacy.selectedKeyframeIds)
      ? { selectedKeyframeIds: [...new Set(legacy.selectedKeyframeIds.filter((id): id is string => typeof id === 'string'))] }
      : {}),
    ...(Array.isArray(legacy.animations) ? { animations: structuredClone(legacy.animations) } : {}),
  };

  return {
    shim: SHIM_001_ID,
    project,
    warnings: imported.warnings,
    importedAssetIds: imported.importedAssetIds,
    sourceSchemaVersion,
  };
}
