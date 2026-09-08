import React, { useCallback, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clipboard, RefreshCw, ShieldCheck, Upload } from 'lucide-react';
import {
  loadRenderDiagnosticBundle,
  type RenderDiagnosticBundle,
  type RenderDiagnosticBundleStore,
} from '../services/renderDiagnosticBundle';
import { replayRenderDiagnosticPayload } from '../services/renderDiagnosticReplay';
import { stepDiagnosticFrame } from '../services/renderDiagnosticFrameNavigator';
import type { Track } from '../../project/types/project';
import type { ElementAnimation } from '../../animation/types/animation';
import { captureDiagnosticFrameRange, type RenderDiagnosticMultiFrameCaptureResult } from '../services/renderDiagnosticMultiFrameCapture';
import { clusterDiagnosticMismatches, summarizeMismatchRootCause, type RenderDiagnosticMismatchClusteringResult } from '../services/renderDiagnosticMismatchClustering';
import { analyzeMismatchIncidentCausality, summarizeCausality } from '../services/renderDiagnosticCausality';
import { buildCausalDependencyGraph, graphPathFromRoot, type RenderDiagnosticCausalGraph } from '../services/renderDiagnosticCausalGraph';
import { correlateDiagnosticIncidents } from '../services/renderDiagnosticIncidentCorrelation';
import { buildDiagnosticIncidentTimeline, type RenderDiagnosticIncidentTimeline } from '../services/renderDiagnosticIncidentTimeline';
import { consolidateDiagnosticRootCauses, type RenderDiagnosticRootCauseConsolidationResult } from '../services/renderDiagnosticRootCauseConsolidation';
import { buildRootCauseEvidenceExplorer, type RenderDiagnosticRootCauseCaseEvidence } from '../services/renderDiagnosticRootCauseEvidence';
import { buildRootCauseDiffInspector, type RenderDiagnosticRootCauseDiffInspectorCase } from '../services/renderDiagnosticRootCauseDiffInspector';
import { buildRootCauseEvidenceComparison, type RenderDiagnosticRootCauseEvidenceComparisonPair } from '../services/renderDiagnosticRootCauseEvidenceComparison';

interface RenderDiagnosticReplayViewerProps {
  readonly projectId: string;
  readonly tracks?: readonly Track[];
  readonly animations?: readonly ElementAnimation[];
  readonly bundleStore?: RenderDiagnosticBundleStore;
  readonly initialBundle?: RenderDiagnosticBundle;
  readonly defaultKey?: string;
  readonly frameRate?: number;
  readonly durationSeconds?: number;
  readonly onNavigateToProjectTime?: (time: number) => void;
  readonly resolveBundleAtTime?: (time: number) => Promise<RenderDiagnosticBundle | undefined> | RenderDiagnosticBundle | undefined;
}

const browserStore: RenderDiagnosticBundleStore = {
  save(key, serializedBundle) {
    window.localStorage.setItem(key, serializedBundle);
  },
  load(key) {
    return window.localStorage.getItem(key) ?? undefined;
  },
};

function formatTime(time: number): string {
  return `${time.toFixed(3)}s`;
}

