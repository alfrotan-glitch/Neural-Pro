import React, { useCallback, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Link2, X } from 'lucide-react';
import type { MediaMissingWarning } from '../../infra/persistence/mediaHydration';
import { relinkClipMedia } from '../../features/video-studio/project/services/projectPersistenceService';
import { useProjectStore } from '../../store/useProjectStore';
import { createTrackSnapshotCommand } from '../../features/video-studio/project/commands';

export interface RelinkMediaDialogProps {
  readonly warnings: readonly MediaMissingWarning[];
  readonly onClose: () => void;
}

interface PendingRelink {
  readonly clipId: string;
  readonly clipName: string;
  readonly file: File;
}

/**
 * The recovery affordance for clips whose media could not be resolved.
 *
 * It exists because the alternative is worse: a clip that silently renders an
 * empty frame and exports a placeholder. Here the user sees exactly which clips
 * are affected, points each one at a file, and the bytes are stored durably
 * (IndexedDB) with the clip rewritten to reference an `AssetId`.
 *
 * Relinking is applied through a command, so it is undoable like any other edit.
 */
export const RelinkMediaDialog: React.FC<RelinkMediaDialogProps> = ({ warnings, onClose }) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [target, setTarget] = useState<MediaMissingWarning | null>(null);
  const [pending, setPending] = useState<PendingRelink[]>([]);
  const [busy, setBusy] = useState(false);

  const affected = useMemo(() => warnings.filter((warning) => warning.clipId !== ''), [warnings]);

  const applyPending = useCallback(async () => {
    if (pending.length === 0) return;
    setBusy(true);
    const store = useProjectStore.getState();
    const initialTracks = structuredClone(store.tracks);
    let nextTracks = store.tracks;
    let relinked = 0;

    try {
      for (const entry of pending) {
        const result = await relinkClipMedia({
          clipIds: [entry.clipId],
          file: entry.file,
          fileName: entry.file.name,
          mimeType: entry.file.type,
          tracks: nextTracks,
        });
        nextTracks = result.tracks;
        relinked += 1;
      }

      if (relinked > 0) {
        store.executeCommand(
          createTrackSnapshotCommand(`Relink ${relinked} media clip(s)`, initialTracks, nextTracks),
        );
        store.showToast(`🔗 Relinked ${relinked} media clip(s).`);
      }
      setPending([]);
      onClose();
    } catch (error) {
      store.showToast(`❌ Relink failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusy(false);
    }
  }, [pending, onClose]);

  const onFilePicked = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !target) return;
    setPending((current) => [
      ...current.filter((entry) => entry.clipId !== target.clipId),
      { clipId: target.clipId, clipName: target.clipName ?? target.clipId, file },
    ]);
    setTarget(null);
  };

  if (affected.length === 0) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-lg rounded-xl border border-amber-500/40 bg-zinc-900 p-5 text-zinc-100 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-400" />
            <h2 className="text-base font-semibold">Media needs to be relinked</h2>
          </div>
          <button type="button" onClick={onClose} className="rounded p-1 text-zinc-400 hover:text-zinc-100" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="mt-2 text-xs text-zinc-400">
          {affected.length} clip(s) reference media that is not available in this browser profile. The clips, their
          timing and their position on the timeline are preserved — point them at the original files to restore playback
          and export.
        </p>

        <ul className="mt-3 max-h-64 space-y-2 overflow-y-auto text-sm">
          {affected.map((warning) => {
            const picked = pending.find((entry) => entry.clipId === warning.clipId);
            return (
              <li
                key={`${warning.trackId}:${warning.clipId}`}
                className="flex items-center justify-between gap-3 rounded-lg border border-zinc-700 bg-zinc-800/60 px-3 py-2"
              >
                <div className="min-w-0">
                  <div className="truncate font-medium">{warning.clipName ?? warning.clipId}</div>
                  <div className="truncate text-xs text-zinc-400">
                    {picked ? `Selected: ${picked.file.name}` : warning.message}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setTarget(warning);
                    fileInputRef.current?.click();
                  }}
                  className="flex shrink-0 items-center gap-1 rounded-md bg-indigo-600 px-2.5 py-1.5 text-xs font-medium hover:bg-indigo-500"
                >
                  <Link2 className="h-3.5 w-3.5" />
                  {picked ? 'Change' : 'Relink'}
                </button>
              </li>
            );
          })}
        </ul>

        <div className="mt-4 flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-md px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-100">
            Later
          </button>
          <button
            type="button"
            disabled={pending.length === 0 || busy}
            onClick={() => void applyPending()}
            className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? 'Relinking…' : `Relink ${pending.length || ''} clip(s)`}
          </button>
        </div>

        <input ref={fileInputRef} type="file" className="hidden" onChange={onFilePicked} />
      </div>
    </div>
  );
};

export default RelinkMediaDialog;
