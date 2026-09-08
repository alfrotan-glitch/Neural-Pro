import type { Track, ProjectState } from '../../project/types/project';
import type { ElementAnimation } from '../../animation/types/animation';
import { createStandaloneRenderSnapshot, type AtomicRenderSnapshot } from './atomicRenderSnapshot';
import { diagnoseRenderSnapshotPair, formatRenderSnapshotDiagnostic, type RenderSnapshotDiagnostic } from './renderSnapshotDiagnostics';
import { evaluateRenderSnapshotRegressionGate, type RenderSnapshotRegressionGateResult } from './renderSnapshotRegressionGate';
import { createRenderDiagnosticBundle } from './renderDiagnosticBundle';
import { createRenderDiagnosticReplayPayload } from './renderDiagnosticReplay';

export interface RenderSnapshotPairCaptureInput {
  readonly tracks: readonly Track[];
  readonly animations: readonly ElementAnimation[];
  readonly projectTime: number;
  readonly projectId: string;
  readonly epsilonSeconds?: number;
}

export interface RenderSnapshotPair {
  readonly projectTime: number;
  readonly preview: AtomicRenderSnapshot;
  readonly export: AtomicRenderSnapshot;
}

export interface RenderSnapshotDiagnosticBundle {
  readonly projectId: string;
  readonly projectTime: number;
  readonly previewHash: string;
  readonly exportHash: string;
  readonly equal: boolean;
  readonly previewOrigin: 'preview' | 'scrub' | 'seek';
  readonly exportOrigin: 'export';
  readonly diagnostic: RenderSnapshotDiagnostic;
  readonly formatted: string;
}

export interface RenderSnapshotPairCaptureResult {
  readonly pair: RenderSnapshotPair;
  readonly gate: RenderSnapshotRegressionGateResult;
  readonly diagnosticBundle: RenderSnapshotDiagnosticBundle;
}

function assertFiniteTime(time: number): void {
  if (!Number.isFinite(time) || time < 0) throw new Error(`Invalid render snapshot pair time: ${time}`);
}

/**
 * Captures preview and export render inputs for the same Project Time and
 * validates them through the existing deterministic snapshot regression gate.
 * No Media element is touched and no project state is mutated.
 */
export function capturePreviewExportSnapshotPair(
  input: RenderSnapshotPairCaptureInput,
): RenderSnapshotPairCaptureResult {
  assertFiniteTime(input.projectTime);
  const identity = `${input.projectId}:${input.projectTime}`;
  const preview = createStandaloneRenderSnapshot({
    tracks: input.tracks,
    animations: input.animations,
    time: input.projectTime,
    origin: 'scrub',
    identity: `preview:${identity}`,
  });
  const exportSnapshot = createStandaloneRenderSnapshot({
    tracks: input.tracks,
    animations: input.animations,
    time: input.projectTime,
    origin: 'export',
    identity: `export:${identity}`,
  });

  const pair: RenderSnapshotPair = Object.freeze({
    projectTime: input.projectTime,
    preview,
    export: exportSnapshot,
  });
  const gate = evaluateRenderSnapshotRegressionGate(preview, exportSnapshot);
  const diagnostic = gate.diagnostic;
  const diagnosticBundle: RenderSnapshotDiagnosticBundle = createRenderDiagnosticBundle({
    projectId: input.projectId,
    projectTime: input.projectTime,
    previewHash: preview.snapshotHash,
    exportHash: exportSnapshot.snapshotHash,
    equal: diagnostic.equal,
    previewOrigin: 'scrub',
    exportOrigin: 'export',
    diagnostic,
    formatted: formatRenderSnapshotDiagnostic(diagnostic),
    replay: createRenderDiagnosticReplayPayload(preview, exportSnapshot),
  });

  return Object.freeze({ pair, gate, diagnosticBundle });
}

export function assertPreviewExportSnapshotPair(
  input: RenderSnapshotPairCaptureInput,
): RenderSnapshotPairCaptureResult {
  const result = capturePreviewExportSnapshotPair(input);
  if (!result.gate.passed) {
    throw new Error(result.diagnosticBundle.formatted);
  }
  return result;
}

/** Capture from a canonical ProjectState without cloning mutable ProjectState into runtime. */
export function captureProjectPreviewExportSnapshotPair(
  state: Pick<ProjectState, 'projectId' | 'tracks' | 'animations' | 'currentTime'>,
): RenderSnapshotPairCaptureResult {
  return capturePreviewExportSnapshotPair({
    projectId: state.projectId,
    tracks: state.tracks,
    animations: state.animations ?? [],
    projectTime: state.currentTime,
  });
}
