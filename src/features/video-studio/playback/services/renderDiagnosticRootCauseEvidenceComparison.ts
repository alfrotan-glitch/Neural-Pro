import type { RenderDiagnosticRootCauseDiffInspectorCase, RenderDiagnosticRootCauseDiffItem } from './renderDiagnosticRootCauseDiffInspector';
import type { RenderDiagnosticRootCauseCaseEvidence } from './renderDiagnosticRootCauseEvidence';
import type { RenderSnapshotDiffCategory } from './renderSnapshotDiff';

export interface RenderDiagnosticRootCauseEvidenceComparisonCell {
  readonly caseId: string;
  readonly category: RenderSnapshotDiffCategory;
  readonly clipId?: string;
  readonly field: string;
  readonly occurrenceCount: number;
  readonly frameCount: number;
  readonly previousValues: readonly unknown[];
  readonly nextValues: readonly unknown[];
  readonly contexts: readonly {
    readonly frame: number;
    readonly projectTime: number;
    readonly incidentId?: string;
    readonly causalCategories: readonly RenderSnapshotDiffCategory[];
    readonly correlationGroupIds: readonly string[];
  }[];
}

export interface RenderDiagnosticRootCauseEvidenceComparisonPair {
  readonly pairId: string;
  readonly leftCaseId: string;
  readonly rightCaseId: string;
  readonly sharedEvidenceKeys: readonly string[];
  readonly leftOnlyEvidenceKeys: readonly string[];
  readonly rightOnlyEvidenceKeys: readonly string[];
  readonly sharedFrameCount: number;
  readonly leftFrameCount: number;
  readonly rightFrameCount: number;
  readonly sameValueTransitionCount: number;
  readonly divergentTransitionCount: number;
  readonly summary: string;
}

export interface RenderDiagnosticRootCauseEvidenceComparisonResult {
  readonly cells: readonly RenderDiagnosticRootCauseEvidenceComparisonCell[];
  readonly pairs: readonly RenderDiagnosticRootCauseEvidenceComparisonPair[];
  readonly summary: string;
}

function evidenceKey(item: { category: RenderSnapshotDiffCategory; clipId?: string; field: string }): string {
  return [item.category, item.clipId ?? 'project', item.field].join('|');
}

function uniqueValues(values: readonly unknown[]): unknown[] {
  const result: unknown[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const key = JSON.stringify(value);
    if (!seen.has(key)) {
      seen.add(key);
      result.push(value);
    }
  }
  return result;
}

function toCell(caseId: string, items: readonly RenderDiagnosticRootCauseDiffItem[]): RenderDiagnosticRootCauseEvidenceComparisonCell {
  const representative = items[0]!;
  const contexts = items
    .map((item) => ({
      frame: item.context.frame,
      projectTime: item.context.projectTime,
      ...(item.context.incidentId ? { incidentId: item.context.incidentId } : {}),
      causalCategories: Object.freeze([...item.context.causalCategories]),
      correlationGroupIds: Object.freeze([...item.context.correlationGroupIds]),
    }))
    .sort((a, b) => a.frame - b.frame);
  return Object.freeze({
    caseId,
    category: representative.category,
    ...(representative.clipId ? { clipId: representative.clipId } : {}),
    field: representative.field,
    occurrenceCount: items.length,
    frameCount: new Set(items.map((item) => item.context.frame)).size,
    previousValues: Object.freeze(uniqueValues(items.map((item) => item.previous))),
    nextValues: Object.freeze(uniqueValues(items.map((item) => item.next))),
    contexts: Object.freeze(contexts),
  });
}

