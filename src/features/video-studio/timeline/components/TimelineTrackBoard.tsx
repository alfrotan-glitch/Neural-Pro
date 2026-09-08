import React, { useEffect, useMemo, useState } from 'react';
import type { ClipNode, Track } from '../../project/types/project';
import type { ActiveDrag } from './timelineInteractionTypes';
import { TimelineTrackRow } from './TimelineTrackRow';
import { useProjectStore } from '../../../../store/useProjectStore';

const RULER_HEIGHT = 28;
const TOP_DROPZONE_HEIGHT = 16;
const BOTTOM_DROPZONE_HEIGHT = 48;
export const TRACK_HEIGHT_VIDEO = 56;
export const TRACK_HEIGHT_AUDIO = 44;
export const TRACK_HEIGHT_SLIM = 28;
export const TRACK_HEIGHT_COLLAPSED = 24;
const OVERSCAN_PX = 224;

export interface TimelineTrackBoardProps {
  workspaceRef: React.RefObject<HTMLDivElement | null>;
  timelineWidth: number;
  basePixelsPerSecond: number;
  timelineZoom: number;
  totalDuration: number;
  visibleTimeRange: { start: number; end: number };
  activeDrag: ActiveDrag | null;
  editingTextClipId: string | null;
  setEditingTextClipId: (value: string | null) => void;
  trackMenuId: string | null;
  setTrackMenuId: (value: string | null) => void;
  handleWorkspaceMouseDown: (event: React.PointerEvent<HTMLDivElement>, trackId: string) => void;
  handleWorkspaceMouseMove: (event: React.MouseEvent) => void;
  handleContextMenu: (event: React.MouseEvent<HTMLDivElement>, clipId?: string, trackId?: string) => void;
  handleClipMouseDown: (event: React.PointerEvent<HTMLDivElement>, clipId: string, trackId: string, trackType: Track['type']) => void;
  professionalTrimTool?: 'none' | 'roll' | 'slip';
  handleClipDoubleClick: (event: React.MouseEvent<HTMLDivElement>, clip: ClipNode, trackType: string) => void;
  handleRenameTrack: (trackId: string) => void;
  handleDuplicateTrack: (trackId: string) => void;
  handleAddTrack: (type: Track['type']) => void;
  handleDeleteTrack: (trackId: string) => void;
  tracks?: Track[];
}

interface VirtualWindow {
  startIndex: number;
  endIndex: number;
  topSpacer: number;
  bottomSpacer: number;
  totalHeight: number;
}

export const getTrackHeight = (track: Track): number => {
  if (track.isCollapsed) return TRACK_HEIGHT_COLLAPSED;
  if (track.type === 'video') return TRACK_HEIGHT_VIDEO;
  if (track.type === 'audio') return TRACK_HEIGHT_AUDIO;
  return TRACK_HEIGHT_SLIM;
};

const findFirstTrackIntersecting = (
  offsets: readonly number[],
  heights: readonly number[],
  position: number,
): number => {
  if (offsets.length === 0) return 0;
  let low = 0;
  let high = offsets.length - 1;
  let result = offsets.length;

  while (low <= high) {
    const mid = (low + high) >> 1;
    const offset = offsets[mid] ?? 0;
    const height = heights[mid] ?? 0;
    const end = offset + height;
    if (end >= position) {
      result = mid;
      high = mid - 1;
    } else {
      low = mid + 1;
    }
  }

  return result;
};

const buildVirtualWindow = (
  tracks: readonly Track[],
  scrollTop: number,
  viewportHeight: number,
): VirtualWindow => {
  const heights = tracks.map(getTrackHeight);
  const offsets = new Array<number>(tracks.length);
  let totalHeight = 0;

  for (let index = 0; index < tracks.length; index += 1) {
    offsets[index] = totalHeight;
    totalHeight += heights[index] ?? 0;
  }

  const effectiveTop = Math.max(0, scrollTop - RULER_HEIGHT - TOP_DROPZONE_HEIGHT - OVERSCAN_PX);
  const effectiveBottom = Math.min(
    totalHeight,
    Math.max(0, scrollTop - RULER_HEIGHT - TOP_DROPZONE_HEIGHT) +
      Math.max(0, viewportHeight - RULER_HEIGHT) +
      OVERSCAN_PX,
  );

  const startIndex = findFirstTrackIntersecting(offsets, heights, effectiveTop);
  const endIndex = Math.min(
    tracks.length,
    Math.max(startIndex, findFirstTrackIntersecting(offsets, heights, effectiveBottom) + 1),
  );

  return {
    startIndex,
    endIndex,
    topSpacer: startIndex > 0 ? (offsets[startIndex] ?? 0) : 0,
    bottomSpacer: totalHeight - (endIndex < tracks.length ? (offsets[endIndex] ?? totalHeight) : totalHeight),
    totalHeight,
  };
};

