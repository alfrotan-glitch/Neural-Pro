import type { RenderDiagnosticFrameResult } from './renderDiagnosticFrameNavigator';
import type { RenderDiagnosticCausalGraph } from './renderDiagnosticCausalGraph';
import type { RenderDiagnosticIncidentCorrelationResult } from './renderDiagnosticIncidentCorrelation';
import type { RenderDiagnosticMismatchIncident } from './renderDiagnosticMismatchClustering';
import type { RenderDiagnosticRootCauseCase } from './renderDiagnosticRootCauseConsolidation';
import type { RenderSnapshotDiffCategory } from './renderSnapshotDiff';

export interface RenderDiagnosticRootCauseEvidenceItem {
  readonly evidenceId: string;
  readonly incidentId: string;
  readonly role: 'root-cause' | 'contributing' | 'consequence' | 'co-occurring';
  readonly category: RenderSnapshotDiffCategory;
  readonly firstFrame: number;
  readonly lastFrame: number;
  readonly occurrenceCount: number;
  readonly confidence: number;
  readonly field?: string;
  readonly clipId?: string;
  readonly previous?: unknown;
  readonly next?: unknown;
}

export interface RenderDiagnosticRootCauseFrameEvidence {
  readonly frame: number;
  readonly time: number;
  readonly previewHash: string;
  readonly exportHash: string;
  readonly categories: readonly RenderSnapshotDiffCategory[];
  readonly entryCount: number;
}

export interface RenderDiagnosticRootCauseIncidentEvidence {
  readonly incidentId: string;
  readonly firstFrame: number;
  readonly lastFrame: number;
  readonly categories: readonly RenderSnapshotDiffCategory[];
  readonly firstCauseCategory?: RenderSnapshotDiffCategory;
  readonly firstCauseField?: string;
  readonly firstCauseClipId?: string;
}

export interface RenderDiagnosticRootCauseCorrelationEvidence {
  readonly groupId: string;
  readonly incidentIds: readonly string[];
  readonly firstFrame: number;
  readonly lastFrame: number;
  readonly confidence: number;
  readonly summary: string;
}

export interface RenderDiagnosticRootCauseCausalPathEvidence {
  readonly incidentId: string;
  readonly nodeIds: readonly string[];
  readonly categories: readonly RenderSnapshotDiffCategory[];
  readonly rootNodeId?: string;
}

export interface RenderDiagnosticRootCauseCaseEvidence {
  readonly caseId: string;
  readonly incidentEvidence: readonly RenderDiagnosticRootCauseIncidentEvidence[];
  readonly rootCauseEvidence: readonly RenderDiagnosticRootCauseEvidenceItem[];
  readonly causalPaths: readonly RenderDiagnosticRootCauseCausalPathEvidence[];
  readonly correlationEvidence: readonly RenderDiagnosticRootCauseCorrelationEvidence[];
  readonly frameEvidence: readonly RenderDiagnosticRootCauseFrameEvidence[];
  readonly summary: string;
}

export interface RenderDiagnosticRootCauseEvidenceExplorerResult {
  readonly cases: readonly RenderDiagnosticRootCauseCaseEvidence[];
  readonly summary: string;
}

function uniqueSorted<T extends string>(values: readonly T[]): T[] {
  return [...new Set(values)].sort();
}

function incidentById(
  incidents: readonly RenderDiagnosticMismatchIncident[],
  incidentId: string,
): RenderDiagnosticMismatchIncident | undefined {
  return incidents.find((incident) => incident.incidentId === incidentId);
}

function graphByIncident(
  graphs: readonly RenderDiagnosticCausalGraph[],
  incidentId: string,
): RenderDiagnosticCausalGraph | undefined {
  return graphs.find((graph) => graph.incidentId === incidentId);
}

function correlationById(
  correlation: RenderDiagnosticIncidentCorrelationResult | undefined,
  groupId: string,
): RenderDiagnosticRootCauseCorrelationEvidence | undefined {
  const group = correlation?.groups.find((candidate) => candidate.groupId === groupId);
  if (!group) return undefined;
  return Object.freeze({
    groupId: group.groupId,
    incidentIds: Object.freeze([...group.incidentIds]),
    firstFrame: group.firstFrame,
    lastFrame: group.lastFrame,
    confidence: group.confidence,
    summary: group.summary,
  });
}

/**
 * Builds a traceable, read-only evidence view for consolidated root-cause cases.
 * canonical incidents, frames, causal graphs, and correlation groups remain the
 * source of truth; this service only projects them into an explorer-friendly model.
 */
