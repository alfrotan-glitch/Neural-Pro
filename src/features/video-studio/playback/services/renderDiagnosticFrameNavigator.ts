import type { ElementAnimation } from '../../animation/types/animation';
import type { Track } from '../../project/types/project';
import { createRenderDiagnosticBundle, type RenderDiagnosticBundle } from './renderDiagnosticBundle';
import { createRenderDiagnosticReplayPayload } from './renderDiagnosticReplay';
import { capturePreviewExportSnapshotPair } from './renderSnapshotPairCapture';
import { formatRenderSnapshotDiagnostic } from './renderSnapshotDiagnostics';

const MIN_FPS = 1;
const MAX_FPS = 240;

export interface RenderDiagnosticFrameNavigatorInput {
  readonly projectId: string;
  readonly tracks: readonly Track[];
  readonly animations: readonly ElementAnimation[];
  readonly durationSeconds: number;
  readonly fps: number;
}

export interface RenderDiagnosticFrameResult {
  readonly frameIndex: number;
  readonly projectTime: number;
  readonly bundle: RenderDiagnosticBundle;
}

function normalizeFps(fps: number): number {
  if (!Number.isFinite(fps)) return 30;
  return Math.min(MAX_FPS, Math.max(MIN_FPS, fps));
}

export function snapProjectTimeToFrame(time: number, fps: number, durationSeconds = Number.POSITIVE_INFINITY): RenderDiagnosticFrameResult['projectTime'] {
  if (!Number.isFinite(time) || time < 0) throw new Error(`Invalid diagnostic frame time: ${time}`);
  const safeFps = normalizeFps(fps);
  const maxTime = Number.isFinite(durationSeconds) ? Math.max(0, durationSeconds) : Number.POSITIVE_INFINITY;
  const frameIndex = Math.max(0, Math.round(time * safeFps));
  return Math.min(maxTime, frameIndex / safeFps);
}

export function createDiagnosticFrameResolver(input: RenderDiagnosticFrameNavigatorInput) {
  const fps = normalizeFps(input.fps);
  const duration = Math.max(0, Number.isFinite(input.durationSeconds) ? input.durationSeconds : 0);
  return (requestedTime: number): RenderDiagnosticFrameResult => {
    const projectTime = snapProjectTimeToFrame(requestedTime, fps, duration);
    const capture = capturePreviewExportSnapshotPair({
      projectId: input.projectId,
      tracks: input.tracks,
      animations: input.animations,
      projectTime,
    });
    const bundle = createRenderDiagnosticBundle({
      projectId: input.projectId,
      projectTime,
      previewHash: capture.pair.preview.snapshotHash,
      exportHash: capture.pair.export.snapshotHash,
      equal: capture.gate.passed,
      previewOrigin: 'scrub',
      exportOrigin: 'export',
      diagnostic: capture.gate.diagnostic,
      formatted: formatRenderSnapshotDiagnostic(capture.gate.diagnostic),
      replay: createRenderDiagnosticReplayPayload(capture.pair.preview, capture.pair.export),
    });
    return Object.freeze({
      frameIndex: Math.round(projectTime * fps),
      projectTime,
      bundle,
    });
  };
}

export function stepDiagnosticFrame(currentTime: number, direction: -1 | 1, fps: number, durationSeconds: number): number {
  const safeFps = normalizeFps(fps);
  const currentFrame = Math.round(Math.max(0, currentTime) * safeFps);
  const nextFrame = Math.min(
    Math.round(Math.max(0, durationSeconds) * safeFps),
    Math.max(0, currentFrame + direction),
  );
  return nextFrame / safeFps;
}
