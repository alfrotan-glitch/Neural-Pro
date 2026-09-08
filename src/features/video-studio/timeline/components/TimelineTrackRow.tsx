import React from 'react';
import type { ClipNode, Track } from '../../project/types/project';
import type { ActiveDrag } from './timelineInteractionTypes';
import { TimelineTrackHeader } from './TimelineTrackHeader';
import { TimelineClip } from './TimelineClip';
import { TimelineAnimationMarkers } from './TimelineAnimationMarkers';
import { resolveTimelineClipGeometry, isTimelineClipVisible } from '../geometry';

export interface TimelineTrackRowProps {
  track: Track;
  trackBadge: string;
  timelineWidth: number;
  basePixelsPerSecond: number;
  timelineZoom: number;
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
  handleClipDoubleClick: (event: React.MouseEvent<HTMLDivElement>, clip: ClipNode, trackType: Track['type']) => void;
  handleRenameTrack: (trackId: string) => void;
  handleDuplicateTrack: (trackId: string) => void;
  handleAddTrack: (type: Track['type']) => void;
  handleDeleteTrack: (trackId: string) => void;
}

export const TimelineTrackRow: React.FC<TimelineTrackRowProps> = (props) => {
  const professionalTrimTool = props.professionalTrimTool ?? 'none';
  const state = {
    visible: props.track.isVisible !== false,
    locked: props.track.isLocked === true,
    muted: props.track.isMuted === true,
    collapsed: props.track.isCollapsed === true,
  };
  const pixelsPerSecond = props.basePixelsPerSecond * props.timelineZoom;
  const rowHeightClass = state.collapsed
    ? 'h-6 min-h-[24px]'
    : props.track.type === 'video'
    ? 'h-14 min-h-[56px]'
    : props.track.type === 'audio'
    ? 'h-11 min-h-[44px]'
    : 'h-7 min-h-[28px]';

  return (
    <div data-track-id={props.track.id} data-track-type={props.track.type} data-track-lane-role={props.track.laneRole ?? props.track.type} className={`${rowHeightClass} flex items-stretch shrink-0 w-full transition-colors duration-100 ${props.activeDrag && props.activeDrag.trackType === props.track.type && (props.track.laneRole ?? props.track.type) === (props.activeDrag.trackLaneRole ?? props.activeDrag.trackType) && props.activeDrag.trackId !== props.track.id ? 'bg-purple-900/5 border-y border-purple-500/10' : ''}`}>
      <TimelineTrackHeader
        track={props.track}
        trackBadge={props.trackBadge}
        isVisible={state.visible}
        isLocked={state.locked}
        isMuted={state.muted}
        isCollapsed={state.collapsed}
        trackMenuId={props.trackMenuId}
        setTrackMenuId={props.setTrackMenuId}
        handleRenameTrack={props.handleRenameTrack}
        handleDuplicateTrack={props.handleDuplicateTrack}
        handleAddTrack={props.handleAddTrack}
        handleDeleteTrack={props.handleDeleteTrack}
      />
      {!state.collapsed && (
        <div
          className="h-full relative bg-[#252628] shrink-0 overflow-hidden border-b border-white/[0.035]"
          style={{ width: `${props.timelineWidth}px`, backgroundImage: 'linear-gradient(to right, rgba(255,255,255,0.035) 1px, transparent 1px)', backgroundSize: `${Math.max(1, pixelsPerSecond)}px 100%` }}
          onPointerDown={(event) => props.handleWorkspaceMouseDown(event, props.track.id)}
          onMouseMove={props.handleWorkspaceMouseMove}
          onContextMenu={(event) => props.handleContextMenu(event, undefined, props.track.id)}
        >
          {props.track.clips
            .filter((clip) => isTimelineClipVisible(resolveTimelineClipGeometry(clip, pixelsPerSecond), props.visibleTimeRange.start, props.visibleTimeRange.end))
            .map((clip) => (
              <TimelineClip key={clip.id} clip={clip} track={props.track} pixelsPerSecond={pixelsPerSecond} editingTextClipId={props.editingTextClipId} setEditingTextClipId={props.setEditingTextClipId} handleClipMouseDown={props.handleClipMouseDown} handleClipDoubleClick={props.handleClipDoubleClick} handleContextMenu={props.handleContextMenu} professionalTrimTool={professionalTrimTool} />
            ))}
          {props.track.clips
            .filter((clip) => isTimelineClipVisible(resolveTimelineClipGeometry(clip, pixelsPerSecond), props.visibleTimeRange.start, props.visibleTimeRange.end))
            .map((clip) => {
              const geometry = resolveTimelineClipGeometry(clip, pixelsPerSecond);
              return (
                <div key={`${clip.id}-animation-markers`} className="absolute inset-0 pointer-events-none" style={{ left: `${geometry.leftPx}px`, width: `${geometry.widthPx}px` }}>
                  <TimelineAnimationMarkers clipId={clip.id} clipStart={geometry.startAt} clipDuration={geometry.duration} pixelsPerSecond={pixelsPerSecond} />
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
};
