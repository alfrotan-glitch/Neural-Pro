import type { AtomicRenderSnapshot } from './atomicRenderSnapshot';
import { diffRenderSnapshots, type RenderSnapshotDiff, type RenderSnapshotDiffCategory, type RenderSnapshotDiffEntry } from './renderSnapshotDiff';

export type RenderSnapshotDiagnosticOrigin = 'preview' | 'scrub' | 'seek' | 'export' | 'regression';

export interface RenderSnapshotDiagnostic {
  readonly origin: RenderSnapshotDiagnosticOrigin;
  readonly equal: boolean;
  readonly previousHash: string;
  readonly nextHash: string;
  readonly categories: readonly RenderSnapshotDiffCategory[];
  readonly entries: readonly RenderSnapshotDiffEntry[];
  readonly summary: string;
}

function summarize(diff: RenderSnapshotDiff): string {
  if (diff.equal) return 'Render snapshots are identical.';
  if (diff.categories.length === 0) return 'Render snapshot hashes differ without a classified field difference.';
  return `Render snapshots differ: ${diff.categories.join(', ')}.`;
}

export function diagnoseRenderSnapshotPair(
  previous: AtomicRenderSnapshot,
  next: AtomicRenderSnapshot,
  origin: RenderSnapshotDiagnosticOrigin,
): RenderSnapshotDiagnostic {
  const diff = diffRenderSnapshots(previous, next);
  return Object.freeze({
    origin,
    equal: diff.equal,
    previousHash: diff.previousHash,
    nextHash: diff.nextHash,
    categories: Object.freeze([...diff.categories]),
    entries: diff.entries,
    summary: summarize(diff),
  });
}

export function formatRenderSnapshotDiagnostic(diagnostic: RenderSnapshotDiagnostic): string {
  return [
    `[RenderSnapshotDiagnostic:${diagnostic.origin}] ${diagnostic.summary}`,
    `previous=${diagnostic.previousHash}`,
    `next=${diagnostic.nextHash}`,
    ...diagnostic.entries.map((entry) =>
      `${entry.category}${entry.clipId ? `:${entry.clipId}` : ''}.${entry.field}: ${JSON.stringify(entry.previous)} -> ${JSON.stringify(entry.next)}`,
    ),
  ].join('\n');
}
