import type { RenderDiagnosticMismatchIncident } from './renderDiagnosticMismatchClustering';
import type { RenderDiagnosticCausalGraph } from './renderDiagnosticCausalGraph';
import { analyzeMismatchIncidentCausality, type RenderDiagnosticCausalityAnalysis } from './renderDiagnosticCausality';
import type { RenderDiagnosticIncidentCorrelationResult } from './renderDiagnosticIncidentCorrelation';
import type { RenderDiagnosticFrameResult } from './renderDiagnosticFrameNavigator';
import type { RenderSnapshotDiffCategory } from './renderSnapshotDiff';

export interface RenderDiagnosticRootCauseCase {
  readonly caseId: string;
  readonly rootCauseKey: string;
  readonly category: RenderSnapshotDiffCategory;
  readonly clipId?: string;
  readonly field?: string;
  readonly incidentIds: readonly string[];
  readonly correlationGroupIds: readonly string[];
  readonly firstFrame: number;
  readonly lastFrame: number;
  readonly occurrenceCount: number;
  readonly incidentCount: number;
  readonly confidence: number;
  readonly affectedCategories: readonly RenderSnapshotDiffCategory[];
  readonly summary: string;
}

export interface RenderDiagnosticRootCauseConsolidationResult {
  readonly cases: readonly RenderDiagnosticRootCauseCase[];
  readonly unconsolidatedIncidentIds: readonly string[];
  readonly summary: string;
}

interface RootCauseRecord {
  readonly incident: RenderDiagnosticMismatchIncident;
  readonly analysis: RenderDiagnosticCausalityAnalysis;
}

function rootCauseEvidenceMatchesIncident(incident: RenderDiagnosticMismatchIncident, analysis: RenderDiagnosticCausalityAnalysis): boolean {
  if (!analysis.rootCause) return false;
  return Boolean(incident.firstCause && incident.firstCause.category === analysis.rootCause.category);
}

function buildRootCauseKey(incident: RenderDiagnosticMismatchIncident, analysis: RenderDiagnosticCausalityAnalysis): string | undefined {
  if (!analysis.rootCause || !rootCauseEvidenceMatchesIncident(incident, analysis)) return undefined;
  const firstCause = incident.firstCause;
  return [
    analysis.rootCause.category,
    firstCause?.clipId ?? 'project',
    firstCause?.field ?? '*',
  ].join('|');
}

function correlationGroupsForIncident(
  incidentId: string,
  correlation: RenderDiagnosticIncidentCorrelationResult | undefined,
): string[] {
  return (correlation?.groups ?? [])
    .filter((group) => group.incidentIds.includes(incidentId))
    .map((group) => group.groupId)
    .sort();
}

function uniqueSorted<T extends string>(values: readonly T[]): T[] {
  return [...new Set(values)].sort();
}

/**
 * Consolidates incidents only when the canonical causality analyzer identifies
 * a root-cause candidate and that candidate is backed by the incident's first
 * diff evidence. Exact category/clip/field identity is required; this avoids
 * merging merely similar symptoms into one root-cause case.
 */
export function consolidateDiagnosticRootCauses(
  incidents: readonly RenderDiagnosticMismatchIncident[],
  graphs: readonly RenderDiagnosticCausalGraph[],
  frames: readonly RenderDiagnosticFrameResult[],
  correlation?: RenderDiagnosticIncidentCorrelationResult,
): RenderDiagnosticRootCauseConsolidationResult {
  const graphByIncident = new Map(graphs.map((graph) => [graph.incidentId, graph]));
  const records: RootCauseRecord[] = incidents
    .map((incident) => ({
      incident,
      analysis: analyzeMismatchIncidentCausality(incident, frames),
    }))
    .sort((a, b) => a.incident.startFrame - b.incident.startFrame || a.incident.incidentId.localeCompare(b.incident.incidentId));

  const buckets = new Map<string, RootCauseRecord[]>();
  const unconsolidatedIncidentIds: string[] = [];

  for (const record of records) {
    const key = buildRootCauseKey(record.incident, record.analysis);
    if (!key) {
      unconsolidatedIncidentIds.push(record.incident.incidentId);
      continue;
    }
    const bucket = buckets.get(key) ?? [];
    bucket.push(record);
    buckets.set(key, bucket);
  }

  const cases: RenderDiagnosticRootCauseCase[] = [];
  const orderedBuckets = [...buckets.entries()].sort(([a], [b]) => a.localeCompare(b));

  for (const [rootCauseKey, bucket] of orderedBuckets) {
    const firstRecord = bucket[0];
    if (!firstRecord) continue;
    const rootCause = firstRecord.analysis.rootCause;
    if (!rootCause) continue;

    const incidentIds = bucket.map((record) => record.incident.incidentId).sort();
    const correlationGroupIds = uniqueSorted(bucket.flatMap((record) => correlationGroupsForIncident(record.incident.incidentId, correlation)));
    const affectedCategories = uniqueSorted([
      ...bucket.flatMap((record) => record.incident.categories),
      ...bucket.flatMap((record) => {
        const graph = graphByIncident.get(record.incident.incidentId);
        return graph?.nodes.map((node) => node.category) ?? [];
      }),
    ]);
    const confidenceValues = bucket.map((record) => record.analysis.rootCause?.confidence ?? 0);
    const averageConfidence = confidenceValues.reduce((sum, value) => sum + value, 0) / Math.max(1, confidenceValues.length);
    const reinforcement = bucket.length > 1 ? Math.min(0.2, (bucket.length - 1) * 0.05) : 0;
    const confidence = Number(Math.min(1, averageConfidence + reinforcement).toFixed(6));
    const occurrenceCount = bucket.reduce((sum, record) => sum + record.analysis.rootCause!.occurrenceCount, 0);
    const firstFrame = Math.min(...bucket.map((record) => record.incident.startFrame));
    const lastFrame = Math.max(...bucket.map((record) => record.incident.endFrame));
    const clipId = firstRecord.incident.firstCause?.category === rootCause.category ? firstRecord.incident.firstCause?.clipId : undefined;
    const field = firstRecord.incident.firstCause?.category === rootCause.category ? firstRecord.incident.firstCause?.field : undefined;

    cases.push(Object.freeze({
      caseId: `root-cause-case-${cases.length + 1}`,
      rootCauseKey,
      category: rootCause.category,
      clipId,
      field,
      incidentIds: Object.freeze(incidentIds),
      correlationGroupIds: Object.freeze(correlationGroupIds),
      firstFrame,
      lastFrame,
      occurrenceCount,
      incidentCount: bucket.length,
      confidence,
      affectedCategories: Object.freeze(affectedCategories),
      summary: `${bucket.length} incident(s) consolidate under ${rootCauseKey}; ${occurrenceCount} root-cause occurrence(s) across frames #${firstFrame}–#${lastFrame}.`,
    }));
  }

  return Object.freeze({
    cases: Object.freeze(cases),
    unconsolidatedIncidentIds: Object.freeze(uniqueSorted(unconsolidatedIncidentIds)),
    summary: `${cases.length} root-cause case(s); ${incidents.length} incident(s); ${unconsolidatedIncidentIds.length} unconsolidated incident(s).`,
  });
}
