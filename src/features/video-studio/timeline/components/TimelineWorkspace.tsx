import React from 'react';
import { TimelineRuler } from './TimelineRuler';
import { TimelineTrackBoard } from './TimelineTrackBoard';
import type { Track, ClipNode } from '../../project/types/project';
import { TIMELINE_HEADER_WIDTH, timeToPixel, getVisibleTimeRange } from '../geometry';

export interface TimelineWorkspaceProps {
  workspaceRef: React.RefObject<HTMLDivElement | null>;
  timelineRef: React.RefObject<HTMLDivElement | null>;
  timelineWidth: number;
  basePixelsPerSecond: number;
  timelineZoom: number;
  totalDuration: number;
  currentTime: number;
  hoverTime: number | null;
  hoverScrubEnabled: boolean;
  snapLineTime: number | null;
  markIn: number | null;
  markOut: number | null;
  visibleTimeRange: { start: number; end: number };
  setVisibleTimeRange: React.Dispatch<React.SetStateAction<{ start: number; end: number }>>;
  setHoverTime: (value: number | null) => void;
  handleTimelineMouseDown: (event: React.MouseEvent) => void;
  handleWorkspaceMouseDown: (event: React.PointerEvent<HTMLDivElement>, trackId: string) => void;
  handleWorkspaceMouseMove: (event: React.MouseEvent) => void;
  activeDrag: import('./timelineInteractionTypes').ActiveDrag | null;
  editingTextClipId: string | null;
  setEditingTextClipId: (value: string | null) => void;
  trackMenuId: string | null;
  setTrackMenuId: (value: string | null) => void;
  handleContextMenu: (event: React.MouseEvent<HTMLDivElement>, clipId?: string, trackId?: string) => void;
  handleClipMouseDown: (event: React.PointerEvent<HTMLDivElement>, clipId: string, trackId: string, trackType: 'video' | 'audio' | 'text' | 'effect') => void;
  handleClipDoubleClick: (event: React.MouseEvent<HTMLDivElement>, clip: ClipNode, trackType: string) => void;
  professionalTrimTool?: 'none' | 'roll' | 'slip';
  handleRenameTrack: (trackId: string) => void;
  handleDuplicateTrack: (trackId: string) => void;
  handleAddTrack: (type: Track['type']) => void;
  handleDeleteTrack: (trackId: string) => void;
  handleAssetDrop: (event: React.DragEvent<HTMLDivElement>) => void;
}

