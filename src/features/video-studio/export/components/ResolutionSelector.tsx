// src/features/video-studio/export/components/ResolutionSelector.tsx
import React from 'react';
import { useExportStore } from '../../../../store/useExportStore';
import type { ExportResolution } from '../../../../store/useExportStore';
import { EXPORT_RESOLUTION_SPECS } from '../../../../core/engine/exportResolution';
import { Monitor, Check } from 'lucide-react';

const resolutions = Object.values(EXPORT_RESOLUTION_SPECS);

export const ResolutionSelector: React.FC = () => {
  const { resolution, setResolution } = useExportStore();

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 mb-1">
        <Monitor className="w-4 h-4 text-purple-400" />
        <span className="text-[11px] font-bold text-gray-300 uppercase tracking-wider">
          Resolution / وضوح تصویر
        </span>
      </div>
      
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {resolutions.map((res) => {
          const isSelected = resolution === res.value;
          return (
            <button
              key={res.value}
              onClick={() => setResolution(res.value)}
              className={`p-3 rounded-xl border text-left transition-all relative flex flex-col gap-0.5 cursor-pointer ${
                isSelected
                  ? 'bg-purple-500/10 border-purple-500 shadow-[0_0_15px_rgba(168,85,247,0.15)]'
                  : 'bg-[#12131a] border-white/5 hover:bg-[#161722] hover:border-white/10'
              }`}
            >
              {isSelected && (
                <span className="absolute top-3 right-3 text-purple-400">
                  <Check className="w-4 h-4" />
                </span>
              )}
              <span className="text-[11px] font-bold text-white uppercase tracking-wide">
                {res.label}
              </span>
              <span className="text-[9.5px] text-gray-500 font-mono mt-0.5">
                {res.dimensionsLabel}
              </span>
              <span className="text-[8.5px] text-gray-400 font-medium mt-1.5 leading-relaxed">
                {res.description}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
