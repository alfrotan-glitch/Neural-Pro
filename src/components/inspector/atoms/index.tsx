import React from 'react';

export const SliderAtom: React.FC<{ label: string; value: number; min: number; max: number; onChange: (v: number) => void }> = ({ label, value, min, max, onChange }) => (
  <div className="flex flex-col gap-1 my-2">
    <div className="flex justify-between text-xs text-gray-400">
      <span>{label}</span>
      <span>{Math.round(value)}</span>
    </div>
    <input 
      type="range" 
      min={min} 
      max={max} 
      value={value} 
      onChange={(e) => onChange(parseFloat(e.target.value))}
      className="w-full accent-purple-500"
    />
  </div>
);

export const Vector2DAtom: React.FC<{ value: { x: number; y: number }; onChange: (v: { x: number; y: number }) => void }> = ({ value, onChange }) => (
  <div className="flex gap-2 my-2">
    <div className="flex flex-col flex-1">
      <span className="text-xs text-gray-400 mb-1">X Pos</span>
      <input 
        type="number" 
        value={value.x} 
        onChange={(e) => onChange({ ...value, x: parseFloat(e.target.value) })}
        className="bg-[#13141f] border border-white/10 rounded px-2 py-1 text-xs text-white"
      />
    </div>
    <div className="flex flex-col flex-1">
      <span className="text-xs text-gray-400 mb-1">Y Pos</span>
      <input 
        type="number" 
        value={value.y} 
        onChange={(e) => onChange({ ...value, y: parseFloat(e.target.value) })}
        className="bg-[#13141f] border border-white/10 rounded px-2 py-1 text-xs text-white"
      />
    </div>
  </div>
);

export const ToggleAtom: React.FC<{ label: string; value: boolean; onChange: (v: boolean) => void }> = ({ label, value, onChange }) => (
  <div className="flex justify-between items-center my-2">
    <span className="text-xs text-gray-400">{label}</span>
    <button 
      onClick={() => onChange(!value)}
      className={`w-8 h-4 rounded-full relative transition-colors ${value ? 'bg-purple-500' : 'bg-gray-600'}`}
    >
      <div className={`w-3 h-3 rounded-full bg-white absolute top-0.5 transition-all ${value ? 'right-0.5' : 'left-0.5'}`} />
    </button>
  </div>
);
