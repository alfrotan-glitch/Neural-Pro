import React from 'react';
import type { ClipNode, Track } from '../../project/types/project';
import { useProjectStore } from '../../../../store/useProjectStore';
import { createTrackSnapshotCommand } from '../../project/commands';
import { resolveTimelineClipGeometry } from '../geometry';

export interface TimelineClipProps {
  clip: ClipNode;
  track: Track;
  pixelsPerSecond: number;
  editingTextClipId: string | null;
  setEditingTextClipId: (value: string | null) => void;
  handleClipMouseDown: (event: React.PointerEvent<HTMLDivElement>, clipId: string, trackId: string, trackType: Track['type'], requestedDragMode?: 'move' | 'trim-left' | 'trim-right' | 'rate-stretch' | 'roll-left' | 'roll-right' | 'roll' | 'slip') => void;
  professionalTrimTool?: 'none' | 'roll-left' | 'roll-right' | 'roll' | 'slip';
  handleClipDoubleClick: (event: React.MouseEvent<HTMLDivElement>, clip: ClipNode, trackType: Track['type']) => void;
  handleContextMenu: (event: React.MouseEvent<HTMLDivElement>, clipId?: string, trackId?: string) => void;
}

const getWaveformData = (clip: ClipNode): number[] => {
  if (Array.isArray(clip.properties.waveformData)) return clip.properties.waveformData as number[];
  return [];
};

const getClipDisplayName = (clip: ClipNode): string => String(clip.properties?.name || clip.properties?.textContent || 'Untitled Clip');

const getPreviewSource = (clip: ClipNode): string | null => {
  const value = [clip.properties?.thumbnailUrl, clip.properties?.thumbnail, clip.properties?.imageUrl, clip.properties?.videoThumbnail, clip.properties?.videoUrl]
    .find((candidate) => typeof candidate === 'string' && /^(blob:|data:|https?:\/\/|file:)/i.test(candidate));
  return typeof value === 'string' ? value : null;
};

const formatTimecode = (seconds: number): string => {
  const safe = Math.max(0, Math.floor(seconds));
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = safe % 60;
  return h > 0 ? `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `00:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};

const getClipClass = (type: string, selected: boolean): string => {
  const state = selected ? 'ring-1 ring-white/80 shadow-[0_0_0_1px_rgba(255,255,255,0.12)] z-20' : 'hover:brightness-110';
  switch (type) {
    case 'text': return `bg-[#d99124] border-[#f2b94b] text-[#fff4d9] ${state}`;
    case 'audio': return `bg-[#0b4f69] border-[#146a8a] text-[#dff7ff] ${state}`;
    case 'effect': return `bg-[#b85c34] border-[#d98357] text-[#fff0e8] ${state}`;
    default: return `bg-[#0b6b72] border-[#118a92] text-[#e9ffff] ${state}`;
  }
};