export const TimelineTrackBoard: React.FC<TimelineTrackBoardProps> = ({
  workspaceRef,
  timelineWidth,
  basePixelsPerSecond,
  timelineZoom,
  visibleTimeRange,
  activeDrag,
  editingTextClipId,
  setEditingTextClipId,
  trackMenuId,
  setTrackMenuId,
  handleWorkspaceMouseDown,
  handleWorkspaceMouseMove,
  handleContextMenu,
  handleClipMouseDown,
  handleClipDoubleClick,
  handleRenameTrack,
  handleDuplicateTrack,
  handleAddTrack,
  handleDeleteTrack,
  professionalTrimTool = 'none',
  tracks: tracksProp,
}) => {
  const { tracks: storeTracks } = useProjectStore();
  const tracks = tracksProp ?? storeTracks;
  const [viewport, setViewport] = useState({ scrollTop: 0, height: 0 });

  const orderMap: Record<string, number> = {
    text: 0,
    caption: 1,
    element: 2,
    overlay: 3,
    subscribe: 4,
    sticker: 5,
    effect: 6,
    transition: 7,
    filter: 8,
    adjustment: 9,
    video: 10,
    image: 11,
    audio: 12,
  };

  const sortedTracks = useMemo(
    () => [...tracks].sort((a, b) => {
      const aRole = a.laneRole ?? a.type;
      const bRole = b.laneRole ?? b.type;
      return (orderMap[aRole] ?? 99) - (orderMap[bRole] ?? 99);
    }),
    [tracks],
  );

  useEffect(() => {
    const element = workspaceRef.current;
    if (!element) return;

    const update = () => {
      setViewport({ scrollTop: element.scrollTop, height: element.clientHeight });
    };

    update();
    element.addEventListener('scroll', update, { passive: true });

    const resizeObserver = new ResizeObserver(update);
    resizeObserver.observe(element);

    return () => {
      element.removeEventListener('scroll', update);
      resizeObserver.disconnect();
    };
  }, [workspaceRef]);

  const virtualWindow = useMemo(
    () => buildVirtualWindow(sortedTracks, viewport.scrollTop, viewport.height),
    [sortedTracks, viewport.scrollTop, viewport.height],
  );

  const typeCounterBeforeStart = useMemo(() => {
    const counters: Record<string, number> = {};
    for (let index = 0; index < virtualWindow.startIndex; index += 1) {
      const track = sortedTracks[index];
      if (!track) continue;
      const type = track.type;
      counters[type] = (counters[type] ?? 0) + 1;
    }
    return counters;
  }, [sortedTracks, virtualWindow.startIndex]);

  const typeCounters = { ...typeCounterBeforeStart };

  return (
    <div
      data-timeline-track-board
      data-total-track-height={virtualWindow.totalHeight}
      className="flex-1 min-w-full bg-[#252628]"
    >
      <div
        data-new-track-dropzone="top"
        className={`h-4 shrink-0 w-full transition-all duration-150 border-b border-dashed border-white/5 flex items-center justify-center ${activeDrag ? 'bg-purple-500/5 hover:bg-purple-500/10 cursor-copy' : 'opacity-0 h-0 hidden'}`}
      />

      {virtualWindow.topSpacer > 0 && (
        <div aria-hidden="true" style={{ height: virtualWindow.topSpacer }} className="shrink-0" />
      )}

      {sortedTracks.slice(virtualWindow.startIndex, virtualWindow.endIndex).map((track) => {
        typeCounters[track.type] = (typeCounters[track.type] ?? 0) + 1;
        return (
          <TimelineTrackRow
            key={track.id}
            track={track}
            trackBadge={`${track.type.charAt(0).toUpperCase()}${typeCounters[track.type]}`}
            timelineWidth={timelineWidth}
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
            professionalTrimTool={professionalTrimTool}
          />
        );
      })}

      {virtualWindow.bottomSpacer > 0 && (
        <div aria-hidden="true" style={{ height: virtualWindow.bottomSpacer }} className="shrink-0" />
      )}

      <div
        data-new-track-dropzone="true"
        className={`h-12 min-h-[48px] shrink-0 w-full transition-all duration-150 border-t border-dashed border-white/5 flex items-center justify-center ${activeDrag ? 'bg-purple-500/5 hover:bg-purple-500/10 cursor-copy' : 'opacity-0'}`}
      >
        {activeDrag && <span className="text-xs font-semibold text-purple-400 font-mono">+ DRAG HERE TO CREATE NEW TRACK</span>}
      </div>
    </div>
  );
};
