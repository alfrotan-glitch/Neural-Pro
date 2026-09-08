import type { AtomicRenderSnapshot } from './atomicRenderSnapshot';
import { createRenderDiagnosticBundle, saveRenderDiagnosticBundle, type RenderDiagnosticBundle, type RenderDiagnosticBundleStore } from './renderDiagnosticBundle';
import { diagnoseRenderSnapshotPair, formatRenderSnapshotDiagnostic, type RenderSnapshotDiagnostic } from './renderSnapshotDiagnostics';
import { createRenderDiagnosticReplayPayload } from './renderDiagnosticReplay';

export interface RenderDiagnosticBundleCaptureInput {
  readonly projectId: string;
  readonly projectTime: number;
  readonly preview: AtomicRenderSnapshot;
  readonly export: AtomicRenderSnapshot;
  readonly store: RenderDiagnosticBundleStore;
  readonly key?: string;
}

export interface RenderDiagnosticBundleCaptureResult {
  readonly captured: boolean;
  readonly key?: string;
  readonly diagnostic: RenderSnapshotDiagnostic;
  readonly bundle?: RenderDiagnosticBundle;
}

function defaultKey(input: RenderDiagnosticBundleCaptureInput, diagnostic: RenderSnapshotDiagnostic): string {
  return [
    'render-diagnostic',
    input.projectId,
    input.projectTime.toFixed(6),
    diagnostic.previousHash,
    diagnostic.nextHash,
  ].join(':');
}

/**
 * Automatically persists a deterministic diagnostic artifact only when the
 * Preview/Export snapshots differ. Equality never produces an artifact.
 */
export async function captureRenderDiagnosticBundleOnMismatch(
  input: RenderDiagnosticBundleCaptureInput,
): Promise<RenderDiagnosticBundleCaptureResult> {
  const diagnostic = diagnoseRenderSnapshotPair(input.preview, input.export, 'regression');
  if (diagnostic.equal) {
    return Object.freeze({ captured: false, diagnostic });
  }

  const bundle = createRenderDiagnosticBundle({
    projectId: input.projectId,
    projectTime: input.projectTime,
    previewHash: input.preview.snapshotHash,
    exportHash: input.export.snapshotHash,
    equal: false,
    previewOrigin: 'scrub',
    exportOrigin: 'export',
    diagnostic,
    formatted: formatRenderSnapshotDiagnostic(diagnostic),
    replay: createRenderDiagnosticReplayPayload(input.preview, input.export),
  });
  const key = input.key ?? defaultKey(input, diagnostic);
  await saveRenderDiagnosticBundle(input.store, key, bundle);
  return Object.freeze({ captured: true, key, diagnostic, bundle });
}
