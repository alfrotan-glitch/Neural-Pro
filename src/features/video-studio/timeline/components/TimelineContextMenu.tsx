import React, { useState } from 'react';
import {
  Activity,
  ChevronRight,
  Clipboard,
  Copy,
  Download,
  EyeOff,
  FileInput,
  Layers,
  Link2,
  MoreHorizontal,
  Replace,
  Scissors,
  Shield,
  Sparkles,
  Trash2,
  Unlink,
  Wand2,
  Workflow,
} from 'lucide-react';
import type { ClipNode, Track } from '../../project/types/project';

export type TimelineContextAction =
  | 'copy'
  | 'cut'
  | 'copy-attributes'
  | 'paste-attributes'
  | 'split'
  | 'trim'
  | 'trim-start'
  | 'trim-end'
  | 'image-to-video'
  | 'split-scenes'
  | 'transcribe'
  | 'recover-audio'
  | 'sync-audio-video'
  | 'separate-audio'
  | 'compound'
  | 'multi-camera'
  | 'save-preset'
  | 'group'
  | 'ungroup'
  | 'mirror'
  | 'deactivate'
  | 'replace'
  | 'link-media'
  | 'open-file-location'
  | 'edit-effects'
  | 'variable-speed'
  | 'export-selected'
  | 'render-selected'
  | 'range-in'
  | 'range-out'
  | 'range-clear'
  | 'delete'
  | 'ripple-delete';

export interface TimelineContextMenuProps {
  x: number;
  y: number;
  clip?: ClipNode;
  track?: Track;
  hasClipboard: boolean;
  hasAttributesClipboard: boolean;
  selectedCount: number;
  canPaste: boolean;
  canSplit: boolean;
  canTrim: boolean;
  canSeparateAudio: boolean;
  canRecoverAudio: boolean;
  canSyncAudio: boolean;
  canImageToVideo: boolean;
  canSplitScenes: boolean;
  canGroup: boolean;
  canUngroup: boolean;
  canExport: boolean;
  canRender: boolean;
  onAction: (action: TimelineContextAction) => void;
  onClose: () => void;
}

const itemClass =
  'w-full text-left px-3.5 py-2 flex items-center justify-between gap-4 text-[11px] text-gray-200 hover:bg-white/6 hover:text-white transition-colors';
const disabledClass = 'opacity-35 cursor-not-allowed';

