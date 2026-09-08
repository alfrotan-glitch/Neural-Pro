import type { RenderDiagnosticFrameResult } from './renderDiagnosticFrameNavigator';
import type { RenderDiagnosticRootCauseCaseEvidence, RenderDiagnosticRootCauseEvidenceExplorerResult } from './renderDiagnosticRootCauseEvidence';
import type { RenderSnapshotDiffCategory, RenderSnapshotDiffEntry } from './renderSnapshotDiff';

export interface RenderDiagnosticRootCauseDiffContext {
  readonly rootCauseCaseId: string;
  readonly incidentId?: string;
  readonly frame: number;
  readonly projectTime: number;
  readonly previousHash: string;
  readonly nextHash: string;
  readonly causalCategories: readonly RenderSnapshotDiffCategory[];
  readonly correlationGroupIds: readonly string[];
}

export interface RenderDiagnosticRootCauseDiffItem {
  readonly diffId: string;
  readonly evidenceId?: string;
  readonly role: 'root-cause' | 'contributing' | 'consequence' | 'co-occurring' | 'unclassified';
  readonly category: RenderSnapshotDiffCategory;
  readonly clipId?: string;
  readonly field: string;
  readonly previous: unknown;
  readonly next: unknown;
  readonly context: RenderDiagnosticRootCauseDiffContext;
}

export interface RenderDiagnosticRootCauseDiffInspectorCase {
  readonly caseId: string;
  readonly items: readonly RenderDiagnosticRootCauseDiffItem[];
  readonly summary: string;
}

export interface RenderDiagnosticRootCauseDiffInspectorResult {
  readonly cases: readonly RenderDiagnosticRootCauseDiffInspectorCase[];
  readonly summary: string;
}

function sameEvidence(entry: RenderSnapshotDiffEntry, evidence: RenderDiagnosticRootCauseCaseEvidence['rootCauseEvidence'][number]): boolean {
  return entry.category === evidence.category
    && (entry.clipId ?? undefined) === evidence.clipId
    && entry.field === (evidence.field ?? entry.field)
    && evidence.firstFrame <= evidence.lastFrame;
}

function incidentForFrame(evidenceCase: RenderDiagnosticRootCauseCaseEvidence, frame: number): string | undefined {
  return evidenceCase.incidentEvidence.find((incident) => frame >= incident.firstFrame && frame <= incident.lastFrame)?.incidentId;
}

function evidenceForEntry(
  evidenceCase: RenderDiagnosticRootCauseCaseEvidence,
  entry: RenderSnapshotDiffEntry,
  frame: number,
) {
  return evidenceCase.rootCauseEvidence
    .filter((evidence) => evidence.firstFrame <= frame && frame <= evidence.lastFrame)
    .find((evidence) => sameEvidence(entry, evidence));
}

export function buildRootCauseDiffInspector(
  explorer: RenderDiagnosticRootCauseEvidenceExplorerResult,
  frames: readonly RenderDiagnosticFrameResult[],
): RenderDiagnosticRootCauseDiffInspectorResult {
  const frameByIndex = new Map(frames.map((frame) => [frame.frameIndex, frame]));
  const cases = explorer.cases.map((evidenceCase) => {
    const items: RenderDiagnosticRootCauseDiffItem[] = [];
    for (const frameEvidence of evidenceCase.frameEvidence) {
      const frame = frameByIndex.get(frameEvidence.frame);
      if (!frame) continue;
      frame.bundle.diagnostic.entries.forEach((entry, entryIndex) => {
        const evidence = evidenceForEntry(evidenceCase, entry, frame.frameIndex);
        const causalPath = evidenceCase.causalPaths.find((path) => path.incidentId === evidence?.incidentId);
        const correlationGroupIds = evidenceCase.correlationEvidence
          .filter((group) => !evidence?.incidentId || group.incidentIds.includes(evidence.incidentId))
          .map((group) => group.groupId)
          .sort();
        items.push(Object.freeze({
          diffId: `${evidenceCase.caseId}:frame-${frame.frameIndex}:entry-${entryIndex}:${entry.category}:${entry.field}`,
          ...(evidence ? { evidenceId: evidence.evidenceId } : {}),
          role: evidence?.role ?? 'unclassified',
          category: entry.category,
          ...(entry.clipId ? { clipId: entry.clipId } : {}),
          field: entry.field,
          previous: entry.previous,
          next: entry.next,
          context: Object.freeze({
            rootCauseCaseId: evidenceCase.caseId,
            ...(incidentForFrame(evidenceCase, frame.frameIndex) ? { incidentId: incidentForFrame(evidenceCase, frame.frameIndex) } : {}),
            frame: frame.frameIndex,
            projectTime: frame.projectTime,
            previousHash: frame.bundle.diagnostic.previousHash,
            nextHash: frame.bundle.diagnostic.nextHash,
            causalCategories: Object.freeze([...(causalPath?.categories ?? [])]),
            correlationGroupIds: Object.freeze(correlationGroupIds),
          }),
        }));
      });
    }
    items.sort((a, b) => a.context.frame - b.context.frame || a.diffId.localeCompare(b.diffId));
    return Object.freeze({
      caseId: evidenceCase.caseId,
      items: Object.freeze(items),
      summary: `${items.length} traceable diff item(s) across ${new Set(items.map((item) => item.context.frame)).size} mismatch frame(s).`,
    });
  });

  return Object.freeze({
    cases: Object.freeze(cases),
    summary: `${cases.length} root-cause case(s) expose previous → next diff evidence with frame, hash, causal, and correlation context.`,
  });
}