function pairCases(
  left: RenderDiagnosticRootCauseEvidenceComparisonCell[],
  right: RenderDiagnosticRootCauseEvidenceComparisonCell[],
): Omit<RenderDiagnosticRootCauseEvidenceComparisonPair, 'pairId'> {
  const leftMap = new Map(left.map((cell) => [evidenceKey(cell), cell]));
  const rightMap = new Map(right.map((cell) => [evidenceKey(cell), cell]));
  const allKeys = [...new Set([...leftMap.keys(), ...rightMap.keys()])].sort();
  const sharedEvidenceKeys = allKeys.filter((key) => leftMap.has(key) && rightMap.has(key));
  const leftOnlyEvidenceKeys = allKeys.filter((key) => leftMap.has(key) && !rightMap.has(key));
  const rightOnlyEvidenceKeys = allKeys.filter((key) => rightMap.has(key) && !leftMap.has(key));
  const leftFrames = new Set(left.flatMap((cell) => cell.contexts.map((context) => context.frame)));
  const rightFrames = new Set(right.flatMap((cell) => cell.contexts.map((context) => context.frame)));
  const sameFrameCount = [...leftFrames].filter((frame) => rightFrames.has(frame)).length;
  let sameValueTransitionCount = 0;
  let divergentTransitionCount = 0;
  for (const key of sharedEvidenceKeys) {
    const a = leftMap.get(key)!;
    const b = rightMap.get(key)!;
    const aTransitions = new Set(a.previousValues.map((value, index) => `${JSON.stringify(value)}→${JSON.stringify(a.nextValues[index])}`));
    const bTransitions = new Set(b.previousValues.map((value, index) => `${JSON.stringify(value)}→${JSON.stringify(b.nextValues[index])}`));
    const same = [...aTransitions].some((value) => bTransitions.has(value));
    if (same) sameValueTransitionCount += 1;
    else divergentTransitionCount += 1;
  }
  return {
    leftCaseId: left[0]?.caseId ?? 'unknown',
    rightCaseId: right[0]?.caseId ?? 'unknown',
    sharedEvidenceKeys: Object.freeze(sharedEvidenceKeys),
    leftOnlyEvidenceKeys: Object.freeze(leftOnlyEvidenceKeys),
    rightOnlyEvidenceKeys: Object.freeze(rightOnlyEvidenceKeys),
    sharedFrameCount: sameFrameCount,
    leftFrameCount: leftFrames.size,
    rightFrameCount: rightFrames.size,
    sameValueTransitionCount,
    divergentTransitionCount,
    summary: `${sharedEvidenceKeys.length} shared evidence key(s); ${sameValueTransitionCount} shared transition(s); ${divergentTransitionCount} divergent transition(s).`,
  };
}

export function buildRootCauseEvidenceComparison(
  evidenceExplorer: { readonly cases: readonly RenderDiagnosticRootCauseCaseEvidence[] },
  diffInspector: { readonly cases: readonly RenderDiagnosticRootCauseDiffInspectorCase[] },
): RenderDiagnosticRootCauseEvidenceComparisonResult {
  const inspectorByCase = new Map(diffInspector.cases.map((item) => [item.caseId, item]));
  const cells: RenderDiagnosticRootCauseEvidenceComparisonCell[] = [];
  const cellsByCase = new Map<string, RenderDiagnosticRootCauseEvidenceComparisonCell[]>();

  for (const evidenceCase of evidenceExplorer.cases) {
    const inspectorCase = inspectorByCase.get(evidenceCase.caseId);
    const grouped = new Map<string, RenderDiagnosticRootCauseDiffItem[]>();
    for (const item of inspectorCase?.items ?? []) {
      const key = evidenceKey(item);
      const list = grouped.get(key) ?? [];
      list.push(item);
      grouped.set(key, list);
    }
    const caseCells = [...grouped.values()]
      .map((items) => toCell(evidenceCase.caseId, items))
      .sort((a, b) => evidenceKey(a).localeCompare(evidenceKey(b)));
    cells.push(...caseCells);
    cellsByCase.set(evidenceCase.caseId, caseCells);
  }

  const caseIds = [...cellsByCase.keys()].sort();
  const pairs: RenderDiagnosticRootCauseEvidenceComparisonPair[] = [];
  for (let i = 0; i < caseIds.length; i += 1) {
    const leftId = caseIds[i];
    if (!leftId) continue;
    for (let j = i + 1; j < caseIds.length; j += 1) {
      const rightId = caseIds[j];
      if (!rightId) continue;
      const compared = pairCases(cellsByCase.get(leftId) ?? [], cellsByCase.get(rightId) ?? []);
      pairs.push(Object.freeze({
        pairId: `root-cause-comparison-${pairs.length + 1}`,
        ...compared,
        leftCaseId: leftId,
        rightCaseId: rightId,
      }));
    }
  }

  return Object.freeze({
    cells: Object.freeze(cells),
    pairs: Object.freeze(pairs),
    summary: `${cellsByCase.size} root-cause case(s), ${cells.length} evidence comparison cell(s), ${pairs.length} pair comparison(s).`,
  });
}
