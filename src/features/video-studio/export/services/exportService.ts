import type { ProjectState, Track } from '../../project/types/project';
import type { ExportProjectSnapshot } from '../types/settings';
import type { ExportJob } from '../types/settings';
import { exportVideoWebCodecs } from '../../../../lib/webcodecs-export';
import { selectExportDimensions } from '../selectors/exportSelectors';
import { selectExportScope } from '../selectors/exportSelectors';
import { collectExportVideoElements } from '../../../../core/engine/render/ExportMediaRegistry';
import { CanvasExportRenderer } from '../../../../core/engine/render/CanvasExportRenderer';
import { seekActiveVideoClips } from '../../playback/services/playbackService';
import { createStandaloneRenderSnapshot } from '../../playback/services/atomicRenderSnapshot';
import type { RenderSnapshotDiagnostic } from '../../playback/services/renderSnapshotDiagnostics';
import { diagnoseRenderSnapshotPair } from '../../playback/services/renderSnapshotDiagnostics';
import { assertRenderSnapshotParity } from '../../playback/services/renderSnapshotRegressionGate';
import { captureRenderDiagnosticBundleOnMismatch } from '../../playback/services/renderDiagnosticBundleCapture';


export function createExportProjectSnapshot(state: ProjectState): ExportProjectSnapshot {
  const snapshot = {
    projectId: state.projectId,
    metadata: state.metadata,
    currentTime: state.currentTime,
    totalDuration: state.totalDuration,
    tracks: state.tracks,
    selectedNodeIds: state.selectedNodeIds,
    isPlaying: false,
    animations: state.animations ? structuredClone(state.animations) : undefined,
  };

  return structuredClone(snapshot);
}

export interface ExportFrameContext {
  state: ProjectState;
  onRenderSnapshotDiagnostics?: (diagnostic: RenderSnapshotDiagnostic) => void;
  previousRenderSnapshot?: import('../../playback/services/atomicRenderSnapshot').AtomicRenderSnapshot;
  referenceRenderSnapshot?: import('../../playback/services/atomicRenderSnapshot').AtomicRenderSnapshot;
  enforceRenderSnapshotParity?: boolean;
  diagnosticBundleStore?: import('../../playback/services/renderDiagnosticBundle').RenderDiagnosticBundleStore;
  diagnosticBundleKey?: string;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  renderer: CanvasExportRenderer;
  mediaByClipId: ReadonlyMap<string, HTMLVideoElement>;
  imageCache: ReadonlyMap<string, CanvasImageSource>;
}

export function getExportDimensionsForJob(job: ExportJob): { width: number; height: number } {
  const base = selectExportDimensions(job);
  const projectResolution = job.projectSnapshot.metadata.resolution;
  if (!(projectResolution.width > 0 && projectResolution.height > 0)) return base;

  // Preserve the project's canvas orientation while applying the requested
  // export tier. The UI viewport must never affect export dimensions.
  const projectIsPortrait = projectResolution.height > projectResolution.width;
  const exportIsPortrait = base.height > base.width;
  if (projectIsPortrait !== exportIsPortrait) {
    return { width: base.height, height: base.width };
  }
  return base;
}

export function getExportScope(
  state: ProjectState,
  job: ExportJob,
) {
  return selectExportScope(state, job.settings.clipIds);
}

export function collectExportMedia(): ReadonlyMap<string, HTMLVideoElement> {
  return collectExportVideoElements();
}

export async function renderExportFrame(
  tracks: readonly Track[],
  targetTime: number,
  signal: AbortSignal | undefined,
  context: ExportFrameContext,
): Promise<HTMLCanvasElement> {
  // Video export uses the same MediaTimeMapper-backed seek path as Preview playback.
  await seekActiveVideoClips(
    tracks,
    targetTime,
    context.mediaByClipId,
    signal,
  );

  if (signal?.aborted) {
    throw signal.reason instanceof Error
      ? signal.reason
      : new Error('Export cancelled.');
  }

  const renderSnapshot = createStandaloneRenderSnapshot({
    tracks,
    animations: context.state.animations ?? [],
    time: targetTime,
    origin: 'export',
    identity: `export:${context.state.projectId}:${targetTime}`,
  });

  if (context.previousRenderSnapshot && context.onRenderSnapshotDiagnostics) {
    context.onRenderSnapshotDiagnostics(
      diagnoseRenderSnapshotPair(context.previousRenderSnapshot, renderSnapshot, 'export'),
    );
  }

  if (context.referenceRenderSnapshot && context.enforceRenderSnapshotParity) {
    if (context.diagnosticBundleStore) {
      await captureRenderDiagnosticBundleOnMismatch({
        projectId: context.state.projectId,
        projectTime: targetTime,
        preview: context.referenceRenderSnapshot,
        export: renderSnapshot,
        store: context.diagnosticBundleStore,
        key: context.diagnosticBundleKey,
      });
    }
    assertRenderSnapshotParity(context.referenceRenderSnapshot, renderSnapshot);
  }

  context.renderer.render(
    context.canvas,
    context.ctx,
    context.width,
    context.height,
    targetTime,
    {
      state: context.state,
      imageCache: context.imageCache,
      mediaByClipId: context.mediaByClipId,
      renderSnapshot,
    },
  );

  return context.canvas;
}

export { exportVideoWebCodecs };