export const RenderDiagnosticReplayViewer: React.FC<RenderDiagnosticReplayViewerProps> = ({
  projectId,
  tracks = [],
  animations = [],
  bundleStore = typeof window === 'undefined' ? undefined : browserStore,
  initialBundle,
  defaultKey = `video-studio:render-diagnostic:${projectId}`,
  frameRate = 30,
  durationSeconds,
  onNavigateToProjectTime,
  resolveBundleAtTime,
}) => {
  const [bundleKey, setBundleKey] = useState(defaultKey);
  const [bundle, setBundle] = useState<RenderDiagnosticBundle | undefined>(initialBundle);
  const [rawJson, setRawJson] = useState('');
  const [status, setStatus] = useState<'idle' | 'loaded' | 'error'>('idle');
  const [error, setError] = useState('');
  const [replay, setReplay] = useState<ReturnType<typeof replayRenderDiagnosticPayload> | undefined>();
  const [navigationTime, setNavigationTime] = useState<number | undefined>(initialBundle?.projectTime);
  const [rangeCapture, setRangeCapture] = useState<RenderDiagnosticMultiFrameCaptureResult | undefined>();
  const [mismatchClustering, setMismatchClustering] = useState<RenderDiagnosticMismatchClusteringResult | undefined>();
  const [selectedCausalNodeId, setSelectedCausalNodeId] = useState<string | undefined>();
  const [selectedIncidentId, setSelectedIncidentId] = useState<string | undefined>();
  const [selectedRootCauseCaseId, setSelectedRootCauseCaseId] = useState<string | undefined>();
  const incidentCorrelation = useMemo(() => mismatchClustering ? correlateDiagnosticIncidents(mismatchClustering.incidents) : undefined, [mismatchClustering]);
  const incidentTimeline = useMemo<RenderDiagnosticIncidentTimeline | undefined>(() => {
    if (!mismatchClustering || !rangeCapture) return undefined;
    const graphs = mismatchClustering.incidents.map((incident) => buildCausalDependencyGraph(incident, rangeCapture.frames));
    return buildDiagnosticIncidentTimeline(mismatchClustering.incidents, graphs, incidentCorrelation);
  }, [incidentCorrelation, mismatchClustering, rangeCapture]);
  const rootCauseConsolidation = useMemo<RenderDiagnosticRootCauseConsolidationResult | undefined>(() => {
    if (!mismatchClustering || !rangeCapture) return undefined;
    const graphs = mismatchClustering.incidents.map((incident) => buildCausalDependencyGraph(incident, rangeCapture.frames));
    return consolidateDiagnosticRootCauses(mismatchClustering.incidents, graphs, rangeCapture.frames, incidentCorrelation);
  }, [incidentCorrelation, mismatchClustering, rangeCapture]);
  const rootCauseEvidenceExplorer = useMemo(() => {
    if (!rootCauseConsolidation || !mismatchClustering || !rangeCapture) return undefined;
    const graphs = mismatchClustering.incidents.map((incident) => buildCausalDependencyGraph(incident, rangeCapture.frames));
    return buildRootCauseEvidenceExplorer(rootCauseConsolidation, mismatchClustering.incidents, rangeCapture.frames, graphs, incidentCorrelation);
  }, [incidentCorrelation, mismatchClustering, rangeCapture, rootCauseConsolidation]);
  const rootCauseDiffInspector = useMemo(() => {
    if (!rootCauseEvidenceExplorer || !rangeCapture) return undefined;
    return buildRootCauseDiffInspector(rootCauseEvidenceExplorer, rangeCapture.frames);
  }, [rangeCapture, rootCauseEvidenceExplorer]);
  const selectedRootCauseDiffs = useMemo<RenderDiagnosticRootCauseDiffInspectorCase | undefined>(() => {
    if (!rootCauseDiffInspector || rootCauseDiffInspector.cases.length === 0) return undefined;
    return rootCauseDiffInspector.cases.find((item) => item.caseId === selectedRootCauseCaseId) ?? rootCauseDiffInspector.cases[0];
  }, [rootCauseDiffInspector, selectedRootCauseCaseId]);
  const selectedRootCauseEvidence = useMemo<RenderDiagnosticRootCauseCaseEvidence | undefined>(() => {
    if (!rootCauseEvidenceExplorer || rootCauseEvidenceExplorer.cases.length === 0) return undefined;
    return rootCauseEvidenceExplorer.cases.find((item) => item.caseId === selectedRootCauseCaseId) ?? rootCauseEvidenceExplorer.cases[0];
  }, [rootCauseEvidenceExplorer, selectedRootCauseCaseId]);
  const rootCauseEvidenceComparison = useMemo(() => {
    if (!rootCauseEvidenceExplorer || !rootCauseDiffInspector) return undefined;
    return buildRootCauseEvidenceComparison(rootCauseEvidenceExplorer, rootCauseDiffInspector);
  }, [rootCauseDiffInspector, rootCauseEvidenceExplorer]);

  const selectedRootCauseComparisonPairs = useMemo<readonly RenderDiagnosticRootCauseEvidenceComparisonPair[]>(() => {
    if (!rootCauseEvidenceComparison || !selectedRootCauseCaseId) return [];
    return rootCauseEvidenceComparison.pairs.filter((pair) => pair.leftCaseId === selectedRootCauseCaseId || pair.rightCaseId === selectedRootCauseCaseId);
  }, [rootCauseEvidenceComparison, selectedRootCauseCaseId]);


  const store = bundleStore;
  const disabled = !store;

  const loadSaved = useCallback(async () => {
    if (!store) return;
    try {
      const next = await loadRenderDiagnosticBundle(store, bundleKey);
      if (!next) throw new Error(`No diagnostic bundle found for key: ${bundleKey}`);
      setBundle(next);
      setReplay(next.replay
        ? replayRenderDiagnosticPayload(next.replay, next.previewHash, next.exportHash)
        : undefined);
      setStatus('loaded');
      setError('');
    } catch (cause) {
      setStatus('error');
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }, [bundleKey, store]);

  const loadJson = useCallback(() => {
    try {
      const parsed = JSON.parse(rawJson) as RenderDiagnosticBundle;
      setBundle(parsed);
      setReplay(parsed.replay
        ? replayRenderDiagnosticPayload(parsed.replay, parsed.previewHash, parsed.exportHash)
        : undefined);
      setStatus('loaded');
      setError('');
    } catch (cause) {
      setStatus('error');
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }, [rawJson]);

  const navigateToTime = useCallback(async (requestedTime: number) => {
    const boundedTime = Math.max(0, Number.isFinite(durationSeconds ?? Number.POSITIVE_INFINITY) ? Math.min(requestedTime, durationSeconds ?? Number.POSITIVE_INFINITY) : requestedTime);
    setNavigationTime(boundedTime);
    onNavigateToProjectTime?.(boundedTime);
    if (!resolveBundleAtTime) return;
    try {
      const resolved = await resolveBundleAtTime(boundedTime);
      if (!resolved) return;
      setBundle(resolved);
      setReplay(resolved.replay
        ? replayRenderDiagnosticPayload(resolved.replay, resolved.previewHash, resolved.exportHash)
        : undefined);
      setStatus('loaded');
      setError('');
    } catch (cause) {
      setStatus('error');
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }, [durationSeconds, onNavigateToProjectTime, resolveBundleAtTime]);

  const captureRange = useCallback(() => {
    if (!durationSeconds) return;
    try {
      const start = Math.min(navigationTime ?? bundle?.projectTime ?? 0, durationSeconds);
      const end = Math.max(start, Math.min(durationSeconds, (navigationTime ?? bundle?.projectTime ?? 0) + 1));
      const result = captureDiagnosticFrameRange({
        projectId,
        tracks,
        animations,
        startTime: start,
        endTime: end,
        fps: frameRate,
        durationSeconds,
      });
      setRangeCapture(result);
      setMismatchClustering(clusterDiagnosticMismatches(result.frames));
    } catch (cause) {
      setStatus('error');
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }, [animations, bundle?.projectTime, durationSeconds, frameRate, navigationTime, projectId, tracks]);

  const categoryEntries = useMemo(() => {
    const entries = replay?.diagnostic.entries ?? bundle?.diagnostic.entries ?? [];
    return entries;
  }, [bundle, replay]);

  return (
    <div className="h-full overflow-auto p-4 space-y-4 bg-[#090a0e] text-white">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-purple-400" />
            <h3 className="text-[11px] font-black uppercase tracking-wider">Render Diagnostic Replay</h3>
          </div>
          <p className="text-[8px] text-gray-500 mt-1">Load a persisted Preview↔Export bundle and verify its hashes without replaying Media.</p>
        </div>
        {replay && (
          <span className={`text-[8px] font-black uppercase px-2 py-1 rounded-md border ${replay.deterministic && replay.gatePassed
            ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
            : 'border-amber-500/30 bg-amber-500/10 text-amber-300'}`}>
            {replay.deterministic && replay.gatePassed ? 'Replay PASS' : 'Replay REVIEW'}
          </span>
        )}
      </div>

      <div className="grid grid-cols-[1fr_auto] gap-2">
        <input
          value={bundleKey}
          onChange={(e) => setBundleKey(e.target.value)}
          aria-label="Diagnostic bundle key"
          className="min-w-0 bg-[#11131a] border border-white/10 rounded-lg px-2.5 py-2 text-[9px] font-mono text-gray-300 outline-none focus:border-purple-500/50"
          placeholder="diagnostic bundle key"
        />
        <button
          type="button"
          disabled={disabled}
          onClick={() => void loadSaved()}
          className="px-3 py-2 rounded-lg bg-purple-500/10 border border-purple-500/20 text-purple-300 text-[9px] font-bold uppercase flex items-center gap-1.5 disabled:opacity-40"
        >
          <RefreshCw className="w-3 h-3" /> Load Saved
        </button>
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Upload className="w-3.5 h-3.5 text-gray-400" />
          <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">Paste Bundle JSON</span>
        </div>
        <textarea
          value={rawJson}
          onChange={(e) => setRawJson(e.target.value)}
          aria-label="Diagnostic bundle JSON"
          placeholder="Paste a persisted render diagnostic bundle here..."
          className="w-full h-28 resize-y bg-[#050608] border border-white/5 rounded-lg p-2 text-[8px] font-mono text-gray-400 outline-none focus:border-purple-500/40"
        />
        <button
          type="button"
          onClick={loadJson}
          disabled={!rawJson.trim()}
          className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-[8px] font-bold uppercase disabled:opacity-40"
        >
          Load JSON
        </button>
      </div>

      {status === 'error' && (
        <div role="alert" className="flex gap-2 p-3 rounded-lg border border-red-500/20 bg-red-500/5 text-red-300 text-[8px]">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {bundle && (
        <div className="space-y-3">
          <div className="space-y-2 p-3 rounded-lg border border-cyan-500/15 bg-cyan-500/[0.03]">
            <div className="flex items-center justify-between">
              <span className="text-[8px] font-bold text-gray-400 uppercase">Frame Navigation</span>
              <span className="text-[8px] font-mono text-cyan-300">@ {((navigationTime ?? bundle.projectTime) * frameRate).toFixed(0)}f</span>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => void navigateToTime(stepDiagnosticFrame(navigationTime ?? bundle.projectTime, -1, frameRate, durationSeconds ?? bundle.projectTime))} className="px-2.5 py-1.5 rounded-md bg-white/5 border border-white/10 text-[8px] font-bold">◀ Frame</button>
              <input
                type="range"
                min={0}
                max={Math.max(0, durationSeconds ?? bundle.projectTime)}
                step={1 / Math.max(1, frameRate)}
                value={Math.min(Math.max(0, navigationTime ?? bundle.projectTime), Math.max(0, durationSeconds ?? bundle.projectTime))}
                onChange={(e) => void navigateToTime(Number(e.target.value))}
                aria-label="Diagnostic project time"
                className="flex-1"
              />
              <button type="button" onClick={() => void navigateToTime(stepDiagnosticFrame(navigationTime ?? bundle.projectTime, 1, frameRate, durationSeconds ?? bundle.projectTime))} className="px-2.5 py-1.5 rounded-md bg-white/5 border border-white/10 text-[8px] font-bold">Frame ▶</button>
            </div>
            <div className="flex items-center justify-between text-[7.5px] text-gray-500 font-mono">
              <span>FPS {frameRate}</span>
              <span>Time {(navigationTime ?? bundle.projectTime).toFixed(3)}s</span>
              <button type="button" onClick={() => void navigateToTime(bundle.projectTime)} className="text-cyan-300 hover:text-cyan-200">Reference Frame</button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="bg-[#11131a] border border-white/5 rounded-lg p-2.5">
              <span className="block text-[7px] text-gray-500 uppercase">Project Time</span>
              <span className="text-[10px] font-mono font-black">{formatTime(bundle.projectTime)}</span>
            </div>
            <div className="bg-[#11131a] border border-white/5 rounded-lg p-2.5">
              <span className="block text-[7px] text-gray-500 uppercase">Project</span>
              <span className="text-[9px] font-mono truncate block">{projectId}</span>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-2 text-[8px] font-mono">
            <div className="bg-[#050608] border border-white/5 rounded-lg p-2.5">
              <span className="block text-gray-500 mb-1">Preview Hash</span>
              <span className="text-purple-300 break-all">{bundle.previewHash}</span>
            </div>
            <div className="bg-[#050608] border border-white/5 rounded-lg p-2.5">
              <span className="block text-gray-500 mb-1">Export Hash</span>
              <span className="text-purple-300 break-all">{bundle.exportHash}</span>
            </div>
          </div>

          <div className="flex items-center justify-between p-2.5 rounded-lg border border-white/5 bg-white/[0.02]">
            <span className="text-[8px] text-gray-400 uppercase font-bold">Stored Gate</span>
            {bundle.equal ? (
              <span className="flex items-center gap-1 text-[8px] text-emerald-300 font-black"><CheckCircle2 className="w-3 h-3" /> PASS</span>
            ) : (
              <span className="flex items-center gap-1 text-[8px] text-red-300 font-black"><AlertTriangle className="w-3 h-3" /> MISMATCH</span>
            )}
          </div>

          {replay && (
            <div className="space-y-2 p-3 rounded-lg border border-white/5 bg-[#11131a]">
              <div className="flex items-center justify-between">
                <span className="text-[8px] font-bold text-gray-400 uppercase">Replay Verification</span>
                <span className="text-[8px] font-mono text-gray-500">schema v{bundle.schemaVersion}</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-[8px] font-mono">
                <span className={replay.recomputedPreviewHash === replay.storedPreviewHash ? 'text-emerald-300' : 'text-red-300'}>Preview recompute: {replay.recomputedPreviewHash}</span>
                <span className={replay.recomputedExportHash === replay.storedExportHash ? 'text-emerald-300' : 'text-red-300'}>Export recompute: {replay.recomputedExportHash}</span>
              </div>
              <div className="flex items-center gap-2 text-[8px] text-gray-400">
                <span>Deterministic: <strong className="text-gray-200">{String(replay.deterministic)}</strong></span>
                <span>Gate: <strong className="text-gray-200">{String(replay.gatePassed)}</strong></span>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[8px] font-bold text-gray-400 uppercase">Diff Entries</span>
              <span className="text-[8px] font-mono text-gray-500">{categoryEntries.length}</span>
            </div>
            {categoryEntries.length === 0 ? (
              <div className="text-[8px] text-emerald-300 bg-emerald-500/5 border border-emerald-500/10 rounded-lg p-2.5">No snapshot differences.</div>
            ) : (
              <div className="space-y-1.5 max-h-60 overflow-auto">
                {categoryEntries.map((entry, index) => (
                  <div key={`${entry.category}-${entry.field}-${index}`} className="p-2 rounded-md bg-[#050608] border border-white/5 text-[7.5px] font-mono">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-purple-300">{entry.category}</span>
                      <span className="text-gray-500">{entry.clipId ?? 'project'}</span>
                    </div>
                    <div className="text-gray-400 mt-1">{entry.field}</div>
                    <div className="text-red-300 break-all">prev: {String(entry.previous)}</div>
                    <div className="text-emerald-300 break-all">next: {String(entry.next)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {durationSeconds !== undefined && (
            <>
            {incidentTimeline && incidentTimeline.events.length > 0 && (
              <div className="space-y-2 p-3 rounded-lg border border-cyan-500/10 bg-[#0b0d12]">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[8px] font-bold text-cyan-300 uppercase">Incident Timeline</span>
                  <span className="text-[7px] text-gray-600 font-mono">{incidentTimeline.events.length} events · {incidentTimeline.incidentCount} incidents</span>
                </div>
                <div className="text-[7px] text-gray-500 font-mono">{incidentTimeline.summary}</div>
                <div className="relative h-9 overflow-x-auto rounded bg-black/20 border border-white/5">
                  <div className="h-full flex items-center gap-1 px-2 w-max min-w-full">
                    {incidentTimeline.events.map((event) => (
                      <button
                        key={event.eventId}
                        type="button"
                        title={`${event.label} · frame ${event.frame}`}
                        onClick={() => { setSelectedIncidentId(event.incidentId); setNavigationTime(event.time); onNavigateToProjectTime?.(event.time); }}
                        className={`h-6 min-w-[9px] px-1 rounded border text-[6px] font-mono ${selectedIncidentId === event.incidentId
                          ? 'border-cyan-400/50 bg-cyan-400/10 text-cyan-200'
                          : event.type === 'root-cause'
                            ? 'border-amber-400/30 bg-amber-400/10 text-amber-300'
                            : event.type === 'correlation-group'
                              ? 'border-purple-400/30 bg-purple-400/10 text-purple-300'
                              : 'border-white/10 bg-white/[0.02] text-gray-500'}`}>
                        #{event.frame}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
            <div className="space-y-2 p-3 rounded-lg border border-white/5 bg-[#11131a]">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[8px] font-bold text-gray-400 uppercase">Frame Range Diagnostics</span>
                <button type="button" onClick={captureRange} className="px-2 py-1 rounded-md bg-purple-500/10 border border-purple-500/20 text-[8px] font-bold text-purple-300 uppercase">Capture 1s</button>
              </div>
              {rangeCapture && (
                <div className="text-[8px] font-mono text-gray-400 space-y-1">
                  <div>Frames: {rangeCapture.startFrame} → {rangeCapture.endFrame}</div>
                  <div>Mismatches: <strong className={rangeCapture.mismatchFrameCount ? 'text-red-300' : 'text-emerald-300'}>{rangeCapture.mismatchFrameCount}</strong></div>
                  <div>First: {rangeCapture.firstMismatchFrame !== undefined ? `#${rangeCapture.firstMismatchFrame} @ ${formatTime(rangeCapture.firstMismatchTime ?? 0)}` : '—'}</div>
                  <div>Last: {rangeCapture.lastMismatchFrame !== undefined ? `#${rangeCapture.lastMismatchFrame} @ ${formatTime(rangeCapture.lastMismatchTime ?? 0)}` : '—'}</div>
                  {mismatchClustering && (
                    <div className="mt-2 pt-2 border-t border-white/5 space-y-1.5">
                      <div className="text-gray-300 font-black uppercase">Mismatch Incidents: {mismatchClustering.incidentCount}</div>
                      {rootCauseConsolidation && rootCauseConsolidation.cases.length > 0 && (
                        <div className="rounded-md bg-amber-500/[0.03] border border-amber-500/10 p-2.5 space-y-1.5">
                          <div className="flex items-center justify-between">
                            <span className="text-amber-300 font-black uppercase">Root-Cause Cases</span>
                            <span className="text-[7px] text-gray-600 font-mono">{rootCauseConsolidation.cases.length} case(s)</span>
                          </div>
                          {rootCauseConsolidation.cases.map((rootCase) => (
                            <button
                              key={rootCase.caseId}
                              type="button"
                              onClick={() => {
                                setSelectedRootCauseCaseId(rootCase.caseId);
                                const time = rootCase.firstFrame / Math.max(1, frameRate);
                                setNavigationTime(time);
                                onNavigateToProjectTime?.(time);
                              }}
                              className="w-full text-left p-2 rounded bg-black/20 border border-white/5 hover:border-amber-400/20"
                            >
                              <div className="flex items-center justify-between gap-2 text-[7px] font-mono">
                                <span className="text-amber-200">{rootCase.caseId}</span>
                                <span className="text-cyan-300">{Math.round(rootCase.confidence * 100)}%</span>
                              </div>
                              <div className="text-[7px] text-gray-400 font-mono mt-1">{rootCase.category} · {rootCase.field ?? '*'}{rootCase.clipId ? ` · ${rootCase.clipId}` : ''}</div>
                              <div className="text-[7px] text-gray-500">Incidents: {rootCase.incidentIds.join(', ')}</div>
                              <div className="text-[7px] text-gray-500">Frames #{rootCase.firstFrame}–#{rootCase.lastFrame} · {rootCase.occurrenceCount} occurrence(s)</div>
                              <div className="text-[7px] text-gray-400 mt-1">Affected: {rootCase.affectedCategories.join(', ') || '—'}</div>
                            </button>
                          ))}
                        </div>
                      )}
                      {selectedRootCauseEvidence && rootCauseEvidenceExplorer && (
                        <div className="rounded-md bg-purple-500/[0.03] border border-purple-500/10 p-2.5 space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-purple-300 font-black uppercase">Root-Cause Evidence Explorer</span>
                            <span className="text-[7px] text-gray-600 font-mono">{rootCauseEvidenceExplorer.cases.length} case(s)</span>
                          </div>
                          <div className="text-[7px] text-gray-500 font-mono">{selectedRootCauseEvidence.summary}</div>
                          <div className="flex flex-wrap gap-1">
                            {rootCauseEvidenceExplorer.cases.map((evidenceCase) => (
                              <button
                                key={evidenceCase.caseId}
                                type="button"
                                onClick={() => setSelectedRootCauseCaseId(evidenceCase.caseId)}
                                className={`px-2 py-1 rounded border text-[7px] font-mono ${selectedRootCauseEvidence.caseId === evidenceCase.caseId ? 'border-purple-400/40 bg-purple-400/10 text-purple-200' : 'border-white/10 bg-black/20 text-gray-500'}`}
                              >
                                {evidenceCase.caseId}
                              </button>
                            ))}
                          </div>
                          <div className="grid grid-cols-2 gap-1.5 text-[7px] font-mono">
                            <div className="rounded bg-black/20 border border-white/5 p-2 text-gray-400"><span className="text-gray-600">Incidents</span> {selectedRootCauseEvidence.incidentEvidence.length}</div>
                            <div className="rounded bg-black/20 border border-white/5 p-2 text-gray-400"><span className="text-gray-600">Frames</span> {selectedRootCauseEvidence.frameEvidence.length}</div>
                            <div className="rounded bg-black/20 border border-white/5 p-2 text-gray-400"><span className="text-gray-600">Causal evidence</span> {selectedRootCauseEvidence.rootCauseEvidence.length}</div>
                            <div className="rounded bg-black/20 border border-white/5 p-2 text-gray-400"><span className="text-gray-600">Correlation</span> {selectedRootCauseEvidence.correlationEvidence.length}</div>
                          </div>
                          <div className="space-y-1.5">
                            <div className="text-[7px] text-gray-400 font-black uppercase">Causal Evidence</div>
                            {selectedRootCauseEvidence.rootCauseEvidence.slice(0, 8).map((evidence) => (
                              <button
                                key={evidence.evidenceId}
                                type="button"
                                onClick={() => {
                                  const time = evidence.firstFrame / Math.max(1, frameRate);
                                  setSelectedIncidentId(evidence.incidentId);
                                  setNavigationTime(time);
                                  onNavigateToProjectTime?.(time);
                                }}
                                className="w-full text-left p-2 rounded bg-black/20 border border-white/5 hover:border-purple-400/20"
                              >
                                <div className="flex items-center justify-between gap-2 text-[7px] font-mono">
                                  <span className="text-purple-200">{evidence.role} · {evidence.category}</span>
                                  <span className="text-cyan-300">{Math.round(evidence.confidence * 100)}%</span>
                                </div>
                                <div className="text-[7px] text-gray-500">{evidence.incidentId} · frame #{evidence.firstFrame}–#{evidence.lastFrame} · {evidence.occurrenceCount} occurrence(s)</div>
                                <div className="text-[7px] text-gray-600 mt-0.5">{evidence.field ?? '*'}{evidence.clipId ? ` · ${evidence.clipId}` : ''}</div>
                              </button>
                            ))}
                          </div>
                          <div className="space-y-1.5">
                            <div className="text-[7px] text-gray-400 font-black uppercase">Frame Evidence</div>
                            <div className="max-h-28 overflow-auto space-y-1">
                              {selectedRootCauseEvidence.frameEvidence.map((frame) => (
                                <button
                                  key={frame.frame}
                                  type="button"
                                  onClick={() => {
                                    const time = frame.time;
                                    setNavigationTime(time);
                                    onNavigateToProjectTime?.(time);
                                  }}
                                  className="w-full text-left p-1.5 rounded bg-black/20 border border-white/5 text-[7px] font-mono hover:border-cyan-400/20"
                                >
                                  #{frame.frame} · {formatTime(frame.time)} · {frame.entryCount} diff · {frame.categories.join(', ') || '—'}
                                </button>
                              ))}
                            </div>
                          </div>
                          {selectedRootCauseEvidence.correlationEvidence.length > 0 && (
                            <div className="space-y-1.5">
                              <div className="text-[7px] text-gray-400 font-black uppercase">Correlation Evidence</div>
                              {selectedRootCauseEvidence.correlationEvidence.map((group) => (
                                <button
                                  key={group.groupId}
                                  type="button"
                                  onClick={() => {
                                    const time = group.firstFrame / Math.max(1, frameRate);
                                    setNavigationTime(time);
                                    onNavigateToProjectTime?.(time);
                                  }}
                                  className="w-full text-left p-2 rounded bg-black/20 border border-white/5 hover:border-cyan-400/20"
                                >
                                  <div className="flex items-center justify-between text-[7px] font-mono"><span className="text-cyan-200">{group.groupId}</span><span className="text-amber-300">{Math.round(group.confidence * 100)}%</span></div>
                                  <div className="text-[7px] text-gray-500">frames #{group.firstFrame}–#{group.lastFrame} · {group.incidentIds.join(', ')}</div>
                                </button>
                              ))}
                            </div>
                          )}
                          {rootCauseEvidenceComparison && selectedRootCauseCaseId && rootCauseEvidenceComparison.pairs.length > 0 && (
                            <div className="space-y-1.5">
                              <div className="flex items-center justify-between gap-2">
                                <div className="text-[7px] text-gray-400 font-black uppercase">Comparison View</div>
                                <span className="text-[7px] text-gray-600 font-mono">{selectedRootCauseComparisonPairs.length} pair(s)</span>
                              </div>
                              <div className="max-h-44 overflow-auto space-y-1">
                                {selectedRootCauseComparisonPairs.map((pair) => {
                                  const oppositeCaseId = pair.leftCaseId === selectedRootCauseCaseId ? pair.rightCaseId : pair.leftCaseId;
                                  return (
                                    <button
                                      key={pair.pairId}
                                      type="button"
                                      onClick={() => {
                                        const caseEvidence = rootCauseEvidenceExplorer.cases.find((item) => item.caseId === oppositeCaseId);
                                        const frame = caseEvidence?.frameEvidence[0]?.frame;
                                        if (frame === undefined) return;
                                        const time = frame / Math.max(1, frameRate);
                                        setSelectedRootCauseCaseId(oppositeCaseId);
                                        setNavigationTime(time);
                                        onNavigateToProjectTime?.(time);
                                      }}
                                      className="w-full text-left p-2 rounded bg-black/20 border border-white/5 hover:border-amber-400/20"
                                    >
                                      <div className="flex items-center justify-between gap-2 text-[7px] font-mono">
                                        <span className="text-amber-200">vs {oppositeCaseId}</span>
                                        <span className="text-gray-400">{pair.sharedEvidenceKeys.length} shared</span>
                                      </div>
                                      <div className="text-[7px] text-gray-500 mt-1">same transitions: {pair.sameValueTransitionCount} · divergent: {pair.divergentTransitionCount}</div>
                                      <div className="text-[7px] text-gray-600 mt-1 font-mono">shared frames: {pair.sharedFrameCount} · left: {pair.leftFrameCount} · right: {pair.rightFrameCount}</div>
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                          {selectedRootCauseDiffs && selectedRootCauseDiffs.items.length > 0 && (
                            <div className="space-y-1.5">
                              <div className="flex items-center justify-between gap-2">
                                <div className="text-[7px] text-gray-400 font-black uppercase">Diff Inspector</div>
                                <span className="text-[7px] text-gray-600 font-mono">{selectedRootCauseDiffs.items.length} diff(s)</span>
                              </div>
                              <div className="max-h-48 overflow-auto space-y-1">
                                {selectedRootCauseDiffs.items.slice(0, 16).map((diff) => (
                                  <button
                                    key={diff.diffId}
                                    type="button"
                                    onClick={() => {
                                      setSelectedIncidentId(diff.context.incidentId);
                                      setNavigationTime(diff.context.projectTime);
                                      onNavigateToProjectTime?.(diff.context.projectTime);
                                    }}
                                    className="w-full text-left p-2 rounded bg-black/20 border border-white/5 hover:border-purple-400/20"
                                  >
                                    <div className="flex items-center justify-between gap-2 text-[7px] font-mono">
                                      <span className="text-purple-200">{diff.role} · {diff.category}</span>
                                      <span className="text-cyan-300">#{diff.context.frame}</span>
                                    </div>
                                    <div className="text-[7px] text-gray-400 font-mono mt-1">{diff.field}{diff.clipId ? ` · ${diff.clipId}` : ''}</div>
                                    <div className="text-[7px] text-gray-500 font-mono mt-1 break-all">{JSON.stringify(diff.previous)} → {JSON.stringify(diff.next)}</div>
                                    <div className="text-[7px] text-gray-600 font-mono mt-1">hash {diff.context.previousHash.slice(0, 10)}… → {diff.context.nextHash.slice(0, 10)}… · {diff.context.causalCategories.join(' → ') || 'no causal path'}</div>
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                          <div className="space-y-1.5">
                            <div className="text-[7px] text-gray-400 font-black uppercase">Causal Paths</div>
                            {selectedRootCauseEvidence.causalPaths.map((path) => (
                              <div key={path.incidentId} className="p-1.5 rounded bg-black/20 border border-white/5 text-[7px] font-mono text-gray-500">
                                <span className="text-gray-300">{path.incidentId}</span> · {path.categories.join(' → ') || '—'}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {incidentCorrelation && incidentCorrelation.groups.some((group) => group.incidentIds.length > 1) && (
                        <div className="rounded-md bg-cyan-500/[0.03] border border-cyan-500/10 p-2.5 space-y-1.5">
                          <div className="flex items-center justify-between">
                            <span className="text-cyan-300 font-black uppercase">Cross-Incident Correlation</span>
                            <span className="text-[7px] text-gray-600 font-mono">{incidentCorrelation.groups.filter((group) => group.incidentIds.length > 1).length} group(s)</span>
                          </div>
                          {incidentCorrelation.groups.filter((group) => group.incidentIds.length > 1).map((group) => (
                            <button
                              key={group.groupId}
                              type="button"
                              onClick={() => {
                                const time = group.firstFrame / Math.max(1, frameRate);
                                setNavigationTime(time);
                                onNavigateToProjectTime?.(time);
                              }}
                              className="w-full text-left p-2 rounded bg-black/20 border border-white/5 hover:border-cyan-400/20"
                            >
                              <div className="flex items-center justify-between gap-2 text-[7px] font-mono">
                                <span className="text-cyan-200">{group.groupId}</span>
                                <span className="text-amber-300">{Math.round(group.confidence * 100)}%</span>
                              </div>
                              <div className="text-[7px] text-gray-400 font-mono mt-1">Incidents: {group.incidentIds.join(', ')}</div>
                              <div className="text-[7px] text-gray-500">Frames #{group.firstFrame}–#{group.lastFrame}</div>
                              <div className="text-[7px] text-purple-300 mt-1">{group.summary}</div>
                            </button>
                          ))}
                        </div>
                      )}
                      {mismatchClustering.incidents.map((incident) => {
                        const causality = analyzeMismatchIncidentCausality(incident, rangeCapture.frames);
                        const graph: RenderDiagnosticCausalGraph = buildCausalDependencyGraph(incident, rangeCapture.frames);
                        const graphPath = graphPathFromRoot(graph);
                        return (
                          <div key={incident.incidentId} className="rounded-md bg-[#050608] border border-white/5 p-2.5 space-y-2">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-red-300">#{incident.startFrame}–#{incident.endFrame}</span>
                              <span className="text-purple-300">{incident.dominantCategory ?? 'unknown'}</span>
                            </div>
                            <div className="text-gray-500">{summarizeMismatchRootCause(incident)}</div>
                            <div className="text-amber-300">Cause candidate: {summarizeCausality(causality)}</div>
                            <div className="pt-1 border-t border-white/5">
                              <div className="flex items-center justify-between">
                                <span className="text-[7px] text-gray-400 font-black uppercase">Causal Dependency Graph</span>
                                <span className="text-[7px] text-gray-600 font-mono">{graph.nodes.length}N / {graph.edges.length}E</span>
                              </div>
                              <div className="text-[7px] text-gray-500 mt-1">{graph.summary}</div>
                              <div className="flex flex-wrap gap-1 mt-1.5">
                                {graph.nodes.map((node) => {
                                  const selected = selectedCausalNodeId === node.nodeId;
                                  return (
                                    <button
                                      key={node.nodeId}
                                      type="button"
                                      onClick={() => {
                                        setSelectedCausalNodeId(node.nodeId);
                                        onNavigateToProjectTime?.(node.firstFrame / Math.max(1, frameRate));
                                        setNavigationTime(node.firstFrame / Math.max(1, frameRate));
                                      }}
                                      className={`px-1.5 py-1 rounded border text-[7px] font-mono ${selected
                                        ? 'border-cyan-400/40 bg-cyan-400/10 text-cyan-200'
                                        : 'border-white/10 bg-white/[0.02] text-gray-400 hover:text-gray-200'}`}
                                    >
                                      {node.category} · #{node.firstFrame}
                                    </button>
                                  );
                                })}
                              </div>
                              {selectedCausalNodeId && graph.nodes.some((node) => node.nodeId === selectedCausalNodeId) && (
                                <div className="mt-2 p-2 rounded bg-black/20 border border-cyan-500/10 text-[7px] font-mono">
                                  {(() => {
                                    const node = graph.nodes.find((item) => item.nodeId === selectedCausalNodeId);
                                    if (!node) return null;
                                    const outgoing = graph.edges.filter((edge) => edge.fromNodeId === node.nodeId);
                                    return (
                                      <>
                                        <div className="text-cyan-300">{node.role} · confidence {(node.confidence * 100).toFixed(0)}%</div>
                                        <div className="text-gray-400">Frame #{node.firstFrame} → #{node.lastFrame} · occurrences {node.occurrences}</div>
                                        <div className="text-gray-500 mt-1">Leads to: {outgoing.length ? outgoing.map((edge) => `${edge.toCategory} (+${edge.leadFrames}f)`).join(', ') : 'none'}</div>
                                      </>
                                    );
                                  })()}
                                </div>
                              )}
                              {graphPath.length > 1 && (
                                <div className="mt-1 text-[7px] text-gray-600 font-mono">Path: {graphPath.map((id) => id.replace('cause:', '')).join(' → ')}</div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
            </>
          )}

          <button
            type="button"
            onClick={() => void navigator.clipboard?.writeText(JSON.stringify(bundle, null, 2))}
            className="w-full py-2 rounded-lg bg-white/5 border border-white/10 text-[8px] font-bold uppercase flex items-center justify-center gap-1.5"
          >
            <Clipboard className="w-3 h-3" /> Copy Bundle JSON
          </button>
        </div>
      )}
    </div>
  );
};
