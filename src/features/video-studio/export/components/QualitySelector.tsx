// src/features/video-studio/export/components/QualitySelector.tsx
import React from 'react';
import { useExportStore, ExportQuality } from '../../../../store/useExportStore';
import { Sliders, Check } from 'lucide-react';

interface QualityOption {
  value: ExportQuality;
  label: string;
  badge: string;
  description: string;
}

const qualities: QualityOption[] = [
  { 
    value: 'Fast', 
    label: 'Fast Draft', 
    badge: 'Lower bitrate / faster render',
    description: 'Prioritizes extreme processing speed. Ideal for quick drafts, offline reviews, and low bandwidth.' 
  },
  { 
    value: 'Balanced', 
    label: 'Balanced Engine', 
    badge: 'Balanced bitrate target',
    description: 'Balanced bitrate target for quality, file size, and render time.' 
  },
  { 
    value: 'High Quality', 
    label: 'Production Quality', 
    badge: 'Higher bitrate target',
    description: 'Raises the target bitrate to preserve detail in demanding high-resolution footage.' 
  },
];

export const QualitySelector: React.FC = () => {
  const { quality, setQuality } = useExportStore();

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 mb-1">
        <Sliders className="w-4 h-4 text-purple-400" />
        <span className="text-[11px] font-bold text-gray-300 uppercase tracking-wider">
          Rendering Preset / تنظیمات کیفیت خروجی
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        {qualities.map((item) => {
          const isSelected = quality === item.value;
          return (
            <button
              key={item.value}
              onClick={() => setQuality(item.value)}
              className={`p-3 rounded-xl border text-left transition-all relative flex flex-col gap-1 cursor-pointer ${
                isSelected
                  ? 'bg-purple-500/10 border-purple-500 shadow-[0_0_15px_rgba(168,85,247,0.15)]'
                  : 'bg-[#12131a] border-white/5 hover:bg-[#161722] hover:border-white/10'
              }`}
            >
              {isSelected && (
                <span className="absolute top-3 right-3 text-purple-400">
                  <Check className="w-3.5 h-3.5" />
                </span>
              )}
              <span className="text-[11px] font-bold text-white uppercase tracking-wide">
                {item.label}
              </span>
              <span className="inline-block self-start text-[8px] px-1.5 py-0.5 rounded-md bg-purple-500/20 text-purple-300 font-bold tracking-wide uppercase mt-0.5">
                {item.badge}
              </span>
              <span className="text-[8.5px] text-gray-400 leading-relaxed mt-2">
                {item.description}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