export const TimelineContextMenu: React.FC<TimelineContextMenuProps> = ({
  x,
  y,
  clip,
  track,
  hasClipboard,
  hasAttributesClipboard,
  selectedCount,
  canPaste,
  canSplit,
  canTrim,
  canSeparateAudio,
  canRecoverAudio,
  canSyncAudio,
  canImageToVideo,
  canSplitScenes,
  canGroup,
  canUngroup,
  canExport,
  canRender,
  onAction,
  onClose,
}) => {
  const [submenu, setSubmenu] = useState<'edit' | 'media' | 'range' | 'render' | null>(null);

  const action = (value: TimelineContextAction) => {
    onAction(value);
    onClose();
  };

  const menuStyle: React.CSSProperties = {
    top: Math.max(8, Math.min(y, window.innerHeight - 680)),
    left: Math.max(8, Math.min(x, window.innerWidth - 360)),
  };

  return (
    <div
      style={menuStyle}
      className="fixed z-[120] min-w-[292px] max-w-[360px] rounded-xl border border-white/10 bg-[#202124]/98 py-1 shadow-[0_18px_60px_rgba(0,0,0,.7)] backdrop-blur-xl select-none"
      onClick={(event) => event.stopPropagation()}
      onContextMenu={(event) => event.preventDefault()}
    >
      <button className={itemClass} onClick={() => action('copy')}>
        <span className="flex items-center gap-2"><Copy className="h-3.5 w-3.5" />Copy</span><kbd>Ctrl C</kbd>
      </button>
      <button className={itemClass} onClick={() => action('cut')}>
        <span className="flex items-center gap-2"><Scissors className="h-3.5 w-3.5" />Cut</span><kbd>Ctrl X</kbd>
      </button>
      <button className={itemClass} onClick={() => action('copy-attributes')}>
        <span className="flex items-center gap-2"><Clipboard className="h-3.5 w-3.5" />Copy attributes</span><kbd>Ctrl Shift C</kbd>
      </button>
      <button
        disabled={!hasAttributesClipboard}
        className={`${itemClass} ${!hasAttributesClipboard ? disabledClass : ''}`}
        onClick={() => action('paste-attributes')}
      >
        <span className="flex items-center gap-2"><Clipboard className="h-3.5 w-3.5" />Paste attributes</span><kbd>Ctrl Shift V</kbd>
      </button>

      <div className="my-1 border-t border-white/8" />

      <div className="relative">
        <button className={itemClass} onClick={() => setSubmenu(submenu === 'edit' ? null : 'edit')}>
          <span className="flex items-center gap-2"><Scissors className="h-3.5 w-3.5" />Edit</span>
          <ChevronRight className="h-3.5 w-3.5 text-gray-500" />
        </button>
        {submenu === 'edit' && (
          <div className="absolute left-full top-0 ml-1 min-w-[250px] rounded-xl border border-white/10 bg-[#202124]/98 py-1 shadow-[0_18px_60px_rgba(0,0,0,.7)]">
            <button disabled={!canSplit} className={`${itemClass} ${!canSplit ? disabledClass : ''}`} onClick={() => action('split')}>Split <kbd>S</kbd></button>
            <button disabled={!canTrim} className={`${itemClass} ${!canTrim ? disabledClass : ''}`} onClick={() => action('trim')}>Trim clip</button>
            <button disabled={!canTrim} className={`${itemClass} ${!canTrim ? disabledClass : ''}`} onClick={() => action('trim-start')}>Trim start to playhead</button>
            <button disabled={!canTrim} className={`${itemClass} ${!canTrim ? disabledClass : ''}`} onClick={() => action('trim-end')}>Trim end to playhead</button>
            <button disabled={!canImageToVideo} className={`${itemClass} ${!canImageToVideo ? disabledClass : ''}`} onClick={() => action('image-to-video')}>Image to video</button>
            <button disabled={!canSplitScenes} className={`${itemClass} ${!canSplitScenes ? disabledClass : ''}`} onClick={() => action('split-scenes')}>Split scenes <span className="rounded bg-purple-500/90 px-1 py-0.5 text-[8px] font-bold text-white">Free</span></button>
            <button className={itemClass} onClick={() => action('edit-effects')}><span>Edit effects</span><Sparkles className="h-3.5 w-3.5 text-purple-300" /></button>
            <button className={itemClass} onClick={() => action('variable-speed')}><span>Show variable speed animation</span><kbd>Alt K</kbd></button>
            <button className={itemClass} onClick={() => action('replace')}><span className="flex items-center gap-2"><Replace className="h-3.5 w-3.5" />Replace clip</span></button>
          </div>
        )}
      </div>

      <button
        disabled={!canImageToVideo}
        className={`${itemClass} ${!canImageToVideo ? disabledClass : ''}`}
        onClick={() => action('image-to-video')}
      >
        <span>Image to video</span>
        <Sparkles className="h-3.5 w-3.5 text-purple-300" />
      </button>

      <div className="relative">
        <button className={itemClass} onClick={() => setSubmenu(submenu === 'media' ? null : 'media')}>
          <span className="flex items-center gap-2"><Sparkles className="h-3.5 w-3.5 text-purple-300" />AI / Media</span>
          <ChevronRight className="h-3.5 w-3.5 text-gray-500" />
        </button>
        {submenu === 'media' && (
          <div className="absolute left-full top-0 ml-1 min-w-[245px] rounded-xl border border-white/10 bg-[#202124]/98 py-1 shadow-[0_18px_60px_rgba(0,0,0,.7)]">
            <button className={itemClass} onClick={() => action('transcribe')}>Transcript <span className="rounded bg-purple-500/90 px-1 py-0.5 text-[8px] font-bold text-white">AI</span></button>
            <button disabled={!canRecoverAudio} className={`${itemClass} ${!canRecoverAudio ? disabledClass : ''}`} onClick={() => action('recover-audio')}>Recover audio <kbd>Ctrl Shift S</kbd></button>
            <button disabled={!canSyncAudio} className={`${itemClass} ${!canSyncAudio ? disabledClass : ''}`} onClick={() => action('sync-audio-video')}>Sync video and audio</button>
            <button disabled={!canSeparateAudio} className={`${itemClass} ${!canSeparateAudio ? disabledClass : ''}`} onClick={() => action('separate-audio')}>Separate audio <ChevronRight className="h-3.5 w-3.5" /></button>
            <button disabled={!canSplitScenes} className={`${itemClass} ${!canSplitScenes ? disabledClass : ''}`} onClick={() => action('split-scenes')}>Split scenes <span className="rounded bg-purple-500/90 px-1 py-0.5 text-[8px] font-bold text-white">Free</span></button>
          </div>
        )}
      </div>

      <div className="my-1 border-t border-white/8" />

      <button disabled={selectedCount < 2} className={`${itemClass} ${selectedCount < 2 ? disabledClass : ''}`} onClick={() => action('compound')}>
        <span className="flex items-center gap-2"><Layers className="h-3.5 w-3.5" />Create compound clip (subproject)</span><kbd>Alt G</kbd>
      </button>
      <button disabled className={`${itemClass} ${disabledClass}`} onClick={() => action('multi-camera')}>
        <span>Create multi-camera clip</span><span className="rounded bg-purple-500/90 px-1 py-0.5 text-[8px] font-bold text-white">Free</span>
      </button>
      <button className={itemClass} onClick={() => action('save-preset')}>
        <span className="flex items-center gap-2"><Shield className="h-3.5 w-3.5" />Save preset</span>
      </button>
      <button disabled={!canGroup} className={`${itemClass} ${!canGroup ? disabledClass : ''}`} onClick={() => action('group')}>
        <span className="flex items-center gap-2"><Link2 className="h-3.5 w-3.5" />Group</span><kbd>Ctrl G</kbd>
      </button>
      <button disabled={!canUngroup} className={`${itemClass} ${!canUngroup ? disabledClass : ''}`} onClick={() => action('ungroup')}>
        <span className="flex items-center gap-2"><Unlink className="h-3.5 w-3.5" />Ungroup</span><kbd>Ctrl Shift G</kbd>
      </button>

      <div className="my-1 border-t border-white/8" />

      <button className={itemClass} onClick={() => action('mirror')}>Mirror <Activity className="h-3.5 w-3.5" /></button>
      <button className={itemClass} onClick={() => action('deactivate')}>
        <span className="flex items-center gap-2"><EyeOff className="h-3.5 w-3.5" />Deactivate clip</span><kbd>V</kbd>
      </button>
      <button className={itemClass} onClick={() => action('link-media')}>
        <span className="flex items-center gap-2"><Link2 className="h-3.5 w-3.5" />Link to media</span>
      </button>
      <button className={itemClass} onClick={() => action('open-file-location')}>
        <span className="flex items-center gap-2"><FileInput className="h-3.5 w-3.5" />Open file location</span>
      </button>
      <button disabled={!canExport} className={`${itemClass} ${!canExport ? disabledClass : ''}`} onClick={() => action('export-selected')}>
        <span className="flex items-center gap-2"><Download className="h-3.5 w-3.5" />Export selected clips</span>
      </button>

      <div className="relative">
        <button disabled={!canRender} className={`${itemClass} ${!canRender ? disabledClass : ''}`} onClick={() => setSubmenu(submenu === 'render' ? null : 'render')}>
          <span className="flex items-center gap-2"><Wand2 className="h-3.5 w-3.5" />Render</span>
          <ChevronRight className="h-3.5 w-3.5 text-gray-500" />
        </button>
        {submenu === 'render' && (
          <div className="absolute left-full bottom-0 ml-1 min-w-[220px] rounded-xl border border-white/10 bg-[#202124]/98 py-1 shadow-[0_18px_60px_rgba(0,0,0,.7)]">
            <button className={itemClass} onClick={() => action('render-selected')}>Render selected clips</button>
            <button className={itemClass} onClick={() => action('range-in')}>Render In → Out</button>
          </div>
        )}
      </div>

      <div className="relative">
        <button className={itemClass} onClick={() => setSubmenu(submenu === 'range' ? null : 'range')}>
          <span>Range</span><ChevronRight className="h-3.5 w-3.5 text-gray-500" />
        </button>
        {submenu === 'range' && (
          <div className="absolute left-full bottom-0 ml-1 min-w-[190px] rounded-xl border border-white/10 bg-[#202124]/98 py-1 shadow-[0_18px_60px_rgba(0,0,0,.7)]">
            <button className={itemClass} onClick={() => action('range-in')}>Set In</button>
            <button className={itemClass} onClick={() => action('range-out')}>Set Out</button>
            <button className={itemClass} onClick={() => action('range-clear')}>Clear Range</button>
          </div>
        )}
      </div>

      <div className="my-1 border-t border-white/8" />
      <button className={`${itemClass} text-red-200 hover:text-red-100`} onClick={() => action('delete')}>
        <span className="flex items-center gap-2"><Trash2 className="h-3.5 w-3.5 text-red-400" />Delete</span><kbd>Backspace</kbd>
      </button>
      <button className={`${itemClass} text-purple-200 hover:text-purple-100`} onClick={() => action('ripple-delete')}>
        <span className="flex items-center gap-2"><Trash2 className="h-3.5 w-3.5 text-purple-400" />Ripple delete</span><kbd>Shift Delete</kbd>
      </button>
    </div>
  );
};
