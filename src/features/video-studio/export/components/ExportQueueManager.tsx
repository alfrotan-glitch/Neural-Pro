// src/features/video-studio/export/components/ExportQueueManager.tsx
import React, { useEffect, useState, useMemo, useRef } from 'react';
import { useExportStore } from '../../../../store/useExportStore';
import { ExportJobManager } from './ExportJobManager';
import { RenderPipeline } from '../../../../core/engine/RenderPipeline';
import { 
  Play, Pause, Trash2, CheckCircle2, AlertCircle, Clock, RefreshCw, Layers, ListOrdered, Sparkles, Terminal, Trash
} from 'lucide-react';

export const ExportQueueManager: React.FC = () => {
  const { jobs, clearQueue } = useExportStore();
  const [isQueueRunning, setIsQueueRunning] = useState<boolean>(false);
  const [processMode, setProcessMode] = useState<'sequential' | 'parallel'>('sequential');
  
  // Production export engine logs
  const [logs, setLogs] = useState<string[]>([]);
  const [showConsole, setShowConsole] = useState<boolean>(true);
  const consoleBottomRef = useRef<HTMLDivElement>(null);

  const pipeline = useMemo(() => RenderPipeline.getInstance(), []);

  // Stats calculation
  const stats = useMemo(() => {
    const total = jobs.length;
    const completed = jobs.filter((j) => j.status === 'completed').length;
    const failed = jobs.filter((j) => j.status === 'failed').length;
    const rendering = jobs.filter((j) => j.status === 'rendering' || j.status === 'preparing').length;
    const waiting = jobs.filter((j) => j.status === 'waiting').length;

    return { total, completed, failed, rendering, waiting };
  }, [jobs]);

  // Subscribe to pipeline logs
  useEffect(() => {
    const unsubscribe = pipeline.subscribeLogs((newLogs) => {
      setLogs(newLogs);
    });
    return unsubscribe;
  }, [pipeline]);

  // Scroll console to bottom when logs are updated
  useEffect(() => {
    if (showConsole && consoleBottomRef.current) {
      consoleBottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, showConsole]);

  // Queue orchestrator loop
  useEffect(() => {
    if (!isQueueRunning) return;

    let isSubscribed = true;
    let timer: NodeJS.Timeout;

    const runOrchestrator = async () => {
      // Check current active jobs
      const activeJobs = jobs.filter(
        (j) => j.status === 'rendering' || j.status === 'preparing'
      );

      if (processMode === 'sequential') {
        // Sequential: Only run if no active jobs are processing
        if (activeJobs.length === 0) {
          const nextJob = [...jobs].reverse().find((j) => j.status === 'waiting');
          if (nextJob && isSubscribed) {
            await pipeline.renderJob(nextJob.id);
          } else if (!nextJob) {
            setIsQueueRunning(false);
          }
        }
      } else {
        // Parallel requests are serialized by the single production encoder
        const waitingJobs = jobs.filter((j) => j.status === 'waiting');
        if (waitingJobs.length > 0 && isSubscribed) {
          await Promise.all(
            waitingJobs.map((job) => pipeline.renderJob(job.id))
          );
        } else if (activeJobs.length === 0) {
          setIsQueueRunning(false);
        }
      }
    };

    // Poll the orchestrator tick every 1.5 seconds
    timer = setInterval(() => {
      runOrchestrator();
    }, 1500);

    // Run first immediately
    runOrchestrator();

    return () => {
      isSubscribed = false;
      clearInterval(timer);
    };
  }, [isQueueRunning, jobs, processMode, pipeline]);

  const handleClearLogs = () => {
    pipeline.clearLogs();
  };

  const getLogColorClass = (log: string) => {
    if (log.includes('[ERROR]')) return 'text-rose-400';
    if (log.includes('[WARN]')) return 'text-amber-400';
    if (log.includes('[PIPELINE]')) return 'text-purple-400 font-bold';
    if (log.includes('frame=')) return 'text-cyan-400 font-mono';
    return 'text-gray-300';
  };

  return (
    <div className="bg-[#0b0c10] border border-white/5 rounded-2xl p-4 space-y-4 shadow-xl">
      {/* Top action header controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#12131a] p-3 rounded-xl border border-white/5">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-lg bg-purple-500/10 text-purple-400">
            <Layers className="w-4 h-4 animate-pulse" />
          </div>
          <div>
            <h3 className="text-xs font-black text-white uppercase tracking-wider flex items-center gap-1.5">
              <span>Media Encoder Queue</span>
              <span className="inline-flex items-center text-[8px] font-bold px-1.5 py-0.5 rounded-md bg-purple-500/25 text-purple-300">
                PRO ACTIVE
              </span>
            </h3>
            <p className="text-[9px] text-gray-500 font-medium">
              Single-owner production WebCodecs renderer with deterministic queue execution
            </p>
          </div>
        </div>

        {/* Controller actions */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Mode Switcher */}
          <div className="flex bg-black/40 p-0.5 rounded-lg border border-white/5">
            <button
              onClick={() => setProcessMode('sequential')}
              className={`px-2 py-1 text-[8.5px] font-bold rounded flex items-center gap-1 transition-all cursor-pointer ${
                processMode === 'sequential'
                  ? 'bg-purple-500 text-white shadow font-black'
                  : 'text-gray-400 hover:text-white'
              }`}
              title="Sequential processing (one job at a time)"
            >
              <ListOrdered className="w-3 h-3" />
              <span>Sequential</span>
            </button>
            <button
              onClick={() => setProcessMode('parallel')}
              className={`px-2 py-1 text-[8.5px] font-bold rounded flex items-center gap-1 transition-all cursor-pointer ${
                processMode === 'parallel'
                  ? 'bg-purple-500 text-white shadow font-black'
                  : 'text-gray-400 hover:text-white'
              }`}
              title="Parallel requests are accepted but serialized by the single production encoder"
            >
              <Sparkles className="w-3 h-3" />
              <span>Parallel requests</span>
            </button>
          </div>

          <div className="h-4 w-[1px] bg-white/5" />

          {/* Console toggler */}
          <button
            onClick={() => setShowConsole(!showConsole)}
            className={`p-1.5 rounded-lg border transition-all cursor-pointer ${
              showConsole 
                ? 'bg-purple-500/10 text-purple-400 border-purple-500/20' 
                : 'bg-[#12131a] border-white/5 text-gray-400 hover:text-white'
            }`}
            title="Toggle Console Logs"
          >
            <Terminal className="w-3.5 h-3.5" />
          </button>

          {/* Play/Pause Queue */}
          <button
            onClick={() => setIsQueueRunning(!isQueueRunning)}
            className={`px-3.5 py-1.5 rounded-lg text-[9px] font-bold flex items-center gap-1.5 transition-all shadow-md cursor-pointer ${
              isQueueRunning
                ? 'bg-amber-500 hover:bg-amber-400 text-black shadow-amber-500/10'
                : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-500/10'
            }`}
          >
            {isQueueRunning ? (
              <>
                <Pause className="w-3.5 h-3.5" />
                <span>Pause Queue</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5" />
                <span>Start Queue</span>
              </>
            )}
          </button>

          {/* Clear Log */}
          {jobs.length > 0 && (
            <button
              onClick={clearQueue}
              className="p-1.5 rounded-lg hover:bg-white/5 border border-white/10 hover:border-white/20 text-gray-400 hover:text-white transition-all cursor-pointer"
              title="Clear queue list"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Mini overview dashboard */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        <div className="bg-[#12131a] border border-white/5 rounded-xl p-2.5 text-center">
          <span className="text-[8px] font-bold uppercase tracking-wider text-gray-500 block mb-0.5">Total Jobs</span>
          <span className="font-mono text-sm font-black text-white">{stats.total}</span>
        </div>
        <div className="bg-[#12131a] border border-white/5 rounded-xl p-2.5 text-center">
          <span className="text-[8px] font-bold uppercase tracking-wider text-gray-500 block mb-0.5 flex items-center justify-center gap-1">
            <Clock className="w-2.5 h-2.5 text-blue-400 animate-pulse" />
            <span>Waiting</span>
          </span>
          <span className="font-mono text-sm font-black text-blue-400">{stats.waiting}</span>
        </div>
        <div className="bg-[#12131a] border border-white/5 rounded-xl p-2.5 text-center">
          <span className="text-[8px] font-bold uppercase tracking-wider text-gray-500 block mb-0.5 flex items-center justify-center gap-1">
            <RefreshCw className="w-2.5 h-2.5 text-purple-400 animate-spin" />
            <span>Active</span>
          </span>
          <span className="font-mono text-sm font-black text-purple-400">{stats.rendering}</span>
        </div>
        <div className="bg-[#12131a] border border-white/5 rounded-xl p-2.5 text-center">
          <span className="text-[8px] font-bold uppercase tracking-wider text-gray-500 block mb-0.5 flex items-center justify-center gap-1">
            <CheckCircle2 className="w-2.5 h-2.5 text-emerald-400" />
            <span>Completed</span>
          </span>
          <span className="font-mono text-sm font-black text-emerald-400">{stats.completed}</span>
        </div>
        <div className="bg-[#12131a] border border-white/5 rounded-xl p-2.5 text-center col-span-2 sm:col-span-1">
          <span className="text-[8px] font-bold uppercase tracking-wider text-gray-500 block mb-0.5 flex items-center justify-center gap-1">
            <AlertCircle className="w-2.5 h-2.5 text-rose-400" />
            <span>Failed</span>
          </span>
          <span className="font-mono text-sm font-black text-rose-400">{stats.failed}</span>
        </div>
      </div>

      {/* Main split UI - Jobs list left, Console logs right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Queue Job List */}
        <div className={`space-y-2 max-h-[360px] overflow-y-auto pr-1 ${showConsole ? 'lg:col-span-7' : 'lg:col-span-12'}`}>
          {jobs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center bg-[#07080c] rounded-xl border border-dashed border-white/5 h-[260px]">
              <ListOrdered className="w-8 h-8 text-gray-600 mb-2" />
              <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Queue is Empty</p>
              <p className="text-[8.5px] text-gray-500 max-w-[220px] mt-1">
                Add your current timeline clips or preset render jobs using the main Export panel!
              </p>
            </div>
          ) : (
            jobs.map((job) => (
              <ExportJobManager key={job.id} job={job} />
            ))
          )}
        </div>

        {/* Production export engine logs */}
        {showConsole && (
          <div className="lg:col-span-5 bg-black border border-white/5 rounded-xl flex flex-col overflow-hidden h-[360px]">
            {/* Console Header */}
            <div className="flex items-center justify-between bg-[#0e0f15] px-3.5 py-2 border-b border-white/5">
              <div className="flex items-center gap-1.5 text-gray-400">
                <Terminal className="w-3.5 h-3.5 text-purple-400" />
                <span className="text-[8.5px] font-black uppercase tracking-wider text-gray-300">
                  Production Export Console
                </span>
              </div>
              {logs.length > 0 && (
                <button
                  onClick={handleClearLogs}
                  className="p-1 rounded text-gray-500 hover:text-white hover:bg-white/5 transition-all cursor-pointer"
                  title="Clear Console Output"
                >
                  <Trash className="w-3 h-3" />
                </button>
              )}
            </div>

            {/* Console Body */}
            <div className="flex-1 overflow-y-auto p-4 font-mono text-[8.5px] space-y-1 bg-[#050508] select-text selection:bg-purple-500/30 selection:text-white">
              {logs.length === 0 ? (
                <div className="h-full flex items-center justify-center text-center text-gray-600 py-10 italic">
                  Terminal inactive. Start a queue job to view production encoder logs...
                </div>
              ) : (
                logs.map((log, idx) => (
                  <div key={idx} className={`leading-relaxed break-all ${getLogColorClass(log)}`}>
                    {log}
                  </div>
                ))
              )}
              <div ref={consoleBottomRef} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
