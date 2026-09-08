import type { RenderDiagnosticFrameResult } from './renderDiagnosticFrameNavigator';
import type { RenderSnapshotDiffCategory, RenderSnapshotDiffEntry } from './renderSnapshotDiff';
import type { RenderDiagnosticMismatchIncident } from './renderDiagnosticMismatchClustering';

export interface RenderDiagnosticCausalEvidence {
  readonly category: RenderSnapshotDiffCategory;
  readonly firstFrame: number;
  readonly firstTime: number;
  readonly occurrenceCount: number;
  readonly persistenceCount: number;
  readonly leadingFrames: number;
  readonly score: number;
  readonly confidence: number;
  readonly role: 'root-cause' | 'contributing' | 'consequence' | 'co-occurring';
}

export interface RenderDiagnosticCausalityAnalysis {
  readonly incidentId: string;
  readonly rootCause?: RenderDiagnosticCausalEvidence;
  readonly evidence: readonly RenderDiagnosticCausalEvidence[];
  readonly rationale: string;
}

const CATEGORY_PRIORITY: readonly RenderSnapshotDiffCategory[] = [
  'time', 'layer-membership', 'clip-source', 'clip-geometry', 'track',
  'layer-order', 'clip-properties', 'transform', 'animation', 'render-input',
];

function priority(category: RenderSnapshotDiffCategory): number {
  const index = CATEGORY_PRIORITY.indexOf(category);
  return index < 0 ? CATEGORY_PRIORITY.length : index;
}

function entriesByCategory(frame: RenderDiagnosticFrameResult): Map<RenderSnapshotDiffCategory, readonly RenderSnapshotDiffEntry[]> {
  const result = new Map<RenderSnapshotDiffCategory, RenderSnapshotDiffEntry[]>();
  for (const entry of frame.bundle.diagnostic.entries) {
    const items = result.get(entry.category) ?? [];
    items.push(entry);
    result.set(entry.category, items);
  }
  return result;
}

function confidence(score: number, topScore: number): number {
  if (topScore <= 0) return 0;
  return Math.max(0, Math.min(1, score / topScore));
}

export function analyzeMismatchIncidentCausality(
  incident: RenderDiagnosticMismatchIncident,
  frames: readonly RenderDiagnosticFrameResult[],
): RenderDiagnosticCausalityAnalysis {
  const incidentFrames = frames
    .filter((frame) => frame.frameIndex >= incident.startFrame && frame.frameIndex <= incident.endFrame && frame.bundle.equal === false)
    .sort((a, b) => a.frameIndex - b.frameIndex);

  if (incidentFrames.length === 0) {
    return Object.freeze({ incidentId: incident.incidentId, evidence: Object.freeze([]), rationale: 'No mismatching frames were available for causality analysis.' });
  }

  const firstFrame0 = incidentFrames[0]!;
  const firstIndex = firstFrame0.frameIndex;
  const evidenceByCategory = new Map<RenderSnapshotDiffCategory, RenderDiagnosticCausalEvidence>();
  const categories = new Set<RenderSnapshotDiffCategory>();

  for (let i = 0; i < incidentFrames.length; i += 1) {
    const frame = incidentFrames[i];
    if (frame) {
      for (const category of frame.bundle.diagnostic.categories) categories.add(category);
    }
  }

  for (const category of categories) {
    const hits = incidentFrames.filter((frame) => frame.bundle.diagnostic.categories.includes(category));
    const firstFrame = hits[0];
    if (!firstFrame) continue;
    const occurrenceCount = hits.length;
    let persistenceCount = 0;
    for (let i = 1; i < hits.length; i += 1) {
      const prevHit = hits[i - 1];
      const currHit = hits[i];
      if (currHit && prevHit && currHit.frameIndex === prevHit.frameIndex + 1) persistenceCount += 1;
    }
    const leadingFrames = Math.max(0, incidentFrames.length - 1 - hits.findIndex((frame) => frame.frameIndex === firstIndex));
    const earlyBonus = firstFrame.frameIndex === firstIndex ? 2 : 0;
    const persistenceBonus = persistenceCount * 0.75;
    const frequencyBonus = occurrenceCount / incidentFrames.length;
    const priorityBonus = (CATEGORY_PRIORITY.length - priority(category)) * 0.01;
    const score = earlyBonus + persistenceBonus + frequencyBonus + priorityBonus;
    const entries = firstFrame.bundle.diagnostic.entries.filter((entry) => entry.category === category);
    const role: RenderDiagnosticCausalEvidence['role'] =
      score >= 2.5 ? 'root-cause' :
      firstFrame.frameIndex === firstIndex ? 'contributing' :
      persistenceCount === 0 ? 'consequence' : 'co-occurring';
    void entries;
    evidenceByCategory.set(category, Object.freeze({
      category,
      firstFrame: firstFrame.frameIndex,
      firstTime: firstFrame.projectTime,
      occurrenceCount,
      persistenceCount,
      leadingFrames,
      score,
      confidence: 0,
      role,
    }));
  }

  const ranked = [...evidenceByCategory.values()].sort((a, b) =>
    b.score - a.score || a.firstFrame - b.firstFrame || priority(a.category) - priority(b.category),
  );
  const topScore = ranked[0]?.score ?? 0;
  const normalized = ranked.map((item, index) => Object.freeze({
    ...item,
    confidence: confidence(item.score, topScore),
    role: index === 0 && item.score > 0 ? 'root-cause' as const : item.role === 'root-cause' ? 'contributing' as const : item.role,
  }));
  const rootCause = normalized[0];
  const rationale = rootCause
    ? `Root cause candidate ${rootCause.category} first appears at frame ${rootCause.firstFrame}, persists across ${rootCause.persistenceCount} adjacent transition(s), and has confidence ${(rootCause.confidence * 100).toFixed(0)}%.`
    : 'No causal evidence was identified.';

  return Object.freeze({
    incidentId: incident.incidentId,
    rootCause,
    evidence: Object.freeze(normalized),
    rationale,
  });
}

export function summarizeCausality(analysis: RenderDiagnosticCausalityAnalysis): string {
  if (!analysis.rootCause) return analysis.rationale;
  return `${analysis.rootCause.category} @ frame ${analysis.rootCause.firstFrame} (${Math.round(analysis.rootCause.confidence * 100)}% confidence)`;
}

export function collectCausalityFrames(
  incident: RenderDiagnosticMismatchIncident,
  frames: readonly RenderDiagnosticFrameResult[],
): RenderDiagnosticFrameResult[] {
  return frames.filter((frame) => frame.frameIndex >= incident.startFrame && frame.frameIndex <= incident.endFrame && frame.bundle.equal === false)
    .sort((a, b) => a.frameIndex - b.frameIndex);
}

export function buildIncidentCategoryMap(frames: readonly RenderDiagnosticFrameResult[]): Map<RenderSnapshotDiffCategory, number[]> {
  const result = new Map<RenderSnapshotDiffCategory, number[]>();
  for (const frame of frames) {
    const map = entriesByCategory(frame);
    for (const category of map.keys()) {
      const values = result.get(category) ?? [];
      values.push(frame.frameIndex);
      result.set(category, values);
    }
  }
  return result;
}