export const TimelineWorkspace: React.FC<TimelineWorkspaceProps> = ({
  workspaceRef,
  timelineRef,
  timelineWidth,
  basePixelsPerSecond,
  timelineZoom,
  totalDuration,
  currentTime,
  hoverTime,
  hoverScrubEnabled,
  snapLineTime,
  markIn,
  markOut,
  visibleTimeRange,
  setVisibleTimeRange,
  setHoverTime,
  handleTimelineMouseDown,
  handleWorkspaceMouseDown,
  handleWorkspaceMouseMove,
  activeDrag,
  editingTextClipId,
  setEditingTextClipId,
  trackMenuId,
  setTrackMenuId,
  handleContextMenu,
  handleClipMouseDown,
  handleClipDoubleClick,
  handleRenameTrack,
  handleDuplicateTrack,
  handleAddTrack,
  handleDeleteTrack,
  handleAssetDrop,
  professionalTrimTool = 'none',
}) => (
  <div
    ref={workspaceRef}
    className="flex-1 overflow-x-auto overflow-y-auto custom-scrollbar relative flex flex-col min-h-0 select-none bg-[#0b0c10]"
    onMouseLeave={() => setHoverTime(null)}
    onDragOver={(event) => {
      if (event.dataTransfer.types.includes('application/json')) event.preventDefault();
    }}
    onDrop={handleAssetDrop}
    onScroll={(e) => {
      const target = e.currentTarget;
      setVisibleTimeRange(
        getVisibleTimeRange(
          target.scrollLeft,
          target.clientWidth,
          basePixelsPerSecond * timelineZoom
        )
      );
    }}
  >
    <div style={{ width: `calc(${TIMELINE_HEADER_WIDTH}px + ${timelineWidth}px)`, minWidth: `calc(${TIMELINE_HEADER_WIDTH}px + ${timelineWidth}px)` }} className="flex flex-col relative">
      <div
        style={{ left: `${TIMELINE_HEADER_WIDTH + timeToPixel(currentTime, basePixelsPerSecond * timelineZoom)}px` }}
        className="absolute top-0 bottom-0 w-[1.5px] bg-purple-500 z-30 pointer-events-none transition-all duration-75"
      >
        <div className="sticky top-0 z-40 h-7 flex items-start pointer-events-none">
          <div className="w-2.5 h-2.5 bg-purple-500 rotate-45 border border-white/25 -translate-x-1/2 shadow-[0_2px_6px_rgba(0,0,0,0.5)] mt-1 rounded-sm" />
        </div>
      </div>

      {hoverTime !== null && hoverScrubEnabled && (
        <div
          style={{ left: `${TIMELINE_HEADER_WIDTH + timeToPixel(hoverTime, basePixelsPerSecond * timelineZoom)}px` }}
          className="absolute top-0 bottom-0 w-[1px] bg-gray-400/80 z-30 pointer-events-none border-l border-dashed border-gray-900/50"
        >
          <div className="sticky top-0 z-40 h-7 flex items-center justify-center pointer-events-none">
            <div className="bg-gray-800 text-gray-300 border border-gray-600 text-[8px] font-mono font-black px-1.5 py-0.5 rounded-sm -translate-x-1/2 whitespace-nowrap shadow-md uppercase tracking-wide">
              {hoverTime.toFixed(2)}s
            </div>
          </div>
        </div>
      )}

      {snapLineTime !== null && (
        <div
          style={{ left: `${TIMELINE_HEADER_WIDTH + timeToPixel(snapLineTime, basePixelsPerSecond * timelineZoom)}px` }}
          className="absolute top-0 bottom-0 w-[1.5px] bg-yellow-400 z-30 pointer-events-none shadow-[0_0_8px_rgba(250,204,21,0.8)]"
        >
          <div className="sticky top-0 z-40 h-7 flex items-center justify-center pointer-events-none">
            <div className="bg-yellow-400 text-[8px] font-mono font-black text-black px-1.5 py-0.5 rounded-sm -translate-x-1/2 whitespace-nowrap shadow-md uppercase tracking-wide">
              SNAP {snapLineTime.toFixed(2)}s
            </div>
          </div>
        </div>
      )}

      <TimelineRuler
        timelineRef={timelineRef}
        timelineWidth={timelineWidth}
        totalDuration={totalDuration}
        basePixelsPerSecond={basePixelsPerSecond}
        timelineZoom={timelineZoom}
        visibleTimeRange={visibleTimeRange}
        markIn={markIn}
        markOut={markOut}
        handleTimelineMouseDown={handleTimelineMouseDown}
      />

      <TimelineTrackBoard
        timelineWidth={timelineWidth}
        totalDuration={totalDuration}
        basePixelsPerSecond={basePixelsPerSecond}
        timelineZoom={timelineZoom}
        visibleTimeRange={visibleTimeRange}
        activeDrag={activeDrag}
        editingTextClipId={editingTextClipId}
        setEditingTextClipId={setEditingTextClipId}
        trackMenuId={trackMenuId}
        setTrackMenuId={setTrackMenuId}
        handleWorkspaceMouseDown={handleWorkspaceMouseDown}
        handleWorkspaceMouseMove={handleWorkspaceMouseMove}
        handleContextMenu={handleContextMenu}
        handleClipMouseDown={handleClipMouseDown}
        handleClipDoubleClick={handleClipDoubleClick}
        handleRenameTrack={handleRenameTrack}
        handleDuplicateTrack={handleDuplicateTrack}
        handleAddTrack={handleAddTrack}
        handleDeleteTrack={handleDeleteTrack}
        workspaceRef={workspaceRef}
        professionalTrimTool={professionalTrimTool}
      />
    </div>
  </div>
);
