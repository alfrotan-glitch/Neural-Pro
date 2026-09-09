// src/features/video-studio/export/components/ExportJobManager.tsx
import React from 'react';
import type { ExportJob } from '../../../../store/useExportStore';
import { getExportQueue } from '../../../../app/workflows/export/exportQueue';
import { 
  Play, RotateCcw, Trash2, XCircle, CheckCircle, Clock, AlertTriangle, Download, Film, Cpu, HardDrive
} from 'lucide-react';

interface ExportJobManagerProps {
  job: ExportJob;
}

export const ExportJobManager: React.FC<ExportJobManagerProps> = ({ job }) => {
  // UI actions are *intents*: the workflow runtime owns run status and mirrors it
  // into the store one-way. No component assigns job status.
  const queue = getExportQueue();

  const getStatusBadge = () => {
    switch (job.status) {
      case 'waiting':
        return (
          <span className="inline-flex items-center gap-1 text-[8.5px] px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 font-bold border border-blue-500/10 uppercase tracking-wider">
            <Clock className="w-2.5 h-2.5 animate-pulse" />
            <span>Waiting</span>
          </span>
        );
      case 'preparing':
        return (
          <span className="inline-flex items-center gap-1 text-[8.5px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 font-bold border border-amber-500/10 uppercase tracking-wider">
            <Cpu className="w-2.5 h-2.5 animate-spin" />
            <span>Preparing</span>
          </span>
        );
      case 'rendering':
        return (
          <span className="inline-flex items-center gap-1 text-[8.5px] px-2 py-0.5 rounded-full bg-purple-500/15 text-purple-400 font-bold border border-purple-500/10 uppercase tracking-wider">
            <HardDrive className="w-2.5 h-2.5 animate-pulse" />
            <span>Rendering</span>
          </span>
        );
      case 'completed':
        return (
          <span className="inline-flex items-center gap-1 text-[8.5px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 font-bold border border-emerald-500/10 uppercase tracking-wider">
            <CheckCircle className="w-2.5 h-2.5" />
            <span>Completed</span>
          </span>
        );
      case 'failed':
        return (
          <span className="inline-flex items-center gap-1 text-[8.5px] px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-400 font-bold border border-rose-500/10 uppercase tracking-wider">
            <AlertTriangle className="w-2.5 h-2.5" />
            <span>Failed</span>
          </span>
        );
      case 'cancelled':
        return (
          <span className="inline-flex items-center gap-1 text-[8.5px] px-2 py-0.5 rounded-full bg-gray-500/15 text-gray-400 font-bold border border-gray-500/10 uppercase tracking-wider">
            <XCircle className="w-2.5 h-2.5" />
            <span>Cancelled</span>
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div className="bg-[#12131a] border border-white/5 hover:border-white/10 rounded-xl p-3.5 transition-all space-y-3.5 relative overflow-hidden group">
      {/* Background glow on rendering */}
      {job.status === 'rendering' && (
        <div className="absolute inset-x-0 bottom-0 h-[1.5px] bg-gradient-to-r from-purple-500 via-indigo-500 to-pink-500 animate-pulse" />
      )}

      {/* Top Header line of Job */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="flex items-start gap-2.5">
          <div className={`p-2 rounded-lg border shrink-0 ${
            job.status === 'completed' 
              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/10' 
              : job.status === 'failed'
              ? 'bg-rose-500/10 text-rose-400 border-rose-500/10'
              : 'bg-purple-500/10 text-purple-400 border-purple-500/10'
          }`}>
            <Film className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-[11px] font-bold text-white tracking-wide truncate max-w-[200px] sm:max-w-[320px]">
              {job.projectName}
            </h4>
            <div className="flex flex-wrap items-center gap-2 mt-1">
              <span className="font-mono text-[8px] text-gray-500 bg-[#07080c] px-1.5 py-0.5 rounded border border-white/5 uppercase">
                {job.settings.resolution}
              </span>
              <span className="font-mono text-[8px] text-gray-500 bg-[#07080c] px-1.5 py-0.5 rounded border border-white/5 uppercase">
                {job.settings.codec}
              </span>
              <span className="font-mono text-[8px] text-gray-500 bg-[#07080c] px-1.5 py-0.5 rounded border border-white/5">
                {job.settings.fps} FPS
              </span>
              <span className="font-mono text-[8px] text-purple-400 bg-purple-500/5 px-1.5 py-0.5 rounded border border-purple-500/10">
                {job.settings.format.toUpperCase()}
              </span>
            </div>
          </div>
        </div>

        {/* Status Badge and Control Buttons */}
        <div className="flex items-center gap-2.5 self-end sm:self-center">
          {getStatusBadge()}

          <div className="flex items-center gap-1 bg-[#0b0c11] border border-white/5 p-0.5 rounded-lg">
            {(job.status === 'waiting' || job.status === 'preparing' || job.status === 'rendering') && (
              <button
                onClick={() => {
                  queue.cancel(job.id);
                }}
                title="Cancel job"
                className="p-1.5 rounded-md hover:bg-rose-500/10 text-gray-400 hover:text-rose-400 transition-all cursor-pointer"
              >
                <XCircle className="w-3.5 h-3.5" />
              </button>
            )}

            {(job.status === 'failed' || job.status === 'cancelled') && (
              <button
                onClick={() => {
                  void queue.retry(job.id);
                }}
                title="Retry render"
                className="p-1.5 rounded-md hover:bg-purple-500/10 text-gray-400 hover:text-purple-400 transition-all cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            )}

            {job.status === 'completed' && (
              <a
                href={job.downloadUrl || '#'}
                download={`${job.projectName}.${job.settings.format}`}
                title="Download encoded file"
                className="p-1.5 rounded-md hover:bg-emerald-500/10 text-emerald-400 hover:text-emerald-300 transition-all"
              >
                <Download className="w-3.5 h-3.5" />
              </a>
            )}

            {(job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled') && (
              <button
                onClick={() => queue.remove(job.id)}
                title="Remove job from log"
                className="p-1.5 rounded-md hover:bg-white/5 text-gray-500 hover:text-white transition-all cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Progress slider / bar */}
      {(job.status === 'rendering' || job.status === 'preparing' || job.status === 'completed' || job.status === 'failed') && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between font-mono text-[8px] text-gray-400">
            <div className="flex items-center gap-1">
              {job.startTime && (
                <span>Started: <strong className="text-gray-300">{job.startTime}</strong></span>
              )}
              {job.endTime && (
                <span className="border-l border-white/5 pl-1.5 ml-1.5">Ended: <strong className="text-gray-300">{job.endTime}</strong></span>
              )}
            </div>
            {job.status === 'rendering' && job.estimatedRemainingTime !== undefined && (
              <span className="text-purple-400">
                Rem: <strong className="text-white">{job.estimatedRemainingTime}s</strong>
              </span>
            )}
          </div>

          <div className="relative">
            <div className="w-full h-1.5 bg-black/40 rounded-full overflow-hidden border border-white/5">
              <div
                style={{ width: `${job.progress}%` }}
                className={`h-full transition-all duration-300 rounded-full ${
                  job.status === 'completed'
                    ? 'bg-gradient-to-r from-emerald-500 to-teal-500'
                    : job.status === 'failed'
                    ? 'bg-rose-500'
                    : 'bg-gradient-to-r from-purple-500 to-indigo-500 animate-pulse'
                }`}
              />
            </div>
            <span className="absolute right-0 -top-5 text-[8.5px] font-mono font-bold text-gray-400">
              {job.progress}%
            </span>
          </div>
        </div>
      )}

      {/* Error message logs */}
      {job.status === 'failed' && job.error && (
        <div className="bg-rose-500/5 border border-rose-500/10 rounded-lg p-2 text-[8px] font-mono text-rose-300 flex items-start gap-1.5">
          <AlertTriangle className="w-3 h-3 text-rose-400 shrink-0 mt-0.5" />
          <span>Error Log: {job.error}</span>
        </div>
      )}
    </div>
  );
};