export function buildRootCauseEvidenceExplorer(
  rootCauseConsolidation: { readonly cases: readonly RenderDiagnosticRootCauseCase[] },
  incidents: readonly RenderDiagnosticMismatchIncident[],
  frames: readonly RenderDiagnosticFrameResult[],
  graphs: readonly RenderDiagnosticCausalGraph[],
  correlation?: RenderDiagnosticIncidentCorrelationResult,
): RenderDiagnosticRootCauseEvidenceExplorerResult {
  const sortedFrames = frames.slice().sort((a, b) => a.frameIndex - b.frameIndex);
  const cases = rootCauseConsolidation.cases.map((rootCase) => {
    const caseIncidents = rootCase.incidentIds
      .map((incidentId) => incidentById(incidents, incidentId))
      .filter((incident): incident is RenderDiagnosticMismatchIncident => Boolean(incident))
      .sort((a, b) => a.startFrame - b.startFrame || a.incidentId.localeCompare(b.incidentId));

    const rootCauseEvidence: RenderDiagnosticRootCauseEvidenceItem[] = [];
    for (const incident of caseIncidents) {
      const graph = graphByIncident(graphs, incident.incidentId);
      for (const node of graph?.nodes ?? []) {
        rootCauseEvidence.push(Object.freeze({
          evidenceId: `${rootCase.caseId}:${incident.incidentId}:${node.nodeId}`,
          incidentId: incident.incidentId,
          role: node.role,
          category: node.category,
          firstFrame: node.firstFrame,
          lastFrame: node.lastFrame,
          occurrenceCount: node.occurrences,
          confidence: node.confidence,
          field: incident.firstCause?.category === node.category ? incident.firstCause.field : undefined,
          clipId: incident.firstCause?.category === node.category ? incident.firstCause.clipId : undefined,
          previous: incident.firstCause?.category === node.category ? incident.firstCause.previous : undefined,
          next: incident.firstCause?.category === node.category ? incident.firstCause.next : undefined,
        }));
      }
    }
    rootCauseEvidence.sort((a, b) => b.confidence - a.confidence || a.firstFrame - b.firstFrame || a.evidenceId.localeCompare(b.evidenceId));

    const causalPaths = caseIncidents.map((incident) => {
      const graph = graphByIncident(graphs, incident.incidentId);
      const nodes = graph?.nodes.slice().sort((a, b) => a.firstFrame - b.firstFrame || a.category.localeCompare(b.category)) ?? [];
      return Object.freeze({
        incidentId: incident.incidentId,
        nodeIds: Object.freeze(nodes.map((node) => node.nodeId)),
        categories: Object.freeze(nodes.map((node) => node.category)),
        rootNodeId: graph?.rootNodeId,
      });
    });

    const correlationEvidence = rootCase.correlationGroupIds
      .map((groupId) => correlationById(correlation, groupId))
      .filter((group): group is RenderDiagnosticRootCauseCorrelationEvidence => Boolean(group))
      .sort((a, b) => a.firstFrame - b.firstFrame || a.groupId.localeCompare(b.groupId));

    const incidentEvidence = caseIncidents.map((incident) => Object.freeze({
      incidentId: incident.incidentId,
      firstFrame: incident.startFrame,
      lastFrame: incident.endFrame,
      categories: Object.freeze([...incident.categories]),
      firstCauseCategory: incident.firstCause?.category,
      firstCauseField: incident.firstCause?.field,
      firstCauseClipId: incident.firstCause?.clipId,
    }));

    const incidentIdSet = new Set(rootCase.incidentIds);
    const frameEvidence = sortedFrames
      .filter((frame) => frame.frameIndex >= rootCase.firstFrame && frame.frameIndex <= rootCase.lastFrame)
      .filter((frame) => frame.bundle.equal === false)
      .filter((frame) => {
        return caseIncidents.some((incident) => incidentIdSet.has(incident.incidentId)
          && frame.frameIndex >= incident.startFrame && frame.frameIndex <= incident.endFrame);
      })
      .map((frame) => Object.freeze({
        frame: frame.frameIndex,
        time: frame.projectTime,
        previewHash: frame.bundle.previewHash,
        exportHash: frame.bundle.exportHash,
        categories: Object.freeze(uniqueSorted(frame.bundle.diagnostic.categories)),
        entryCount: frame.bundle.diagnostic.entries.length,
      }));

    return Object.freeze({
      caseId: rootCase.caseId,
      incidentEvidence: Object.freeze(incidentEvidence),
      rootCauseEvidence: Object.freeze(rootCauseEvidence),
      causalPaths: Object.freeze(causalPaths),
      correlationEvidence: Object.freeze(correlationEvidence),
      frameEvidence: Object.freeze(frameEvidence),
      summary: `${rootCase.caseId}: ${rootCauseEvidence.length} causal evidence item(s), ${frameEvidence.length} mismatch frame(s), ${correlationEvidence.length} correlation group(s).`,
    });
  });

  return Object.freeze({
    cases: Object.freeze(cases),
    summary: `${cases.length} root-cause case(s) exposed with traceable incident, frame, causality, and correlation evidence.`,
  });
}
