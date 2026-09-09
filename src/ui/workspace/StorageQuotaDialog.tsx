import React, { useState } from 'react';
import { HardDrive, X } from 'lucide-react';
import type { QuotaRecovery } from '../../features/video-studio/project/services/projectSaveController';
import { evictUnusedMedia } from '../../features/video-studio/project/services/projectSaveController';

export interface StorageQuotaDialogProps {
  readonly quota: QuotaRecovery;
  /** Re-runs the save after space was freed. */
  readonly onRetry: () => void;
  readonly onClose: () => void;
}

function formatBytes(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return 'unknown';
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  if (value < 1024 * 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  return `${(value / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/**
 * The quota-failure affordance (WP-05 §2.8).
 *
 * A save that fails on quota is actionable, so it gets an action instead of an
 * apology: the real `navigator.storage.estimate()` numbers, what is reclaimable,
 * and a button that actually reclaims it. Nothing is deleted implicitly — the user
 * decides, and media referenced by any stored project is never a candidate.
 */
export const StorageQuotaDialog: React.FC<StorageQuotaDialogProps> = ({ quota, onRetry, onClose }) => {
  const [busy, setBusy] = useState(false);
  const [freed, setFreed] = useState<string | null>(null);

  const canEvict = quota.evictableAssets > 0;

  const evict = async (): Promise<void> => {
    setBusy(true);
    try {
      const result = await evictUnusedMedia();
      if (result.ok && result.removedAssets > 0) setFreed(result.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-2xl border border-red-500/25 bg-[#0d0e14] p-5 shadow-[0_0_40px_rgba(239,68,68,0.15)]">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex items-center gap-2.5">
            <HardDrive className="w-5 h-5 text-red-400" />
            <h2 className="text-sm font-bold text-white">Storage is full</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-gray-400 hover:text-white hover:bg-white/5 transition-all cursor-pointer"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <dl className="space-y-1.5 text-[11px] mb-4">
          <div className="flex justify-between">
            <dt className="text-gray-400">Used</dt>
            <dd className="text-gray-200 font-mono">{formatBytes(quota.usage)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-gray-400">Browser quota</dt>
            <dd className="text-gray-200 font-mono">{formatBytes(quota.quota)}</dd>
          </div>
          <div className="flex justify-between border-t border-white/5 pt-1.5">
            <dt className="text-gray-400">Reclaimable</dt>
            <dd className="text-emerald-400 font-mono">
              {canEvict ? `${formatBytes(quota.evictableBytes)} (${quota.evictableAssets} file(s))` : 'none'}
            </dd>
          </div>
        </dl>

        <p className="text-[11px] text-gray-400 leading-relaxed mb-4">
          {canEvict
            ? 'Reclaimable means media that no saved project references. Media used by any project — including projects you are not editing right now — is never touched.'
            : 'Every stored media file is referenced by a saved project, so there is nothing to reclaim automatically. Delete an unused project, or export a bundle and remove media from it.'}
        </p>

        {freed && (
          <p className="text-[11px] text-emerald-400 mb-3">{freed}</p>
        )}

        <div className="flex gap-2">
          {canEvict && (
            <button
              onClick={() => void evict()}
              disabled={busy}
              className="flex-1 py-2 rounded-xl text-[11px] font-bold bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white transition-all cursor-pointer"
            >
              {busy ? 'Freeing…' : `Free ${formatBytes(quota.evictableBytes)}`}
            </button>
          )}
          <button
            onClick={() => {
              onClose();
              onRetry();
            }}
            className="flex-1 py-2 rounded-xl text-[11px] font-bold bg-white/5 hover:bg-white/10 text-gray-200 border border-white/10 transition-all cursor-pointer"
          >
            {freed ? 'Retry save' : 'Close'}
          </button>
        </div>
      </div>
    </div>
  );
};
