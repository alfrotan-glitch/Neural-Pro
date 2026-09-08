import type { RenderDiagnosticMismatchIncident } from './renderDiagnosticMismatchClustering';
import type { RenderDiagnosticIncidentCorrelationResult } from './renderDiagnosticIncidentCorrelation';
import type { RenderDiagnosticCausalGraph } from './renderDiagnosticCausalGraph';

export type RenderDiagnosticTimelineEventType =
  | 'incident-start'
  | 'incident-end'
  | 'root-cause'
  | 'contributing'
  | 'consequence'
  | 'correlation-group';

export interface RenderDiagnosticTimelineEvent {
  readonly eventId: string;
  readonly type: RenderDiagnosticTimelineEventType;
  readonly frame: number;
  readonly time: number;
  readonly incidentId?: string;
  readonly groupId?: string;
  readonly category?: string;
  readonly role?: 'root-cause' | 'contributing' | 'consequence' | 'co-occurring';
  readonly label: string;
  readonly confidence?: number;
}

export interface RenderDiagnosticIncidentTimeline {
  readonly events: readonly RenderDiagnosticTimelineEvent[];
  readonly firstFrame?: number;
  readonly lastFrame?: number;
  readonly incidentCount: number;
  readonly correlationGroupCount: number;
  readonly rootCauseCount: number;
  readonly summary: string;
}

function roleForGraphRole(role: RenderDiagnosticTimelineEvent['role']): Extract<RenderDiagnosticTimelineEventType, 'root-cause' | 'contributing' | 'consequence'> {
  if (role === 'root-cause') return 'root-cause';
  if (role === 'contributing') return 'contributing';
  return 'consequence';
}

/**
 * Builds a deterministic end-to-end incident timeline from canonical
 * mismatch incidents, causal graphs, and cross-incident correlation groups.
 * This function never mutates any supplied diagnostic data.
 */
export function buildDiagnosticIncidentTimeline(
  incidents: readonly RenderDiagnosticMismatchIncident[],
  graphs: readonly RenderDiagnosticCausalGraph[],
  correlation?: RenderDiagnosticIncidentCorrelationResult,
): RenderDiagnosticIncidentTimeline {
  const events: RenderDiagnosticTimelineEvent[] = [];

  for (const incident of incidents) {
    events.push(Object.freeze({
      eventId: `${incident.incidentId}:start`,
      type: 'incident-start',
      frame: incident.startFrame,
      time: incident.startTime,
      incidentId: incident.incidentId,
      category: incident.dominantCategory,
      label: `Incident ${incident.incidentId} started`,
    }));
    events.push(Object.freeze({
      eventId: `${incident.incidentId}:end`,
      type: 'incident-end',
      frame: incident.endFrame,
      time: incident.endTime,
      incidentId: incident.incidentId,
      category: incident.dominantCategory,
      label: `Incident ${incident.incidentId} ended`,
    }));

    const graph = graphs.find((candidate) => candidate.incidentId === incident.incidentId);
    if (!graph) continue;
    for (const node of graph.nodes) {
      const eventType = roleForGraphRole(node.role);
      events.push(Object.freeze({
        eventId: `${incident.incidentId}:${node.nodeId}`,
        type: eventType,
        frame: node.firstFrame,
        time: node.firstFrame > 0 ? node.firstFrame : incident.startTime,
        incidentId: incident.incidentId,
        category: node.category,
        role: node.role,
        label: `${node.role}: ${node.category}`,
        confidence: node.confidence,
      }));
    }
  }

  for (const group of correlation?.groups ?? []) {
    events.push(Object.freeze({
      eventId: `${group.groupId}:timeline`,
      type: 'correlation-group',
      frame: group.firstFrame,
      time: group.firstFrame,
      groupId: group.groupId,
      label: group.summary,
      confidence: group.confidence,
    }));
  }

  events.sort((a, b) => (
    a.frame - b.frame
    || a.time - b.time
    || a.type.localeCompare(b.type)
    || a.eventId.localeCompare(b.eventId)
  ));

  const rootCauseCount = events.filter((event) => event.type === 'root-cause').length;
  const firstFrame = events[0]?.frame;
  const lastFrame = events[events.length - 1]?.frame;
  return Object.freeze({
    events: Object.freeze(events),
    firstFrame,
    lastFrame,
    incidentCount: incidents.length,
    correlationGroupCount: (correlation?.groups ?? []).filter((group) => group.incidentIds.length > 1).length,
    rootCauseCount,
    summary: `${incidents.length} incident(s), ${rootCauseCount} root-cause event(s), ${(correlation?.groups ?? []).filter((group) => group.incidentIds.length > 1).length} correlated group(s).`,
  });
}
