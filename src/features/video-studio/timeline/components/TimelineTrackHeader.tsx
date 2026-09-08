import React from 'react';
import { Eye, EyeOff, Lock, Unlock, Volume2, VolumeX, MoreHorizontal, ChevronDown, ChevronRight } from 'lucide-react';
import type { Track } from '../../project/types/project';
import { useProjectStore } from '../../../../store/useProjectStore';
import { TIMELINE_HEADER_WIDTH } from '../geometry';

export interface TimelineTrackHeaderProps {
  track: Track;
  trackBadge: string;
  isVisible: boolean;
  isLocked: boolean;
  isMuted: boolean;
  isCollapsed: boolean;
  trackMenuId: string | null;
  setTrackMenuId: (value: string | null) => void;
  handleRenameTrack: (trackId: string) => void;
  handleDuplicateTrack: (trackId: string) => void;
  handleAddTrack: (type: Track['type']) => void;
  handleDeleteTrack: (trackId: string) => void;
}

export const TimelineTrackHeader: React.FC<TimelineTrackHeaderProps> = ({
  track,
  trackBadge,
  isVisible,
  isLocked,
  isMuted,
  isCollapsed,
  trackMenuId,
  setTrackMenuId,
  handleRenameTrack,
  handleDuplicateTrack,
  handleAddTrack,
  handleDeleteTrack,
}) => {
  const { toggleTrackState } = useProjectStore();

  return (
    <div
      style={{ width: `${TIMELINE_HEADER_WIDTH}px`, minWidth: `${TIMELINE_HEADER_WIDTH}px`, maxWidth: `${TIMELINE_HEADER_WIDTH}px` }}
      className="bg-[#202124] border-r border-[#343638] px-2.5 flex items-center justify-between shrink-0 sticky left-0 z-20 select-none overflow-hidden"
    >
      <div className="flex items-center gap-1 min-w-0 pr-1">
        <button
          onClick={() => toggleTrackState(track.id, 'collapsed')}
          className="p-0.5 rounded text-gray-500 hover:text-white transition-colors"
          aria-label={isCollapsed ? 'Expand track' : 'Collapse track'}
        >
          {isCollapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </button>
        <button className="px-1 py-0.5 rounded bg-white/5 border border-white/10 text-[7px] font-mono font-bold text-gray-400 hover:text-white hover:bg-purple-500/20 hover:border-purple-500/40 transition-colors shrink-0">
          {trackBadge}
        </button>
        {!isCollapsed && (
          <div className="min-w-0 ml-1">
            <p className="text-[9px] font-bold text-gray-300 capitalize truncate">
              {String(track.name ?? (track.type === 'effect' ? 'Effects & Stickers' : track.type))}
            </p>
          </div>
        )}
      </div>

      <div className="flex items-center gap-0.5">
        <button
          onClick={() => toggleTrackState(track.id, 'visible')}
          className={`p-1 rounded hover:bg-white/5 transition-all cursor-pointer ${isVisible ? 'text-gray-400 hover:text-white' : 'text-purple-500'}`}
          title={isVisible ? 'Hide Track' : 'Show Track'}
          aria-label={isVisible ? 'Hide Track' : 'Show Track'}
        >
          {isVisible ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
        </button>
        <button
          onClick={() => toggleTrackState(track.id, 'locked')}
          className={`p-1 rounded hover:bg-white/5 transition-all cursor-pointer ${isLocked ? 'text-purple-500' : 'text-gray-400 hover:text-white'}`}
          title={isLocked ? 'Unlock Track' : 'Lock Track'}
          aria-label={isLocked ? 'Unlock Track' : 'Lock Track'}
        >
          {isLocked ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
        </button>
        {track.type === 'audio' && (
          <button
            onClick={() => toggleTrackState(track.id, 'muted')}
            className={`p-1 rounded hover:bg-white/5 transition-all cursor-pointer ${isMuted ? 'text-purple-500' : 'text-gray-400 hover:text-white'}`}
            title={isMuted ? 'Unmute Audio' : 'Mute Audio'}
            aria-label={isMuted ? 'Unmute Audio' : 'Mute Audio'}
          >
            {isMuted ? <VolumeX className="w-3 h-3" /> : <Volume2 className="w-3 h-3" />}
          </button>
        )}
        <div className="relative">
          <button
            onClick={(event) => {
              event.stopPropagation();
              setTrackMenuId(trackMenuId === track.id ? null : track.id);
            }}
            className="p-1 rounded hover:bg-white/5 text-gray-500 hover:text-white"
            title="Track options"
            aria-label="Track options"
          >
            <MoreHorizontal className="w-3 h-3" />
          </button>
          {trackMenuId === track.id && (
            <div
              className="absolute left-full top-0 ml-1 z-[80] min-w-[170px] rounded-lg border border-white/10 bg-[#18191e]/98 shadow-[0_10px_30px_rgba(0,0,0,.6)] py-1"
              onClick={(event) => event.stopPropagation()}
            >
              <button onClick={() => { handleRenameTrack(track.id); setTrackMenuId(null); }} className="w-full text-left px-3 py-1.5 text-[10px] text-gray-200 hover:bg-white/5">Rename track</button>
              <button onClick={() => { handleDuplicateTrack(track.id); setTrackMenuId(null); }} className="w-full text-left px-3 py-1.5 text-[10px] text-gray-200 hover:bg-white/5">Duplicate track</button>
              <button onClick={() => { handleAddTrack(track.type); setTrackMenuId(null); }} className="w-full text-left px-3 py-1.5 text-[10px] text-gray-200 hover:bg-white/5">Add same-type track</button>
              <div className="my-1 border-t border-white/8" />
              <button onClick={() => { handleDeleteTrack(track.id); setTrackMenuId(null); }} className="w-full text-left px-3 py-1.5 text-[10px] text-red-300 hover:bg-red-500/10">Delete track</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
