import React, { useState } from 'react';
import { useProjectStore } from '../../../../store/useProjectStore';
import type { PanelId, SlotId } from '../types';
import { GripHorizontal, Move, Maximize2, Minimize2 } from 'lucide-react';

interface DockableWorkspaceProps {
  renderPanel: (panelId: PanelId) => React.ReactNode;
}

export const DockableWorkspace: React.FC<DockableWorkspaceProps> = ({ renderPanel }) => {
  // Panel slot locations
  const [slots, setSlots] = useState<Record<SlotId, PanelId>>({
    topLeft: 'media',
    topCenter: 'preview',
    topRight: 'inspector',
    bottom: 'timeline'
  });

  // Track panel sizes
  const [leftWidth, setLeftWidth] = useState<number>(20); // %
  const [rightWidth, setRightWidth] = useState<number>(22); // %
  const [bottomHeight, setBottomHeight] = useState<number>(280); // px

  // Drag and drop of panels
  const [draggedPanel, setDraggedPanel] = useState<PanelId | null>(null);
  const [dragOverSlot, setDragOverSlot] = useState<SlotId | null>(null);

  const handleDragStart = (panelId: PanelId) => {
    setDraggedPanel(panelId);
  };

  const handleDragOver = (e: React.DragEvent, slotId: SlotId) => {
    e.preventDefault();
    setDragOverSlot(slotId);
  };

  const handleDrop = (e: React.DragEvent, targetSlot: SlotId) => {
    e.preventDefault();
    if (!draggedPanel) return;

    // Find current slot of the dragged panel
    const sourceSlot = Object.keys(slots).find(k => slots[k as SlotId] === draggedPanel) as SlotId;
    if (sourceSlot && sourceSlot !== targetSlot) {
      const swappedPanel = slots[targetSlot];
      setSlots(prev => ({
        ...prev,
        [sourceSlot]: swappedPanel,
        [targetSlot]: draggedPanel
      }));
    }
    setDraggedPanel(null);
    setDragOverSlot(null);
  };

  // Drag resizing handlers
  const startLeftResize = (e: React.MouseEvent) => {
    e.preventDefault();
    const onMouseMove = (moveEvent: MouseEvent) => {
      const percentage = (moveEvent.clientX / window.innerWidth) * 100;
      setLeftWidth(Math.max(15, Math.min(40, percentage)));
    };
    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  const startRightResize = (e: React.MouseEvent) => {
    e.preventDefault();
    const onMouseMove = (moveEvent: MouseEvent) => {
      const percentage = ((window.innerWidth - moveEvent.clientX) / window.innerWidth) * 100;
      setRightWidth(Math.max(15, Math.min(40, percentage)));
    };
    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  const startBottomResize = (e: React.MouseEvent) => {
    e.preventDefault();
    const onMouseMove = (moveEvent: MouseEvent) => {
      const height = window.innerHeight - moveEvent.clientY;
      // Allow the timeline to be collapsed down to 32px (header only), or expanded up to almost full screen (90% of window height)
      const maxHeight = window.innerHeight - 80;
      setBottomHeight(Math.max(32, Math.min(maxHeight, height)));
    };
    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  const panelTitles: Record<PanelId, string> = {
    media: 'Resource Sidebar',
    preview: 'Player Preview & Stage',
    inspector: 'Inspector & Settings',
    timeline: 'Timeline Tracks'
  };

  const renderCard = (slotId: SlotId, panelId: PanelId) => {
    const isDraggingOver = dragOverSlot === slotId;
    const isCollapsed = slotId === 'bottom' && bottomHeight <= 45;

    return (
      <div 
        className={`flex flex-col bg-[#0b0c10] border border-white/5 rounded-xl overflow-hidden transition-all duration-200 h-full ${
          isDraggingOver ? 'ring-2 ring-purple-500 bg-[#161325]' : ''
        }`}
        onDragOver={(e) => handleDragOver(e, slotId)}
        onDrop={(e) => handleDrop(e, slotId)}
      >
        {/* Card Header with drag handles */}
        <div 
          draggable
          onDragStart={() => handleDragStart(panelId)}
          className="bg-[#111218] border-b border-white/5 px-3 py-1.5 flex items-center justify-between cursor-grab active:cursor-grabbing hover:bg-white/[0.02] select-none"
        >
          <div className="flex items-center gap-2">
            <Move className="w-3 h-3 text-gray-500" />
            <span className="text-[10px] font-bold tracking-wider text-gray-400 uppercase">{panelTitles[panelId]}</span>
          </div>
          <div className="flex items-center gap-2">
            {slotId === 'bottom' && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setBottomHeight(isCollapsed ? 300 : 32);
                }}
                className="p-1 rounded hover:bg-white/10 text-gray-400 hover:text-white transition-colors cursor-pointer flex items-center justify-center"
                title={isCollapsed ? "Expand Panel" : "Collapse Panel"}
              >
                {isCollapsed ? <Maximize2 className="w-3 h-3" /> : <Minimize2 className="w-3 h-3" />}
              </button>
            )}
            <div className="w-1.5 h-1.5 rounded-full bg-white/10" />
            <div className="w-1.5 h-1.5 rounded-full bg-white/10" />
          </div>
        </div>
        
        {/* Card Body */}
        {!isCollapsed && (
          <div className="flex-1 overflow-hidden relative">
            {renderPanel(panelId)}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full w-full select-none text-white">
      {/* Top row of slots */}
      <div className="flex-1 flex min-h-0 relative">
         {/* Left Slot (Media Sidebar by default) */}
        <div style={{ width: `${leftWidth}%` }} className="h-full pr-1.5 py-1.5 pl-3">
          {renderCard('topLeft', slots.topLeft)}
        </div>

        {/* Vertical Resize Splitter Left */}
        <div 
          onMouseDown={startLeftResize}
          className="w-1.5 cursor-col-resize hover:bg-purple-500/50 hover:shadow-[0_0_8px_rgba(168,85,247,0.5)] active:bg-purple-600 transition-colors shrink-0 flex items-center justify-center relative z-20"
        >
          <div className="w-[1.5px] h-10 bg-white/10 rounded" />
        </div>

        {/* Center Slot (Player Preview by default) */}
        <div style={{ width: `${100 - leftWidth - rightWidth}%` }} className="h-full px-1.5 py-1.5">
          {renderCard('topCenter', slots.topCenter)}
        </div>

        {/* Vertical Resize Splitter Right */}
        <div 
          onMouseDown={startRightResize}
          className="w-1.5 cursor-col-resize hover:bg-purple-500/50 hover:shadow-[0_0_8px_rgba(168,85,247,0.5)] active:bg-purple-600 transition-colors shrink-0 flex items-center justify-center relative z-20"
        >
          <div className="w-[1.5px] h-10 bg-white/10 rounded" />
        </div>

        {/* Right Slot (Inspector by default) */}
        <div style={{ width: `${rightWidth}%` }} className="h-full pl-1.5 py-1.5 pr-3">
          {renderCard('topRight', slots.topRight)}
        </div>
      </div>

      {/* Horizontal Resize Splitter Bottom */}
      <div 
        onMouseDown={startBottomResize}
        className="h-1.5 cursor-row-resize hover:bg-purple-500/50 hover:shadow-[0_0_8px_rgba(168,85,247,0.5)] active:bg-purple-600 transition-colors shrink-0 flex items-center justify-center relative z-20"
      >
        <div className="w-10 h-[1.5px] bg-white/10 rounded" />
      </div>

      {/* Bottom Slot (Timeline by default) */}
      <div 
        style={{ height: `${bottomHeight}px` }} 
        className={`w-full shrink-0 transition-all duration-150 ${
          bottomHeight <= 45 ? 'px-3 pb-0 pt-0' : 'px-3 pb-3 pt-1.5'
        }`}
      >
        {renderCard('bottom', slots.bottom)}
      </div>
    </div>
  );
};
