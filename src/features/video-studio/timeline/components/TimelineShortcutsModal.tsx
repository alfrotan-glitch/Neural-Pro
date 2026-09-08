import React, { useState } from 'react';
import { X, Keyboard, HelpCircle, Search } from 'lucide-react';
import { defaultKeymap } from '../../../../config/keymap';

interface ShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const TimelineShortcutsModal: React.FC<ShortcutsModalProps> = ({ isOpen, onClose }) => {
  const [searchQuery, setSearchQuery] = useState('');
  
  if (!isOpen) return null;
  
  // Group keymap by category
  const categories: Record<string, typeof defaultKeymap> = {};
  defaultKeymap.forEach(act => {
    if (
      searchQuery && 
      !act.name.toLowerCase().includes(searchQuery.toLowerCase()) && 
      !act.description.toLowerCase().includes(searchQuery.toLowerCase()) &&
      !act.category.toLowerCase().includes(searchQuery.toLowerCase())
    ) {
      return;
    }
    if (!categories[act.category]) {
      categories[act.category] = [];
    }
    const category = categories[act.category];
    if (category) category.push(act);
  });

  return (
    <div 
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm transition-all"
      onClick={onClose}
    >
      <div 
        className="bg-[#0c0d12] border border-white/10 rounded-2xl w-full max-w-2xl shadow-[0_20px_50px_rgba(168,85,247,0.15)] flex flex-col max-h-[85vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        dir="rtl"
      >
        {/* Header */}
        <div className="p-5 border-b border-white/5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-500/10 rounded-lg text-purple-400 border border-purple-500/20">
              <Keyboard className="w-5 h-5" />
            </div>
            <div className="text-right">
              <h2 className="text-sm font-bold text-white">میانبرهای کیبورد (Keyboard Shortcuts)</h2>
              <p className="text-[10px] text-gray-400 font-mono mt-0.5">نقشه کلیدهای استاندارد و مهندسی سیستم ادیتور</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/5 text-gray-400 hover:text-white transition-all cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search filter */}
        <div className="p-4 bg-[#0e1015] border-b border-white/5 flex items-center gap-2">
          <Search className="w-4 h-4 text-gray-500 shrink-0" />
          <input 
            type="text"
            placeholder="جستجو در میانبرها (مثلا: برش، حذف، پخش)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="bg-transparent border-none text-xs text-white focus:outline-none focus:ring-0 w-full text-right font-sans"
          />
        </div>

        {/* List of categories */}
        <div className="p-5 overflow-y-auto space-y-6 custom-scrollbar flex-1 text-right">
          {Object.keys(categories).length === 0 ? (
            <div className="text-center py-8 text-gray-500 text-xs">
              میانبری با این مشخصات پیدا نشد.
            </div>
          ) : (
            Object.entries(categories).map(([category, actions]) => (
              <div key={category} className="space-y-2.5">
                <h3 className="text-[10px] font-bold tracking-wider text-purple-400 uppercase font-mono pr-1">
                  // {category}
                </h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {actions.map(act => (
                    <div 
                      key={act.id}
                      className="p-3 bg-[#101117] hover:bg-[#141620] border border-white/5 hover:border-purple-500/10 rounded-xl flex items-center justify-between gap-4 transition-all text-right"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-bold text-gray-200">{act.name}</div>
                        <div className="text-[9px] text-gray-400 mt-0.5 leading-relaxed truncate" title={act.description}>
                          {act.description}
                        </div>
                      </div>
                      
                      {/* Key Caps */}
                      <div className="flex items-center gap-1 shrink-0 select-none" dir="ltr">
                        {act.keys.map((keyCombo, idx) => {
                          const keys = keyCombo.split('+');
                          return (
                            <div key={idx} className="flex items-center gap-0.5">
                              {idx > 0 && <span className="text-xs text-gray-600 px-0.5">یا</span>}
                              {keys.map((k, kIdx) => (
                                <kbd 
                                  key={kIdx}
                                  className="px-1.5 py-0.5 bg-[#1b1c26] border border-white/10 rounded text-[9px] font-mono font-bold text-gray-300 uppercase shadow-sm"
                                >
                                  {k === 'arrowright' ? '→' : 
                                   k === 'arrowleft' ? '←' : 
                                   k === 'arrowup' ? '↑' : 
                                   k === 'arrowdown' ? '↓' : 
                                   k === 'space' ? 'Space' : k}
                                </kbd>
                              ))}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer info */}
        <div className="p-3 bg-[#08090d] border-t border-white/5 text-center text-[9px] text-gray-500 font-mono">
          برای کارکرد صحیح، مطمئن شوید فوکوس روی فیلدهای متنی نیست.
        </div>
      </div>
    </div>
  );
};
