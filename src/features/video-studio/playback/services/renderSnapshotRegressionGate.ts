import type { AtomicRenderSnapshot } from './atomicRenderSnapshot';
import { diagnoseRenderSnapshotPair, formatRenderSnapshotDiagnostic, type RenderSnapshotDiagnostic } from './renderSnapshotDiagnostics';

export interface RenderSnapshotRegressionGateResult {
  readonly passed: boolean;
  readonly diagnostic: RenderSnapshotDiagnostic;
}

/**
 * Verifies that two render snapshots represent the exact same render input.
 * Runtime identity (session/revision/transaction) is intentionally ignored by
 * the underlying snapshot diff; only content-relevant render state can fail.
 */
export function evaluateRenderSnapshotRegressionGate(
  expected: AtomicRenderSnapshot,
  actual: AtomicRenderSnapshot,
): RenderSnapshotRegressionGateResult {
  const diagnostic = diagnoseRenderSnapshotPair(expected, actual, 'regression');
  return Object.freeze({
    passed: diagnostic.equal,
    diagnostic,
  });
}

/**
 * Fails fast with a deterministic, human-readable explanation when preview and
 * export (or any other paired render paths) disagree for the same frame.
 */
export function assertRenderSnapshotParity(
  expected: AtomicRenderSnapshot,
  actual: AtomicRenderSnapshot,
): void {
  const result = evaluateRenderSnapshotRegressionGate(expected, actual);
  if (!result.passed) {
    throw new Error(formatRenderSnapshotDiagnostic(result.diagnostic));
  }
}
