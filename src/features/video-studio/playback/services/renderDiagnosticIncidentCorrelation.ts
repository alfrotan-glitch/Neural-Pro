import type { RenderDiagnosticMismatchIncident } from './renderDiagnosticMismatchClustering';

export interface RenderDiagnosticIncidentCorrelationGroup {
  readonly groupId: string;
  readonly incidentIds: readonly string[];
  readonly categories: readonly string[];
  readonly firstFrame: number;
  readonly lastFrame: number;
  readonly sharedCauseKey?: string;
  readonly confidence: number;
  readonly summary: string;
}

export interface RenderDiagnosticIncidentCorrelationResult {
  readonly groups: readonly RenderDiagnosticIncidentCorrelationGroup[];
  readonly ungroupedIncidentIds: readonly string[];
  readonly summary: string;
}

function firstCauseKey(incident: RenderDiagnosticMismatchIncident): string | undefined {
  const cause = incident.firstCause;
  if (!cause) return undefined;
  return [cause.category, cause.clipId ?? 'project', cause.field].join('|');
}

function overlap(a: RenderDiagnosticMismatchIncident, b: RenderDiagnosticMismatchIncident): boolean {
  return a.startFrame <= b.endFrame + 1 && b.startFrame <= a.endFrame + 1;
}

/** Correlates incidents using deterministic temporal adjacency and shared first-cause evidence. */
export function correlateDiagnosticIncidents(
  incidents: readonly RenderDiagnosticMismatchIncident[],
): RenderDiagnosticIncidentCorrelationResult {
  const sorted = incidents.slice().sort((a, b) => a.startFrame - b.startFrame || a.incidentId.localeCompare(b.incidentId));
  const groups: RenderDiagnosticIncidentCorrelationGroup[] = [];
  const assigned = new Set<string>();

  for (const seed of sorted) {
    if (assigned.has(seed.incidentId)) continue;
    const members: RenderDiagnosticMismatchIncident[] = [seed];
    assigned.add(seed.incidentId);
    const seedCause = firstCauseKey(seed);

    for (const candidate of sorted) {
      if (assigned.has(candidate.incidentId)) continue;
      const sharedCause = Boolean(seedCause && firstCauseKey(candidate) === seedCause);
      const near = overlap(seed, candidate);
      if (!sharedCause && !near) continue;
      members.push(candidate);
      assigned.add(candidate.incidentId);
    }

    const categorySet = new Set<string>();
    for (const member of members) member.categories.forEach((category) => categorySet.add(category));
    const sharedCauseCount = seedCause ? members.filter((member) => firstCauseKey(member) === seedCause).length : 0;
    const confidence = Math.min(1, (sharedCauseCount / members.length) * 0.7 + (members.length > 1 ? 0.3 : 0));
    groups.push(Object.freeze({
      groupId: `incident-correlation-${groups.length + 1}`,
      incidentIds: Object.freeze(members.map((member) => member.incidentId)),
      categories: Object.freeze([...categorySet].sort()),
      firstFrame: Math.min(...members.map((member) => member.startFrame)),
      lastFrame: Math.max(...members.map((member) => member.endFrame)),
      sharedCauseKey: seedCause,
      confidence: Number(confidence.toFixed(6)),
      summary: seedCause
        ? `${members.length} incident(s) correlate around ${seedCause}.`
        : `${members.length} temporally adjacent incident(s) correlate.`,
    }));
  }

  const correlatedIncidentIds = new Set(groups.filter((group) => group.incidentIds.length > 1).flatMap((group) => group.incidentIds));
  const ungroupedIncidentIds = sorted.filter((incident) => !correlatedIncidentIds.has(incident.incidentId)).map((incident) => incident.incidentId);
  return Object.freeze({
    groups: Object.freeze(groups),
    ungroupedIncidentIds: Object.freeze(ungroupedIncidentIds),
    summary: `${groups.length} correlation group(s); ${correlatedIncidentIds.size} incident(s) correlated.`,
  });
}
