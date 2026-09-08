import React from 'react';
import {
  Eye, Magnet, Workflow, Link2, Unlink, Rows3, ZoomOut, ZoomIn, MousePointer2, Scissors, Activity,
  Plus, Trash2, Copy, Clipboard, X, Crop, Replace, Layers, Download, RotateCcw, ChevronsUpDown,
  SlidersHorizontal, Search, Keyboard, HelpCircle, Video, Music, Type, Sparkles, FileText
} from 'lucide-react';
import type { Track } from '../../project/types/project';
import { useHistoryStore } from '../../../../store/useHistoryStore';
import { useProjectStore } from '../../../../store/useProjectStore';
import { defaultKeymap } from '../../../../config/keymap';
import { importSrtFile } from '../../captions/services/srtImporter';

export interface TimelineToolbarProps {
  handleAddTrack: (type: 'video' | 'audio' | 'text' | 'effect') => void;
  activeTool: 'select' | 'split' | 'rate-stretch';
  handleSetActiveTool: (tool: 'select' | 'split' | 'rate-stretch') => void;
  handleSelectAll: () => void;
  handleCopyNode: () => void;
  handleCutNode: () => void;
  handlePasteNode: () => void;
  handleSplitNode: () => void;
  handleTrimBeforePlayhead: () => void;
  handleTrimAfterPlayhead: () => void;
  handleDeleteNode: () => void;
  handleRippleDeleteNode: () => void;
  handleCompoundClips: () => void;
  handleDeconstructCompound: () => void;
  handleMirrorSelected: () => void;
  handleVariableSpeedAnimation: () => void;
  hoverScrubEnabled: boolean;
  setHoverScrubEnabled: (value: boolean) => void;
  magneticSnapping: boolean;
  setMagneticSnapping: (value: boolean) => void;
  rippleMode: boolean;
  setRippleMode: (value: boolean) => void;
  timelineEditMode: 'normal' | 'ripple' | 'overwrite';
  setTimelineEditMode: (value: 'normal' | 'ripple' | 'overwrite') => void;
  linkedSelectionEnabled: boolean;
  handleToggleLinkedSelection: () => void;
  handleFitTimeline: () => void;
  timelineZoom: number;
  professionalTrimTool?: 'none' | 'roll' | 'slip';
  setProfessionalTrimTool?: (value: 'none' | 'roll' | 'slip') => void;
  setTimelineZoom: (value: number) => void;
  showFindReplace: boolean;
  setShowFindReplace: (value: boolean) => void;
  findText: string;
  setFindText: (value: string) => void;
  replaceText: string;
  setReplaceText: (value: string) => void;
  searchMatches: Array<{ clipId: string; textContent: string }>;
  currentMatchIndex: number;
  handleFindNext: () => void;
  handleReplaceCurrent: () => void;
  handleReplaceAll: () => void;
  setShowShortcutsModal: (value: boolean) => void;
  lassoFilters: { video: boolean; audio: boolean; text: boolean; effect: boolean };
  setLassoFilters: React.Dispatch<React.SetStateAction<{ video: boolean; audio: boolean; text: boolean; effect: boolean }>>;
  showToast: (message: string) => void;
  performTextSearch: (query: string) => void;
  setSearchMatches: React.Dispatch<React.SetStateAction<Array<{ clipId: string; textContent: string }>>>;
}

