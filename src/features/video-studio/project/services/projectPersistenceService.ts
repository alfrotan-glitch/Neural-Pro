import type { ProjectState, Track } from '../types/project';
import { assertValidProjectState } from '../validation/projectStateInvariants';
import { calculateProjectDuration, clampProjectTime } from '../../../../core/engine/projectDuration';
import { normalizeCyberpunkSubscribeProperties } from '../../../../core/engine/cyberpunkSubscribeModel';

export const PROJECT_PERSISTENCE_SCHEMA_VERSION = 1 as const;
const STORAGE_PREFIX = 'video_studio_pro_project_v1_';
const LEGACY_NAMED_PREFIX = 'video_studio_pro_project_';
const LEGACY_GLOBAL_KEY = 'video_studio_pro_saved_project';

export interface PersistedProjectDocumentV1 {
  schemaVersion: typeof PROJECT_PERSISTENCE_SCHEMA_VERSION;
  project: {
    projectId: ProjectState['projectId'];
    metadata: ProjectState['metadata'];
    currentTime: number;
    totalDuration: number;
    tracks: Track[];
    selectedNodeIds: ProjectState['selectedNodeIds'];
    isPlaying: false;
    animations?: ProjectState['animations'];
  };
}

function assertProjectName(projectName: string): void {
  if (typeof projectName !== 'string' || projectName.trim() === '') {
    throw new Error('Project name is required for persistence.');
  }
}

export function getProjectStorageKey(projectName: string): string {
  assertProjectName(projectName);
  return `${STORAGE_PREFIX}${encodeURIComponent(projectName.trim())}`;
}

export function createPersistedProjectDocument(state: ProjectState): PersistedProjectDocumentV1 {
  const totalDuration = calculateProjectDuration(state.tracks);
  const project: PersistedProjectDocumentV1['project'] = {
    projectId: state.projectId,
    metadata: structuredClone(state.metadata),
    currentTime: clampProjectTime(state.currentTime, totalDuration),
    totalDuration,
    tracks: structuredClone(state.tracks),
    selectedNodeIds: state.selectedNodeIds.filter((id) => state.tracks.some((track) => track.clips.some((clip) => clip.id === id))),
    isPlaying: false,
    animations: state.animations ? structuredClone(state.animations) : undefined,
  };

  assertValidProjectState(project);
  return { schemaVersion: PROJECT_PERSISTENCE_SCHEMA_VERSION, project };
}

function finiteOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function normalizePersistedTransform(transform: unknown): Track['clips'][number]['transform'] {
  const source = transform && typeof transform === 'object' ? transform as Record<string, unknown> : {};
  const scale = finiteOr(source.scale, 100);
  const opacity = finiteOr(source.opacity, 100);
  const scaleX = finiteOr(source.scaleX, 100);
  const scaleY = finiteOr(source.scaleY, 100);
  return {
    x: finiteOr(source.x, 0),
    y: finiteOr(source.y, 0),
    scale: scale > 0 ? scale : 100,
    scaleX: scaleX > 0 ? scaleX : 100,
    scaleY: scaleY > 0 ? scaleY : 100,
    rotation: finiteOr(source.rotation, 0),
    opacity: Math.max(0, Math.min(100, opacity)),
  };
}

function migrateTracks(tracks: unknown): Track[] {
  if (!Array.isArray(tracks)) throw new Error('Persisted project tracks must be an array.');
  const migrated = tracks.map((track) => ({
    ...track,
    clips: Array.isArray(track?.clips)
      ? track.clips.map((clip: Track['clips'][number]) => {
          const normalizedTransform = normalizePersistedTransform(clip?.transform);
          if (clip?.sourceId !== 'st_cyber_sub' && clip?.sourceId !== 'ef_cyber_sub') {
            return { ...clip, transform: normalizedTransform };
          }
          return {
            ...clip,
            transform: normalizedTransform,
            properties: {
              ...normalizeCyberpunkSubscribeProperties(clip.properties),
              ...clip.properties,
            },
          };
        })
      : track?.clips,
  })) as Track[];
  return migrated;
}

export function deserializeProject(raw: string, fallbackState: ProjectState): ProjectState {
  const parsed: unknown = JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object') throw new Error('Persisted project must be an object.');

  const candidate = parsed as Record<string, unknown>;
  let project: Partial<PersistedProjectDocumentV1['project']>;

  if (candidate.schemaVersion === PROJECT_PERSISTENCE_SCHEMA_VERSION && candidate.project && typeof candidate.project === 'object') {
    project = candidate.project as Partial<PersistedProjectDocumentV1['project']>;
  } else if (candidate.schemaVersion === undefined) {
    // Migrate legacy save shapes that predate an explicit persistence schema.
    project = candidate as Partial<PersistedProjectDocumentV1['project']>;
  } else {
    throw new Error(`Unsupported persisted project schema version: ${String(candidate.schemaVersion)}`);
  }

  const tracks = migrateTracks(project.tracks);
  const totalDuration = calculateProjectDuration(tracks);
  const knownClipIds = new Set(tracks.flatMap((track) => track.clips.map((clip) => clip.id)));
  const selectedNodeIds = Array.isArray(project.selectedNodeIds)
    ? project.selectedNodeIds.filter((id): id is string => typeof id === 'string' && knownClipIds.has(id))
    : fallbackState.selectedNodeIds.filter((id) => knownClipIds.has(id));

  const hydrated: ProjectState = {
    projectId: typeof project.projectId === 'string' && project.projectId.trim() ? project.projectId : fallbackState.projectId,
    metadata: project.metadata && typeof project.metadata === 'object'
      ? structuredClone(project.metadata as ProjectState['metadata'])
      : structuredClone(fallbackState.metadata),
    currentTime: clampProjectTime(typeof project.currentTime === 'number' ? project.currentTime : 0, totalDuration),
    totalDuration,
    tracks,
    selectedNodeIds,
    isPlaying: false,
    animations: Array.isArray(project.animations) ? structuredClone(project.animations as ProjectState['animations']) : structuredClone(fallbackState.animations),
  };

  assertValidProjectState(hydrated);
  return hydrated;
}

export function saveProjectToStorage(storage: Storage, projectName: string, state: ProjectState): void {
  const document = createPersistedProjectDocument(state);
  storage.setItem(getProjectStorageKey(projectName), JSON.stringify(document));
}

export function loadProjectFromStorage(storage: Storage, projectName: string, fallbackState: ProjectState): ProjectState | null {
  assertProjectName(projectName);
  const keys = [
    getProjectStorageKey(projectName),
    `${LEGACY_NAMED_PREFIX}${projectName}`,
    LEGACY_GLOBAL_KEY,
  ];

  for (const key of keys) {
    const raw = storage.getItem(key);
    if (!raw) continue;
    return deserializeProject(raw, fallbackState);
  }
  return null;
}
