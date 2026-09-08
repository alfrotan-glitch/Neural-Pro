import type { RenderSnapshotDiffCategory } from './renderSnapshotDiff';
import type { RenderDiagnosticFrameResult } from './renderDiagnosticFrameNavigator';
import type { RenderDiagnosticMismatchIncident } from './renderDiagnosticMismatchClustering';
import { analyzeMismatchIncidentCausality, type RenderDiagnosticCausalEvidence } from './renderDiagnosticCausality';

export interface RenderDiagnosticCausalGraphNode {
  readonly nodeId: string;
  readonly category: RenderSnapshotDiffCategory;
  readonly firstFrame: number;
  readonly lastFrame: number;
  readonly occurrences: number;
  readonly confidence: number;
  readonly role: RenderDiagnosticCausalEvidence['role'];
}

export interface RenderDiagnosticCausalGraphEdge {
  readonly edgeId: string;
  readonly fromNodeId: string;
  readonly toNodeId: string;
  readonly fromCategory: RenderSnapshotDiffCategory;
  readonly toCategory: RenderSnapshotDiffCategory;
  readonly firstFromFrame: number;
  readonly firstToFrame: number;
  readonly leadFrames: number;
  readonly strength: number;
}

export interface RenderDiagnosticCausalGraph {
  readonly incidentId: string;
  readonly nodes: readonly RenderDiagnosticCausalGraphNode[];
  readonly edges: readonly RenderDiagnosticCausalGraphEdge[];
  readonly rootNodeId?: string;
  readonly summary: string;
}

function nodeId(category: RenderSnapshotDiffCategory): string {
  return `cause:${category}`;
}

function evidenceLastFrame(evidence: RenderDiagnosticCausalEvidence): number {
  return evidence.firstFrame + Math.max(0, evidence.leadingFrames);
}

/**
 * Builds a deterministic temporal dependency graph from a mismatch incident.
 * Edges point from categories that first appear earlier to categories that
 * first appear later. Strength combines temporal lead and persistence/frequency
 * evidence already computed by the canonical causality analyzer.
 */
export function buildCausalDependencyGraph(
  incident: RenderDiagnosticMismatchIncident,
  frames: readonly RenderDiagnosticFrameResult[],
): RenderDiagnosticCausalGraph {
  const analysis = analyzeMismatchIncidentCausality(incident, frames);
  const nodes = analysis.evidence
    .map((evidence) => Object.freeze({
      nodeId: nodeId(evidence.category),
      category: evidence.category,
      firstFrame: evidence.firstFrame,
      lastFrame: evidenceLastFrame(evidence),
      occurrences: evidence.occurrenceCount,
      confidence: evidence.confidence,
      role: evidence.role,
    }))
    .sort((a, b) => a.firstFrame - b.firstFrame || a.category.localeCompare(b.category));

  const edges: RenderDiagnosticCausalGraphEdge[] = [];
  for (const from of nodes) {
    for (const to of nodes) {
      if (from.nodeId === to.nodeId || to.firstFrame < from.firstFrame) continue;
      const leadFrames = to.firstFrame - from.firstFrame;
      if (leadFrames === 0) continue;
      const temporalStrength = 1 / (1 + leadFrames);
      const evidenceStrength = Math.min(1, (from.occurrences + to.occurrences) / Math.max(1, frames.length * 2));
      edges.push(Object.freeze({
        edgeId: `${from.nodeId}->${to.nodeId}`,
        fromNodeId: from.nodeId,
        toNodeId: to.nodeId,
        fromCategory: from.category,
        toCategory: to.category,
        firstFromFrame: from.firstFrame,
        firstToFrame: to.firstFrame,
        leadFrames,
        strength: Number((temporalStrength * 0.7 + evidenceStrength * 0.3).toFixed(6)),
      }));
    }
  }

  edges.sort((a, b) => b.strength - a.strength || a.leadFrames - b.leadFrames || a.edgeId.localeCompare(b.edgeId));
  const rootNodeId = analysis.rootCause ? nodeId(analysis.rootCause.category) : nodes[0]?.nodeId;
  const summary = rootNodeId
    ? `Root ${rootNodeId.replace('cause:', '')}; ${nodes.length} node(s), ${edges.length} temporal edge(s).`
    : 'No causal graph evidence was identified.';

  return Object.freeze({
    incidentId: incident.incidentId,
    nodes: Object.freeze(nodes),
    edges: Object.freeze(edges),
    rootNodeId,
    summary,
  });
}

export function graphPathFromRoot(graph: RenderDiagnosticCausalGraph): string[] {
  if (!graph.rootNodeId) return [];
  const path: string[] = [graph.rootNodeId];
  const seen = new Set(path);
  let current = graph.rootNodeId;
  while (true) {
    const next = graph.edges.find((edge) => edge.fromNodeId === current && !seen.has(edge.toNodeId));
    if (!next) break;
    path.push(next.toNodeId);
    seen.add(next.toNodeId);
    current = next.toNodeId;
  }
  return path;
}
