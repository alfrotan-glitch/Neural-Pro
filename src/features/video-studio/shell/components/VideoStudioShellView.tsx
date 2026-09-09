import React from 'react';
import {
  Undo2,
  Redo2,
  ArrowLeft,
  Download,
  Save,
  Package,
  FolderOpen,
  Check,
  Sun,
  Moon,
  Layers,
  X,
  Cpu,
} from 'lucide-react';
import { DockableWorkspace } from './DockableWorkspace';
import { ExportPanel } from '../../export/components/ExportPanel';
import { ExportQueueManager } from '../../export/components/ExportQueueManager';
import type { ExportJob, ExportResolution } from '../../export/types';
import type { PanelId } from '../types';

interface VideoStudioShellViewProps {
  projectName: string;
  theme: 'light' | 'dark';
  toastMessage: string | null;
  isExporting: boolean;
  exportProgress: number;
  exportQuality: ExportResolution;
  exportFps: 24 | 30 | 60;
  exportFormat: 'mp4' | 'webm' | 'mkv';
  renderedBlobUrl: string | null;
  renderedFileName: string;
  canUndo: boolean;
  canRedo: boolean;
  showExportModal: boolean;
  showQueueModal: boolean;
  renderPanel: (panelId: PanelId) => React.ReactNode;
  onBack: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onSave: () => void;
  /** Saves the project and downloads a portable `.neuralpro` bundle (document + media). */
  onDownloadBundle?: () => void;
  /** Restores a `.neuralpro` bundle chosen from disk. */
  onImportBundle?: (file: File) => void;
  onToggleTheme: () => void;
  onShowQueue: () => void;
  onShowExport: () => void;
  onCloseQueue: () => void;
  onCloseExport: () => void;
  onStartExport: (settings: ExportJob['settings']) => void;
  onCloseExportProgress: () => void;
  getProgressStatusMessage: () => string;
}

