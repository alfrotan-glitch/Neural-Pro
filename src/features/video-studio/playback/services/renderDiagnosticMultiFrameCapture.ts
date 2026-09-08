import type { Track } from '../../project/types/project';
import type { ElementAnimation } from '../../animation/types/animation';
import { createDiagnosticFrameResolver, type RenderDiagnosticFrameResult } from './renderDiagnosticFrameNavigator';
import type { RenderDiagnosticBundle } from './renderDiagnosticBundle';

export interface RenderDiagnosticMultiFrameCaptureInput {
  readonly projectId: string;
  readonly tracks: readonly Track[];
  readonly animations: readonly ElementAnimation[];
  readonly startTime: number;
  readonly endTime: number;
  readonly fps: number;
  readonly durationSeconds?: number;
}

export interface RenderDiagnosticMultiFrameCaptureResult {
  readonly startFrame: number;
  readonly endFrame: number;
  readonly frames: readonly RenderDiagnosticFrameResult[];
  readonly firstMismatchFrame?: number;
  readonly lastMismatchFrame?: number;
  readonly firstMismatchTime?: number;
  readonly lastMismatchTime?: number;
  readonly mismatchFrameCount: number;
}

function normalizeFrameBounds(input: RenderDiagnosticMultiFrameCaptureInput): { start: number; end: number; fps: number } {
  if (!Number.isFinite(input.startTime) || input.startTime < 0) throw new Error(`Invalid diagnostic startTime: ${input.startTime}`);
  if (!Number.isFinite(input.endTime) || input.endTime < 0) throw new Error(`Invalid diagnostic endTime: ${input.endTime}`);
  if (!Number.isFinite(input.fps) || input.fps <= 0) throw new Error(`Invalid diagnostic fps: ${input.fps}`);
  const fps = Math.min(240, Math.max(1, input.fps));
  const start = Math.max(0, Math.round(input.startTime * fps));
  const maxEnd = Number.isFinite(input.durationSeconds)
    ? Math.max(0, Math.round((input.durationSeconds ?? 0) * fps))
    : Number.MAX_SAFE_INTEGER;
  const end = Math.min(maxEnd, Math.max(start, Math.round(input.endTime * fps)));
  return { start, end, fps };
}

export function captureDiagnosticFrameRange(
  input: RenderDiagnosticMultiFrameCaptureInput,
): RenderDiagnosticMultiFrameCaptureResult {
  const { start, end, fps } = normalizeFrameBounds(input);
  const resolveFrame = createDiagnosticFrameResolver({
    projectId: input.projectId,
    tracks: input.tracks,
    animations: input.animations,
    durationSeconds: input.durationSeconds ?? Number.POSITIVE_INFINITY,
    fps,
  });
  const frames: RenderDiagnosticFrameResult[] = [];
  for (let frame = start; frame <= end; frame += 1) {
    frames.push(resolveFrame(frame / fps));
  }
  const mismatches = frames.filter((frame) => frame.bundle.equal === false);
  const first = mismatches[0];
  const last = mismatches[mismatches.length - 1];
  return Object.freeze({
    startFrame: start,
    endFrame: end,
    frames: Object.freeze(frames),
    firstMismatchFrame: first?.frameIndex,
    lastMismatchFrame: last?.frameIndex,
    firstMismatchTime: first?.projectTime,
    lastMismatchTime: last?.projectTime,
    mismatchFrameCount: mismatches.length,
  });
}

export function summarizeDiagnosticFrameRange(
  capture: RenderDiagnosticMultiFrameCaptureResult,
): Pick<RenderDiagnosticMultiFrameCaptureResult, 'firstMismatchFrame' | 'lastMismatchFrame' | 'firstMismatchTime' | 'lastMismatchTime' | 'mismatchFrameCount'> {
  return {
    firstMismatchFrame: capture.firstMismatchFrame,
    lastMismatchFrame: capture.lastMismatchFrame,
    firstMismatchTime: capture.firstMismatchTime,
    lastMismatchTime: capture.lastMismatchTime,
    mismatchFrameCount: capture.mismatchFrameCount,
  };
}

export function findDiagnosticBundleAtFrame(
  capture: RenderDiagnosticMultiFrameCaptureResult,
  frameIndex: number,
): RenderDiagnosticBundle | undefined {
  return capture.frames.find((frame) => frame.frameIndex === frameIndex)?.bundle;
}