export const TimelineClip: React.FC<TimelineClipProps> = ({
  clip,
  track,
  pixelsPerSecond,
  editingTextClipId,
  setEditingTextClipId,
  handleClipMouseDown,
  handleClipDoubleClick,
  handleContextMenu,
  professionalTrimTool = 'none',
}) => {
  const { tracks, selectedNodeIds, executeCommand, showToast } = useProjectStore();
  const selected = selectedNodeIds.includes(clip.id);
  const geometry = resolveTimelineClipGeometry(clip, pixelsPerSecond);
  const left = geometry.leftPx;
  const width = geometry.widthPx;
  const source = getPreviewSource(clip);
  const isImageClip = Boolean(clip.properties?.imageUrl) && !clip.properties?.videoUrl;
  const waveformData = getWaveformData(clip);

  const commitText = (value: string) => {
    const initialTracks = structuredClone(tracks);
    const nextTracks = tracks.map((trackNode) => ({
      ...trackNode,
      clips: trackNode.clips.map((candidate) => candidate.id === clip.id
        ? { ...candidate, properties: { ...candidate.properties, textContent: value, name: value } }
        : candidate),
    }));
    executeCommand(createTrackSnapshotCommand('Edit Clip Text', initialTracks, nextTracks));
    setEditingTextClipId(null);
  };

  return (
    <div
      data-clip-id={clip.id}
      data-track-type={track.type}
      onPointerDown={(event) => {
        if (professionalTrimTool === 'roll') {
          event.stopPropagation();
          if (event.button !== 0) return;
          useProjectStore.getState().setSelectedNodeIds([clip.id]);
          return;
        }
        handleClipMouseDown(event, clip.id, track.id, track.type, professionalTrimTool === 'slip' ? 'slip' : undefined);
      }}
      onDoubleClick={(event) => handleClipDoubleClick(event, clip, track.type)}
      onContextMenu={(event) => handleContextMenu(event, clip.id, track.id)}
      style={{ left: `${left}px`, width: `${width}px` }}
      className={`absolute top-[3px] bottom-[3px] cursor-grab select-none group ${getClipClass(track.type, selected)}`}
    >
      <div className="absolute inset-0 overflow-hidden rounded-[4px] border pointer-events-auto">
      {editingTextClipId === clip.id ? (
        <input
          autoFocus
          defaultValue={clip.properties.textContent || ''}
          className="absolute inset-0 z-50 bg-[#3b0764]/95 border-2 border-purple-400 text-white text-[10px] font-bold px-2.5 rounded-lg text-center select-text focus:outline-none"
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.stopPropagation();
              commitText(event.currentTarget.value);
              showToast('📝 Text updated!');
            } else if (event.key === 'Escape') {
              event.stopPropagation();
              setEditingTextClipId(null);
            }
          }}
          onBlur={(event) => commitText(event.currentTarget.value)}
          onClick={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
        />
      ) : track.type === 'audio' ? (
        <div className="absolute inset-0 flex flex-col justify-center px-2 py-1.5">
          <div className="absolute left-1.5 right-1.5 top-1 h-3 flex items-center gap-0.5 overflow-hidden opacity-95">
            {(waveformData.length > 0 ? waveformData : [12, 18, 24, 14, 20, 10]).map((height, index) => <span key={index} className="min-w-0 flex-1 rounded-full bg-[#39bfe5]" style={{ height: `${Math.max(8, height)}%`, opacity: waveformData.length > 0 ? 1 : 0.35 }} />)}
          </div>
          <div className="relative z-10 mt-2 flex items-center justify-between gap-2 px-1">
            <span className="truncate text-[9px] font-semibold text-[#d9f7ff]">{getClipDisplayName(clip)}</span>
            <span className="shrink-0 text-[8px] font-mono text-[#9addec]">{formatTimecode(clip.startAt)}</span>
          </div>
        </div>
      ) : track.type === 'video' || clip.properties?.imageUrl || clip.properties?.thumbnailUrl ? (
        <div className="absolute inset-0">
          {source && isImageClip ? (
            <img
              src={source}
              alt=""
              draggable={false}
              className="absolute inset-0 h-full w-full object-cover"
            />
          ) : (
            <div className="absolute inset-0 opacity-95" style={source ? { backgroundImage: `linear-gradient(to bottom, rgba(7,42,45,0.12), rgba(7,32,36,0.28)), url(${source})`, backgroundSize: `${Math.max(56, Math.min(96, pixelsPerSecond * 2))}px 100%`, backgroundRepeat: 'repeat-x', backgroundPosition: 'center' } : undefined}>
              {!source && <div className="absolute inset-0 bg-[linear-gradient(90deg,#0c6168,#0d747b,#0a5b62)]" />}
            </div>
          )}
          <div className="absolute inset-x-0 top-0 h-5 bg-gradient-to-b from-black/35 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 px-2 py-1.5 bg-gradient-to-t from-black/65 via-black/20 to-transparent flex items-end justify-between gap-2">
            <span className="truncate text-[8.5px] font-semibold text-white drop-shadow">{getClipDisplayName(clip)}</span>
            <span className="shrink-0 text-[8px] font-mono text-white/75">{formatTimecode(clip.startAt)}</span>
          </div>
        </div>
      ) : (
        <div className="absolute inset-0 flex items-center justify-between gap-1.5 px-2">
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded bg-black/25 text-[9px] font-black text-white/90">{track.type === 'effect' ? '✦' : 'T'}</span>
            <span className="truncate text-[8.5px] font-bold text-white">{getClipDisplayName(clip)}</span>
          </div>
          <span className="shrink-0 text-[7.5px] font-mono text-white/70">{formatTimecode(clip.startAt)}</span>
        </div>
      )}
      </div>
      <div
        data-timeline-resize-edge="left" data-timeline-roll-edge={professionalTrimTool === 'roll' ? 'active' : undefined}
        aria-label="Trim clip start"
        className={`absolute inset-y-0 left-0 z-40 w-[10px] -translate-x-1/2 cursor-col-resize opacity-0 transition-opacity group-hover:opacity-100 ${professionalTrimTool === 'roll' ? 'bg-amber-300/40' : ''}`}
        onPointerDown={(event) => {
          event.stopPropagation();
          handleClipMouseDown(event, clip.id, track.id, track.type, professionalTrimTool === 'roll' ? 'roll-left' : 'trim-left');
        }}
      />
      <div
        data-timeline-resize-edge="right" data-timeline-roll-edge={professionalTrimTool === 'roll' ? 'active' : undefined}
        aria-label="Trim clip end"
        className={`absolute inset-y-0 right-0 z-40 w-[10px] translate-x-1/2 cursor-col-resize opacity-0 transition-opacity group-hover:opacity-100 ${professionalTrimTool === 'roll' ? 'bg-amber-300/40' : ''}`}
        onPointerDown={(event) => {
          event.stopPropagation();
          handleClipMouseDown(event, clip.id, track.id, track.type, professionalTrimTool === 'roll' ? 'roll-right' : 'trim-right');
        }}
      />
      {clip.properties.speed && Math.abs(clip.properties.speed - 1) > 0.05 && <span className="absolute right-1 top-1 z-20 rounded-[2px] border border-white/25 bg-black/35 px-1 py-0.5 text-[7px] font-mono font-bold text-white pointer-events-none">⚡ {clip.properties.speed.toFixed(1)}x</span>}
    </div>
  );
};