export const VideoStudioShellView: React.FC<VideoStudioShellViewProps> = ({
  projectName,
  theme,
  toastMessage,
  isExporting,
  exportProgress,
  exportQuality,
  exportFps,
  exportFormat,
  renderedBlobUrl,
  renderedFileName,
  canUndo,
  canRedo,
  showExportModal,
  showQueueModal,
  renderPanel,
  onBack,
  onUndo,
  onRedo,
  onSave,
  onDownloadBundle,
  onImportBundle,
  onToggleTheme,
  onShowQueue,
  onShowExport,
  onCloseQueue,
  onCloseExport,
  onStartExport,
  onCloseExportProgress,
  getProgressStatusMessage,
}) => {
  const bundleInputRef = React.useRef<HTMLInputElement>(null);

  return (
    <div className={`h-full w-full flex flex-col bg-[#050508] text-gray-200 overflow-hidden font-sans relative ${theme === 'light' ? 'theme-light' : 'theme-dark'}`}>
      {toastMessage && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 bg-purple-600/90 border border-purple-500/30 text-white font-bold text-xs tracking-wide px-4 py-2.5 rounded-full shadow-[0_0_24px_rgba(168,85,247,0.4)] backdrop-blur z-50 transition-all">
          {toastMessage}
        </div>
      )}

      <header className="h-14 border-b border-white/5 bg-[#090a0f] px-4 flex items-center justify-between shrink-0 select-none z-30">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-1.5 rounded-lg hover:bg-white/5 text-gray-400 hover:text-white cursor-pointer transition-all border border-transparent hover:border-white/5"
            title="Back to Script Editor"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold tracking-widest text-purple-400 uppercase bg-purple-500/10 px-1.5 py-0.5 rounded border border-purple-500/20">Studio Pro</span>
              <h1 className="text-xs font-bold text-gray-100 truncate max-w-[200px]">{projectName}</h1>
            </div>
            <p className="text-[8px] text-gray-500 mt-0.5 uppercase tracking-wider font-semibold">Offline Project Workspace</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onUndo}
            disabled={!canUndo}
            className={`p-2 rounded-lg transition-all ${canUndo ? 'text-gray-300 hover:text-white hover:bg-white/5 cursor-pointer' : 'text-gray-600 cursor-not-allowed'}`}
            title="Undo"
          >
            <Undo2 className="w-4 h-4" />
          </button>

          <button
            onClick={onRedo}
            disabled={!canRedo}
            className={`p-2 rounded-lg transition-all ${canRedo ? 'text-gray-300 hover:text-white hover:bg-white/5 cursor-pointer' : 'text-gray-600 cursor-not-allowed'}`}
            title="Redo"
          >
            <Redo2 className="w-4 h-4" />
          </button>

          <div className="h-4 w-px bg-white/10 mx-1" />

          <button
            onClick={onToggleTheme}
            className="p-2 rounded-lg text-gray-300 hover:text-white hover:bg-white/5 border border-transparent hover:border-white/5 transition-all flex items-center justify-center cursor-pointer"
            title={theme === 'light' ? 'حالت تاریک' : 'حالت روشن'}
            id="theme-toggle-btn"
          >
            {theme === 'light' ? <Moon className="w-4 h-4 text-purple-600" /> : <Sun className="w-4 h-4 text-amber-400" />}
          </button>

          <div className="h-4 w-px bg-white/10 mx-1" />

          <button
            onClick={onSave}
            className="px-3 py-1.5 rounded-lg text-[10px] font-bold text-gray-300 hover:text-white hover:bg-white/5 border border-white/5 hover:border-white/10 transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <Save className="w-3.5 h-3.5" />
            <span>Save</span>
          </button>

          {(onDownloadBundle || onImportBundle) && (
            <>
              <input
                ref={bundleInputRef}
                type="file"
                accept=".neuralpro,application/zip"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  // Reset first: picking the same file twice must still fire onChange.
                  event.target.value = '';
                  if (file && onImportBundle) onImportBundle(file);
                }}
              />
              {onImportBundle && (
                <button
                  onClick={() => bundleInputRef.current?.click()}
                  className="px-3 py-1.5 rounded-lg text-[10px] font-bold text-gray-300 hover:text-white hover:bg-white/5 border border-white/5 hover:border-white/10 transition-all flex items-center gap-1.5 cursor-pointer"
                  title="Restore a portable .neuralpro project bundle"
                >
                  <FolderOpen className="w-3.5 h-3.5" />
                  <span>Open Bundle</span>
                </button>
              )}
              {onDownloadBundle && (
                <button
                  onClick={onDownloadBundle}
                  className="px-3 py-1.5 rounded-lg text-[10px] font-bold text-gray-300 hover:text-white hover:bg-white/5 border border-white/5 hover:border-white/10 transition-all flex items-center gap-1.5 cursor-pointer"
                  title="Download a portable .neuralpro bundle: the project file plus every media file it uses"
                >
                  <Package className="w-3.5 h-3.5" />
                  <span>Bundle</span>
                </button>
              )}
            </>
          )}

          <button
            onClick={onShowQueue}
            className="px-3.5 py-1.5 rounded-lg text-[10px] font-bold bg-[#12131a] hover:bg-[#1a1c24] text-purple-400 hover:text-purple-300 border border-purple-500/20 hover:border-purple-500/40 transition-all flex items-center gap-1.5 cursor-pointer"
            title="Open Render Queue (Media Encoder)"
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Render Queue</span>
          </button>

          <button
            onClick={onShowExport}
            className="px-3.5 py-1.5 rounded-lg text-[10px] font-bold bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white transition-all flex items-center gap-1.5 shadow-[0_0_12px_rgba(147,51,234,0.3)] cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export</span>
          </button>
        </div>
      </header>

      <main className="flex-1 relative min-h-0 bg-[#06070a]">
        <DockableWorkspace renderPanel={renderPanel} />
      </main>

      {showExportModal && (
        <ExportPanel
          onClose={onCloseExport}
          onStartExport={onStartExport}
        />
      )}

      {showQueueModal && (
        <div className="fixed inset-0 z-50 backdrop-blur-md bg-black/80 flex items-center justify-center p-4">
          <div className="bg-[#0b0c10] border border-white/10 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl relative overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/5 bg-[#0e0f15]">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-lg bg-purple-500/10 text-purple-400 border border-purple-500/20">
                  <Layers className="w-4 h-4 animate-pulse" />
                </div>
                <div>
                  <h3 className="text-xs font-black text-white uppercase tracking-wider">Adobe Premiere Pro Style Render Queue</h3>
                  <p className="text-[9px] text-gray-500 font-medium">Monitor progress, queue encoding parameters, and manage hardware accelerated exports</p>
                </div>
              </div>
              <button onClick={onCloseQueue} className="p-1.5 rounded-lg hover:bg-white/5 text-gray-400 hover:text-white transition-all cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5">
              <ExportQueueManager />
            </div>

            <div className="flex px-5 py-4 border-t border-white/5 bg-[#0e0f15] justify-end">
              <button onClick={onCloseQueue} className="px-5 py-1.5 rounded-xl text-[10px] font-bold bg-purple-600 hover:bg-purple-500 text-white transition-all cursor-pointer">
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {isExporting && (
        <div className="fixed inset-0 z-50 backdrop-blur-xl bg-[#0e0f14]/80 flex items-center justify-center p-4">
          <div className="bg-[#0e0f14]/95 border border-white/10 p-6 rounded-2xl w-full max-w-sm flex flex-col items-center shadow-2xl">
            {exportProgress === 100 && renderedBlobUrl ? (
              <div className="w-full flex flex-col items-center text-center">
                <div className="w-12 h-12 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 mb-4 animate-bounce">
                  <Check className="w-6 h-6" />
                </div>
                <h3 className="text-sm font-bold text-gray-100 mb-1">رندر ویدیو با موفقیت کامل شد!</h3>
                <p className="text-[10px] text-gray-400 leading-relaxed mb-5">فایل ویدیوی فشرده‌شده با کیفیت بالا آماده دریافت است. اگر دانلود به طور خودکار شروع نشده است، روی دکمه زیر کلیک کنید:</p>

                <div className="w-full bg-[#12131a] border border-white/5 rounded-xl p-2.5 mb-5 flex flex-col gap-1 text-[8.5px] text-gray-400">
                  <div className="flex justify-between">
                    <span>نام فایل:</span>
                    <span className="font-mono text-gray-300 truncate max-w-[170px]">{renderedFileName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>رزولوشن خروجی:</span>
                    <span className="font-mono text-gray-300">{exportQuality.toUpperCase()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>فرمت فشرده‌سازی:</span>
                    <span className="font-mono text-purple-400 font-bold">H.264 + AAC (WebCodecs)</span>
                  </div>
                </div>

                <a href={renderedBlobUrl} download={renderedFileName} className="w-full py-2.5 rounded-xl text-center font-bold text-[10px] bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white shadow-lg shadow-emerald-500/20 transition-all flex items-center justify-center gap-2 mb-3 cursor-pointer">
                  <Download className="w-3.5 h-3.5" />
                  <span>دانلود ویدیو رندر شده (Download)</span>
                </a>

                <button onClick={onCloseExportProgress} className="w-full py-1.5 rounded-xl text-[9px] font-bold border border-white/5 hover:border-white/10 text-gray-500 hover:text-white transition-all cursor-pointer">
                  بستن پنجره (Close)
                </button>
              </div>
            ) : (
              <>
                <Cpu className="w-8 h-8 text-purple-400 mb-3 animate-pulse" />
                <h3 className="text-sm font-bold text-gray-100 mb-1">Exporting Media Package</h3>
                <div className="flex gap-1.5 mb-3">
                  <span className="text-[8px] font-black uppercase tracking-wider bg-purple-500/20 text-purple-300 border border-purple-500/30 px-2 py-0.5 rounded">⚡ {exportQuality.toUpperCase()}</span>
                  <span className="text-[8px] font-black uppercase tracking-wider bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-2 py-0.5 rounded">🚀 {exportFps} FPS</span>
                  <span className="text-[8px] font-black uppercase tracking-wider bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 px-2 py-0.5 rounded">📦 {exportFormat.toUpperCase()}</span>
                </div>
                <p className="text-[9.5px] text-gray-300 mb-4 text-center min-h-[28px] leading-relaxed">{getProgressStatusMessage()}</p>
                <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden mb-2">
                  <div style={{ width: `${exportProgress}%` }} className="h-full bg-gradient-to-r from-purple-500 to-indigo-500 rounded-full transition-all duration-150" />
                </div>
                <span className="text-xs font-mono font-bold text-purple-400">{exportProgress}%</span>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default VideoStudioShellView;
