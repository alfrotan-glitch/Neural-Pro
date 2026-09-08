import React from 'react';

export const SliderRow: React.FC<{
  label: string; value: number; min: number; max: number; step?: number; unit?: string;
  icon?: React.ElementType; onChange: (v: number) => void; onReset?: () => void;
}> = ({ label, value, min, max, step = 1, unit = '', icon: Icon, onChange, onReset }) => (
  <div className="space-y-1 my-2 bg-black/10 border border-white/[0.02] p-2.5 rounded-xl">
    <div className="flex justify-between items-center">
      <div className="flex items-center gap-1.5 text-gray-400">
        {Icon && <Icon className="w-3.5 h-3.5 text-gray-500" />}
        <span className="text-[10px] font-bold uppercase tracking-wider">{label}</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] font-mono font-bold text-cyan-400 bg-cyan-500/10 px-1.5 py-0.5 rounded border border-cyan-500/20">
          {typeof value === 'number' ? value.toFixed(step >= 1 ? 0 : 1) : Number(value || 0).toFixed(step >= 1 ? 0 : 1)}{unit}
        </span>
        {onReset && (
          <button onClick={onReset} className="p-1 rounded hover:bg-white/5 text-gray-500 hover:text-white transition-all cursor-pointer" title="Reset value">
            <span className="text-[9px]">Reset</span>
          </button>
        )}
      </div>
    </div>
    <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(parseFloat(e.target.value))} className="w-full h-1 bg-[#151620] rounded-lg appearance-none cursor-pointer accent-cyan-400 outline-none" />
  </div>
);

export const ToggleRow: React.FC<{
  label: string; value: boolean; icon?: React.ElementType; description?: string; onChange: (v: boolean) => void;
}> = ({ label, value, icon: Icon, description, onChange }) => (
  <div className="flex items-start justify-between bg-black/10 border border-white/[0.02] p-2.5 rounded-xl my-2 transition-all">
    <div className="flex gap-2.5 min-w-0">
      {Icon && <Icon className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />}
      <div className="min-w-0">
        <span className="text-[10px] font-bold uppercase tracking-wider text-gray-200 block">{label}</span>
        {description && <p className="text-[8px] text-gray-500 mt-0.5 font-medium leading-relaxed">{description}</p>}
      </div>
    </div>
    <button onClick={() => onChange(!value)} className={`w-9 h-5 rounded-full relative transition-all duration-200 shrink-0 cursor-pointer ${value ? 'bg-cyan-500 shadow-[0_0_8px_rgba(34,211,238,0.4)]' : 'bg-[#181922] border border-white/5'}`}>
      <div className={`w-3.5 h-3.5 rounded-full bg-white absolute top-[2px] transition-all duration-200 ${value ? 'right-[2px]' : 'left-[2px]'}`} />
    </button>
  </div>
);

export const SelectRow: React.FC<{
  label: string; value: string; options: Array<{value: string; label: string}>; icon?: React.ElementType; onChange: (v: string) => void;
}> = ({ label, value, options, icon: Icon, onChange }) => (
  <div className="space-y-1.5 my-2 bg-black/10 border border-white/[0.02] p-2.5 rounded-xl">
    <div className="flex items-center gap-1.5 text-gray-400">
      {Icon && <Icon className="w-3.5 h-3.5 text-gray-500" />}
      <span className="text-[10px] font-bold uppercase tracking-wider">{label}</span>
    </div>
    <select value={value} onChange={(e) => onChange(e.target.value)} className="w-full bg-[#111218] border border-white/5 rounded-lg px-2.5 py-1.5 text-xs text-gray-200 font-semibold focus:outline-none focus:ring-1 focus:ring-cyan-500/50">
      {options.map(opt => <option key={opt.value} value={opt.value} className="bg-[#111218] text-white font-semibold">{opt.label}</option>)}
    </select>
  </div>
);
