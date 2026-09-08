import type { RenderDiagnosticFrameResult } from './renderDiagnosticFrameNavigator';
import type { RenderSnapshotDiffCategory } from './renderSnapshotDiff';

export interface RenderDiagnosticMismatchIncident {
  readonly incidentId: string;
  readonly startFrame: number;
  readonly endFrame: number;
  readonly startTime: number;
  readonly endTime: number;
  readonly frameCount: number;
  readonly categories: readonly RenderSnapshotDiffCategory[];
  readonly dominantCategory?: RenderSnapshotDiffCategory;
  readonly firstCause?: {
    readonly category: RenderSnapshotDiffCategory;
    readonly clipId?: string;
    readonly field: string;
    readonly previous: unknown;
    readonly next: unknown;
  };
  readonly hashes: readonly string[];
}

export interface RenderDiagnosticMismatchClusteringResult {
  readonly incidentCount: number;
  readonly incidents: readonly RenderDiagnosticMismatchIncident[];
  readonly firstMismatchFrame?: number;
  readonly lastMismatchFrame?: number;
}

function categoryOrder(values: Iterable<RenderSnapshotDiffCategory>): RenderSnapshotDiffCategory[] {
  const priority: RenderSnapshotDiffCategory[] = [
    'time', 'layer-membership', 'clip-source', 'clip-geometry', 'track',
    'layer-order', 'clip-properties', 'transform', 'animation', 'render-input',
  ];
  const set = new Set(values);
  return priority.filter((value) => set.has(value));
}

function dominant(categories: RenderSnapshotDiffCategory[]): RenderSnapshotDiffCategory | undefined {
  return categoryOrder(categories)[0];
}

function incidentFromFrames(frames: RenderDiagnosticFrameResult[], ordinal: number): RenderDiagnosticMismatchIncident {
  const first = frames[0]!;
  const last = frames[frames.length - 1]!;
  const categoryValues = frames.flatMap((frame) => frame.bundle.diagnostic.categories);
  const categories = categoryOrder(categoryValues);
  const firstEntry = first.bundle.diagnostic.entries[0];
  return Object.freeze({
    incidentId: `render-mismatch-${ordinal + 1}-${first.frameIndex}-${last.frameIndex}`,
    startFrame: first.frameIndex,
    endFrame: last.frameIndex,
    startTime: first.projectTime,
    endTime: last.projectTime,
    frameCount: frames.length,
    categories: Object.freeze(categories),
    dominantCategory: dominant(categories),
    firstCause: firstEntry ? Object.freeze({
      category: firstEntry.category,
      clipId: firstEntry.clipId,
      field: firstEntry.field,
      previous: firstEntry.previous,
      next: firstEntry.next,
    }) : undefined,
    hashes: Object.freeze(frames.flatMap((frame) => [frame.bundle.previewHash, frame.bundle.exportHash])),
  });
}

/**
 * Groups adjacent mismatching frames into deterministic incidents. Frames are
 * considered part of the same incident only when their indexes are adjacent.
 * Root-cause ordering is deterministic and starts with the first diff entry of
 * the first mismatching frame in each incident.
 */
export function clusterDiagnosticMismatches(
  frames: readonly RenderDiagnosticFrameResult[],
): RenderDiagnosticMismatchClusteringResult {
  const mismatches = frames
    .filter((frame) => frame.bundle.equal === false)
    .slice()
    .sort((a, b) => a.frameIndex - b.frameIndex);

  if (mismatches.length === 0) {
    return Object.freeze({ incidentCount: 0, incidents: Object.freeze([]) });
  }

  const groups: RenderDiagnosticFrameResult[][] = [];
  let current: RenderDiagnosticFrameResult[] = [];
  for (const frame of mismatches) {
    const previous = current[current.length - 1];
    if (previous && frame.frameIndex !== previous.frameIndex + 1) {
      groups.push(current);
      current = [];
    }
    current.push(frame);
  }
  if (current.length) groups.push(current);

  const incidents = groups.map((group, index) => incidentFromFrames(group, index));
  return Object.freeze({
    incidentCount: incidents.length,
    incidents: Object.freeze(incidents),
    firstMismatchFrame: incidents[0]?.startFrame,
    lastMismatchFrame: incidents[incidents.length - 1]?.endFrame,
  });
}

export function summarizeMismatchRootCause(
  incident: RenderDiagnosticMismatchIncident,
): string {
  if (!incident.firstCause) return 'No diff entry captured.';
  const clip = incident.firstCause.clipId ? ` clip=${incident.firstCause.clipId}` : '';
  return `${incident.firstCause.category}${clip} field=${incident.firstCause.field}`;
}
