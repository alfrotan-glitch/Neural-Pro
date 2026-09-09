/**
 * Save / Load / Continue controller (WP-05).
 *
 * The single place that connects the editor store to the durable persistence
 * layer, so both save entry points (the header button and the timeline menu)
 * behave identically and neither can report a success that did not happen
 * (INV-010).
 *
 * Responsibilities:
 *   - resolve the durable project id from the project name,
 *   - persist project settings (export panel) alongside the timeline,
 *   - hydrate the store from a loaded document WITHOUT creating an undo entry,
 *   - turn warnings into user-facing messages, including degraded storage,
 *   - remember the last opened project so "Continue" works after a reload.
 */

import { useProjectStore } from '../../../../store/useProjectStore';
import { useExportStore } from '../../../../store/useExportStore';
import {
  deriveProjectId,
  describeReclaimableMedia,
  evictUnreferencedMedia,
  exportProjectBundleFile,
  importProjectBundleFile,
  loadProject,
  releaseProjectMediaHandles,
  saveProject,
  type LoadProjectResult,
  type MediaMissingWarning,
  type ProjectSettings,
  type SaveProjectResult,
} from './projectPersistenceService';
import type { ExportRecordEntry } from '../../../../infra/persistence/documentContract';
import type {
  AudioBitrate,
  ExportCodec,
  ExportFPS,
  ExportFormat,
  ExportQuality,
  ExportResolution,
} from '../../export/types/settings';
import type { ProjectState } from '../types/project';

export interface QuotaRecovery {
  readonly usage: number | null;
  readonly quota: number | null;
  readonly evictableAssets: number;
  readonly evictableBytes: number;
}

export interface SaveOutcome {
  readonly ok: boolean;
  readonly message: string;
  readonly warnings: MediaMissingWarning[];
  readonly revision: number;
  readonly storageMode: 'durable' | 'session';
  readonly degraded: boolean;
  readonly result: SaveProjectResult | null;
  /** Set only on a quota failure: what is used, and what can be freed. */
  readonly quota: QuotaRecovery | null;
}

