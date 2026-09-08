import React, { useState } from 'react';
import SettingsPanel from './SettingsPanel';
import AnimationController from './AnimationController';
import LogoEditor from './LogoEditor';
import SetupWizard from './SetupWizard';
import ExportToast from './ExportToast';
import { useSubscribeStore } from '../../store/useSubscribeStore';
import { Play, RotateCcw } from 'lucide-react';

const SubscribeGenerator: React.FC = () => {
  const { isPlaying, setIsPlaying, setAnimationStage, hasCompletedSetup } = useSubscribeStore();
  const [exportToast, setExportToast] = useState<{ visible: boolean; format: string }>({ visible: false, format: '' });

  const handlePlay = () => {
    setAnimationStage(0);
    setIsPlaying(true);
  };

  const handleReset = () => {
    setIsPlaying(false);
    setAnimationStage(0);
  };

  // Provide a function on window so SettingsPanel can trigger the toast without complex prop drilling
  // just for this simulated export demo.
  React.useEffect(() => {
    (window as any).triggerExport = (format: string) => {
      setExportToast({ visible: true, format });
    };
    return () => {
      delete (window as any).triggerExport;
    };
  }, []);

  return (
    <div className="flex h-[calc(100vh-64px)] overflow-hidden bg-black text-white relative">
      {!hasCompletedSetup && <SetupWizard />}

      {/* Main Preview Area */}
      <div className="flex-1 flex flex-col relative overflow-hidden bg-zinc-950">
        
        {/* Top Bar */}
        <div className="h-14 border-b border-white/10 flex items-center justify-between px-6 bg-zinc-900/50 backdrop-blur-sm z-10">
          <h2 className="font-semibold text-white/90">Preview</h2>
          <div className="flex items-center gap-3">
            <button
              onClick={handleReset}
              className="px-3 py-1.5 rounded bg-white/5 hover:bg-white/10 transition flex items-center gap-2 text-sm text-gray-300"
            >
              <RotateCcw className="w-4 h-4" /> Reset
            </button>
            <button
              onClick={handlePlay}
              className="px-4 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 transition flex items-center gap-2 text-sm font-medium"
            >
              <Play className="w-4 h-4" /> Play
            </button>
          </div>
        </div>

        {/* Checkerboard Pattern for Alpha Channel Visualization */}
        <div 
          className="flex-1 flex items-center justify-center relative bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyMCIgaGVpZ2h0PSIyMCI+CjxyZWN0IHdpZHRoPSIyMCIgaGVpZ2h0PSIyMCIgZmlsbD0iIzFBMUExQSIvPgo8cmVjdCB3aWR0aD0iMTAiIGhlaWdodD0iMTAiIGZpbGw9IiMyMjIyMjIiLz4KPHJlY3QgeD0iMTAiIHk9IjEwIiB3aWR0aD0iMTAiIGhlaWdodD0iMTAiIGZpbGw9IiMyMjIyMjIiLz4KPC9zdmc+')] overflow-hidden"
        >
          {/* Overlay container with responsive width */}
          <div className="relative flex items-center min-w-[600px] h-32 transform scale-125 origin-center">
            <AnimationController />
          </div>
        </div>
      </div>

      {/* Settings Panel */}
      <SettingsPanel />

      {/* Modal for Logo Edit */}
      <LogoEditor />

      {/* Export Toast */}
      <ExportToast 
        isVisible={exportToast.visible} 
        format={exportToast.format} 
        onClose={() => setExportToast(prev => ({ ...prev, visible: false }))} 
      />
    </div>
  );
};

export default SubscribeGenerator;
