// src/features/video-studio/export/components/CodecSelector.tsx
import React from 'react';
import { useExportStore, ExportCodec } from '../../../../store/useExportStore';
import { Cpu, Check } from 'lucide-react';

interface CodecOption {
  value: ExportCodec;
  label: string;
  badge: string;
  description: string;
}

const codecs: CodecOption[] = [
  { 
    value: 'H.264', 
    label: 'H.264 (AVC)', 
    badge: 'Universal Compatibility',
    description: 'Widely compatible with virtually all legacy web and mobile player systems.' 
  },
  { 
    value: 'H.265', 
    label: 'H.265 (HEVC)', 
    badge: 'High Efficiency',
    description: 'Outstanding visual fidelity with approximately 40% reduction in file size.' 
  },
  { 
    value: 'AV1', 
    label: 'AV1 (AOMedia)', 
    badge: 'Next-Gen Royalty-Free',
    description: 'Cutting-edge modern codec with superior compression rates, best for streaming.' 
  },
];

export const CodecSelector: React.FC = () => {
  const { codec, setCodec } = useExportStore();

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 mb-1">
        <Cpu className="w-4 h-4 text-purple-400" />
        <span className="text-[11px] font-bold text-gray-300 uppercase tracking-wider">
          Video Codec / کدک فشرده‌سازی
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        {codecs.map((item) => {
          const isSelected = codec === item.value;
          return (
            <button
              key={item.value}
              onClick={() => setCodec(item.value)}
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