function formatBytes(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return 'unknown';
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  if (value < 1024 * 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  return `${(value / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/**
 * Persisted settings are validated against the canonical value sets on read.
 *
 * The `Record<Union, true>` coverage maps are compile-time drift guards: adding a
 * value to the export contract without updating these lists breaks the build,
 * which is the only reliable way to stop a new setting from being silently
 * discarded when a project is reopened.
 */
const RESOLUTION_COVERAGE: Record<ExportResolution, true> = {
  '720p': true, '1080p': true, '2K': true, '4K': true, '8K': true,
};
const CODEC_COVERAGE: Record<ExportCodec, true> = { 'H.264': true, 'H.265': true, AV1: true };
const QUALITY_COVERAGE: Record<ExportQuality, true> = { Fast: true, Balanced: true, 'High Quality': true };
const AUDIO_BITRATE_COVERAGE: Record<AudioBitrate, true> = {
  '128k': true, '192k': true, '256k': true, '320k': true,
};
const FORMAT_COVERAGE: Record<ExportFormat, true> = { mp4: true, webm: true, mkv: true };
const FPS_COVERAGE: Record<ExportFPS, true> = { 24: true, 30: true, 60: true };

const RESOLUTIONS = Object.keys(RESOLUTION_COVERAGE) as ExportResolution[];
const CODECS = Object.keys(CODEC_COVERAGE) as ExportCodec[];
const QUALITIES = Object.keys(QUALITY_COVERAGE) as ExportQuality[];
const AUDIO_BITRATES = Object.keys(AUDIO_BITRATE_COVERAGE) as AudioBitrate[];
const FORMATS = Object.keys(FORMAT_COVERAGE) as ExportFormat[];
const FPS_VALUES = Object.keys(FPS_COVERAGE).map(Number) as ExportFPS[];

function oneOf<T extends string | number>(value: unknown, allowed: readonly T[]): T | undefined {
  return allowed.includes(value as T) ? (value as T) : undefined;
}

/** Project-scoped settings that must survive a reload. */
export function collectProjectSettings(): ProjectSettings {
  const store = useExportStore.getState();
  return {
    export: {
      resolution: store.resolution,
      fps: store.fps,
      codec: store.codec,
      quality: store.quality,
      audioBitrate: store.audioBitrate,
      videoBitrate: store.videoBitrate,
      videoBitrateMode: store.videoBitrateMode,
      format: store.format,
    },
  };
}

/** Restores persisted export settings; unknown values are ignored, never guessed. */
export function applyProjectSettings(settings: ProjectSettings): void {
  const store = useExportStore.getState();
  const source = settings.export ?? {};

  const resolution = oneOf(source.resolution, RESOLUTIONS);
  const fps = oneOf(source.fps, FPS_VALUES);
  const codec = oneOf(source.codec, CODECS);
  const quality = oneOf(source.quality, QUALITIES);
  const audioBitrate = oneOf(source.audioBitrate, AUDIO_BITRATES);
  const format = oneOf(source.format, FORMATS);
  const videoBitrateMode = oneOf(source.videoBitrateMode, ['auto', 'custom'] as const);
  const videoBitrate = typeof source.videoBitrate === 'number' && Number.isFinite(source.videoBitrate)
    ? source.videoBitrate
    : undefined;

  if (resolution) store.setResolution(resolution);
  if (fps) store.setFps(fps);
  if (codec) store.setCodec(codec);
  if (quality) store.setQuality(quality);
  if (audioBitrate) store.setAudioBitrate(audioBitrate);
  if (videoBitrateMode) store.setVideoBitrateMode(videoBitrateMode);
  if (videoBitrate !== undefined && videoBitrateMode === 'custom') store.setVideoBitrate(videoBitrate);
  if (format) store.setFormat(format);
}

function describeWarnings(warnings: readonly MediaMissingWarning[]): string {
  if (warnings.length === 0) return '';
  const first = warnings[0];
  const name = first?.clipName ?? first?.clipId ?? 'a clip';
  return warnings.length === 1
    ? ` ⚠️ 1 clip needs its media relinked (${name}).`
    : ` ⚠️ ${warnings.length} clips need their media relinked (first: ${name}).`;
}

/** Saves the current editor state durably. Never throws. */
export async function saveCurrentProject(projectName: string): Promise<SaveOutcome> {
  const state = useProjectStore.getState();
  try {
    const projectId = await deriveProjectId(projectName);
    const result = await saveProject({
      projectId,
      name: projectName,
      state,
      settings: collectProjectSettings(),
      exports: collectExportRecords(),
    });

    if (!result.ok) {
      // A quota failure is actionable, so it reports numbers rather than an
      // instruction the user has no way to carry out (WP-05 §2.8).
      let quota: QuotaRecovery | null = null;
      let message = `❌ Save failed: ${result.error?.message ?? 'unknown error'}`;

      if (result.error?.code === 'PERSISTENCE_QUOTA') {
        const reclaimable = await describeReclaimableMedia();
        quota = {
          usage: result.estimate.usage,
          quota: result.estimate.quota,
          evictableAssets: reclaimable.count,
          evictableBytes: reclaimable.bytes,
        };
        const used = `used ${formatBytes(result.estimate.usage)} of ${formatBytes(result.estimate.quota)}`;
        message = reclaimable.count > 0
          ? `❌ Save failed: storage is full (${used}). ${reclaimable.count} unused media file(s) — ${formatBytes(reclaimable.bytes)} — can be freed.`
          : `❌ Save failed: storage is full (${used}). No unused media is available to free.`;
      }

      useProjectStore.getState().showToast(message);
      return {
        ok: false,
        message,
        warnings: result.warnings,
        revision: 0,
        storageMode: result.storageMode,
        degraded: result.degraded,
        result,
        quota,
      };
    }

    // Keep the durable asset ids in the live store so the next save is a no-op
    // for media that is already stored (no re-import, no history entry).
    if (result.importedAssetIds.length > 0) {
      useProjectStore.getState().hydrateTracks(result.normalizedTracks);
    }

    const runtime = await import('./projectPersistenceService').then((module) => module.getPersistenceRuntime());
    runtime.preferences.write({ lastProjectId: projectId, lastProjectName: projectName });

    const degradedNote = result.degraded
      ? ' ⚠️ Durable storage is unavailable — this project will NOT survive a browser restart.'
      : '';
    const message = `💾 Saved (revision ${result.revision}).${describeWarnings(result.warnings)}${degradedNote}`;
    useProjectStore.getState().showToast(message);

    return {
      ok: true,
      message,
      warnings: result.warnings,
      revision: result.revision,
      storageMode: result.storageMode,
      degraded: result.degraded,
      result,
      quota: null,
    };
  } catch (error) {
    const message = `❌ Save failed: ${error instanceof Error ? error.message : String(error)}`;
    useProjectStore.getState().showToast(message);
    return {
      ok: false,
      message,
      warnings: [],
      revision: 0,
      storageMode: 'durable',
      degraded: false,
      result: null,
      quota: null,
    };
  }
}

export interface LoadOutcome {
  readonly loaded: boolean;
  readonly message: string | null;
  readonly result: LoadProjectResult | null;
}

/** Loads a project by name, hydrates the store, and reports recovery/warnings. */
export async function loadCurrentProject(projectName: string): Promise<LoadOutcome> {
  const fallbackState: ProjectState = {
    projectId: useProjectStore.getState().projectId,
    metadata: useProjectStore.getState().metadata,
    currentTime: 0,
    totalDuration: 0,
    tracks: useProjectStore.getState().tracks,
    selectedNodeIds: [],
    isPlaying: false,
  };

  try {
    const projectId = await deriveProjectId(projectName);
    const result = await loadProject({ projectId, name: projectName, fallbackState });

    if (!result.found || !result.state) {
      if (result.error) {
        const message = result.error.code === 'PERSISTENCE_UNSUPPORTED_VERSION'
          ? `❌ ${result.error.message}`
          : '❌ The saved project could not be read. Start fresh or restore the previous version.';
        useProjectStore.getState().showToast(message);
        return { loaded: false, message, result };
      }
      return { loaded: false, message: null, result };
    }

    // Hydration (not a command): loading a project must not create an undo entry.
    useProjectStore.getState().hydrateProject(result.state);
    applyProjectSettings(result.settings);

    const runtime = await import('./projectPersistenceService').then((module) => module.getPersistenceRuntime());
    runtime.preferences.write({ lastProjectId: result.projectId, lastProjectName: projectName });

    const parts: string[] = [];
    if (result.recoveredFrom === 'rollback') {
      parts.push('♻️ The last save was unreadable; the previous version was restored.');
    } else if (result.recoveredFrom === 'legacy-localStorage') {
      parts.push('♻️ Migrated an older save to the durable format.');
    }
    if (result.warnings.length > 0) {
      parts.push(`⚠️ ${result.warnings.length} clip(s) need their media relinked.`);
    }
    if (result.degraded) {
      parts.push('⚠️ Durable storage is unavailable in this context.');
    }

    const message = parts.length > 0 ? parts.join(' ') : null;
    if (message) useProjectStore.getState().showToast(message);

    return { loaded: true, message, result };
  } catch (error) {
    const message = `❌ Failed to load the project: ${error instanceof Error ? error.message : String(error)}`;
    useProjectStore.getState().showToast(message);
    return { loaded: false, message, result: null };
  }
}

export interface EvictionOutcome {
  readonly ok: boolean;
  readonly message: string;
  readonly removedAssets: number;
  readonly removedBytes: number;
}

/**
 * Frees storage on explicit user action (the "evict unused media" half of the
 * quota path). Never touches media a stored project references, and refuses to run
 * at all when a project document is unreadable — an unknown reference set means
 * there is no safe answer.
 */
export async function evictUnusedMedia(): Promise<EvictionOutcome> {
  const result = await evictUnreferencedMedia();

  if (!result.ok) {
    const message = `❌ Could not free space: ${result.error?.message ?? 'unknown error'}`;
    useProjectStore.getState().showToast(message);
    return { ok: false, message, removedAssets: 0, removedBytes: 0 };
  }

  const message = result.removed.length > 0
    ? `🧹 Freed ${formatBytes(result.removedBytes)} (${result.removed.length} unused media file(s)).`
    : 'Nothing unused was available to free.';
  useProjectStore.getState().showToast(message);
  return { ok: true, message, removedAssets: result.removed.length, removedBytes: result.removedBytes };
}

/* --------------------------------------------------- portable .neuralpro */

export interface BundleOutcome {
  readonly ok: boolean;
  readonly blob: Blob | null;
  readonly fileName: string;
  readonly byteSize: number;
  readonly assetCount: number;
  readonly message: string;
  readonly missingAssets: readonly string[];
}

/**
 * Builds a downloadable `.neuralpro` bundle of the current project.
 *
 * The project is saved first, on purpose: the bundle must be a copy of what the
 * durable store holds, not of a stale document from the last save. If the save
 * fails the bundle is not produced — shipping a file that lags behind the editor
 * would be a silent data-loss bug.
 *
 * The caller owns the actual browser download; this function never touches the DOM.
 */
export async function createCurrentProjectBundle(projectName: string): Promise<BundleOutcome> {
  const failed = (message: string): BundleOutcome => ({
    ok: false,
    blob: null,
    fileName: '',
    byteSize: 0,
    assetCount: 0,
    message,
    missingAssets: [],
  });

  const saved = await saveCurrentProject(projectName);
  if (!saved.ok || !saved.result) return failed(saved.message);

  const outcome = await exportProjectBundleFile({ projectId: saved.result.projectId });
  if (!outcome.ok || !outcome.blob) {
    const message = `❌ Bundle failed: ${outcome.error?.message ?? 'unknown error'}`;
    useProjectStore.getState().showToast(message);
    return failed(message);
  }

  const missing = outcome.missingAssets.length;
  const missingNote = missing > 0
    ? ` ⚠️ ${missing} media file(s) had no bytes in this profile and are NOT in the bundle.`
    : '';
  const sessionNote = outcome.storageMode === 'session'
    ? ' ⚠️ Durable storage is unavailable here — this file is the only durable copy of the project.'
    : '';
  const message =
    `📦 Bundle ready: ${outcome.assetCount} media file(s), ${formatBytes(outcome.byteSize)}.${missingNote}${sessionNote}`;
  useProjectStore.getState().showToast(message);

  return {
    ok: true,
    blob: outcome.blob,
    fileName: outcome.fileName,
    byteSize: outcome.byteSize,
    assetCount: outcome.assetCount,
    message,
    missingAssets: outcome.missingAssets,
  };
}

export interface BundleImportOutcome {
  readonly ok: boolean;
  readonly message: string;
  readonly projectId: string;
  readonly name: string;
  readonly missingAssets: readonly string[];
}

/**
 * Restores a `.neuralpro` bundle into the current profile and opens it.
 *
 * Hydration, not a command: importing must not create an undo entry that could be
 * undone back into a project that does not exist locally.
 */
export async function importProjectBundleIntoStore(file: Blob): Promise<BundleImportOutcome> {
  const store = useProjectStore.getState();
  const fallbackState: ProjectState = {
    projectId: store.projectId,
    metadata: store.metadata,
    currentTime: 0,
    totalDuration: 0,
    tracks: store.tracks,
    selectedNodeIds: [],
    isPlaying: false,
  };

  try {
    const result = await importProjectBundleFile({ file, fallbackState });

    if (!result.ok || !result.state) {
      const code = result.error?.code;
      const message =
        code === 'PERSISTENCE_CONFLICT'
          ? `❌ Import refused: ${result.error?.message ?? 'a media file with the same identity but different bytes already exists here.'}`
          : code === 'PERSISTENCE_UNSUPPORTED_VERSION'
            ? `❌ ${result.error?.message ?? 'This bundle was written by a newer version.'}`
            : `❌ Import failed: ${result.error?.message ?? 'the file is not a readable Neural-Pro bundle.'}`;
      useProjectStore.getState().showToast(message);
      return { ok: false, message, projectId: '', name: '', missingAssets: result.missingAssets };
    }

    useProjectStore.getState().hydrateProject(result.state);
    applyProjectSettings(result.settings);

    const runtime = await import('./projectPersistenceService').then((module) => module.getPersistenceRuntime());
    runtime.preferences.write({ lastProjectId: result.projectId, lastProjectName: result.name });

    const parts = [`📦 Imported "${result.name}" (revision ${result.revision}).`];
    if (result.restoredAssets.length > 0) {
      parts.push(`${result.restoredAssets.length} media file(s) restored.`);
    }
    if (result.reusedAssets.length > 0) {
      parts.push(`${result.reusedAssets.length} already present.`);
    }
    if (result.missingAssets.length > 0) {
      parts.push(`⚠️ ${result.missingAssets.length} media file(s) are missing and need a relink.`);
    }
    if (result.degraded) {
      parts.push('⚠️ Durable storage is unavailable in this context.');
    }
    const message = parts.join(' ');
    useProjectStore.getState().showToast(message);

    return {
      ok: true,
      message,
      projectId: result.projectId,
      name: result.name,
      missingAssets: result.missingAssets,
    };
  } catch (error) {
    const message = `❌ Import failed: ${error instanceof Error ? error.message : String(error)}`;
    useProjectStore.getState().showToast(message);
    return { ok: false, message, projectId: '', name: '', missingAssets: [] };
  }
}

/** Durable records for media this project generated (rendered outputs, extracted audio). */
export function collectExportRecords(): ExportRecordEntry[] {
  const jobs = useExportStore.getState().jobs ?? [];
  return jobs
    .filter((job) => job.status === 'completed')
    .map((job) => ({
      id: job.id,
      assetId: (job as { assetId?: string }).assetId ?? null,
      createdAt: job.startTime ? Date.parse(job.startTime) : Date.now(),
      fileName: `${job.projectName}-${job.id}.mp4`,
      byteSize: null,
      duration: job.projectSnapshot?.totalDuration ?? null,
      settings: { ...job.settings },
    }));
}

/** Revokes every media handle minted for the current project. */
export async function releaseCurrentProjectMedia(): Promise<number> {
  return releaseProjectMediaHandles();
}