export const TimelineToolbar: React.FC<TimelineToolbarProps> = ({
  handleAddTrack, activeTool, handleSetActiveTool, handleSelectAll, handleCopyNode, handleCutNode, handlePasteNode,
  handleSplitNode, handleTrimBeforePlayhead, handleTrimAfterPlayhead, handleDeleteNode, handleRippleDeleteNode,
  handleCompoundClips, handleDeconstructCompound, handleMirrorSelected, handleVariableSpeedAnimation, hoverScrubEnabled,
  setHoverScrubEnabled, magneticSnapping, setMagneticSnapping, rippleMode, setRippleMode, timelineEditMode, setTimelineEditMode, linkedSelectionEnabled,
  handleToggleLinkedSelection, handleFitTimeline, timelineZoom, setTimelineZoom, showFindReplace, setShowFindReplace,
  findText, setFindText, replaceText, setReplaceText, searchMatches, currentMatchIndex, handleFindNext,
  handleReplaceCurrent, handleReplaceAll, setShowShortcutsModal, lassoFilters, setLassoFilters, showToast,
  performTextSearch, setSearchMatches, professionalTrimTool, setProfessionalTrimTool,
}) => {
  const { selectedNodeIds } = useProjectStore();
  const { undo, redo, past, future } = useHistoryStore();
  const canUndo = past.length > 0;
  const canRedo = future.length > 0;
  const helpShortcuts = defaultKeymap;
  const srtInputRef = React.useRef<HTMLInputElement>(null);
  return (
  <>
      {/* Hidden SRT File Picker */}
      <input
        ref={srtInputRef}
        type="file"
        accept=".srt"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void importSrtFile(file);
          e.target.value = '';
        }}
      />
      {/* 1. Timeline Action Header / Toolbar - Single Unified Compact Row */}
      <div className="px-2 py-1 bg-[#1f2022] border-b border-[#343638] flex flex-nowrap items-center justify-between gap-1.5 shrink-0 select-none h-9 overflow-x-auto no-scrollbar">
        {/* Left Side: Creation, Edit Tools & Clip Operations */}
        <div className="flex items-center gap-1 shrink-0 flex-nowrap">
          {/* Add Track */}
          <div className="flex items-center gap-0.5">
            <button
              onClick={() => handleAddTrack('video')}
              className="p-1 rounded hover:bg-white/5 border border-white/5 hover:border-purple-500/20 text-gray-300 hover:text-white transition-all cursor-pointer text-[10px] font-bold"
              title="Add video track (+)"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
            <select
              defaultValue="video"
              onChange={(event) => {
                handleAddTrack(event.target.value as Track['type']);
                event.currentTarget.value = 'video';
              }}
              className="bg-[#101117] text-[9px] text-gray-300 border border-white/5 rounded px-1 py-1 outline-none cursor-pointer h-6"
              title="Add track type"
              aria-label="Add track type"
            >
              <option value="video">+ Video</option>
              <option value="audio">+ Audio</option>
              <option value="text">+ Text</option>
              <option value="effect">+ Effects</option>
            </select>
          </div>

          {/* Direct SRT Import Button */}
          <button
            onClick={() => srtInputRef.current?.click()}
            className="px-1.5 py-1 rounded bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/30 text-purple-300 hover:text-purple-200 transition-all cursor-pointer flex items-center gap-1 text-[9.5px] font-bold h-6"
            title="Import Subtitles (.srt) directly into timeline"
          >
            <FileText className="w-3 h-3 text-purple-400" />
            <span className="hidden xl:inline">Import SRT</span>
          </button>

          <div className="h-4 w-px bg-white/10 mx-0.5 shrink-0" />

          {/* Active Tool */}
          <div className="flex items-center border border-white/5 rounded overflow-hidden bg-[#101117] h-6">
            <button
              onClick={() => handleSetActiveTool(activeTool)}
              className="p-1 hover:bg-white/5 text-gray-300 transition-colors"
              title="Timeline tool"
            >
              {activeTool === 'split' ? <Scissors className="w-3 h-3 text-purple-400" /> : activeTool === 'rate-stretch' ? <Activity className="w-3 h-3 text-amber-400" /> : <MousePointer2 className="w-3 h-3 text-cyan-400" />}
            </button>
            <select
              value={activeTool}
              onChange={(event) => handleSetActiveTool(event.target.value as 'select' | 'split' | 'rate-stretch')}
              className="bg-transparent text-[9px] text-gray-300 border-l border-white/5 px-1 py-0.5 outline-none cursor-pointer"
              aria-label="Timeline tool"
            >
              <option value="select">Select</option>
              <option value="split">Blade</option>
              <option value="rate-stretch">Rate</option>
            </select>
          </div>

          {/* Selection & Clipboard */}
          <button
            onClick={handleSelectAll}
            className="px-1.5 py-1 rounded hover:bg-white/5 border border-white/5 text-gray-300 hover:text-white transition-all cursor-pointer text-[9.5px] font-bold h-6 flex items-center"
            title="Select all clips (Ctrl+A)"
          >
            All
          </button>
          <button
            onClick={handleCopyNode}
            className="px-1.5 py-1 rounded hover:bg-white/5 border border-white/5 text-gray-300 hover:text-white transition-all cursor-pointer text-[9.5px] font-bold h-6 flex items-center"
            title="Copy (Ctrl+C)"
          >
            Copy
          </button>
          <button
            onClick={handleCutNode}
            className="px-1.5 py-1 rounded hover:bg-white/5 border border-white/5 text-gray-300 hover:text-white transition-all cursor-pointer text-[9.5px] font-bold h-6 flex items-center"
            title="Cut (Ctrl+X)"
          >
            Cut
          </button>
          <button
            onClick={handlePasteNode}
            className="px-1.5 py-1 rounded hover:bg-white/5 border border-white/5 text-gray-300 hover:text-white transition-all cursor-pointer text-[9.5px] font-bold h-6 flex items-center"
            title="Paste (Ctrl+V)"
          >
            Paste
          </button>

          <button
            onClick={() => useHistoryStore.getState().undo()}
            disabled={!canUndo}
            className={`p-1 rounded border border-white/5 text-gray-300 hover:text-white transition-all cursor-pointer text-[10px] font-bold h-6 flex items-center justify-center ${!canUndo ? 'opacity-30 cursor-not-allowed' : 'hover:bg-white/5'}`}
            title="Undo (Ctrl+Z)"
          >
            ↶
          </button>
          <button
            onClick={() => useHistoryStore.getState().redo()}
            disabled={!canRedo}
            className={`p-1 rounded border border-white/5 text-gray-300 hover:text-white transition-all cursor-pointer text-[10px] font-bold h-6 flex items-center justify-center ${!canRedo ? 'opacity-30 cursor-not-allowed' : 'hover:bg-white/5'}`}
            title="Redo (Ctrl+Y / Ctrl+Shift+Z)"
          >
            ↷
          </button>

          <div className="h-4 w-px bg-white/10 mx-0.5 shrink-0" />

          {/* Edit Operations */}
          <button 
            onClick={handleSplitNode}
            className="p-1 rounded hover:bg-white/5 border border-white/5 hover:border-purple-500/20 text-gray-300 hover:text-white transition-all cursor-pointer flex items-center gap-1 text-[9.5px] font-bold h-6"
            title="Split Clip at Playhead (S or Ctrl+B)"
          >
            <Scissors className="w-3 h-3 text-purple-400" />
            <span className="hidden xl:inline">Split</span>
          </button>

          <button
            onClick={handleTrimBeforePlayhead}
            disabled={selectedNodeIds.length === 0}
            className={`p-1 rounded hover:bg-white/5 border border-white/5 text-gray-300 hover:text-white transition-all cursor-pointer h-6 flex items-center justify-center ${selectedNodeIds.length === 0 ? 'opacity-30 cursor-not-allowed' : ''}`}
            title="Trim start to playhead (Q)"
          >
            <Crop className="w-3 h-3" />
          </button>
          <button
            onClick={handleTrimAfterPlayhead}
            disabled={selectedNodeIds.length === 0}
            className={`p-1 rounded hover:bg-white/5 border border-white/5 text-gray-300 hover:text-white transition-all cursor-pointer h-6 flex items-center justify-center ${selectedNodeIds.length === 0 ? 'opacity-30 cursor-not-allowed' : ''}`}
            title="Trim end to playhead (W)"
          >
            <ChevronsUpDown className="w-3 h-3" />
          </button>
          
          <button 
            onClick={handleDeleteNode}
            className="p-1 rounded hover:bg-red-500/10 border border-white/5 hover:border-red-500/30 text-gray-300 hover:text-red-400 transition-all cursor-pointer flex items-center gap-1 text-[9.5px] font-bold h-6"
            title="Delete Selected Clip (Delete)"
          >
            <Trash2 className="w-3 h-3 text-red-400" />
            <span className="hidden 2xl:inline">Delete</span>
          </button>

          <button 
            onClick={handleRippleDeleteNode}
            className="p-1 rounded hover:bg-purple-500/10 border border-white/5 hover:border-purple-500/30 text-gray-300 hover:text-purple-400 transition-all cursor-pointer flex items-center gap-1 text-[9.5px] font-bold h-6"
            title="Ripple Delete Selected Clip (Shift+Delete)"
          >
            <Trash2 className="w-3 h-3 text-purple-400" />
            <span className="hidden 2xl:inline">Ripple</span>
          </button>

          <button 
            onClick={handleCompoundClips}
            className="p-1 rounded hover:bg-purple-500/10 border border-white/5 hover:border-purple-500/30 text-gray-300 hover:text-white transition-all cursor-pointer flex items-center gap-1 text-[9.5px] font-bold h-6"
            title="Combine Selected Clips into Compound (M)"
          >
            <Layers className="w-3 h-3 text-purple-400" />
          </button>

          <button 
            onClick={handleDeconstructCompound}
            className="p-1 rounded hover:bg-purple-500/10 border border-white/5 hover:border-purple-500/30 text-gray-300 hover:text-white transition-all cursor-pointer flex items-center gap-1 text-[9.5px] font-bold h-6"
            title="Deconstruct Compound Node (Shift+M)"
          >
            <Workflow className="w-3 h-3 text-purple-400" />
          </button>

          <button
            onClick={handleMirrorSelected}
            disabled={selectedNodeIds.length === 0}
            className={`p-1 rounded hover:bg-white/5 border border-white/5 text-gray-300 hover:text-white transition-all cursor-pointer h-6 flex items-center justify-center ${selectedNodeIds.length === 0 ? 'opacity-30 cursor-not-allowed' : ''}`}
            title="Mirror selected clips"
          >
            <RotateCcw className="w-3 h-3" />
          </button>
          <button
            onClick={handleVariableSpeedAnimation}
            disabled={selectedNodeIds.length === 0}
            className={`p-1 rounded hover:bg-white/5 border border-white/5 text-gray-300 hover:text-white transition-all cursor-pointer h-6 flex items-center justify-center ${selectedNodeIds.length === 0 ? 'opacity-30 cursor-not-allowed' : ''}`}
            title="Toggle variable speed animation"
          >
            <SlidersHorizontal className="w-3 h-3" />
          </button>

          <button 
            onClick={() => setShowFindReplace(!showFindReplace)}
            className={`p-1 rounded transition-all flex items-center gap-1 text-[9.5px] font-bold border cursor-pointer h-6 ${
              showFindReplace ? 'bg-purple-600/10 text-purple-400 border-purple-500/30' : 'text-gray-300 hover:text-white border-white/5 hover:border-white/10'
            }`}
            title="Find & Replace Subtitle Text"
          >
            <Search className="w-3 h-3 text-purple-400" />
          </button>

          <button 
            onClick={() => setShowShortcutsModal(true)}
            className="p-1 rounded hover:bg-purple-500/10 border border-purple-500/10 hover:border-purple-500/30 text-purple-400 transition-all cursor-pointer flex items-center gap-1 text-[9.5px] font-bold h-6"
            title="مشاهده میانبرهای کیبورد (Keyboard Shortcuts Map)"
          >
            <Keyboard className="w-3 h-3" />
            <span className="hidden 2xl:inline">میانبرها</span>
          </button>

          {/* Filtered Lasso Selection Controls */}
          <div className="flex items-center gap-0.5 bg-black/40 p-0.5 rounded border border-white/5 shrink-0 h-6">
            <button 
              onClick={() => setLassoFilters(prev => ({ ...prev, video: !prev.video }))}
              className={`p-0.5 rounded transition-colors ${lassoFilters.video ? 'bg-blue-500/20 text-blue-400' : 'text-gray-600 hover:bg-white/5'}`}
              title="Select Video Clips"
            >
              <Video className="w-2.5 h-2.5" />
            </button>
            <button 
              onClick={() => setLassoFilters(prev => ({ ...prev, audio: !prev.audio }))}
              className={`p-0.5 rounded transition-colors ${lassoFilters.audio ? 'bg-green-500/20 text-green-400' : 'text-gray-600 hover:bg-white/5'}`}
              title="Select Audio Clips"
            >
              <Music className="w-2.5 h-2.5" />
            </button>
            <button 
              onClick={() => setLassoFilters(prev => ({ ...prev, text: !prev.text }))}
              className={`p-0.5 rounded transition-colors ${lassoFilters.text ? 'bg-orange-500/20 text-orange-400' : 'text-gray-600 hover:bg-white/5'}`}
              title="Select Text Clips"
            >
              <Type className="w-2.5 h-2.5" />
            </button>
            <button 
              onClick={() => setLassoFilters(prev => ({ ...prev, effect: !prev.effect }))}
              className={`p-0.5 rounded transition-colors ${lassoFilters.effect ? 'bg-pink-500/20 text-pink-400' : 'text-gray-600 hover:bg-white/5'}`}
              title="Select Effect Clips"
            >
              <Sparkles className="w-2.5 h-2.5" />
            </button>
          </div>
        </div>

        {/* Right Side: Sync, Magnet, Mode, Zoom Controls */}
        <div className="flex items-center gap-1 shrink-0 flex-nowrap">
          <button 
            onClick={() => {
              setHoverScrubEnabled(!hoverScrubEnabled);
              showToast(`Scrubbing: ${!hoverScrubEnabled ? 'ENABLED' : 'DISABLED'}`);
            }}
            className={`px-1.5 py-1 rounded transition-all flex items-center gap-1 text-[9.5px] font-bold border cursor-pointer h-6 ${
              hoverScrubEnabled ? 'bg-purple-600/10 text-purple-400 border-purple-500/30 shadow-[0_0_8px_rgba(168,85,247,0.15)]' : 'text-gray-400 hover:text-white border-white/5'
            }`}
            title="Toggle Hover Scrubbing"
          >
            <Eye className="w-3 h-3" />
            <span className="hidden xl:inline">Scrub</span>
          </button>

          <button 
            onClick={() => setMagneticSnapping(!magneticSnapping)}
            className={`px-1.5 py-1 rounded transition-all flex items-center gap-1 text-[9.5px] font-bold border cursor-pointer h-6 ${
              magneticSnapping ? 'bg-purple-600/10 text-purple-400 border-purple-500/30 shadow-[0_0_8px_rgba(168,85,247,0.15)]' : 'text-gray-400 hover:text-white border-white/5'
            }`}
            title="Toggle Snapping"
          >
            <Magnet className="w-3 h-3" />
            <span className="hidden xl:inline">Snap</span>
          </button>

          <button
            onClick={() => {
              const next = timelineEditMode === 'normal'
                ? 'ripple'
                : timelineEditMode === 'ripple'
                  ? 'overwrite'
                  : 'normal';
              setTimelineEditMode(next);
            }}
            className={`px-1.5 py-1 rounded transition-all flex items-center gap-1 text-[9.5px] font-bold border cursor-pointer h-6 ${
              timelineEditMode === 'normal'
                ? 'text-gray-400 hover:text-white border-white/5'
                : 'bg-purple-600/10 text-purple-400 border-purple-500/30 shadow-[0_0_8px_rgba(168,85,247,0.15)]'
            }`}
            title={
              timelineEditMode === 'normal'
                ? 'Normal editing: move/trim only the selected clips'
                : timelineEditMode === 'ripple'
                  ? 'Ripple editing: following clips on the edited lane shift to preserve timing'
                  : 'Overwrite editing: overlapping clips on the edited lane are trimmed/split'
            }
          >
            <Workflow className="w-3 h-3" />
            <span className="hidden xl:inline">{timelineEditMode === 'normal' ? 'Normal' : timelineEditMode === 'ripple' ? 'Ripple' : 'Overwrite'}</span>
          </button>

          {setProfessionalTrimTool && (
            <div className="flex items-center gap-0.5">
              <button
                onClick={() => setProfessionalTrimTool('none')}
                className={`px-1.5 py-0.5 rounded border text-[9px] font-bold cursor-pointer h-6 ${professionalTrimTool === 'none' ? 'bg-white/10 text-white border-white/20' : 'text-gray-400 border-white/5 hover:text-white'}`}
                title="Standard edge trim / move"
              >
                Edit
              </button>
              <button
                onClick={() => setProfessionalTrimTool('roll')}
                className={`px-1.5 py-0.5 rounded border text-[9px] font-bold cursor-pointer h-6 ${professionalTrimTool === 'roll' ? 'bg-amber-500/10 text-amber-300 border-amber-500/30' : 'text-gray-400 border-white/5 hover:text-white'}`}
                title="Roll Edit: move shared boundary between adjacent clips"
              >
                Roll
              </button>
              <button
                onClick={() => setProfessionalTrimTool('slip')}
                className={`px-1.5 py-0.5 rounded border text-[9px] font-bold cursor-pointer h-6 ${professionalTrimTool === 'slip' ? 'bg-cyan-500/10 text-cyan-300 border-cyan-500/30' : 'text-gray-400 border-white/5 hover:text-white'}`}
                title="Slip Edit: change source window without changing timeline geometry"
              >
                Slip
              </button>
            </div>
          )}

          <button
            onClick={handleToggleLinkedSelection}
            className={`p-1 rounded transition-all flex items-center gap-1 text-[9.5px] font-bold border cursor-pointer h-6 ${
              linkedSelectionEnabled
                ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30'
                : 'text-gray-500 border-white/5'
            }`}
            title="Toggle linked / grouped selection"
          >
            {linkedSelectionEnabled ? <Link2 className="w-3 h-3" /> : <Unlink className="w-3 h-3" />}
          </button>

          <button
            onClick={handleFitTimeline}
            className="p-1 rounded transition-all flex items-center gap-1 text-[9.5px] font-bold border border-white/5 text-gray-400 hover:text-white hover:bg-white/5 h-6"
            title="Fit timeline to visible area"
          >
            <Rows3 className="w-3 h-3" />
          </button>

          <div className="h-4 w-px bg-white/10 mx-0.5 shrink-0" />

          {/* Zoom Slider */}
          <div className="flex items-center gap-0.5 bg-[#12131a] border border-white/5 px-1 py-0.5 rounded select-none h-6">
            <button 
              onClick={() => setTimelineZoom(Math.max(0.01, parseFloat((timelineZoom / 1.35).toFixed(3))))}
              className="p-0.5 rounded hover:bg-white/5 text-gray-400 hover:text-white cursor-pointer transition-colors"
              title="Zoom Out"
            >
              <ZoomOut className="w-3 h-3" />
            </button>
            <input 
              type="range"
              min="0.01"
              max="20.0"
              step="0.01"
              value={timelineZoom}
              onChange={(e) => setTimelineZoom(parseFloat(e.target.value))}
              className="w-14 sm:w-16 md:w-20 h-1 bg-white/10 rounded appearance-none cursor-pointer accent-purple-500 hover:bg-white/20 transition-all outline-none"
              title="Zoom Timeline"
            />
            <span className="text-[8.5px] font-mono font-bold w-7 text-center text-gray-400 select-none">
              {Math.round(timelineZoom * 100)}%
            </span>
            <button 
              onClick={() => setTimelineZoom(Math.min(20.0, parseFloat((timelineZoom * 1.35).toFixed(3))))}
              className="p-0.5 rounded hover:bg-white/5 text-gray-400 hover:text-white cursor-pointer transition-colors"
              title="Zoom In"
            >
              <ZoomIn className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>

      {/* Find & Replace Sliding Panel */}
      {showFindReplace && (
        <div className="px-4 py-2.5 bg-[#0e0f16] border-b border-white/5 flex flex-wrap items-center gap-3 animate-fadeIn select-none">
          <div className="flex items-center bg-[#13141e] border border-white/5 rounded-lg px-2.5 py-1 min-w-[200px]">
            <span className="text-[9px] text-purple-400 font-bold uppercase mr-2 shrink-0">Find</span>
            <input 
              type="text"
              placeholder="Search subtitle text..."
              value={findText}
              onChange={(e) => {
                setFindText(e.target.value);
                performTextSearch(e.target.value);
              }}
              className="bg-transparent text-xs text-white focus:outline-none w-full font-sans placeholder-gray-600 font-medium"
            />
          </div>

          <div className="flex items-center bg-[#13141e] border border-white/5 rounded-lg px-2.5 py-1 min-w-[200px]">
            <span className="text-[9px] text-cyan-400 font-bold uppercase mr-2 shrink-0">Replace</span>
            <input 
              type="text"
              placeholder="Replacement text..."
              value={replaceText}
              onChange={(e) => setReplaceText(e.target.value)}
              className="bg-transparent text-xs text-white focus:outline-none w-full font-sans placeholder-gray-600 font-medium"
            />
          </div>

          <div className="flex items-center gap-1.5 ml-auto">
            <button 
              onClick={handleFindNext}
              className="px-2.5 py-1 bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white text-[10px] font-bold border border-white/5 rounded-md cursor-pointer transition-all"
            >
              Find Next ({searchMatches.length > 0 ? `${currentMatchIndex + 1}/${searchMatches.length}` : '0'})
            </button>
            <button 
              onClick={handleReplaceCurrent}
              className="px-2.5 py-1 bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 hover:text-white text-[10px] font-bold border border-purple-500/20 rounded-md cursor-pointer transition-all"
            >
              Replace Current
            </button>
            <button 
              onClick={handleReplaceAll}
              className="px-2.5 py-1 bg-purple-600 hover:bg-purple-500 text-white text-[10px] font-bold rounded-md cursor-pointer transition-all shadow-[0_0_12px_rgba(147,51,234,0.3)]"
            >
              Replace All
            </button>
            <button 
              onClick={() => {
                setShowFindReplace(false);
                setFindText('');
                setReplaceText('');
                setSearchMatches([]);
              }}
              className="p-1 rounded-md hover:bg-white/5 text-gray-500 hover:text-white cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}



  </>
  );
};
