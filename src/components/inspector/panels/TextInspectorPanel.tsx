import React from 'react';
import {
  Volume2, Sliders, Type, Play, Trash2, RotateCcw, Save,
  Settings, Layers, Sparkles, Smile, RefreshCw, Bold,
  Italic, Underline, Check, Video, Eye, Shield, Wand2,
  ChevronUp, ChevronDown, CheckSquare, Square, Lock, Activity,
  SlidersHorizontal, Image, Palette, FileText, Sparkle, Target,
  AlignCenter, AlignLeft, AlignRight, Film, Search, Music,
  Languages, Sparkle as SparkleIcon, HelpCircle, AlertTriangle,
  Upload, Download, Cpu
} from 'lucide-react';
import { useInspectorController } from '../InspectorController';
import { createTrackSnapshotCommand } from '../../../features/video-studio/project/commands';
import { SliderRow, ToggleRow, SelectRow } from '../InspectorFieldControls';
import { UniversalTransformControls } from '../UniversalTransformControls';

export const TextInspectorPanel: React.FC = () => {
  const {
    activeNode, tracks, selectedNodeIds, trackType, currentTime,
    updateNodeProperty, updateNodesProperty, executeCommand, setSelectedNodeIds, setCurrentTime, showToast,
    videoTab, setVideoTab, uniformScale, setUniformScale, chromaEnabled, setChromaEnabled, chromaColor, setChromaColor, chromaIntensity, setChromaIntensity, chromaShadow, setChromaShadow, activeMask, setActiveMask, maskFeather, setMaskFeather, maskWidth, setMaskWidth, maskHeight, setMaskHeight, maskRotation, setMaskRotation, animCategory, setAnimCategory, animSearch, setAnimSearch, videoAnimations, handleAlign,
    audioTab, setAudioTab, eqLow, setEqLow, eqMid, setEqMid, eqHigh, setEqHigh, activeVoiceFx, setActiveVoiceFx, translateLang, setTranslateLang, selectedVoice, setSelectedVoice,
    textTab, setTextTab, templateCategory, setTemplateCategory, captionSearch, setCaptionSearch, isTranslating, setIsTranslating, isTTSGenerating, setIsTTSGenerating, isGeneratingCaptions, setIsGeneratingCaptions, isRefiningCaptions, setIsRefiningCaptions, captionPrompt, setCaptionPrompt, applyScope, setApplyScope, restorePunctuation, setRestorePunctuation, grammarPrompt, setGrammarPrompt, grammarPreset, setGrammarPreset, typographyPresets, customPresets, setCustomPresets, getSubtitlesList, handleAutoCaptionGenerate, handleSrtUpload, handleSrtExport, handleAiRefine, handleAddNewCaption, textColorInputRef, activeColorInputRef, bgInputRef
  } = useInspectorController();

          const selectedTextClips = tracks.flatMap(t => t.clips).filter(c => selectedNodeIds.includes(c.id));
          const isMultiSelected = selectedNodeIds.length > 1;

          const allSubtitleClips = tracks.find(t => t.type === 'text')?.clips || [];
          const allSubtitleIds = allSubtitleClips.map(c => c.id);
          const areAllCaptionsSelected = allSubtitleIds.length > 0 && allSubtitleIds.every(id => selectedNodeIds.includes(id));

          const handleToggleSelectAllCaptions = () => {
            if (areAllCaptionsSelected) {
              setSelectedNodeIds(activeNode?.id ? [activeNode.id] : []);
              showToast('Deselected other subtitle clips');
            } else {
              setSelectedNodeIds(allSubtitleIds);
              showToast(`✅ Selected all ${allSubtitleIds.length} subtitle clips on timeline`);
            }
          };

          const handleSyncPositionAndBoxToAll = () => {
            if (!activeNode) return;
            const currentTransform = activeNode.transform;
            const currentProps = activeNode.properties;

            const currentTracks = tracks;
            const nextTracks = currentTracks.map((t) => {
              if (t.type !== 'text') return t;
              return {
                ...t,
                clips: t.clips.map((clip) => ({
                  ...clip,
                  transform: {
                    ...clip.transform,
                    x: currentTransform.x ?? 0,
                    y: currentTransform.y ?? 0,
                    scale: currentTransform.scale ?? 100,
                    scaleX: 100,
                    scaleY: 100,
                    rotation: currentTransform.rotation ?? 0,
                  },
                  properties: {
                    ...clip.properties,
                    containerWidth: currentProps.containerWidth,
                    containerHeight: currentProps.containerHeight,
                    containerAutoWidth: currentProps.containerAutoWidth,
                    containerAutoHeight: currentProps.containerAutoHeight,
                    padding: currentProps.padding,
                    fontSize: currentProps.fontSize,
                    fontFamily: currentProps.fontFamily,
                    textColor: currentProps.textColor,
                    activeColor: currentProps.activeColor,
                    captionTheme: currentProps.captionTheme,
                    alignment: currentProps.alignment,
                  },
                })),
              };
            });

            executeCommand(createTrackSnapshotCommand('Sync Position & Box to All Subtitles', currentTracks, nextTracks));
            showToast(`⚡ Synchronized position & box layout to all ${allSubtitleIds.length} subtitle clips!`);
          };

        // Helper to get mixed value or default
        const getMixedValue = <T,>(key: string, defaultValue: T): T | 'mixed' => {
          if (selectedNodeIds.length <= 1) {
            return (activeNode.properties[key] !== undefined ? activeNode.properties[key] : defaultValue) as T;
          }
          const values = selectedTextClips.map(clip => clip.properties[key]);
          const first = values[0];
          const allSame = values.every(v => v === first);
          return allSame ? (first !== undefined ? first : defaultValue) as T : 'mixed';
        };

        const textContent = isMultiSelected ? '' : (activeNode.properties.textContent ?? '');
        const fontFamily = getMixedValue('fontFamily', 'Inter');
        const fontSize = getMixedValue('fontSize', 24);
        const textColor = getMixedValue('textColor', '#ffffff');
        const bold = getMixedValue('bold', false);
        const italic = getMixedValue('italic', false);
        const underline = getMixedValue('underline', false);
        const alignment = getMixedValue('alignment', 'center');
        
        // Spacing attributes
        const charSpacing = getMixedValue('charSpacing', 0);
        const lineSpacing = getMixedValue('lineSpacing', 1.2);
        const wordSpacing = getMixedValue('wordSpacing', 12);

        // Premium template attributes
        const activeColor = getMixedValue('activeColor', '#eab308');
        const backgroundColor = getMixedValue('backgroundColor', 'clear');
        const radius = getMixedValue('radius', 12);
        const padding = getMixedValue('padding', 16);
        const captionTheme = getMixedValue('captionTheme', 'karaoke');

        // Helper to update properties respecting active applyScope state OR multi-selection
        const changeProperty = (path: string, value: any) => {
          if (applyScope === 'all') {
            const textTrack = tracks.find(t => t.type === 'text');
            if (!textTrack) return;

            updateNodesProperty(
              textTrack.clips.map((clip) => clip.id),
              path,
              value,
            );
            return;
          }

          updateNodesProperty(selectedNodeIds, path, value);
        };

          return (
            <div className="space-y-4" id="text_inspector_panel">
              {/* Top 3 Tab Headers */}
              <div className="flex bg-[#11121a] p-1 rounded-lg border border-white/5 animate-fadeIn" id="text_tabs_header">
                {(['captions', 'text_style', 'templates', 'advanced'] as const).map((tab) => {
                  const labelMap = {
                    captions: 'Captions List',
                    text_style: 'Text Style',
                    templates: 'Templates',
                    advanced: 'Advanced'
  
                  };
                  return (
                    <button
                      key={tab}
                      id={`text_tab_btn_${tab}`}
                      onClick={() => setTextTab(tab)}
                      className={`flex-1 py-1 text-[10px] font-bold rounded-md transition-all cursor-pointer capitalize ${
                        textTab === tab 
                          ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-400/20' 
                          : 'text-gray-400 hover:text-white'
                      }`}
                    >
                      {labelMap[tab]}
                    </button>
                  );
                })}
              </div>
  
              <UniversalTransformControls id="text_universal_transform" />

              {/* Scope selection pill */}
              <div className="bg-[#0c0d12] border border-white/5 p-2 rounded-xl flex items-center justify-between" id="apply_scope_controller">
                <span className="text-[9px] uppercase font-black text-gray-400 tracking-wider">Apply Settings To:</span>
                <div className="flex bg-[#11121a] p-0.5 rounded-lg border border-white/5 shrink-0" id="scope_segmented_pills">
                  <button
                    onClick={() => {
                      setApplyScope('single');
                      showToast('📍 Changes will apply ONLY to the selected subtitle clip');
                    }}
                    className={`px-3 py-1 text-[9px] font-black uppercase rounded-md transition-all cursor-pointer ${
                      applyScope === 'single'
                        ? 'bg-purple-500/10 text-purple-400 border border-purple-400/20 shadow-md'
                        : 'text-gray-500 hover:text-gray-300'
                    }`}
                  >
                    This Clip
                  </button>
                  <button
                    onClick={() => {
                      setApplyScope('all');
                      showToast('🌐 Changes will apply GLOBALLY to ALL subtitle clips on this track');
                    }}
                    className={`px-3 py-1 text-[9px] font-black uppercase rounded-md transition-all cursor-pointer ${
                      applyScope === 'all'
                        ? 'bg-purple-500/10 text-purple-400 border border-purple-400/20 shadow-md'
                        : 'text-gray-500 hover:text-gray-300'
                    }`}
                  >
                    All Clips
                  </button>
                </div>
              </div>
  
              {/* TAB 1: CAPTIONS (Subtitle list, search, auto translate, text to speech) */}
              {textTab === 'captions' && (
                <div className="space-y-4 animate-fadeIn" id="text_tab_captions_list">
                  
                  {/* 1. AUTO-CAPTIONING SERVICE (SPEECH-TO-TEXT) */}
                  <div className="bg-gradient-to-br from-purple-950/40 to-indigo-950/40 border border-purple-500/20 p-3.5 rounded-xl space-y-2.5">
                    <div className="flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 text-purple-400" />
                      <span className="text-[10px] font-extrabold uppercase tracking-widest text-purple-300">AI Speech-to-Text</span>
                    </div>
                    
                    <p className="text-[9px] text-gray-400 leading-normal">
                      Let Gemini transcribe your timeline audio track into frame-accurate subtitled dialogue segments automatically.
                    </p>
  
                    <div className="space-y-1.5">
                      <input 
                        type="text"
                        placeholder="Add context (e.g. baking instructions, recipe voiceover)..."
                        value={captionPrompt}
                        onChange={(e) => setCaptionPrompt(e.target.value)}
                        className="w-full bg-black/60 border border-white/5 rounded-lg px-2.5 py-1.5 text-[10px] text-white focus:outline-none focus:ring-1 focus:ring-purple-500/50"
                        disabled={isGeneratingCaptions}
                      />
                      
                      <button
                        onClick={handleAutoCaptionGenerate}
                        disabled={isGeneratingCaptions}
                        className="w-full py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 disabled:from-purple-900/50 disabled:to-indigo-900/50 text-white text-[10px] font-bold uppercase tracking-wider rounded-lg transition-all shadow-[0_4px_12px_rgba(147,51,234,0.3)] disabled:shadow-none flex items-center justify-center gap-2 cursor-pointer"
                      >
                        {isGeneratingCaptions ? (
                          <>
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            <span>Generating captions...</span>
                          </>
                        ) : (
                          <>
                            <Cpu className="w-3.5 h-3.5 animate-pulse" />
                            <span>Auto-Generate Captions</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
  
                  {/* 2. SRT FILE IMPORT / EXPORT OPERATIONS */}
                  <div className="grid grid-cols-2 gap-2" id="srt_operations_grid">
                    {/* SRT Import */}
                    <div className="relative">
                      <input 
                        type="file" 
                        id="srt_file_uploader_hidden"
                        accept=".srt"
                        onChange={handleSrtUpload}
                        className="hidden"
                      />
                      <button 
                        onClick={() => document.getElementById('srt_file_uploader_hidden')?.click()}
                        className="w-full py-1.5 bg-[#111218] hover:bg-[#161722] border border-white/5 hover:border-white/10 text-gray-300 hover:text-white text-[9px] font-bold uppercase tracking-wider rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <Upload className="w-3 h-3 text-cyan-400" />
                        <span>Import .SRT</span>
                      </button>
                    </div>
  
                    {/* SRT Export */}
                    <button 
                      onClick={handleSrtExport}
                      className="w-full py-1.5 bg-[#111218] hover:bg-[#161722] border border-white/5 hover:border-white/10 text-gray-300 hover:text-white text-[9px] font-bold uppercase tracking-wider rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Download className="w-3 h-3 text-purple-400" />
                      <span>Export .SRT</span>
                    </button>
                  </div>
  
                  {/* Advanced AI Grammar & Punctuation restoration controls */}
                  <div className="bg-[#11121a]/60 border border-white/5 rounded-xl p-3.5 space-y-3" id="grammar_punctuation_config_card">
                    <div className="flex items-center gap-1.5 border-b border-white/5 pb-2">
                      <SlidersHorizontal className="w-3.5 h-3.5 text-purple-400" />
                      <span className="text-[9.5px] uppercase font-black text-purple-300 tracking-wider">AI Grammar & Punctuation Pipeline</span>
                    </div>
  
                    {/* Restore punctuation toggle */}
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] text-gray-400 font-bold uppercase">Punctuation Restoration</span>
                      <button
                        onClick={() => {
                          setRestorePunctuation(!restorePunctuation);
                          showToast(`Punctuation restoration: ${!restorePunctuation ? 'ENABLED' : 'DISABLED'}`);
                        }}
                        className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                          restorePunctuation ? 'bg-purple-600' : 'bg-gray-800'
                        }`}
                      >
                        <span
                          className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                            restorePunctuation ? 'translate-x-4' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </div>
  
                    {/* Grammar Preset selector */}
                    <div className="space-y-1">
                      <label className="text-[8.5px] text-gray-500 font-bold uppercase block">Grammar / Tone Preset</label>
                      <select
                        value={grammarPreset}
                        onChange={(e) => {
                          const val = e.target.value;
                          setGrammarPreset(val);
                          // Update default instruction value for the custom text area
                          if (val === 'standard') {
                            setGrammarPrompt('Apply standard copyediting rules, restore natural capitalizations.');
                          } else if (val === 'formal') {
                            setGrammarPrompt('Make the dialogue formal, polite, and grammatically complete.');
                          } else if (val === 'tiktok') {
                            setGrammarPrompt('Make it punchy, capitalizations on key action nouns, add exciting punctuation marks.');
                          } else if (val === 'emoji') {
                            setGrammarPrompt('Add relevant emojis next to nouns (e.g. baking 🍳, bread 🍞, kitchen 🔪) to make captions visual.');
                          } else if (val === 'clean') {
                            setGrammarPrompt('Remove all exclamation marks or question marks. Strip brackets or excessive punctuation.');
                          }
                          showToast(`💡 Selected AI Preset: ${val}`);
                        }}
                        className="w-full bg-black/40 border border-white/5 rounded-lg px-2.5 py-1.5 text-[10px] text-gray-300 focus:outline-none focus:ring-1 focus:ring-purple-500/50 cursor-pointer"
                      >
                        <option value="standard">Standard Copyediting</option>
                        <option value="formal">Polite & Formal English</option>
                        <option value="tiktok">Punchy / TikTok Shouting Style</option>
                        <option value="emoji">Emoji Highlights (Visual Captions)</option>
                        <option value="clean">Minimalist & Clean (Strip Punctuation)</option>
                      </select>
                    </div>
  
                    {/* Custom Grammar Rules Text Input */}
                    <div className="space-y-1">
                      <label className="text-[8.5px] text-gray-500 font-bold uppercase block">Custom Grammar Instructions</label>
                      <textarea
                        value={grammarPrompt}
                        onChange={(e) => setGrammarPrompt(e.target.value)}
                        placeholder="e.g., Use formal Persian, capitalize names, add commas between lists..."
                        className="w-full h-12 bg-black/40 border border-white/5 rounded-lg p-2 text-[9.5px] text-gray-300 focus:outline-none focus:ring-1 focus:ring-purple-500/50 resize-none custom-scrollbar"
                      />
                    </div>
  
                    {/* Apply Scope Selector */}
                    <div className="space-y-1 border-t border-white/[0.03] pt-2">
                      <label className="text-[8px] text-gray-500 font-bold uppercase block">Apply AI Refine To</label>
                      <div className="grid grid-cols-2 gap-1.5">
                        <button
                          onClick={() => {
                            setApplyScope('single');
                            showToast('🎯 AI Refine set to Selected Clips only');
                          }}
                          className={`py-1 px-1.5 rounded-lg text-[8.5px] font-bold uppercase border transition-all cursor-pointer ${
                            applyScope === 'single'
                              ? 'bg-purple-500/10 border-purple-500/50 text-purple-400'
                              : 'bg-black/20 border-white/5 text-gray-400 hover:text-white hover:border-white/10'
                          }`}
                        >
                          Selected Clips ({selectedNodeIds.length})
                        </button>
                        <button
                          onClick={() => {
                            setApplyScope('all');
                            showToast('🌐 AI Refine set to ALL Subtitles on track');
                          }}
                          className={`py-1 px-1.5 rounded-lg text-[8.5px] font-bold uppercase border transition-all cursor-pointer ${
                            applyScope === 'all'
                              ? 'bg-purple-500/10 border-purple-500/50 text-purple-400'
                              : 'bg-black/20 border-white/5 text-gray-400 hover:text-white hover:border-white/10'
                          }`}
                        >
                          All Text Clips
                        </button>
                      </div>
                    </div>
                  </div>
  
                  {/* 2b. AI REFINE BUTTON */}
                  <button
                    onClick={handleAiRefine}
                    disabled={isRefiningCaptions}
                    className="w-full py-2 bg-gradient-to-r from-purple-950/50 to-cyan-950/50 hover:from-purple-900/60 hover:to-cyan-900/60 border border-purple-500/30 hover:border-cyan-400/50 text-white text-[10px] font-bold uppercase tracking-wider rounded-lg transition-all flex items-center justify-center gap-2 cursor-pointer shadow-[0_2px_8px_rgba(147,51,234,0.1)]"
                  >
                    {isRefiningCaptions ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin text-purple-400" />
                        <span className="text-purple-300">Restoring Punctuation...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
                        <span>AI Refine Punctuation & Grammar</span>
                      </>
                    )}
                  </button>
  
                  <div className="h-px bg-white/5 my-1" />
  
                  {/* Bulk Actions for Subtitles: Select All & Sync Layout */}
                  <div className="flex items-center justify-between gap-1.5 bg-[#0d0e14] border border-cyan-500/20 p-2 rounded-xl">
                    <button
                      onClick={handleToggleSelectAllCaptions}
                      className={`flex-1 py-1.5 px-2 text-[9.5px] font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                        areAllCaptionsSelected
                          ? 'bg-cyan-500 text-black shadow-[0_0_10px_rgba(6,182,212,0.4)]'
                          : 'bg-white/5 hover:bg-white/10 text-cyan-300 border border-cyan-500/30'
                      }`}
                      title="Select all subtitle blocks on timeline to move or resize them together"
                    >
                      <Layers className="w-3 h-3" />
                      <span>{areAllCaptionsSelected ? 'Deselect All' : `Select All (${allSubtitleClips.length})`}</span>
                    </button>

                    <button
                      onClick={handleSyncPositionAndBoxToAll}
                      className="flex-1 py-1.5 px-2 bg-gradient-to-r from-purple-500/20 to-pink-500/20 hover:from-purple-500/30 hover:to-pink-500/30 border border-purple-500/30 text-purple-300 hover:text-white text-[9.5px] font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                      title="Apply this caption's exact Position (X, Y) and Text Box Size (Width, Height) to all subtitles"
                    >
                      <Sparkles className="w-3 h-3 text-pink-400" />
                      <span>Sync to All</span>
                    </button>
                  </div>

                  {/* Search Caption list & Add New Button */}
                  <div className="grid grid-cols-4 gap-1.5">
                    <div className="col-span-3 relative">
                      <Search className="w-3.5 h-3.5 text-gray-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
                      <input 
                        type="text" 
                        placeholder="Search dialogue words..."
                        value={captionSearch}
                        onChange={(e) => setCaptionSearch(e.target.value)}
                        className="w-full bg-[#111218] border border-white/5 rounded-lg pl-8 pr-3 py-1.5 text-[9.5px] text-white focus:outline-none focus:ring-1 focus:ring-cyan-400/50"
                      />
                    </div>
                    <button
                      onClick={handleAddNewCaption}
                      className="py-1.5 px-2 bg-purple-500/20 hover:bg-purple-500/30 border border-purple-500/30 text-purple-300 hover:text-white text-[9px] font-black uppercase tracking-wider rounded-lg transition-all flex items-center justify-center gap-1 cursor-pointer"
                      title="Add new subtitle block at playhead position"
                    >
                      <span>➕ Add</span>
                    </button>
                  </div>
  
                  {/* Subtitle Dialogue block cards list */}
                  <div className="space-y-2 max-h-[220px] overflow-y-auto custom-scrollbar pr-1" id="captions_timeline_scroll">
                    {getSubtitlesList()
                      .filter(cap => cap.text.toLowerCase().includes(captionSearch.toLowerCase()))
                      .map((cap) => {
                        const isCurrent = currentTime >= cap.start && currentTime <= (cap.start + cap.duration);
                        const isSelected = selectedNodeIds.includes(cap.id);
                        return (
                          <div
                            key={cap.id}
                            onClick={() => {
                              setCurrentTime(cap.start);
                              setSelectedNodeIds([cap.id]);
                              showToast(`🕒 Selected & jumped playhead to ${cap.frame}`);
                            }}
                            className={`p-2.5 rounded-xl border text-left transition-all duration-250 cursor-pointer flex flex-col gap-2 group ${
                              isCurrent 
                                ? 'bg-purple-500/10 border-purple-500 shadow-[0_0_12px_rgba(168,85,247,0.3)] ring-1 ring-purple-500/20' 
                                : isSelected
                                  ? 'bg-cyan-500/10 border-cyan-500'
                                  : 'bg-[#111218] border-white/5 hover:bg-[#151722]'
                            }`}
                          >
                            <div className="flex justify-between items-center w-full">
                              <span className={`text-[8.5px] font-mono font-bold block uppercase tracking-wider transition-colors ${
                                isCurrent ? 'text-purple-400' : 'text-gray-500 group-hover:text-cyan-400'
                              }`}>
                                ⏱️ {cap.frame} ({Number(cap.duration || 0).toFixed(1)}s)
                              </span>
                              
                              <div className="flex items-center gap-1">
                                {/* Timing Adjustment Controls */}
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const newStart = Math.max(0, cap.start - 0.5);
                                    updateNodeProperty(cap.id, 'startAt', newStart);
                                    showToast(`⏱️ Shifted start to ${newStart.toFixed(1)}s`);
                                  }}
                                  className="px-1 py-0.5 rounded bg-black/40 border border-white/5 text-[8px] font-bold text-gray-400 hover:text-white transition-colors"
                                  title="Shift 0.5s Backwards"
                                >
                                  ◀ Nudge
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const newStart = cap.start + 0.5;
                                    updateNodeProperty(cap.id, 'startAt', newStart);
                                    showToast(`⏱️ Shifted start to ${newStart.toFixed(1)}s`);
                                  }}
                                  className="px-1 py-0.5 rounded bg-black/40 border border-white/5 text-[8px] font-bold text-gray-400 hover:text-white transition-colors"
                                  title="Shift 0.5s Forwards"
                                >
                                  Nudge ▶
                                </button>
                                
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const newTracks = tracks.map(t => {
                                      if (t.type === 'text') {
                                        return {
                                          ...t,
                                          clips: t.clips.filter(c => c.id !== cap.id)
                                        };
                                      }
                                      return t;
                                    });
                                    executeCommand(createTrackSnapshotCommand('Apply Inspector Track Changes', tracks, newTracks))
                                    showToast(`🗑️ Subtitle clip removed`);
                                  }}
                                  className="p-1 rounded hover:bg-red-500/20 text-gray-500 hover:text-red-400 transition-colors"
                                  title="Delete Caption Block"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>
                            </div>
  
                            <div className="flex gap-2 items-start w-full">
                              <textarea
                                value={cap.text}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedNodeIds([cap.id]);
                                }}
                                onChange={(e) => {
                                  updateNodeProperty(cap.id, 'properties.textContent', e.target.value);
                                }}
                                className="flex-1 w-full bg-[#0c0d12]/80 border border-white/5 hover:border-white/10 focus:border-cyan-500/50 rounded-lg px-2 py-1 text-[10px] font-semibold text-gray-200 mt-1 leading-normal resize-none focus:outline-none focus:ring-1 focus:ring-cyan-500/30 custom-scrollbar h-11"
                                placeholder="Type subtitle words..."
                              />
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>
              )}
  
              {/* TAB 2: TEXT & STYLE (Text Area, Typography, spacing and preset style cards) */}
              {textTab === 'text_style' && (
                <div className="space-y-4 animate-fadeIn" id="text_tab_style_settings">
                  
                  {/* Subtitle Source Edit box */}
                  <div className="bg-black/10 border border-white/[0.02] p-3 rounded-xl space-y-1.5">
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Edit Dialogue Line</span>
                      <span className="text-[8px] font-mono text-gray-600 font-bold">{isMultiSelected ? 0 : textContent.length} characters</span>
                    </div>
                    <textarea 
                      id="inspector_text_area"
                      value={textContent}
                      disabled={isMultiSelected}
                      onChange={(e) => updateNodesProperty(selectedNodeIds, 'properties.textContent', e.target.value)}
                      className="w-full bg-[#111218] border border-white/5 rounded-lg px-2.5 py-2 text-xs font-semibold text-white focus:outline-none focus:ring-1 focus:ring-cyan-500/50 resize-none h-16 custom-scrollbar disabled:opacity-50 disabled:cursor-not-allowed"
                      placeholder={isMultiSelected ? "⚠️ Dialogue edit disabled for multiple selection" : "Enter subtitle overlay words..."}
                    />
                  </div>
  
                  {/* Typography controls */}
                  <div className="space-y-3" id="typography_settings_group">
                    <span className="text-[10px] uppercase font-black text-gray-400 tracking-wider block">Typography Styling</span>
  
                    <SelectRow 
                      label="Font Family" 
                      value={fontFamily}
                      options={[
                        { value: 'Inter', label: 'Inter (Standard UI)' },
                        { value: 'Space Grotesk', label: 'Space Grotesk (Tech)' },
                        { value: 'Playfair Display', label: 'Playfair Display (Serif)' },
                        { value: 'JetBrains Mono', label: 'JetBrains Mono (Code)' },
                        { value: 'Georgia', label: 'Georgia (Retro Classic)' }
                      ]}
                      icon={Type}
                      onChange={(v) => changeProperty('properties.fontFamily', v)}
                    />
  
                    <SliderRow 
                      label="Font Size" 
                      value={fontSize === 'mixed' ? 24 : fontSize} 
                      min={10} 
                      max={100} 
                      unit="px"
                      icon={Sliders}
                      onChange={(v) => changeProperty('properties.fontSize', v)}
                      onReset={() => changeProperty('properties.fontSize', 24)}
                    />
  
                    {/* Font modifier styles (B, I, U) and Letter CaseTT selectors */}
                    <div className="grid grid-cols-2 gap-2" id="style_modifiers_row">
                      {/* B, I, U Buttons */}
                      <div className="bg-black/10 border border-white/[0.02] p-1.5 rounded-xl flex gap-1 justify-around items-center">
                        <button 
                          onClick={() => {
                            changeProperty('properties.bold', !bold);
                            showToast(`Bold mode: ${!bold ? 'ON' : 'OFF'}`);
                          }}
                          className={`p-1.5 rounded-lg transition-all cursor-pointer hover:bg-white/5 ${
                            bold ? 'text-cyan-400 bg-cyan-500/10 border border-cyan-500/20 font-bold' : 'text-gray-500'
                          }`}
                          title="Bold"
                        >
                          <Bold className="w-3.5 h-3.5" />
                        </button>
                        <button 
                          onClick={() => {
                            changeProperty('properties.italic', !italic);
                            showToast(`Italic mode: ${!italic ? 'ON' : 'OFF'}`);
                          }}
                          className={`p-1.5 rounded-lg transition-all cursor-pointer hover:bg-white/5 ${
                            italic ? 'text-cyan-400 bg-cyan-500/10 border border-cyan-500/20 font-bold' : 'text-gray-500'
                          }`}
                          title="Italic"
                        >
                          <Italic className="w-3.5 h-3.5" />
                        </button>
                        <button 
                          onClick={() => {
                            changeProperty('properties.underline', !underline);
                            showToast(`Underline: ${!underline ? 'ON' : 'OFF'}`);
                          }}
                          className={`p-1.5 rounded-lg transition-all cursor-pointer hover:bg-white/5 ${
                            underline ? 'text-cyan-400 bg-cyan-500/10 border border-cyan-500/20 font-bold' : 'text-gray-500'
                          }`}
                          title="Underline"
                        >
                          <Underline className="w-3.5 h-3.5" />
                        </button>
                      </div>
  
                      {/* Case converters (TT, tt, Tt) */}
                      <div className="bg-black/10 border border-white/[0.02] p-1.5 rounded-xl flex gap-1 justify-around items-center">
                        <button 
                          onClick={() => {
                            updateNodesProperty(selectedNodeIds, 'properties.textContent', textContent.toUpperCase());
                            showToast('🔤 Converted text to UPPERCASE');
                          }}
                          className="text-[9px] font-bold text-gray-500 hover:text-cyan-400 p-1 hover:bg-white/5 rounded cursor-pointer"
                          title="UPPERCASE"
                        >
                          TT
                        </button>
                        <button 
                          onClick={() => {
                            updateNodesProperty(selectedNodeIds, 'properties.textContent', textContent.toLowerCase());
                            showToast('🔤 Converted text to lowercase');
                          }}
                          className="text-[9px] font-bold text-gray-500 hover:text-cyan-400 p-1 hover:bg-white/5 rounded cursor-pointer"
                          title="lowercase"
                        >
                          tt
                        </button>
                        <button 
                          onClick={() => {
                            const titleCased = textContent.replace(/\w\S*/g, (w: string) => w.charAt(0).toUpperCase() + w.substr(1).toLowerCase());
                            updateNodesProperty(selectedNodeIds, 'properties.textContent', titleCased);
                            showToast('🔤 Converted text to Title Case');
                          }}
                          className="text-[9px] font-bold text-gray-500 hover:text-cyan-400 p-1 hover:bg-white/5 rounded cursor-pointer"
                          title="Title Case"
                        >
                          Tt
                        </button>
                      </div>
                    </div>
  
                    {/* Alignment & Spacing sliders */}
                    <div className="bg-black/10 border border-white/[0.02] p-2.5 rounded-xl space-y-3" id="alignment_spacing_controls">
                      {/* Character/Line/Word spacing sliders */}
                      <div className="space-y-2">
                        <div className="space-y-1">
                          <div className="flex justify-between text-[9px] font-medium text-gray-400">
                            <span>Character Spacing</span>
                            <span className="text-cyan-400 font-bold">{charSpacing === 'mixed' ? 'Mixed' : `${charSpacing}px`}</span>
                          </div>
                          <input 
                            type="range" min="-5" max="15" value={charSpacing === 'mixed' ? 0 : charSpacing} 
                            onChange={(e) => changeProperty('properties.charSpacing', parseInt(e.target.value))}
                            className="w-full accent-cyan-400 h-1 bg-black rounded animate-none"
                          />
                        </div>
  
                        <div className="space-y-1">
                          <div className="flex justify-between text-[9px] font-medium text-gray-400">
                            <span>Line Spacing</span>
                            <span className="text-cyan-400 font-bold">{lineSpacing === 'mixed' ? 'Mixed' : `${(typeof lineSpacing === 'number' ? lineSpacing : parseFloat(lineSpacing as any) || 1.2).toFixed(1)}x`}</span>
                          </div>
                          <input 
                            type="range" min="0.5" max="3" step="0.1" value={lineSpacing === 'mixed' ? 1.2 : lineSpacing} 
                            onChange={(e) => changeProperty('properties.lineSpacing', parseFloat(e.target.value))}
                            className="w-full accent-cyan-400 h-1 bg-black rounded animate-none"
                          />
                        </div>
  
                        <div className="space-y-1">
                          <div className="flex justify-between text-[9px] font-medium text-gray-400">
                            <span>Word Spacing</span>
                            <span className="text-cyan-400 font-bold">{wordSpacing === 'mixed' ? 'Mixed' : `${wordSpacing}px`}</span>
                          </div>
                          <input 
                            type="range" min="0" max="50" step="1" value={wordSpacing === 'mixed' ? 0 : wordSpacing} 
                            onChange={(e) => changeProperty('properties.wordSpacing', parseInt(e.target.value))}
                            className="w-full accent-cyan-400 h-1 bg-black rounded animate-none"
                          />
                        </div>
                      </div>
  
                      {/* Alignment row left, center, right */}
                      <div className="flex justify-between items-center border-t border-white/[0.03] pt-2">
                        <span className="text-[9px] font-bold text-gray-500 uppercase">Text Alignment</span>
                        <div className="flex gap-1.5">
                          {(['left', 'center', 'right'] as const).map((align) => {
                            const AlignIcon = align === 'left' ? AlignLeft : align === 'center' ? AlignCenter : AlignRight;
                            const isAligned = alignment === align;
                            return (
                              <button
                                key={align}
                                onClick={() => {
                                  changeProperty('properties.alignment', align);
                                  showToast(`🎯 Aligned text: ${align}`);
                                }}
                                className={`p-1.5 rounded transition-all cursor-pointer ${
                                  isAligned ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-400/20' : 'text-gray-500 hover:text-white'
                                }`}
                              >
                                <AlignIcon className="w-3.5 h-3.5" />
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </div>
  
                    {/* Stroke, Shadows Preset colors row */}
                    <div className="bg-black/10 border border-white/[0.02] p-2.5 rounded-xl space-y-2" id="text_presets_colors">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 block">Quick Preset Styles</span>
                      
                      <div className="grid grid-cols-3 gap-1.5" id="presets_colors_grid">
                        {typographyPresets.map((pr) => (
                          <button
                            key={pr.styleId}
                            onClick={() => {
                              changeProperty('properties.textColor', pr.color);
                              changeProperty('properties.fontSize', pr.size);
                              changeProperty('properties.fontFamily', pr.font);
                              changeProperty('properties.bold', pr.bold);
                              showToast(`🎨 Applied Typography Preset style: ${pr.name}`);
                            }}
                            className="bg-[#111218] border border-white/5 hover:border-cyan-400/30 py-2 px-1 rounded-lg text-center transition-all cursor-pointer active:scale-95 flex flex-col items-center justify-center"
                          >
                            <span 
                              style={{ 
                                color: pr.color, 
                                fontFamily: pr.font, 
                                textShadow: pr.outlineColor !== 'transparent' ? `0px 1px 3px ${pr.outlineColor}` : 'none',
                                backgroundColor: pr.bgColor !== 'transparent' ? pr.bgColor : 'transparent'
                              }} 
                              className="text-[11px] font-bold block px-1 rounded truncate max-w-full"
                            >
                              Aa
                            </span>
                            <span className="text-[8px] text-gray-500 mt-1 truncate max-w-full font-medium leading-none">{pr.name}</span>
                          </button>
                        ))}
                      </div>
                    </div>
  
                    {/* Custom Presets section */}
                    <div className="bg-black/10 border border-white/[0.02] p-2.5 rounded-xl space-y-3" id="custom_presets_section">
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Custom Style Presets</span>
                        <button
                          onClick={() => {
                            const presetName = prompt('نام یا عنوان استایل خود را وارد کنید:', 'استایل شخصی من');
                            if (!presetName) return;
  
                            const newPreset = {
                              styleId: `custom_pr_${Date.now()}`,
                              name: presetName,
                              color: textColor === 'mixed' ? '#ffffff' : textColor,
                              outlineColor: 'transparent',
                              bgColor: backgroundColor === 'mixed' ? 'transparent' : backgroundColor,
                              size: fontSize === 'mixed' ? 24 : fontSize,
                              font: fontFamily === 'mixed' ? 'Inter' : fontFamily,
                              bold: bold === 'mixed' ? false : bold,
                              italic: italic === 'mixed' ? false : italic,
                              underline: underline === 'mixed' ? false : underline,
                              charSpacing: charSpacing === 'mixed' ? 0 : charSpacing,
                              lineSpacing: lineSpacing === 'mixed' ? 1.2 : lineSpacing,
                              wordSpacing: wordSpacing === 'mixed' ? 12 : wordSpacing,
                              captionTheme: captionTheme === 'mixed' ? 'karaoke' : captionTheme,
                            };
  
                            const updated = [...customPresets, newPreset];
                            setCustomPresets(updated);
                            localStorage.setItem('video_studio_custom_text_presets', JSON.stringify(updated));
                            showToast(`💾 استایل "${presetName}" با موفقیت ذخیره شد!`);
                          }}
                          className="flex items-center gap-1 text-[9px] font-bold text-cyan-400 hover:text-cyan-300 bg-cyan-500/10 border border-cyan-500/20 px-2 py-1 rounded transition-all cursor-pointer"
                          title="Save current style settings as preset"
                        >
                          <Save className="w-3 h-3" />
                          <span>Save Style</span>
                        </button>
                      </div>
  
                      {customPresets.length === 0 ? (
                        <p className="text-[9px] text-gray-500 italic text-center py-1">No custom presets saved yet.</p>
                      ) : (
                        <div className="grid grid-cols-2 gap-2 max-h-[100px] overflow-y-auto custom-scrollbar pr-1" id="custom_presets_grid">
                          {customPresets.map((pr) => (
                            <div
                              key={pr.styleId}
                              onClick={() => {
                                changeProperty('properties.textColor', pr.color);
                                changeProperty('properties.fontSize', pr.size);
                                changeProperty('properties.fontFamily', pr.font);
                                changeProperty('properties.bold', pr.bold);
                                if (pr.italic !== undefined) changeProperty('properties.italic', pr.italic);
                                if (pr.underline !== undefined) changeProperty('properties.underline', pr.underline);
                                if (pr.charSpacing !== undefined) changeProperty('properties.charSpacing', pr.charSpacing);
                                if (pr.lineSpacing !== undefined) changeProperty('properties.lineSpacing', pr.lineSpacing);
                                if (pr.wordSpacing !== undefined) changeProperty('properties.wordSpacing', pr.wordSpacing);
                                if (pr.captionTheme !== undefined) changeProperty('properties.captionTheme', pr.captionTheme);
                                showToast(`🎨 Loaded Custom Style: ${pr.name}`);
                              }}
                              className="bg-[#111218] border border-white/5 hover:border-cyan-400/30 p-2 rounded-lg flex items-center justify-between transition-all cursor-pointer group relative"
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <span 
                                  style={{ 
                                    color: pr.color, 
                                    fontFamily: pr.font, 
                                    backgroundColor: pr.bgColor !== 'transparent' && pr.bgColor ? pr.bgColor : 'transparent'
                                  }} 
                                  className="text-[10px] font-bold px-1 rounded shrink-0"
                                >
                                  Aa
                                </span>
                                <span className="text-[9px] text-gray-300 truncate font-semibold">{pr.name}</span>
                              </div>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const updated = customPresets.filter(p => p.styleId !== pr.styleId);
                                  setCustomPresets(updated);
                                  localStorage.setItem('video_studio_custom_text_presets', JSON.stringify(updated));
                                  showToast('🗑️ استایل سفارشی حذف شد');
                                }}
                                className="text-gray-500 hover:text-red-400 p-1 rounded hover:bg-white/5 transition-all opacity-0 group-hover:opacity-100 cursor-pointer"
                                title="Delete preset"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
  
                  </div>
              )}
  
              {/* TAB 3: TEMPLATES (10 customizable subtitle themes: Moving Box, Glow, Karaoke, Underline, etc.) */}
              {textTab === 'templates' && (
                <div className="space-y-4 animate-fadeIn" id="text_tab_animation_templates">
                  
                  {/* Caption Templates Header & Category filter */}
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase font-black text-purple-400 tracking-wider">Caption Templates</span>
                    <select 
                      value={templateCategory}
                      onChange={(e) => setTemplateCategory(e.target.value)}
                      className="bg-[#11121a] text-gray-300 px-2 py-1 rounded-lg border border-white/5 text-[9px] uppercase font-black focus:outline-none focus:ring-1 focus:ring-purple-500/50 cursor-pointer"
                    >
                      <option value="all">All Templates</option>
                      <option value="trending">Trending</option>
                      <option value="classic">Classic</option>
                      <option value="new">New</option>
                    </select>
                  </div>
  
                  {/* Themes List Grid Cards (2 columns) */}
                  <div className="grid grid-cols-2 gap-3.5" id="subtitle_themes_grid">
                    {[
                      {
                        id: 'moving-box',
                        name: 'Moving Box',
                        category: 'classic',
                        renderPreview: () => (
                          <div className="flex flex-col items-center">
                            <div className="flex items-center gap-1">
                              <span className="bg-[#a855f7] text-white text-[8px] font-bold px-1.5 py-0.5 rounded-md">Noticing</span>
                              <span className="text-white text-[8px] opacity-80">means</span>
                            </div>
                            <span className="text-white text-[8px] opacity-80 mt-1">paying attention</span>
                          </div>
                        )
                      },
                      {
                        id: 'karaoke',
                        name: 'Karaoke',
                        category: 'classic',
                        renderPreview: () => (
                          <div className="flex flex-col items-center">
                            <div className="flex items-center gap-1">
                              <span className="text-white text-[8px]">Noticing</span>
                              <span className="text-[#eab308] font-black text-[9px] drop-shadow-[0_0_6px_rgba(234,179,8,0.5)]">means</span>
                            </div>
                            <span className="text-white text-[8px] mt-1">paying attention</span>
                          </div>
                        )
                      },
                      {
                        id: 'underline',
                        name: 'Underline',
                        category: 'new',
                        renderPreview: () => (
                          <div className="flex flex-col items-center">
                            <div className="flex items-center gap-1">
                              <span className="text-white text-[8px]">Noticing</span>
                              <span className="text-[#eab308] text-[8px] border-b-2 border-[#eab308] pb-0.5 font-bold">means</span>
                            </div>
                            <span className="text-white text-[8px] mt-1">paying attention</span>
                          </div>
                        )
                      },
                      {
                        id: 'glow',
                        name: 'Glow',
                        category: 'trending',
                        renderPreview: () => (
                          <div className="flex flex-col items-center">
                            <div className="flex items-center gap-1">
                              <span className="text-white text-[8px]">Noticing</span>
                              <span className="text-[#10b981] font-bold text-[8px] drop-shadow-[0_0_6px_rgba(16,185,129,0.8)]">means</span>
                            </div>
                            <span className="text-white text-[8px] mt-1">paying attention</span>
                          </div>
                        )
                      },
                      {
                        id: 'highlight',
                        name: 'Highlight',
                        category: 'trending',
                        renderPreview: () => (
                          <div className="flex flex-col items-center">
                            <div className="flex items-center gap-1">
                              <span className="bg-[#eab308] text-black font-black text-[8px] px-1 py-0.5">Noticing</span>
                              <span className="text-white text-[8px]">means</span>
                            </div>
                            <span className="text-white text-[8px] mt-1">paying attention</span>
                          </div>
                        )
                      },
                      {
                        id: 'pop',
                        name: 'Pop',
                        category: 'trending',
                        renderPreview: () => (
                          <div className="flex flex-col items-center">
                            <div className="flex items-center gap-1">
                              <span className="bg-[#a855f7]/20 border border-[#a855f7]/40 text-[#a855f7] font-bold text-[8px] px-1.5 py-0.5 rounded-lg scale-105">Noticing</span>
                              <span className="text-white text-[8px]">means</span>
                            </div>
                            <span className="text-white text-[8px] mt-1">paying attention</span>
                          </div>
                        )
                      },
                      {
                        id: 'bounce',
                        name: 'Bounce',
                        category: 'trending',
                        renderPreview: () => (
                          <div className="flex flex-col items-center">
                            <div className="flex items-center gap-1">
                              <span className="text-[#3b82f6] font-extrabold text-[8px] -translate-y-1 inline-block">Noticing</span>
                              <span className="text-white text-[8px]">means</span>
                            </div>
                            <span className="text-white text-[8px] mt-1">paying attention</span>
                          </div>
                        )
                      },
                      {
                        id: 'minimal',
                        name: 'Minimal',
                        category: 'classic',
                        renderPreview: () => (
                          <div className="flex flex-col items-center">
                            <div className="flex items-center gap-1">
                              <span className="text-white font-bold text-[8px]">Noticing</span>
                              <span className="text-white/40 text-[8px]">means</span>
                            </div>
                            <span className="text-white/40 text-[8px] mt-1">paying attention</span>
                          </div>
                        )
                      },
                      {
                        id: 'typewriter',
                        name: 'Typewriter',
                        category: 'new',
                        renderPreview: () => (
                          <div className="flex flex-col items-center font-mono">
                            <div className="flex items-center gap-1">
                              <span className="text-[#22c55e] font-mono text-[8px]">Noticing</span>
                              <span className="text-[#22c55e] animate-pulse font-mono text-[8px] font-black">|</span>
                            </div>
                          </div>
                        )
                      },
                      {
                        id: 'clean',
                        name: 'Clean',
                        category: 'classic',
                        renderPreview: () => (
                          <div className="flex flex-col items-center font-sans">
                            <span className="text-white text-[8px] tracking-wide font-medium text-center">Noticing means paying attention</span>
                          </div>
                        )
                      }
                    ]
                    .filter(t => templateCategory === 'all' || t.category === templateCategory)
                    .map((theme) => {
                      const isActive = activeNode.properties.captionTheme === theme.id;
                      return (
                        <div key={theme.id} className="flex flex-col">
                          <button
                            onClick={() => {
                              changeProperty('properties.captionTheme', theme.id);
                              showToast(`✨ Selected template: ${theme.name}`);
                            }}
                            className={`w-full bg-[#0c0d12] rounded-xl border p-2.5 h-20 flex items-center justify-center relative group overflow-hidden transition-all duration-300 cursor-pointer ${
                              isActive 
                                ? 'border-purple-500 shadow-[0_0_12px_rgba(168,85,247,0.3)] ring-1 ring-purple-500/20' 
                                : 'border-white/5 hover:border-white/10 hover:bg-[#11121a]'
                            }`}
                          >
                            {isActive && (
                              <div className="absolute top-0 right-0 h-2 w-2 bg-purple-500 rounded-bl" />
                            )}
                            {theme.renderPreview()}
                          </button>
                          <span className={`text-[9px] font-bold text-center mt-1 transition-colors ${
                            isActive ? 'text-purple-400' : 'text-gray-500'
                          }`}>
                            {theme.name}
                          </span>
                        </div>
                      );
                    })}
                  </div>
  
                  {/* Customize Template Section */}
                  <div className="border-t border-white/5 pt-4 mt-6 space-y-4" id="customize_template_container">
                    <h3 className="text-[11px] uppercase font-extrabold text-purple-300 tracking-wider">Customize Template</h3>
  
                    {/* Font Dropdown */}
                    <div className="space-y-1.5">
                      <label className="text-[9px] text-gray-400 font-bold uppercase block">Font</label>
                      <select
                        value={fontFamily}
                        onChange={(e) => changeProperty('properties.fontFamily', e.target.value)}
                        className="w-full bg-[#11121a] border border-white/5 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-purple-500/50 cursor-pointer font-sans"
                      >
                        <option value="Vazirmatn">Vazirmatn (وزیرمتن)</option>
                        <option value="Lalezar">Lalezar (لاله‌زار)</option>
                        <option value="Rubik">Rubik (روبیک)</option>
                        <option value="Inter">Inter (Sans-serif)</option>
                        <option value="Space Grotesk">Space Grotesk (Tech)</option>
                        <option value="Playfair Display">Playfair Display (Serif)</option>
                        <option value="Fira Code">Fira Code (Mono)</option>
                        <option value="system-ui">System UI</option>
                      </select>
                    </div>
  
                    {/* Font Size slider */}
                    <div className="space-y-1.5">
                      <div className="flex justify-between items-center text-[9px] text-gray-400 font-bold uppercase">
                        <span>Font Size</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <input 
                          type="range" 
                          min="10" 
                          max="100" 
                          value={fontSize} 
                          onChange={(e) => changeProperty('properties.fontSize', parseInt(e.target.value))}
                          className="flex-1 accent-purple-500 h-1 bg-black rounded"
                        />
                        <input 
                          type="number" 
                          min="10" 
                          max="100" 
                          value={fontSize}
                          onChange={(e) => changeProperty('properties.fontSize', Math.max(10, Math.min(100, parseInt(e.target.value) || 24)))}
                          className="w-12 bg-[#11121a] border border-white/5 rounded px-1.5 py-1 text-center font-mono text-[10px] text-purple-400 font-bold focus:outline-none"
                        />
                      </div>
                    </div>
  
                    {/* Text Color */}
                    <div className="flex justify-between items-center py-1">
                      <span className="text-[9px] text-gray-400 font-bold uppercase">Text Color</span>
                      <div className="flex items-center gap-2">
                        <button 
                          onClick={() => textColorInputRef.current?.click()}
                          style={{ backgroundColor: textColor }}
                          className="w-8 h-8 rounded-lg border border-white/20 shadow-[0_2px_8px_rgba(0,0,0,0.3)] cursor-pointer hover:scale-105 active:scale-95 transition-transform"
                          title="Choose Text Color"
                        />
                        <input 
                          ref={textColorInputRef}
                          type="color" 
                          value={textColor} 
                          onChange={(e) => changeProperty('properties.textColor', e.target.value)}
                          className="hidden"
                        />
                        <span className="text-[9px] text-gray-500 font-mono uppercase">{textColor}</span>
                      </div>
                    </div>
  
                    {/* Active Color */}
                    <div className="flex justify-between items-center py-1">
                      <span className="text-[9px] text-gray-400 font-bold uppercase">Active Color</span>
                      <div className="flex items-center gap-2">
                        <button 
                          onClick={() => activeColorInputRef.current?.click()}
                          style={{ backgroundColor: activeColor }}
                          className="w-8 h-8 rounded-lg border border-white/20 shadow-[0_2px_8px_rgba(0,0,0,0.3)] cursor-pointer hover:scale-105 active:scale-95 transition-transform"
                          title="Choose Active Highlight Color"
                        />
                        <input 
                          ref={activeColorInputRef}
                          type="color" 
                          value={activeColor} 
                          onChange={(e) => changeProperty('properties.activeColor', e.target.value)}
                          className="hidden"
                        />
                        <span className="text-[9px] text-gray-500 font-mono uppercase">{activeColor}</span>
                      </div>
                    </div>
  
                    {/* Background Selector (With Clear Transparent Option) */}
                    <div className="flex justify-between items-center py-1">
                      <span className="text-[9px] text-gray-400 font-bold uppercase">Background</span>
                      <div className="flex items-center gap-2.5">
                        <button 
                          onClick={() => {
                            const val = backgroundColor === 'clear' ? '#a855f7' : 'clear';
                            changeProperty('properties.backgroundColor', val);
                            showToast(val === 'clear' ? '🧹 Background transparent' : '🎨 Background color enabled');
                          }}
                          className={`px-2.5 py-1 text-[8px] font-black rounded-lg uppercase tracking-wider transition-all border ${
                            backgroundColor === 'clear' 
                              ? 'bg-purple-500/10 text-purple-400 border-purple-500/30 shadow-[0_0_8px_rgba(168,85,247,0.15)]' 
                              : 'bg-white/5 text-gray-500 border-white/5 hover:border-white/10'
                          }`}
                        >
                          Clear
                        </button>
                        
                        {backgroundColor !== 'clear' ? (
                          <div className="flex items-center gap-1.5">
                            <button 
                              onClick={() => bgInputRef.current?.click()}
                              style={{ backgroundColor: backgroundColor === 'mixed' ? '#a855f7' : (backgroundColor || '#a855f7') }}
                              className="w-8 h-8 rounded-lg border border-white/20 shadow-[0_2px_8px_rgba(0,0,0,0.3)] cursor-pointer hover:scale-105 active:scale-95 transition-transform"
                              title="Choose Background Color"
                            />
                            <input 
                              ref={bgInputRef}
                              type="color" 
                              value={backgroundColor !== 'mixed' ? backgroundColor : '#a855f7'} 
                              onChange={(e) => changeProperty('properties.backgroundColor', e.target.value)}
                              className="hidden"
                            />
                            <span className="text-[9px] text-gray-500 font-mono uppercase">{backgroundColor}</span>
                          </div>
                        ) : (
                          <button
                            onClick={() => {
                              changeProperty('properties.backgroundColor', '#a855f7');
                            }}
                            className="px-2 py-1 bg-purple-600 hover:bg-purple-500 text-white text-[8px] font-black uppercase rounded-lg cursor-pointer transition-colors"
                          >
                            Add Color
                          </button>
                        )}
                      </div>
                    </div>
  
                    {/* Radius slider */}
                    <div className="space-y-1.5">
                      <div className="flex justify-between items-center text-[9px] text-gray-400 font-bold uppercase">
                        <span>Radius</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <input 
                          type="range" 
                          min="0" 
                          max="40" 
                          value={radius} 
                          onChange={(e) => changeProperty('properties.radius', parseInt(e.target.value))}
                          className="flex-1 accent-purple-500 h-1 bg-black rounded"
                        />
                        <input 
                          type="number" 
                          min="0" 
                          max="40" 
                          value={radius}
                          onChange={(e) => changeProperty('properties.radius', Math.max(0, Math.min(40, parseInt(e.target.value) || 0)))}
                          className="w-12 bg-[#11121a] border border-white/5 rounded px-1.5 py-1 text-center font-mono text-[10px] text-purple-400 font-bold focus:outline-none"
                        />
                      </div>
                    </div>
  
                    {/* Padding slider */}
                    <div className="space-y-1.5">
                      <div className="flex justify-between items-center text-[9px] text-gray-400 font-bold uppercase">
                        <span>Padding</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <input 
                          type="range" 
                          min="0" 
                          max="50" 
                          value={padding} 
                          onChange={(e) => changeProperty('properties.padding', parseInt(e.target.value))}
                          className="flex-1 accent-purple-500 h-1 bg-black rounded"
                        />
                        <input 
                          type="number" 
                          min="0" 
                          max="50" 
                          value={padding}
                          onChange={(e) => changeProperty('properties.padding', Math.max(0, Math.min(50, parseInt(e.target.value) || 0)))}
                          className="w-12 bg-[#11121a] border border-white/5 rounded px-1.5 py-1 text-center font-mono text-[10px] text-purple-400 font-bold focus:outline-none"
                        />
                      </div>
                    </div>
  
                    {/* Animation select */}
                    <div className="space-y-1.5">
                      <label className="text-[9px] text-gray-400 font-bold uppercase block">Animation</label>
                      <select
                        value={captionTheme}
                        onChange={(e) => {
                          changeProperty('properties.captionTheme', e.target.value);
                          showToast(`✨ Changed theme animation to: ${e.target.value}`);
                        }}
                        className="w-full bg-[#11121a] border border-white/5 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-purple-500/50 cursor-pointer font-sans"
                      >
                        <option value="moving-box">Move Box</option>
                        <option value="karaoke">Karaoke</option>
                        <option value="underline">Underline</option>
                        <option value="glow">Glow</option>
                        <option value="highlight">Highlight</option>
                        <option value="pop">Pop</option>
                        <option value="bounce">Bounce</option>
                        <option value="minimal">Minimal</option>
                        <option value="typewriter">Typewriter</option>
                        <option value="clean">Clean</option>
                        <option value="cinematic">Cinematic (Smooth blur)</option>
                        <option value="spring">Spring (Playful)</option>
                        <option value="shadow-pop">Shadow Pop (سایه سه‌بعدی متحرک)</option>
                        <option value="word-stack">Word Stack (پشته‌ای عمودی)</option>
                        <option value="split-reveal">Split Reveal (شکافتن و افشا)</option>
                        <option value="bold-impact">Bold Impact (ضخیم و پر انرژی)</option>
                        <option value="gradient-flow">Gradient Flow (جریان گرادیان متحرک)</option>
                        <option value="chat-bubble">Chat Bubble (حباب گفتگو)</option>
                        <option value="handwritten">Handwritten (دست‌نویس صمیمی)</option>
                        <option value="flip-rotate">Flip/Rotate (چرخش سه‌بعدی)</option>
                        <option value="confetti-burst">Confetti Burst (انفجار ذرات)</option>
                        <option value="outline-stroke">Outline Stroke (حاشیه توخالی)</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}
  
  {textTab === 'advanced' && (
    <div className="space-y-4 animate-fadeIn" id="text_tab_advanced">
      <div className="flex items-center justify-between pb-1 border-b border-white/5">
        <span className="text-[10px] uppercase font-black text-cyan-400 tracking-widest flex items-center gap-1.5">
          <Sparkles className="w-3 h-3 text-cyan-400" />
          Professional Subtitle Canvas
        </span>
        <span className="text-[8px] font-bold text-gray-500 uppercase tracking-widest bg-cyan-500/10 px-1.5 py-0.5 rounded">
          Engine Active
        </span>
      </div>
  
      {/* SECTION TEMPLATE SPECIFIC: DYNAMIC UNIQUE SETTINGS FOR ACTIVE TEMPLATE */}
      {(() => {
        const currentTheme = activeNode.properties.captionTheme || 'karaoke';
        const themeDisplayNames: Record<string, string> = {
          'moving-box': 'Moving Box (قالب جعبه متحرک)',
          'karaoke': 'Karaoke (قالب کارائوکه)',
          'underline': 'Underline (قالب خط زیرین)',
          'glow': 'Glow (قالب درخشان)',
          'highlight': 'Highlight (قالب برجسته رنگی)',
          'pop': 'Pop (قالب بزرگ‌نمایی پویا)',
          'bounce': 'Bounce (قالب پرشی)',
          'minimal': 'Minimal (قالب مینیمال)',
          'typewriter': 'Typewriter (قالب ماشین تحریر)',
          'clean': 'Clean (قالب پاکیزه)',
          'cinematic': 'Cinematic (قالب سینمایی)',
          'spring': 'Spring (قالب فنری)'
        };
        const activeThemeLabel = themeDisplayNames[currentTheme] || currentTheme;
  
        return (
          <details className="group bg-[#0e0f16] border border-purple-500/20 rounded-xl overflow-hidden [&_summary::-webkit-details-marker]:hidden shadow-[0_4px_20px_rgba(168,85,247,0.05)]" open>
            <summary className="flex items-center justify-between p-3 cursor-pointer hover:bg-purple-500/5 select-none transition-all border-b border-purple-500/10">
              <div className="flex items-center gap-2">
                <Wand2 className="w-3.5 h-3.5 text-purple-400 animate-pulse" />
                <div className="flex flex-col">
                  <span className="text-[10px] uppercase font-black text-purple-300 tracking-wider">Template Settings</span>
                  <span className="text-[7px] text-gray-500">تنظیمات اختصاصی قالب انتخاب شده</span>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-[8px] font-black text-purple-400 bg-purple-500/10 px-1.5 py-0.5 rounded truncate max-w-[120px]">
                  {activeThemeLabel}
                </span>
                <ChevronDown className="w-3.5 h-3.5 text-purple-400 group-open:rotate-180 transition-transform" />
              </div>
            </summary>
            
            <div className="p-3.5 space-y-4 text-gray-300 bg-gradient-to-b from-[#0e0f16] to-[#0a0a0f] border-t border-white/[0.01]">
              {currentTheme === 'moving-box' && (
                <div className="space-y-4 animate-fadeIn">
                  <p className="text-[8px] text-gray-400 leading-relaxed text-right" dir="rtl">
                    تنظیمات ویژه قالب متحرک؛ جعبه‌ای رنگی با جابجایی پیوسته که واژه‌ی فعال را احاطه می‌کند:
                  </p>
                  
                  {/* Box BG Color */}
                  <div className="flex justify-between items-center py-1">
                    <div className="flex flex-col">
                      <span className="text-[9px] text-gray-400 font-bold uppercase">Box Color</span>
                      <span className="text-[7px] text-gray-500">رنگ پس‌زمینه جعبه</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <input 
                        type="color" 
                        value={activeNode.properties.movingBoxBgColor || '#a855f7'} 
                        onChange={(e) => changeProperty('properties.movingBoxBgColor', e.target.value)}
                        className="w-8 h-8 rounded border border-white/10 cursor-pointer bg-transparent animate-fadeIn"
                      />
                      <span className="text-[9px] text-gray-500 font-mono uppercase">{activeNode.properties.movingBoxBgColor || '#a855f7'}</span>
                    </div>
                  </div>
  
                  {/* Padding X & Y */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-[9px] text-gray-400 font-bold uppercase">
                      <span>Padding Horizontal (فاصله افقی)</span>
                      <span>{activeNode.properties.movingBoxPaddingX ?? 8}px</span>
                    </div>
                    <input 
                      type="range" min="0" max="30" 
                      value={activeNode.properties.movingBoxPaddingX ?? 8} 
                      onChange={(e) => changeProperty('properties.movingBoxPaddingX', parseInt(e.target.value))}
                      className="w-full accent-purple-500 h-1 bg-black rounded"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-[9px] text-gray-400 font-bold uppercase">
                      <span>Padding Vertical (فاصله عمودی)</span>
                      <span>{activeNode.properties.movingBoxPaddingY ?? 4}px</span>
                    </div>
                    <input 
                      type="range" min="0" max="20" 
                      value={activeNode.properties.movingBoxPaddingY ?? 4} 
                      onChange={(e) => changeProperty('properties.movingBoxPaddingY', parseInt(e.target.value))}
                      className="w-full accent-purple-500 h-1 bg-black rounded"
                    />
                  </div>
  
                  {/* Box Corner Radius */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-[9px] text-gray-400 font-bold uppercase">
                      <span>Corner Radius (گردی گوشه‌ها)</span>
                      <span>{activeNode.properties.movingBoxRadius ?? 8}px</span>
                    </div>
                    <input 
                      type="range" min="0" max="30" 
                      value={activeNode.properties.movingBoxRadius ?? 8} 
                      onChange={(e) => changeProperty('properties.movingBoxRadius', parseInt(e.target.value))}
                      className="w-full accent-purple-500 h-1 bg-black rounded"
                    />
                  </div>
  
                  {/* Border width and Border color */}
                  <div className="space-y-1.5 p-2 bg-black/30 rounded-lg border border-white/5">
                    <div className="flex justify-between text-[9px] text-gray-400 font-bold uppercase">
                      <span>Border Width (ضخامت مرز)</span>
                      <span>{activeNode.properties.movingBoxBorderWidth ?? 0}px</span>
                    </div>
                    <input 
                      type="range" min="0" max="8" 
                      value={activeNode.properties.movingBoxBorderWidth ?? 0} 
                      onChange={(e) => changeProperty('properties.movingBoxBorderWidth', parseInt(e.target.value))}
                      className="w-full accent-purple-500 h-1 bg-black rounded"
                    />
                    {(activeNode.properties.movingBoxBorderWidth ?? 0) > 0 && (
                      <div className="flex justify-between items-center mt-2.5 animate-fadeIn">
                        <span className="text-[9px] text-gray-400 font-bold uppercase">Border Color</span>
                        <input 
                          type="color" 
                          value={activeNode.properties.movingBoxBorderColor || '#ffffff'} 
                          onChange={(e) => changeProperty('properties.movingBoxBorderColor', e.target.value)}
                          className="w-6 h-6 rounded cursor-pointer bg-transparent border border-white/10"
                        />
                      </div>
                    )}
                  </div>
  
                  {/* Box Scale multiplier on active */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-[9px] text-gray-400 font-bold uppercase">
                      <span>Active Box Scale (بزرگ‌نمایی جعبه فعال)</span>
                      <span>{activeNode.properties.movingBoxScale ?? 1.05}x</span>
                    </div>
                    <input 
                      type="range" min="0.8" max="1.4" step="0.05"
                      value={activeNode.properties.movingBoxScale ?? 1.05} 
                      onChange={(e) => changeProperty('properties.movingBoxScale', parseFloat(e.target.value))}
                      className="w-full accent-purple-500 h-1 bg-black rounded"
                    />
                  </div>
  
                  {/* Box Shadow Opacity */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-[9px] text-gray-400 font-bold uppercase">
                      <span>Box Shadow (شفافیت سایه)</span>
                      <span>{Math.round((activeNode.properties.movingBoxShadowOpacity ?? 0.3) * 100)}%</span>
                    </div>
                    <input 
                      type="range" min="0" max="1" step="0.05"
                      value={activeNode.properties.movingBoxShadowOpacity ?? 0.3} 
                      onChange={(e) => changeProperty('properties.movingBoxShadowOpacity', parseFloat(e.target.value))}
                      className="w-full accent-purple-500 h-1 bg-black rounded"
                    />
                  </div>
                </div>
              )}
  
              {currentTheme === 'karaoke' && (
                <div className="space-y-4 animate-fadeIn">
                  <p className="text-[8px] text-gray-400 leading-relaxed text-right" dir="rtl">
                    تنظیمات ویژه قالب کارائوکه؛ جلب توجه چشمگیر با کم‌رنگ کردن و تغییر ابعاد واژه‌های غیرفعال:
                  </p>
  
                  {/* Active word scale */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-[9px] text-gray-400 font-bold uppercase">
                      <span>Active Word Scale (بزرگ‌نمایی کلمه فعال)</span>
                      <span>{activeNode.properties.karaokeActiveScale ?? 1.15}x</span>
                    </div>
                    <input 
                      type="range" min="1.0" max="1.5" step="0.05"
                      value={activeNode.properties.karaokeActiveScale ?? 1.15} 
                      onChange={(e) => changeProperty('properties.karaokeActiveScale', parseFloat(e.target.value))}
                      className="w-full accent-purple-500 h-1 bg-black rounded"
                    />
                  </div>
  
                  {/* Inactive opacity */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-[9px] text-gray-400 font-bold uppercase">
                      <span>Inactive Word Opacity (کلمات غیرفعال)</span>
                      <span>{Math.round((activeNode.properties.karaokeInactiveOpacity ?? 0.4) * 100)}%</span>
                    </div>
                    <input 
                      type="range" min="0.1" max="1.0" step="0.05"
                      value={activeNode.properties.karaokeInactiveOpacity ?? 0.4} 
                      onChange={(e) => changeProperty('properties.karaokeInactiveOpacity', parseFloat(e.target.value))}
                      className="w-full accent-purple-500 h-1 bg-black rounded"
                    />
                  </div>
  
                  {/* Inactive text color */}
                  <div className="flex justify-between items-center py-1">
                    <div className="flex flex-col">
                      <span className="text-[9px] text-gray-400 font-bold uppercase">Inactive Text Color</span>
                      <span className="text-[7px] text-gray-500">رنگ اختصاصی کلمات غیرفعال</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <input 
                        type="color" 
                        value={activeNode.properties.karaokeInactiveColor || '#888888'} 
                        onChange={(e) => changeProperty('properties.karaokeInactiveColor', e.target.value)}
                        className="w-8 h-8 rounded border border-white/10 cursor-pointer bg-transparent animate-fadeIn"
                      />
                      <button 
                        onClick={() => changeProperty('properties.karaokeInactiveColor', '')}
                        className="text-[8px] font-black uppercase text-purple-400 hover:text-purple-300 bg-purple-500/10 px-2 py-1 rounded border border-purple-500/20 cursor-pointer"
                      >
                        Reset
                      </button>
                    </div>
                  </div>
  
                  {/* Active font weight bold */}
                  <div className="flex justify-between items-center bg-black/20 p-2 rounded-lg border border-white/5">
                    <div className="flex flex-col">
                      <span className="text-[9px] font-bold uppercase text-gray-400">Bold Active Word</span>
                      <span className="text-[7px] text-gray-500">ضخیم بودن کلمه فعال نسبت به بقیه</span>
                    </div>
                    <button 
                      onClick={() => changeProperty('properties.karaokeActiveBold', !(activeNode.properties.karaokeActiveBold ?? true))}
                      className={`w-8 h-4 rounded-full p-0.5 transition-colors cursor-pointer ${
                        (activeNode.properties.karaokeActiveBold ?? true) ? 'bg-purple-500 flex justify-end' : 'bg-gray-800 flex justify-start'
                      }`}
                    >
                      <span className="w-3 h-3 rounded-full bg-white shadow-sm" />
                    </button>
                  </div>
                </div>
              )}
  
              {currentTheme === 'underline' && (
                <div className="space-y-4 animate-fadeIn">
                  <p className="text-[8px] text-gray-400 leading-relaxed text-right" dir="rtl">
                    تنظیمات خط زیرین؛ خطی پویا و زیبا که زیر کلمه در حال گفتار کشیده می‌شود:
                  </p>
  
                  {/* Underline color */}
                  <div className="flex justify-between items-center py-1">
                    <div className="flex flex-col">
                      <span className="text-[9px] text-gray-400 font-bold uppercase">Line Color</span>
                      <span className="text-[7px] text-gray-500">رنگ خط زیر واژه</span>
                    </div>
                    <input 
                      type="color" 
                      value={activeNode.properties.underlineColor || '#eab308'} 
                      onChange={(e) => changeProperty('properties.underlineColor', e.target.value)}
                      className="w-8 h-8 rounded border border-white/10 cursor-pointer bg-transparent animate-fadeIn"
                    />
                  </div>
  
                  {/* Underline thickness */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-[9px] text-gray-400 font-bold uppercase">
                      <span>Line Thickness (ضخامت خط)</span>
                      <span>{activeNode.properties.underlineHeight ?? 3}px</span>
                    </div>
                    <input 
                      type="range" min="1" max="10" 
                      value={activeNode.properties.underlineHeight ?? 3} 
                      onChange={(e) => changeProperty('properties.underlineHeight', parseInt(e.target.value))}
                      className="w-full accent-purple-500 h-1 bg-black rounded"
                    />
                  </div>
  
                  {/* Underline Gap below text */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-[9px] text-gray-400 font-bold uppercase">
                      <span>Distance to text (فاصله از متن)</span>
                      <span>{activeNode.properties.underlineGap ?? 4}px</span>
                    </div>
                    <input 
                      type="range" min="0" max="20" 
                      value={activeNode.properties.underlineGap ?? 4} 
                      onChange={(e) => changeProperty('properties.underlineGap', parseInt(e.target.value))}
                      className="w-full accent-purple-500 h-1 bg-black rounded"
                    />
                  </div>
  
                  {/* Underline style type */}
                  <div className="space-y-1.5">
                    <span className="text-[9px] uppercase font-bold text-gray-500">Line Style Pattern (نوع طرح خط)</span>
                    <select
                      value={activeNode.properties.underlineStyle ?? 'solid'}
                      onChange={(e) => changeProperty('properties.underlineStyle', e.target.value)}
                      className="w-full bg-black/40 border border-white/5 rounded-lg px-2.5 py-1.5 text-[10px] text-white focus:outline-none focus:ring-1 focus:ring-purple-500/50 cursor-pointer"
                    >
                      <option value="solid">Solid (یکدست و ممتد)</option>
                      <option value="dashed">Dashed (خط‌چین)</option>
                      <option value="double">Double (دوخط موازی)</option>
                    </select>
                  </div>
                </div>
              )}
  
              {currentTheme === 'glow' && (
                <div className="space-y-4 animate-fadeIn">
                  <p className="text-[8px] text-gray-400 leading-relaxed text-right" dir="rtl">
                    تنظیمات جلوه درخشان؛ ایجاد سایه نوری ملایم و جذاب به همراه تار کردن محو کلمات جانبی:
                  </p>
  
                  {/* Glow color */}
                  <div className="flex justify-between items-center py-1">
                    <div className="flex flex-col">
                      <span className="text-[9px] text-gray-400 font-bold uppercase">Glow Light Color</span>
                      <span className="text-[7px] text-gray-500">رنگ نوری درخشش</span>
                    </div>
                    <input 
                      type="color" 
                      value={activeNode.properties.glowColor || '#10b981'} 
                      onChange={(e) => changeProperty('properties.glowColor', e.target.value)}
                      className="w-8 h-8 rounded border border-white/10 cursor-pointer bg-transparent animate-fadeIn"
                    />
                  </div>
  
                  {/* Glow Radius */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-[9px] text-gray-400 font-bold uppercase">
                      <span>Glow Blur Size (اندازه انتشار نور)</span>
                      <span>{activeNode.properties.glowRadius ?? 12}px</span>
                    </div>
                    <input 
                      type="range" min="2" max="30" 
                      value={activeNode.properties.glowRadius ?? 12} 
                      onChange={(e) => changeProperty('properties.glowRadius', parseInt(e.target.value))}
                      className="w-full accent-purple-500 h-1 bg-black rounded"
                    />
                  </div>
  
                  {/* Glow Brightness boost */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-[9px] text-gray-400 font-bold uppercase">
                      <span>Glow Brightness (شدت روشنایی)</span>
                      <span>{activeNode.properties.glowBrightness ?? 1.5}x</span>
                    </div>
                    <input 
                      type="range" min="1.0" max="2.5" step="0.1"
                      value={activeNode.properties.glowBrightness ?? 1.5} 
                      onChange={(e) => changeProperty('properties.glowBrightness', parseFloat(e.target.value))}
                      className="w-full accent-purple-500 h-1 bg-black rounded"
                    />
                  </div>
  
                  {/* Glow Inactive word blur level */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-[9px] text-gray-400 font-bold uppercase">
                      <span>Inactive Blur (مات کردن غیرفعال‌ها)</span>
                      <span>{activeNode.properties.glowInactiveBlur ?? 1.5}px</span>
                    </div>
                    <input 
                      type="range" min="0" max="8" step="0.5"
                      value={activeNode.properties.glowInactiveBlur ?? 1.5} 
                      onChange={(e) => changeProperty('properties.glowInactiveBlur', parseFloat(e.target.value))}
                      className="w-full accent-purple-500 h-1 bg-black rounded"
                    />
                  </div>
                </div>
              )}
  
              {currentTheme === 'highlight' && (
                <div className="space-y-4 animate-fadeIn">
                  <p className="text-[8px] text-gray-400 leading-relaxed text-right" dir="rtl">
                    تنظیمات هایلایت؛ پس‌زمینه رنگی ثابت با کادر و فواصل سفارشی برای کلمه‌ی در حال پخش:
                  </p>
  
                  {/* Highlight Bg Color */}
                  <div className="flex justify-between items-center py-1">
                    <div className="flex flex-col">
                      <span className="text-[9px] text-gray-400 font-bold uppercase">Highlight Bg Color</span>
                      <span className="text-[7px] text-gray-500">رنگ پس‌زمینه هایلایت</span>
                    </div>
                    <input 
                      type="color" 
                      value={activeNode.properties.highlightBgColor || '#eab308'} 
                      onChange={(e) => changeProperty('properties.highlightBgColor', e.target.value)}
                      className="w-8 h-8 rounded border border-white/10 cursor-pointer bg-transparent animate-fadeIn"
                    />
                  </div>
  
                  {/* Highlight Text Color */}
                  <div className="flex justify-between items-center py-1">
                    <div className="flex flex-col">
                      <span className="text-[9px] text-gray-400 font-bold uppercase">Highlight Text Color</span>
                      <span className="text-[7px] text-gray-500">رنگ واژه فعال داخل هایلایت</span>
                    </div>
                    <input 
                      type="color" 
                      value={activeNode.properties.highlightTextColor || '#000000'} 
                      onChange={(e) => changeProperty('properties.highlightTextColor', e.target.value)}
                      className="w-8 h-8 rounded border border-white/10 cursor-pointer bg-transparent animate-fadeIn"
                    />
                  </div>
  
                  {/* Highlight Padding X & Y */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-[9px] text-gray-400 font-bold uppercase">
                      <span>Padding Horizontal (فاصله افقی)</span>
                      <span>{activeNode.properties.highlightPaddingX ?? 8}px</span>
                    </div>
                    <input 
                      type="range" min="0" max="30" 
                      value={activeNode.properties.highlightPaddingX ?? 8} 
                      onChange={(e) => changeProperty('properties.highlightPaddingX', parseInt(e.target.value))}
                      className="w-full accent-purple-500 h-1 bg-black rounded"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-[9px] text-gray-400 font-bold uppercase">
                      <span>Padding Vertical (فاصله عمودی)</span>
                      <span>{activeNode.properties.highlightPaddingY ?? 4}px</span>
                    </div>
                    <input 
                      type="range" min="0" max="20" 
                      value={activeNode.properties.highlightPaddingY ?? 4} 
                      onChange={(e) => changeProperty('properties.highlightPaddingY', parseInt(e.target.value))}
                      className="w-full accent-purple-500 h-1 bg-black rounded"
                    />
                  </div>
  
                  {/* Highlight Corner Radius */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-[9px] text-gray-400 font-bold uppercase">
                      <span>Corner Radius (گردی گوشه‌ها)</span>
                      <span>{activeNode.properties.highlightRadius ?? 6}px</span>
                    </div>
                    <input 
                      type="range" min="0" max="30" 
                      value={activeNode.properties.highlightRadius ?? 6} 
                      onChange={(e) => changeProperty('properties.highlightRadius', parseInt(e.target.value))}
                      className="w-full accent-purple-500 h-1 bg-black rounded"
                    />
                  </div>
  
                  {/* Highlight Border details */}
                  <div className="space-y-1.5 p-2 bg-black/30 rounded-lg border border-white/5">
                    <div className="flex justify-between text-[9px] text-gray-400 font-bold uppercase">
                      <span>Border Width (ضخامت مرز هایلایت)</span>
                      <span>{activeNode.properties.highlightBorderWidth ?? 0}px</span>
                    </div>
                    <input 
                      type="range" min="0" max="8" 
                      value={activeNode.properties.highlightBorderWidth ?? 0} 
                      onChange={(e) => changeProperty('properties.highlightBorderWidth', parseInt(e.target.value))}
                      className="w-full accent-purple-500 h-1 bg-black rounded"
                    />
                    {(activeNode.properties.highlightBorderWidth ?? 0) > 0 && (
                      <div className="flex justify-between items-center mt-2.5 animate-fadeIn">
                        <span className="text-[9px] text-gray-400 font-bold uppercase">Border Color</span>
                        <input 
                          type="color" 
                          value={activeNode.properties.highlightBorderColor || '#ffffff'} 
                          onChange={(e) => changeProperty('properties.highlightBorderColor', e.target.value)}
                          className="w-6 h-6 rounded cursor-pointer bg-transparent border border-white/10 animate-fadeIn"
                        />
                      </div>
                    )}
                  </div>
                </div>
              )}
  
              {currentTheme === 'pop' && (
                <div className="space-y-4 animate-fadeIn">
                  <p className="text-[8px] text-gray-400 leading-relaxed text-right" dir="rtl">
                    تنظیمات ویژه قالب پاپ؛ ایجاد بزرگ‌نمایی به همراه چرخش زاویه‌ای کلمه‌ی فعال جهت پویایی گرافیکی بالا:
                  </p>
  
                  {/* Pop scale multiplier */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-[9px] text-gray-400 font-bold uppercase">
                      <span>Pop Scale (مقدار بزرگ‌نمایی فعال)</span>
                      <span>{activeNode.properties.popScale ?? 1.3}x</span>
                    </div>
                    <input 
                      type="range" min="1.0" max="1.8" step="0.05"
                      value={activeNode.properties.popScale ?? 1.3} 
                      onChange={(e) => changeProperty('properties.popScale', parseFloat(e.target.value))}
                      className="w-full accent-purple-500 h-1 bg-black rounded"
                    />
                  </div>
  
                  {/* Pop Rotation Angle */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-[9px] text-gray-400 font-bold uppercase">
                      <span>Rotation Angle (زاویه انحراف چرخش)</span>
                      <span>{activeNode.properties.popRotation ?? -5}°</span>
                    </div>
                    <input 
                      type="range" min="-25" max="25" step="1"
                      value={activeNode.properties.popRotation ?? -5} 
                      onChange={(e) => changeProperty('properties.popRotation', parseInt(e.target.value))}
                      className="w-full accent-purple-500 h-1 bg-black rounded"
                    />
                  </div>
  
                  {/* Pop Bounce Factor / Stiffness */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-[9px] text-gray-400 font-bold uppercase">
                      <span>Spring Stiffness (سفتی و سرعت فنری)</span>
                      <span>{activeNode.properties.popBounceStiffness ?? 300}</span>
                    </div>
                    <input 
                      type="range" min="50" max="800" step="10"
                      value={activeNode.properties.popBounceStiffness ?? 300} 
                      onChange={(e) => changeProperty('properties.popBounceStiffness', parseInt(e.target.value))}
                      className="w-full accent-purple-500 h-1 bg-black rounded"
                    />
                  </div>
  
                  {/* Pop Bounce Damping */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-[9px] text-gray-400 font-bold uppercase">
                      <span>Spring Smoothness / Damping (نرمی فنر)</span>
                      <span>{activeNode.properties.popBounceDamping ?? 12}</span>
                    </div>
                    <input 
                      type="range" min="2" max="30" step="1"
                      value={activeNode.properties.popBounceDamping ?? 12} 
                      onChange={(e) => changeProperty('properties.popBounceDamping', parseInt(e.target.value))}
                      className="w-full accent-purple-500 h-1 bg-black rounded"
                    />
                  </div>
                </div>
              )}
  
              {currentTheme === 'bounce' && (
                <div className="space-y-4 animate-fadeIn">
                  <p className="text-[8px] text-gray-400 leading-relaxed text-right" dir="rtl">
                    تنظیمات پرش کلمات؛ ایجاد حرکت عمودی بازیگوشانه و ارتعاشی روی واژه‌ی ادا شده:
                  </p>
  
                  {/* Bounce Height */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-[9px] text-gray-400 font-bold uppercase">
                      <span>Jump Height (ارتفاع پرش کلمه)</span>
                      <span>{Math.abs(activeNode.properties.bounceHeight ?? -15)}px</span>
                    </div>
                    <input 
                      type="range" min="-40" max="0" 
                      value={activeNode.properties.bounceHeight ?? -15} 
                      onChange={(e) => changeProperty('properties.bounceHeight', parseInt(e.target.value))}
                      className="w-full accent-purple-500 h-1 bg-black rounded"
                    />
                  </div>
  
                  {/* Bounce Rotate Tilt */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-[9px] text-gray-400 font-bold uppercase">
                      <span>Bounce Tilt (چرخش در زمان پرش)</span>
                      <span>{activeNode.properties.bounceRotate ?? 5}°</span>
                    </div>
                    <input 
                      type="range" min="-25" max="25" step="1"
                      value={activeNode.properties.bounceRotate ?? 5} 
                      onChange={(e) => changeProperty('properties.bounceRotate', parseInt(e.target.value))}
                      className="w-full accent-purple-500 h-1 bg-black rounded"
                    />
                  </div>
  
                  {/* Bounce Scale */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-[9px] text-gray-400 font-bold uppercase">
                      <span>Active Stretch Scale (کشش واژه فعال)</span>
                      <span>{activeNode.properties.bounceScale ?? 1.1}x</span>
                    </div>
                    <input 
                      type="range" min="0.8" max="1.4" step="0.05"
                      value={activeNode.properties.bounceScale ?? 1.1} 
                      onChange={(e) => changeProperty('properties.bounceScale', parseFloat(e.target.value))}
                      className="w-full accent-purple-500 h-1 bg-black rounded"
                    />
                  </div>
  
                  {/* Bounce Stiffness */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-[9px] text-gray-400 font-bold uppercase">
                      <span>Spring Stiffness (سفتی فنری پرش)</span>
                      <span>{activeNode.properties.bounceStiffness ?? 300}</span>
                    </div>
                    <input 
                      type="range" min="50" max="800" step="10"
                      value={activeNode.properties.bounceStiffness ?? 300} 
                      onChange={(e) => changeProperty('properties.bounceStiffness', parseInt(e.target.value))}
                      className="w-full accent-purple-500 h-1 bg-black rounded"
                    />
                  </div>
  
                  {/* Bounce Damping */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-[9px] text-gray-400 font-bold uppercase">
                      <span>Spring Smoothness (نرمی و کنترل لرزش)</span>
                      <span>{activeNode.properties.bounceDamping ?? 12}</span>
                    </div>
                    <input 
                      type="range" min="2" max="30" step="1"
                      value={activeNode.properties.bounceDamping ?? 12} 
                      onChange={(e) => changeProperty('properties.bounceDamping', parseInt(e.target.value))}
                      className="w-full accent-purple-500 h-1 bg-black rounded"
                    />
                  </div>
                </div>
              )}
  
              {currentTheme === 'minimal' && (
                <div className="space-y-4 animate-fadeIn">
                  <p className="text-[8px] text-gray-400 leading-relaxed text-right" dir="rtl">
                    تنظیمات قالب مینیمال؛ متنی تمیز با امکان نمایش یک نقطه راهنما در زیر کلمه با تغییر فوق‌العاده ظریف فواصل حروف:
                  </p>
  
                  {/* Minimal dot display toggle */}
                  <div className="flex justify-between items-center bg-black/20 p-2 rounded-lg border border-white/5">
                    <div className="flex flex-col">
                      <span className="text-[9px] font-bold uppercase text-gray-400">Under-Dot Indicator</span>
                      <span className="text-[7px] text-gray-500">نمایش نقطه ظریف در زیر واژه فعال</span>
                    </div>
                    <button 
                      onClick={() => changeProperty('properties.minimalShowDot', !(activeNode.properties.minimalShowDot ?? true))}
                      className={`w-8 h-4 rounded-full p-0.5 transition-colors cursor-pointer ${
                        (activeNode.properties.minimalShowDot ?? true) ? 'bg-purple-500 flex justify-end' : 'bg-gray-800 flex justify-start'
                      }`}
                    >
                      <span className="w-3 h-3 rounded-full bg-white shadow-sm" />
                    </button>
                  </div>
  
                  {/* Minimal Dot Color */}
                  {(activeNode.properties.minimalShowDot ?? true) && (
                    <div className="flex justify-between items-center py-1 animate-fadeIn">
                      <div className="flex flex-col">
                        <span className="text-[9px] text-gray-400 font-bold uppercase">Dot Indicator Color</span>
                        <span className="text-[7px] text-gray-500">رنگ نقطه فعال</span>
                      </div>
                      <input 
                        type="color" 
                        value={activeNode.properties.minimalDotColor || '#ffffff'} 
                        onChange={(e) => changeProperty('properties.minimalDotColor', e.target.value)}
                        className="w-8 h-8 rounded border border-white/10 cursor-pointer bg-transparent animate-fadeIn"
                      />
                    </div>
                  )}
  
                  {/* Letter Spacing Inactive & Active */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-[9px] text-gray-400 font-bold uppercase">
                      <span>Inactive Letter Spacing (فاصله حروف غیرفعال)</span>
                      <span>{activeNode.properties.minimalLetterSpacing ?? 0}px</span>
                    </div>
                    <input 
                      type="range" min="-2" max="10" 
                      value={activeNode.properties.minimalLetterSpacing ?? 0} 
                      onChange={(e) => changeProperty('properties.minimalLetterSpacing', parseInt(e.target.value))}
                      className="w-full accent-purple-500 h-1 bg-black rounded"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-[9px] text-gray-400 font-bold uppercase">
                      <span>Active Letter Spacing (فاصله حروف کلمه فعال)</span>
                      <span>{activeNode.properties.minimalActiveLetterSpacing ?? 2}px</span>
                    </div>
                    <input 
                      type="range" min="-2" max="12" 
                      value={activeNode.properties.minimalActiveLetterSpacing ?? 2} 
                      onChange={(e) => changeProperty('properties.minimalActiveLetterSpacing', parseInt(e.target.value))}
                      className="w-full accent-purple-500 h-1 bg-black rounded"
                    />
                  </div>
  
                  {/* Minimal scale boost */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-[9px] text-gray-400 font-bold uppercase">
                      <span>Active Scale (بزرگ‌نمایی جزئی)</span>
                      <span>{activeNode.properties.minimalScale ?? 1.05}x</span>
                    </div>
                    <input 
                      type="range" min="0.9" max="1.3" step="0.05"
                      value={activeNode.properties.minimalScale ?? 1.05} 
                      onChange={(e) => changeProperty('properties.minimalScale', parseFloat(e.target.value))}
                      className="w-full accent-purple-500 h-1 bg-black rounded"
                    />
                  </div>
  
                  {/* Minimal opacity inactive */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-[9px] text-gray-400 font-bold uppercase">
                      <span>Inactive Opacity (شفافیت کلمات جانبی)</span>
                      <span>{Math.round((activeNode.properties.minimalOpacity ?? 0.5) * 100)}%</span>
                    </div>
                    <input 
                      type="range" min="0.1" max="1.0" step="0.05"
                      value={activeNode.properties.minimalOpacity ?? 0.5} 
                      onChange={(e) => changeProperty('properties.minimalOpacity', parseFloat(e.target.value))}
                      className="w-full accent-purple-500 h-1 bg-black rounded"
                    />
                  </div>
                </div>
              )}
  
              {currentTheme === 'typewriter' && (
                <div className="space-y-4 animate-fadeIn">
                  <p className="text-[8px] text-gray-400 leading-relaxed text-right" dir="rtl">
                    تنظیمات ماشین تحریر؛ نمایش افکت مکان‌نما (Cursor) چشمک‌زن موازی با واژه‌ی جاری:
                  </p>
  
                  {/* Cursor Character symbol */}
                  <div className="space-y-1.5">
                    <span className="text-[9px] uppercase font-bold text-gray-500">Cursor Symbol (طرح نشانگر)</span>
                    <select
                      value={activeNode.properties.typewriterCursorType ?? '|'}
                      onChange={(e) => changeProperty('properties.typewriterCursorType', e.target.value)}
                      className="w-full bg-black/40 border border-white/5 rounded-lg px-2.5 py-1.5 text-[10px] text-white focus:outline-none focus:ring-1 focus:ring-purple-500/50 cursor-pointer"
                    >
                      <option value="|">Vertical Line ( | )</option>
                      <option value="_">Underbar ( _ )</option>
                      <option value="■">Square Block ( ■ )</option>
                      <option value="▋">Thick Cursor ( ▋ )</option>
                      <option value="none">None (پنهان)</option>
                    </select>
                  </div>
  
                  {/* Cursor Color */}
                  <div className="flex justify-between items-center py-1">
                    <div className="flex flex-col">
                      <span className="text-[9px] text-gray-400 font-bold uppercase">Cursor Color</span>
                      <span className="text-[7px] text-gray-500">رنگ نشانگر مکان‌نما</span>
                    </div>
                    <input 
                      type="color" 
                      value={activeNode.properties.typewriterCursorColor || '#ffffff'} 
                      onChange={(e) => changeProperty('properties.typewriterCursorColor', e.target.value)}
                      className="w-8 h-8 rounded border border-white/10 cursor-pointer bg-transparent animate-fadeIn"
                    />
                  </div>
  
                  {/* Cursor Speed / Blink interval */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-[9px] text-gray-400 font-bold uppercase">
                      <span>Cursor Blink Speed (سرعت چشمک‌زدن)</span>
                      <span>{activeNode.properties.typewriterCursorSpeed ?? 0.8}s</span>
                    </div>
                    <input 
                      type="range" min="0.2" max="2.0" step="0.1"
                      value={activeNode.properties.typewriterCursorSpeed ?? 0.8} 
                      onChange={(e) => changeProperty('properties.typewriterCursorSpeed', parseFloat(e.target.value))}
                      className="w-full accent-purple-500 h-1 bg-black rounded"
                    />
                  </div>
  
                  {/* Cursor font-size */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-[9px] text-gray-400 font-bold uppercase">
                      <span>Cursor Size (ارتفاع و ابعاد نشانگر)</span>
                      <span>{activeNode.properties.typewriterCursorSize ?? 22}px</span>
                    </div>
                    <input 
                      type="range" min="10" max="60" 
                      value={activeNode.properties.typewriterCursorSize ?? 22} 
                      onChange={(e) => changeProperty('properties.typewriterCursorSize', parseInt(e.target.value))}
                      className="w-full accent-purple-500 h-1 bg-black rounded"
                    />
                  </div>
                </div>
              )}
  
              {currentTheme === 'clean' && (
                <div className="space-y-4 animate-fadeIn">
                  <p className="text-[8px] text-gray-400 leading-relaxed text-right" dir="rtl">
                    تنظیمات قالب پاکیزه؛ طرحی مدرن با کنتراست محو کلمات کناری و قابلیت نمایش نوار عمودی رنگی در کناره جعبه:
                  </p>
  
                  {/* Clean theme Inactive word dimming */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-[9px] text-gray-400 font-bold uppercase">
                      <span>Inactive Opacity (کنتراست کلمات جانبی)</span>
                      <span>{Math.round((activeNode.properties.cleanContrast ?? 0.8) * 100)}%</span>
                    </div>
                    <input 
                      type="range" min="0.0" max="1.0" step="0.05"
                      value={activeNode.properties.cleanContrast ?? 0.8} 
                      onChange={(e) => changeProperty('properties.cleanContrast', parseFloat(e.target.value))}
                      className="w-full accent-purple-500 h-1 bg-black rounded"
                    />
                  </div>
  
                  {/* Left accent indicator bar toggle */}
                  <div className="flex justify-between items-center bg-black/20 p-2 rounded-lg border border-white/5">
                    <div className="flex flex-col">
                      <span className="text-[9px] font-bold uppercase text-gray-400">Left Accent Bar</span>
                      <span className="text-[7px] text-gray-500">نوار رنگی عمودی در کنار جعبه متن</span>
                    </div>
                    <button 
                      onClick={() => changeProperty('properties.cleanIndicatorBar', !(activeNode.properties.cleanIndicatorBar ?? false))}
                      className={`w-8 h-4 rounded-full p-0.5 transition-colors cursor-pointer ${
                        (activeNode.properties.cleanIndicatorBar ?? false) ? 'bg-purple-500 flex justify-end' : 'bg-gray-800 flex justify-start'
                      }`}
                    >
                      <span className="w-3 h-3 rounded-full bg-white shadow-sm" />
                    </button>
                  </div>
  
                  {/* Indicator bar color */}
                  {(activeNode.properties.cleanIndicatorBar ?? false) && (
                    <div className="flex justify-between items-center py-1 animate-fadeIn">
                      <div className="flex flex-col">
                        <span className="text-[9px] text-gray-400 font-bold uppercase">Bar Accent Color</span>
                        <span className="text-[7px] text-gray-500">رنگ نوار تزیینی عمودی</span>
                      </div>
                      <input 
                        type="color" 
                        value={activeNode.properties.cleanIndicatorColor || '#ffffff'} 
                        onChange={(e) => changeProperty('properties.cleanIndicatorColor', e.target.value)}
                        className="w-8 h-8 rounded border border-white/10 cursor-pointer bg-transparent animate-fadeIn"
                      />
                    </div>
                  )}
                </div>
              )}
  
              {currentTheme === 'shadow-pop' && (
                <div className="space-y-4 animate-fadeIn">
                  <p className="text-[8px] text-gray-400 leading-relaxed text-right" dir="rtl">
                    تنظیمات سایه متحرک؛ ایجاد سایه سه‌بعدی ضخیم پشت کلمات فعال با احساس عمق بی‌نظیر:
                  </p>
  
                  <div className="flex justify-between items-center py-1">
                    <div className="flex flex-col">
                      <span className="text-[9px] text-gray-400 font-bold uppercase">Shadow Color</span>
                      <span className="text-[7px] text-gray-500">رنگ سایه متن</span>
                    </div>
                    <input 
                      type="color" 
                      value={activeNode.properties.shadowPopColor || '#000000'} 
                      onChange={(e) => changeProperty('properties.shadowPopColor', e.target.value)}
                      className="w-8 h-8 rounded border border-white/10 cursor-pointer bg-transparent"
                    />
                  </div>
  
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-[9px] text-gray-400 font-bold uppercase">
                      <span>Shadow Blur (میزان تاری سایه)</span>
                      <span>{activeNode.properties.shadowPopBlur ?? 0}px</span>
                    </div>
                    <input 
                      type="range" min="0" max="15" 
                      value={activeNode.properties.shadowPopBlur ?? 0} 
                      onChange={(e) => changeProperty('properties.shadowPopBlur', parseInt(e.target.value))}
                      className="w-full accent-purple-500 h-1 bg-black rounded"
                    />
                  </div>
  
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-[9px] text-gray-400 font-bold uppercase">
                      <span>Normal Offset (جابجایی عادی)</span>
                      <span>{activeNode.properties.shadowPopOffset ?? 4}px</span>
                    </div>
                    <input 
                      type="range" min="0" max="15" 
                      value={activeNode.properties.shadowPopOffset ?? 4} 
                      onChange={(e) => changeProperty('properties.shadowPopOffset', parseInt(e.target.value))}
                      className="w-full accent-purple-500 h-1 bg-black rounded"
                    />
                  </div>
  
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-[9px] text-gray-400 font-bold uppercase">
                      <span>Active Offset (جابجایی هنگام تکلم)</span>
                      <span>{activeNode.properties.shadowPopActiveOffset ?? 8}px</span>
                    </div>
                    <input 
                      type="range" min="0" max="25" 
                      value={activeNode.properties.shadowPopActiveOffset ?? 8} 
                      onChange={(e) => changeProperty('properties.shadowPopActiveOffset', parseInt(e.target.value))}
                      className="w-full accent-purple-500 h-1 bg-black rounded"
                    />
                  </div>
                </div>
              )}
  
              {currentTheme === 'word-stack' && (
                <div className="space-y-4 animate-fadeIn">
                  <p className="text-[8px] text-gray-400 leading-relaxed text-right" dir="rtl">
                    تنظیمات پشته کلمات؛ نمایش کلمه فعلی در مرکز و انباشته شدن عمودی کلمات بعدی و قبلی به سبک ویدیوهای مدرن:
                  </p>
  
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-[9px] text-gray-400 font-bold uppercase">
                      <span>Stack Spacing (فاصله بین کلمات)</span>
                      <span>{activeNode.properties.wordStackSpacing ?? 16}px</span>
                    </div>
                    <input 
                      type="range" min="10" max="40" 
                      value={activeNode.properties.wordStackSpacing ?? 16} 
                      onChange={(e) => changeProperty('properties.wordStackSpacing', parseInt(e.target.value))}
                      className="w-full accent-purple-500 h-1 bg-black rounded"
                    />
                  </div>
  
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-[9px] text-gray-400 font-bold uppercase">
                      <span>Max Items (تعداد کلمات نمایشی همزمان)</span>
                      <span>{activeNode.properties.wordStackMaxItems ?? 3}</span>
                    </div>
                    <input 
                      type="range" min="1" max="5" 
                      value={activeNode.properties.wordStackMaxItems ?? 3} 
                      onChange={(e) => changeProperty('properties.wordStackMaxItems', parseInt(e.target.value))}
                      className="w-full accent-purple-500 h-1 bg-black rounded"
                    />
                  </div>
                </div>
              )}
  
              {currentTheme === 'split-reveal' && (
                <div className="space-y-4 animate-fadeIn">
                  <p className="text-[8px] text-gray-400 leading-relaxed text-right" dir="rtl">
                    تنظیمات قالب شکافتن؛ افکت گشوده شدن و تغییر فواصل حروف کلمه فعال به هنگام تکلم:
                  </p>
  
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-[9px] text-gray-400 font-bold uppercase">
                      <span>Reveal Gap (میزان باز شدن حروف)</span>
                      <span>{activeNode.properties.splitRevealGap ?? 8}px</span>
                    </div>
                    <input 
                      type="range" min="2" max="24" 
                      value={activeNode.properties.splitRevealGap ?? 8} 
                      onChange={(e) => changeProperty('properties.splitRevealGap', parseInt(e.target.value))}
                      className="w-full accent-purple-500 h-1 bg-black rounded"
                    />
                  </div>
  
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-[9px] text-gray-400 font-bold uppercase">
                      <span>Transition Duration (سرعت انیمیشن باز شدن)</span>
                      <span>{activeNode.properties.splitRevealDuration ?? 0.3}s</span>
                    </div>
                    <input 
                      type="range" min="0.1" max="1.0" step="0.05"
                      value={activeNode.properties.splitRevealDuration ?? 0.3} 
                      onChange={(e) => changeProperty('properties.splitRevealDuration', parseFloat(e.target.value))}
                      className="w-full accent-purple-500 h-1 bg-black rounded"
                    />
                  </div>
                </div>
              )}
  
              {currentTheme === 'bold-impact' && (
                <div className="space-y-4 animate-fadeIn">
                  <p className="text-[8px] text-gray-400 leading-relaxed text-right" dir="rtl">
                    تنظیمات قالب ضخیم مِیم‌گونه؛ فونت بسیار سنگین با حاشیه مشکی ضخیم و ورود با بزرگنمایی سریع به سبک تیک‌تاک:
                  </p>
  
                  <div className="flex justify-between items-center bg-black/20 p-2 rounded-lg border border-white/5">
                    <div className="flex flex-col">
                      <span className="text-[9px] font-bold uppercase text-gray-400">Force Uppercase</span>
                      <span className="text-[7px] text-gray-500">بزرگ کردن تمام حروف انگلیسی</span>
                    </div>
                    <button 
                      onClick={() => changeProperty('properties.boldImpactUppercase', !(activeNode.properties.boldImpactUppercase ?? true))}
                      className={`w-8 h-4 rounded-full p-0.5 transition-colors cursor-pointer ${
                        (activeNode.properties.boldImpactUppercase ?? true) ? 'bg-purple-500 flex justify-end' : 'bg-gray-800 flex justify-start'
                      }`}
                    >
                      <span className="w-3 h-3 rounded-full bg-white shadow-sm" />
                    </button>
                  </div>
  
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-[9px] text-gray-400 font-bold uppercase">
                      <span>Letter Spacing (فاصله بین حروف)</span>
                      <span>{activeNode.properties.boldImpactLetterSpacing ?? 1}px</span>
                    </div>
                    <input 
                      type="range" min="-3" max="8" 
                      value={activeNode.properties.boldImpactLetterSpacing ?? 1} 
                      onChange={(e) => changeProperty('properties.boldImpactLetterSpacing', parseInt(e.target.value))}
                      className="w-full accent-purple-500 h-1 bg-black rounded"
                    />
                  </div>
  
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-[9px] text-gray-400 font-bold uppercase">
                      <span>Stroke Width (ضخامت خط دور)</span>
                      <span>{activeNode.properties.boldImpactBorderWidth ?? 3}px</span>
                    </div>
                    <input 
                      type="range" min="1" max="6" 
                      value={activeNode.properties.boldImpactBorderWidth ?? 3} 
                      onChange={(e) => changeProperty('properties.boldImpactBorderWidth', parseInt(e.target.value))}
                      className="w-full accent-purple-500 h-1 bg-black rounded"
                    />
                  </div>
  
                  <div className="flex justify-between items-center py-1">
                    <div className="flex flex-col">
                      <span className="text-[9px] text-gray-400 font-bold uppercase">Stroke Outline Color</span>
                      <span className="text-[7px] text-gray-500">رنگ حاشیه حروف</span>
                    </div>
                    <input 
                      type="color" 
                      value={activeNode.properties.boldImpactBorderColor || '#000000'} 
                      onChange={(e) => changeProperty('properties.boldImpactBorderColor', e.target.value)}
                      className="w-8 h-8 rounded border border-white/10 cursor-pointer bg-transparent"
                    />
                  </div>
                </div>
              )}
  
              {currentTheme === 'gradient-flow' && (
                <div className="space-y-4 animate-fadeIn">
                  <p className="text-[8px] text-gray-400 leading-relaxed text-right" dir="rtl">
                    تنظیمات گرادیان متحرک؛ جاری شدن رنگ‌های زیبای گرادیان در طول حروف کلمه فعال به صورت روان:
                  </p>
  
                  <div className="grid grid-cols-2 gap-2">
                    <div className="flex flex-col space-y-1">
                      <span className="text-[8px] text-gray-400 uppercase font-bold">Start Color</span>
                      <input 
                        type="color" 
                        value={activeNode.properties.gradientFlowStartColor || '#ec4899'} 
                        onChange={(e) => changeProperty('properties.gradientFlowStartColor', e.target.value)}
                        className="w-full h-8 rounded border border-white/10 cursor-pointer bg-transparent"
                      />
                    </div>
                    <div className="flex flex-col space-y-1">
                      <span className="text-[8px] text-gray-400 uppercase font-bold">End Color</span>
                      <input 
                        type="color" 
                        value={activeNode.properties.gradientFlowEndColor || '#8b5cf6'} 
                        onChange={(e) => changeProperty('properties.gradientFlowEndColor', e.target.value)}
                        className="w-full h-8 rounded border border-white/10 cursor-pointer bg-transparent"
                      />
                    </div>
                  </div>
  
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-[9px] text-gray-400 font-bold uppercase">
                      <span>Flow Speed (سرعت حرکت گرادیان)</span>
                      <span>{activeNode.properties.gradientFlowSpeed ?? 2}s</span>
                    </div>
                    <input 
                      type="range" min="0.5" max="5.0" step="0.1"
                      value={activeNode.properties.gradientFlowSpeed ?? 2} 
                      onChange={(e) => changeProperty('properties.gradientFlowSpeed', parseFloat(e.target.value))}
                      className="w-full accent-purple-500 h-1 bg-black rounded"
                    />
                  </div>
  
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-[9px] text-gray-400 font-bold uppercase">
                      <span>Angle (زاویه گرادیان)</span>
                      <span>{activeNode.properties.gradientFlowAngle ?? 45}°</span>
                    </div>
                    <input 
                      type="range" min="0" max="360" step="15"
                      value={activeNode.properties.gradientFlowAngle ?? 45} 
                      onChange={(e) => changeProperty('properties.gradientFlowAngle', parseInt(e.target.value))}
                      className="w-full accent-purple-500 h-1 bg-black rounded"
                    />
                  </div>
                </div>
              )}
  
              {currentTheme === 'chat-bubble' && (
                <div className="space-y-4 animate-fadeIn">
                  <p className="text-[8px] text-gray-400 leading-relaxed text-right" dir="rtl">
                    تنظیمات حباب گفتگو؛ قرارگیری کلمه فعال داخل یک حباب چت دوست‌داشتنی با دم حبابی اختصاصی:
                  </p>
  
                  <div className="flex justify-between items-center py-1">
                    <div className="flex flex-col">
                      <span className="text-[9px] text-gray-400 font-bold uppercase">Bubble Bg Color</span>
                      <span className="text-[7px] text-gray-500">رنگ پس‌زمینه حباب چت</span>
                    </div>
                    <input 
                      type="color" 
                      value={activeNode.properties.chatBubbleBgColor || '#2563eb'} 
                      onChange={(e) => changeProperty('properties.chatBubbleBgColor', e.target.value)}
                      className="w-8 h-8 rounded border border-white/10 cursor-pointer bg-transparent"
                    />
                  </div>
  
                  <div className="flex justify-between items-center py-1">
                    <div className="flex flex-col">
                      <span className="text-[9px] text-gray-400 font-bold uppercase">Active Text Color</span>
                      <span className="text-[7px] text-gray-500">رنگ متن داخل حباب</span>
                    </div>
                    <input 
                      type="color" 
                      value={activeNode.properties.chatBubbleTextColor || '#ffffff'} 
                      onChange={(e) => changeProperty('properties.chatBubbleTextColor', e.target.value)}
                      className="w-8 h-8 rounded border border-white/10 cursor-pointer bg-transparent"
                    />
                  </div>
  
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-[9px] text-gray-400 font-bold uppercase">
                      <span>Bubble Radius (گردی گوشه‌ها)</span>
                      <span>{activeNode.properties.chatBubbleRadius ?? 12}px</span>
                    </div>
                    <input 
                      type="range" min="4" max="24" 
                      value={activeNode.properties.chatBubbleRadius ?? 12} 
                      onChange={(e) => changeProperty('properties.chatBubbleRadius', parseInt(e.target.value))}
                      className="w-full accent-purple-500 h-1 bg-black rounded"
                    />
                  </div>
  
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <span className="text-[8px] text-gray-400 uppercase font-bold">Padding X</span>
                      <input 
                        type="number" min="4" max="24"
                        value={activeNode.properties.chatBubblePaddingX ?? 12} 
                        onChange={(e) => changeProperty('properties.chatBubblePaddingX', parseInt(e.target.value) || 12)}
                        className="w-full bg-[#11121a] border border-white/5 rounded px-2 py-1 text-xs text-white"
                      />
                    </div>
                    <div className="space-y-1">
                      <span className="text-[8px] text-gray-400 uppercase font-bold">Padding Y</span>
                      <input 
                        type="number" min="2" max="16"
                        value={activeNode.properties.chatBubblePaddingY ?? 6} 
                        onChange={(e) => changeProperty('properties.chatBubblePaddingY', parseInt(e.target.value) || 6)}
                        className="w-full bg-[#11121a] border border-white/5 rounded px-2 py-1 text-xs text-white"
                      />
                    </div>
                  </div>
  
                  <div className="flex justify-between items-center bg-black/20 p-2 rounded-lg border border-white/5">
                    <div className="flex flex-col">
                      <span className="text-[9px] font-bold uppercase text-gray-400">Show Tail (دم حبابی)</span>
                      <span className="text-[7px] text-gray-500">افکت فلش کوچک انتهای پیام</span>
                    </div>
                    <button 
                      onClick={() => changeProperty('properties.chatBubbleTail', !(activeNode.properties.chatBubbleTail ?? true))}
                      className={`w-8 h-4 rounded-full p-0.5 transition-colors cursor-pointer ${
                        (activeNode.properties.chatBubbleTail ?? true) ? 'bg-purple-500 flex justify-end' : 'bg-gray-800 flex justify-start'
                      }`}
                    >
                      <span className="w-3 h-3 rounded-full bg-white shadow-sm" />
                    </button>
                  </div>
                </div>
              )}
  
              {currentTheme === 'handwritten' && (
                <div className="space-y-4 animate-fadeIn">
                  <p className="text-[8px] text-gray-400 leading-relaxed text-right" dir="rtl">
                    تنظیمات دست‌نویس صمیمی؛ تغییر شکل حروف به قلم‌های روان‌نویس با زوایای کج فانتزی به همراه تنوع رنگ عالی:
                  </p>
  
                  <div className="space-y-1.5">
                    <label className="text-[9px] text-gray-400 font-bold uppercase block">Handwritten Font (فونت قلم)</label>
                    <select
                      value={activeNode.properties.handwrittenFont || 'Caveat'}
                      onChange={(e) => changeProperty('properties.handwrittenFont', e.target.value)}
                      className="w-full bg-[#11121a] border border-white/5 rounded-lg px-3 py-2 text-xs text-white focus:outline-none"
                    >
                      <option value="Caveat">Caveat (قلم فانتزی سبک)</option>
                      <option value="Pacifico">Pacifico (قلم ضخیم پیوسته)</option>
                      <option value="Playpen Sans">Playpen Sans (قلم کودکانه)</option>
                      <option value="cursive">Cursive (قلم پیش‌فرض سیستم)</option>
                    </select>
                  </div>
  
                  <div className="flex justify-between items-center py-1">
                    <div className="flex flex-col">
                      <span className="text-[9px] text-gray-400 font-bold uppercase">Active Pen Color</span>
                      <span className="text-[7px] text-gray-500">رنگ جوهر کلمه فعال</span>
                    </div>
                    <input 
                      type="color" 
                      value={activeNode.properties.handwrittenColor || '#fbbf24'} 
                      onChange={(e) => changeProperty('properties.handwrittenColor', e.target.value)}
                      className="w-8 h-8 rounded border border-white/10 cursor-pointer bg-transparent"
                    />
                  </div>
                </div>
              )}
  
              {currentTheme === 'flip-rotate' && (
                <div className="space-y-4 animate-fadeIn">
                  <p className="text-[8px] text-gray-400 leading-relaxed text-right" dir="rtl">
                    تنظیمات چرخش سه‌بعدی کارت؛ کارت دیجیتال چرخان سه‌بعدی به هنگام تغییر گفتار کلمات:
                  </p>
  
                  <div className="space-y-1.5">
                    <label className="text-[9px] text-gray-400 font-bold uppercase block">Flip Axis (محور چرخش سه‌بعدی)</label>
                    <select
                      value={activeNode.properties.flipRotateAxis || 'y'}
                      onChange={(e) => changeProperty('properties.flipRotateAxis', e.target.value)}
                      className="w-full bg-[#11121a] border border-white/5 rounded-lg px-3 py-2 text-xs text-white focus:outline-none"
                    >
                      <option value="y">Y Axis (چرخش چپ و راست)</option>
                      <option value="x">X Axis (چرخش بالا و پایین)</option>
                      <option value="z">Z Axis (چرخش زاویه‌دار صفحه)</option>
                    </select>
                  </div>
  
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-[9px] text-gray-400 font-bold uppercase">
                      <span>Duration (مدت زمان چرخش)</span>
                      <span>{activeNode.properties.flipRotateDuration ?? 0.4}s</span>
                    </div>
                    <input 
                      type="range" min="0.1" max="1.5" step="0.05"
                      value={activeNode.properties.flipRotateDuration ?? 0.4} 
                      onChange={(e) => changeProperty('properties.flipRotateDuration', parseFloat(e.target.value))}
                      className="w-full accent-purple-500 h-1 bg-black rounded"
                    />
                  </div>
                </div>
              )}
  
              {currentTheme === 'confetti-burst' && (
                <div className="space-y-4 animate-fadeIn">
                  <p className="text-[8px] text-gray-400 leading-relaxed text-right" dir="rtl">
                    تنظیمات انفجار کاغذ رنگی؛ پرتاب جذاب ذرات شاد و درخشان اطراف کلمه در حال گفتار:
                  </p>
  
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-[9px] text-gray-400 font-bold uppercase">
                      <span>Confetti Count (تعداد ذرات)</span>
                      <span>{activeNode.properties.confettiBurstCount ?? 10}</span>
                    </div>
                    <input 
                      type="range" min="4" max="25" 
                      value={activeNode.properties.confettiBurstCount ?? 10} 
                      onChange={(e) => changeProperty('properties.confettiBurstCount', parseInt(e.target.value))}
                      className="w-full accent-purple-500 h-1 bg-black rounded"
                    />
                  </div>
  
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-[9px] text-gray-400 font-bold uppercase">
                      <span>Dispersion Radius (شعاع پرتاب)</span>
                      <span>{activeNode.properties.confettiBurstRadius ?? 50}px</span>
                    </div>
                    <input 
                      type="range" min="20" max="120" 
                      value={activeNode.properties.confettiBurstRadius ?? 50} 
                      onChange={(e) => changeProperty('properties.confettiBurstRadius', parseInt(e.target.value))}
                      className="w-full accent-purple-500 h-1 bg-black rounded"
                    />
                  </div>
  
                  <div className="space-y-1.5">
                    <span className="text-[9px] text-gray-400 font-bold uppercase block">Colors List (لیست رنگ‌ها)</span>
                    <input 
                      type="text" 
                      value={activeNode.properties.confettiBurstColorList || '#ff0000,#00ff00,#0000ff,#ffff00,#ff00ff'} 
                      onChange={(e) => changeProperty('properties.confettiBurstColorList', e.target.value)}
                      className="w-full bg-[#11121a] border border-white/5 rounded-lg px-3 py-1.5 text-xs text-white"
                    />
                  </div>
                </div>
              )}
  
              {currentTheme === 'outline-stroke' && (
                <div className="space-y-4 animate-fadeIn">
                  <p className="text-[8px] text-gray-400 leading-relaxed text-right" dir="rtl">
                    تنظیمات حاشیه توخالی ورزشی؛ استایلی پرانرژی با پرکردگی صفر درصد کلمات غیرفعال و روشن شدن کلمه فعال با رنگ کامل:
                  </p>
  
                  <div className="flex justify-between items-center py-1">
                    <div className="flex flex-col">
                      <span className="text-[9px] text-gray-400 font-bold uppercase">Outline Color</span>
                      <span className="text-[7px] text-gray-500">رنگ خط دور حاشیه</span>
                    </div>
                    <input 
                      type="color" 
                      value={activeNode.properties.outlineStrokeColor || '#ffffff'} 
                      onChange={(e) => changeProperty('properties.outlineStrokeColor', e.target.value)}
                      className="w-8 h-8 rounded border border-white/10 cursor-pointer bg-transparent"
                    />
                  </div>
  
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-[9px] text-gray-400 font-bold uppercase">
                      <span>Stroke Width (ضخامت حاشیه)</span>
                      <span>{activeNode.properties.outlineStrokeWidth ?? 2}px</span>
                    </div>
                    <input 
                      type="range" min="1" max="5" 
                      value={activeNode.properties.outlineStrokeWidth ?? 2} 
                      onChange={(e) => changeProperty('properties.outlineStrokeWidth', parseInt(e.target.value))}
                      className="w-full accent-purple-500 h-1 bg-black rounded"
                    />
                  </div>
  
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-[9px] text-gray-400 font-bold uppercase">
                      <span>Fill Opacity (کنتراست پرشدگی داخل حروف غیرفعال)</span>
                      <span>{Math.round((activeNode.properties.outlineStrokeFillOpacity ?? 0.1) * 100)}%</span>
                    </div>
                    <input 
                      type="range" min="0.0" max="0.5" step="0.05"
                      value={activeNode.properties.outlineStrokeFillOpacity ?? 0.1} 
                      onChange={(e) => changeProperty('properties.outlineStrokeFillOpacity', parseFloat(e.target.value))}
                      className="w-full accent-purple-500 h-1 bg-black rounded"
                    />
                  </div>
                </div>
              )}
  
              {currentTheme !== 'moving-box' && 
       currentTheme !== 'karaoke' && 
       currentTheme !== 'underline' && 
       currentTheme !== 'glow' && 
       currentTheme !== 'highlight' && 
       currentTheme !== 'pop' && 
       currentTheme !== 'bounce' && 
       currentTheme !== 'minimal' && 
       currentTheme !== 'typewriter' && 
       currentTheme !== 'clean' && 
       currentTheme !== 'shadow-pop' && 
       currentTheme !== 'word-stack' && 
       currentTheme !== 'split-reveal' && 
       currentTheme !== 'bold-impact' && 
       currentTheme !== 'gradient-flow' && 
       currentTheme !== 'chat-bubble' && 
       currentTheme !== 'handwritten' && 
       currentTheme !== 'flip-rotate' && 
       currentTheme !== 'confetti-burst' && 
       currentTheme !== 'outline-stroke' && (
        <p className="text-[9px] text-gray-500 italic text-center py-2" dir="rtl">
          این قالب ویژگی‌های منحصر به فرد خاصی ندارد و با پارامترهای پایه‌ی استایل هماهنگ است.
        </p>
      )}
            </div>
          </details>
        );
      })()}
  
      {/* SECTION 0: CAPTION DISPLAY MODE */}
      <div className="bg-[#0e0f16] border border-cyan-500/10 rounded-xl p-3 space-y-3 shadow-lg" id="caption_display_mode_card">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="w-3.5 h-3.5 text-cyan-400" />
            <span className="text-[10px] uppercase font-black text-cyan-400 tracking-wider">Caption Display Mode</span>
          </div>
          <span className="text-[8px] font-bold text-cyan-500/40 uppercase tracking-wider">حالت نمایش</span>
        </div>
        <p className="text-[8px] text-gray-500 uppercase tracking-wide font-bold">Choose how text splits on screen / تقسیم‌بندی جملات</p>
        
        <div className="grid grid-cols-2 gap-2 p-1 bg-black/40 rounded-lg border border-white/5">
          <button
            onClick={() => {
              changeProperty('properties.captionDisplayMode', 'phrase');
              showToast('💬 Show All Words (Highlight word by word)');
            }}
            className={`py-2 px-1 text-[9px] font-black uppercase rounded-md transition-all flex flex-col items-center justify-center gap-1 cursor-pointer ${
              (activeNode.properties.captionDisplayMode || 'phrase') === 'phrase'
                ? 'bg-cyan-500/15 text-cyan-400 border border-cyan-400/20'
                : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            <span className="text-[11px]">📋 Phrase</span>
            <span className="text-[7px] lowercase font-normal opacity-60">Full phrase together</span>
          </button>
          <button
            onClick={() => {
              changeProperty('properties.captionDisplayMode', 'sentence');
              showToast('✂️ Comma/Sentence splitting activated');
            }}
            className={`py-2 px-1 text-[9px] font-black uppercase rounded-md transition-all flex flex-col items-center justify-center gap-1 cursor-pointer ${
              activeNode.properties.captionDisplayMode === 'sentence'
                ? 'bg-cyan-500/15 text-cyan-400 border border-cyan-400/20'
                : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            <span className="text-[11px]">✂️ Split Sentence</span>
            <span className="text-[7px] lowercase font-normal opacity-60">Split at commas (,) & ends</span>
          </button>
        </div>
      </div>
  
      {/* SECTION 1: CONTAINER OPTIONS */}
      <details className="group bg-[#0e0f16] border border-white/5 rounded-xl overflow-hidden [&_summary::-webkit-details-marker]:hidden" open>
        <summary className="flex items-center justify-between p-3 cursor-pointer hover:bg-white/[0.02] select-none transition-all">
          <div className="flex items-center gap-2">
            <Settings className="w-3.5 h-3.5 text-blue-400" />
            <span className="text-[10px] uppercase font-black text-gray-300 tracking-wider">Container Options</span>
          </div>
          <ChevronDown className="w-3.5 h-3.5 text-gray-500 group-open:rotate-180 transition-transform" />
        </summary>
        <div className="p-3 pt-1 border-t border-white/5 space-y-4 text-gray-300">
          
          {/* Auto Width Toggle */}
          <div className="flex justify-between items-center bg-[#13141f] p-2 rounded-lg border border-white/5">
            <div className="flex flex-col">
              <span className="text-[9px] font-bold uppercase text-gray-400">Auto Width</span>
              <span className="text-[8px] text-gray-600">Container fits text dynamically</span>
            </div>
            <button 
              onClick={() => changeProperty('properties.containerAutoWidth', !(activeNode.properties.containerAutoWidth ?? true))}
              className={`w-8 h-4 rounded-full p-0.5 transition-colors cursor-pointer ${
                (activeNode.properties.containerAutoWidth ?? true) ? 'bg-cyan-500 flex justify-end' : 'bg-gray-800 flex justify-start'
              }`}
            >
              <span className="w-3 h-3 rounded-full bg-white shadow-sm" />
            </button>
          </div>
  
          {/* Container Width (Slider - only shown if Auto Width is false) */}
          {!(activeNode.properties.containerAutoWidth ?? true) && (
            <div className="space-y-1.5">
              <div className="flex justify-between items-center text-[9px] text-gray-500 font-bold uppercase">
                <span>Fixed Width</span>
                <span>{activeNode.properties.containerWidth ?? 550}px</span>
              </div>
              <input 
                type="range" 
                min="200" 
                max="1000" 
                step="10"
                value={activeNode.properties.containerWidth ?? 550} 
                onChange={(e) => changeProperty('properties.containerWidth', parseInt(e.target.value))}
                className="w-full accent-cyan-500 h-1 bg-black rounded"
              />
            </div>
          )}
  
          {/* Auto Height Toggle */}
          <div className="flex justify-between items-center bg-[#13141f] p-2 rounded-lg border border-white/5">
            <div className="flex flex-col">
              <span className="text-[9px] font-bold uppercase text-gray-400">Auto Height</span>
              <span className="text-[8px] text-gray-600">Dynamic height resizing</span>
            </div>
            <button 
              onClick={() => changeProperty('properties.containerAutoHeight', !(activeNode.properties.containerAutoHeight ?? true))}
              className={`w-8 h-4 rounded-full p-0.5 transition-colors cursor-pointer ${
                (activeNode.properties.containerAutoHeight ?? true) ? 'bg-cyan-500 flex justify-end' : 'bg-gray-800 flex justify-start'
              }`}
            >
              <span className="w-3 h-3 rounded-full bg-white shadow-sm" />
            </button>
          </div>
  
          {/* Container Height (Slider - only shown if Auto Height is false) */}
          {!(activeNode.properties.containerAutoHeight ?? true) && (
            <div className="space-y-1.5">
              <div className="flex justify-between items-center text-[9px] text-gray-500 font-bold uppercase">
                <span>Fixed Height</span>
                <span>{activeNode.properties.containerHeight ?? 110}px</span>
              </div>
              <input 
                type="range" 
                min="50" 
                max="400" 
                step="5"
                value={activeNode.properties.containerHeight ?? 110} 
                onChange={(e) => changeProperty('properties.containerHeight', parseInt(e.target.value))}
                className="w-full accent-cyan-500 h-1 bg-black rounded"
              />
            </div>
          )}
  
          {/* Padding */}
          <div className="space-y-1.5">
            <div className="flex justify-between items-center text-[9px] text-gray-500 font-bold uppercase">
              <span>Container Padding</span>
              <span>{activeNode.properties.padding ?? 16}px</span>
            </div>
            <input 
              type="range" 
              min="0" 
              max="64" 
              step="2"
              value={activeNode.properties.padding ?? 16} 
              onChange={(e) => changeProperty('properties.padding', parseInt(e.target.value))}
              className="w-full accent-cyan-500 h-1 bg-black rounded"
            />
          </div>
  
          {/* Margin */}
          <div className="space-y-1.5">
            <div className="flex justify-between items-center text-[9px] text-gray-500 font-bold uppercase">
              <span>Container Margin</span>
              <span>{activeNode.properties.containerMargin ?? 0}px</span>
            </div>
            <input 
              type="range" 
              min="0" 
              max="64" 
              step="2"
              value={activeNode.properties.containerMargin ?? 0} 
              onChange={(e) => changeProperty('properties.containerMargin', parseInt(e.target.value))}
              className="w-full accent-cyan-500 h-1 bg-black rounded"
            />
          </div>
  
          {/* Corner Radius */}
          <div className="space-y-1.5">
            <div className="flex justify-between items-center text-[9px] text-gray-500 font-bold uppercase">
              <span>Corner Radius</span>
              <span>{activeNode.properties.radius ?? 12}px</span>
            </div>
            <input 
              type="range" 
              min="0" 
              max="64" 
              step="2"
              value={activeNode.properties.radius ?? 12} 
              onChange={(e) => changeProperty('properties.radius', parseInt(e.target.value))}
              className="w-full accent-cyan-500 h-1 bg-black rounded"
            />
          </div>
  
          {/* Content Alignment */}
          <div className="space-y-1.5">
            <span className="text-[9px] uppercase font-bold text-gray-500">Text Content Align</span>
            <div className="grid grid-cols-3 gap-1 bg-black/40 p-1 rounded-lg border border-white/5">
              {['left', 'center', 'right'].map((align) => (
                <button
                  key={align}
                  onClick={() => changeProperty('properties.alignment', align)}
                  className={`py-1 text-[9px] font-black uppercase rounded transition-all cursor-pointer ${
                    (activeNode.properties.alignment ?? 'center') === align 
                      ? 'bg-cyan-500/15 text-cyan-400 border border-cyan-400/20' 
                      : 'text-gray-500 hover:text-gray-300'
                  }`}
                >
                  {align}
                </button>
              ))}
            </div>
          </div>
  
        </div>
      </details>
  
      {/* SECTION 2: BACKGROUND STYLE */}
      <details className="group bg-[#0e0f16] border border-white/5 rounded-xl overflow-hidden [&_summary::-webkit-details-marker]:hidden" open>
        <summary className="flex items-center justify-between p-3 cursor-pointer hover:bg-white/[0.02] select-none transition-all">
          <div className="flex items-center gap-2">
            <Palette className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-[10px] uppercase font-black text-gray-300 tracking-wider">Background Options</span>
          </div>
          <ChevronDown className="w-3.5 h-3.5 text-gray-500 group-open:rotate-180 transition-transform" />
        </summary>
        <div className="p-3 pt-1 border-t border-white/5 space-y-4 text-gray-300">
          
          {/* Enable Toggle */}
          <div className="flex justify-between items-center bg-[#13141f] p-2 rounded-lg border border-white/5">
            <span className="text-[9px] font-bold uppercase text-gray-400">Enable Background Layer</span>
            <button 
              onClick={() => changeProperty('properties.bgEnabled', !(activeNode.properties.bgEnabled ?? true))}
              className={`w-8 h-4 rounded-full p-0.5 transition-colors cursor-pointer ${
                (activeNode.properties.bgEnabled ?? true) ? 'bg-emerald-500 flex justify-end' : 'bg-gray-800 flex justify-start'
              }`}
            >
              <span className="w-3 h-3 rounded-full bg-white shadow-sm" />
            </button>
          </div>
  
          {/* If background is enabled, show details */}
          {(activeNode.properties.bgEnabled ?? true) && (
            <div className="space-y-4 pt-1 border-t border-white/5 animate-fadeIn">
              
              {/* Background Color */}
              <div className="space-y-1.5">
                <span className="text-[9px] uppercase font-bold text-gray-500">Solid / Start Color</span>
                <div className="flex gap-2">
                  <input 
                    type="color" 
                    value={activeNode.properties.backgroundColor?.startsWith('rgba') ? '#000000' : (activeNode.properties.backgroundColor || '#000000')}
                    onChange={(e) => changeProperty('properties.backgroundColor', e.target.value)}
                    className="w-10 h-7 bg-transparent border border-white/10 rounded cursor-pointer shrink-0"
                  />
                  <input 
                    type="text" 
                    placeholder="#000000 or rgba(...)"
                    value={activeNode.properties.backgroundColor ?? 'rgba(0,0,0,0.75)'}
                    onChange={(e) => changeProperty('properties.backgroundColor', e.target.value)}
                    className="w-full bg-black/40 border border-white/5 rounded-lg px-2 text-[10px] text-white focus:outline-none focus:ring-1 focus:ring-emerald-500/50"
                  />
                </div>
              </div>
  
              {/* Background Opacity */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-center text-[9px] text-gray-500 font-bold uppercase">
                  <span>Opacity</span>
                  <span>{Math.round((activeNode.properties.bgOpacity ?? 0.75) * 100)}%</span>
                </div>
                <input 
                  type="range" 
                  min="0" 
                  max="1" 
                  step="0.05"
                  value={activeNode.properties.bgOpacity ?? 0.75} 
                  onChange={(e) => changeProperty('properties.bgOpacity', parseFloat(e.target.value))}
                  className="w-full accent-emerald-500 h-1 bg-black rounded"
                />
              </div>
  
              {/* Backdrop Blur */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-center text-[9px] text-gray-500 font-bold uppercase">
                  <span>Backdrop Blur Radius</span>
                  <span>{activeNode.properties.bgBlur ?? 4}px</span>
                </div>
                <input 
                  type="range" 
                  min="0" 
                  max="30" 
                  step="1"
                  value={activeNode.properties.bgBlur ?? 4} 
                  onChange={(e) => changeProperty('properties.bgBlur', parseInt(e.target.value))}
                  className="w-full accent-emerald-500 h-1 bg-black rounded"
                />
              </div>
  
              {/* Glass Effect Toggle */}
              <div className="flex justify-between items-center bg-[#13141f] p-2 rounded-lg border border-white/5">
                <div className="flex flex-col">
                  <span className="text-[9px] font-bold uppercase text-gray-400">Saturated Glassmorphism</span>
                  <span className="text-[8px] text-gray-600">Adds backdrop saturation</span>
                </div>
                <button 
                  onClick={() => changeProperty('properties.bgGlassEffect', !(activeNode.properties.bgGlassEffect ?? false))}
                  className={`w-8 h-4 rounded-full p-0.5 transition-colors cursor-pointer ${
                    (activeNode.properties.bgGlassEffect ?? false) ? 'bg-emerald-500 flex justify-end' : 'bg-gray-800 flex justify-start'
                  }`}
                >
                  <span className="w-3 h-3 rounded-full bg-white shadow-sm" />
                </button>
              </div>
  
              {/* Background Gradient Toggle */}
              <div className="flex justify-between items-center bg-[#13141f] p-2 rounded-lg border border-white/5">
                <div className="flex flex-col">
                  <span className="text-[9px] font-bold uppercase text-gray-400">Gradient Background</span>
                  <span className="text-[8px] text-gray-600">Blend multiple colors</span>
                </div>
                <button 
                  onClick={() => changeProperty('properties.bgGradientEnabled', !(activeNode.properties.bgGradientEnabled ?? false))}
                  className={`w-8 h-4 rounded-full p-0.5 transition-colors cursor-pointer ${
                    (activeNode.properties.bgGradientEnabled ?? false) ? 'bg-emerald-500 flex justify-end' : 'bg-gray-800 flex justify-start'
                  }`}
                >
                  <span className="w-3 h-3 rounded-full bg-white shadow-sm" />
                </button>
              </div>
  
              {/* Gradient ending color (if gradient is enabled) */}
              {(activeNode.properties.bgGradientEnabled ?? false) && (
                <div className="space-y-3 pl-3 border-l-2 border-emerald-500/20 animate-fadeIn">
                  <div className="space-y-1.5">
                    <span className="text-[9px] uppercase font-bold text-gray-500">Ending Color</span>
                    <div className="flex gap-2">
                      <input 
                        type="color" 
                        value={activeNode.properties.bgGradientColor || '#3b82f6'}
                        onChange={(e) => changeProperty('properties.bgGradientColor', e.target.value)}
                        className="w-10 h-7 bg-transparent border border-white/10 rounded cursor-pointer shrink-0"
                      />
                      <input 
                        type="text" 
                        value={activeNode.properties.bgGradientColor ?? '#3b82f6'}
                        onChange={(e) => changeProperty('properties.bgGradientColor', e.target.value)}
                        className="w-full bg-black/40 border border-white/5 rounded-lg px-2 text-[10px] text-white focus:outline-none focus:ring-1"
                      />
                    </div>
                  </div>
  
                  <div className="space-y-1.5">
                    <span className="text-[9px] uppercase font-bold text-gray-500">Direction</span>
                    <select
                      value={activeNode.properties.bgGradientDirection ?? 'to bottom'}
                      onChange={(e) => changeProperty('properties.bgGradientDirection', e.target.value)}
                      className="w-full bg-black/40 border border-white/5 rounded-lg px-2.5 py-1.5 text-[10px] text-white focus:outline-none"
                    >
                      <option value="to bottom">To Bottom ↓</option>
                      <option value="to right">To Right →</option>
                      <option value="to top right">To Top Right ↗</option>
                      <option value="to bottom right">To Bottom Right ↘</option>
                    </select>
                  </div>
                </div>
              )}
  
            </div>
          )}
  
        </div>
      </details>
  
      {/* SECTION 3: OUTLINES & BORDERS */}
      <details className="group bg-[#0e0f16] border border-white/5 rounded-xl overflow-hidden [&_summary::-webkit-details-marker]:hidden">
        <summary className="flex items-center justify-between p-3 cursor-pointer hover:bg-white/[0.02] select-none transition-all">
          <div className="flex items-center gap-2">
            <Type className="w-3.5 h-3.5 text-purple-400" />
            <span className="text-[10px] uppercase font-black text-gray-300 tracking-wider">Outlines & Borders</span>
          </div>
          <ChevronDown className="w-3.5 h-3.5 text-gray-500 group-open:rotate-180 transition-transform" />
        </summary>
        <div className="p-3 pt-1 border-t border-white/5 space-y-4 text-gray-300">
          
          {/* CONTAINER BORDERS */}
          <span className="text-[9px] font-black uppercase text-purple-400 tracking-wider">Box Container Border</span>
          
          <div className="flex justify-between items-center bg-[#13141f] p-2 rounded-lg border border-white/5">
            <span className="text-[9px] font-bold uppercase text-gray-400">Enable Container Border</span>
            <button 
              onClick={() => changeProperty('properties.borderEnabled', !(activeNode.properties.borderEnabled ?? false))}
              className={`w-8 h-4 rounded-full p-0.5 transition-colors cursor-pointer ${
                (activeNode.properties.borderEnabled ?? false) ? 'bg-purple-500 flex justify-end' : 'bg-gray-800 flex justify-start'
              }`}
            >
              <span className="w-3 h-3 rounded-full bg-white shadow-sm" />
            </button>
          </div>
  
          {(activeNode.properties.borderEnabled ?? false) && (
            <div className="space-y-4 pt-1 pl-3 border-l-2 border-purple-500/20 animate-fadeIn">
              <div className="space-y-1.5">
                <span className="text-[9px] uppercase font-bold text-gray-500">Border Color</span>
                <div className="flex gap-2">
                  <input 
                    type="color" 
                    value={activeNode.properties.borderColor || '#ffffff'}
                    onChange={(e) => changeProperty('properties.borderColor', e.target.value)}
                    className="w-10 h-7 bg-transparent border border-white/10 rounded cursor-pointer shrink-0"
                  />
                  <input 
                    type="text" 
                    value={activeNode.properties.borderColor ?? 'rgba(255, 255, 255, 0.15)'}
                    onChange={(e) => changeProperty('properties.borderColor', e.target.value)}
                    className="w-full bg-black/40 border border-white/5 rounded-lg px-2 text-[10px] text-white focus:outline-none"
                  />
                </div>
              </div>
  
              <div className="space-y-1.5">
                <div className="flex justify-between items-center text-[9px] text-gray-500 font-bold uppercase">
                  <span>Border Width</span>
                  <span>{activeNode.properties.borderWidth ?? 1}px</span>
                </div>
                <input 
                  type="range" 
                  min="1" 
                  max="10" 
                  step="1"
                  value={activeNode.properties.borderWidth ?? 1} 
                  onChange={(e) => changeProperty('properties.borderWidth', parseInt(e.target.value))}
                  className="w-full accent-purple-500 h-1 bg-black rounded"
                />
              </div>
  
              <div className="space-y-1.5">
                <span className="text-[9px] uppercase font-bold text-gray-500">Border Style</span>
                <select
                  value={activeNode.properties.borderStyle ?? 'solid'}
                  onChange={(e) => changeProperty('properties.borderStyle', e.target.value)}
                  className="w-full bg-black/40 border border-white/5 rounded-lg px-2.5 py-1.5 text-[10px] text-white focus:outline-none"
                >
                  <option value="solid">Solid ───</option>
                  <option value="dashed">Dashed ─ ─</option>
                  <option value="dotted">Dotted • • •</option>
                  <option value="double">Double ═══</option>
                </select>
              </div>
            </div>
          )}
  
          {/* TEXT OUTLINE (STROKE / WEB STROKE) */}
          <div className="pt-2 border-t border-white/5">
            <span className="text-[9px] font-black uppercase text-purple-400 tracking-wider">Web Text Stroke</span>
          </div>
  
          <div className="flex justify-between items-center bg-[#13141f] p-2 rounded-lg border border-white/5">
            <span className="text-[9px] font-bold uppercase text-gray-400">Enable Text Stroke</span>
            <button 
              onClick={() => changeProperty('properties.textStrokeEnabled', !(activeNode.properties.textStrokeEnabled ?? false))}
              className={`w-8 h-4 rounded-full p-0.5 transition-colors cursor-pointer ${
                (activeNode.properties.textStrokeEnabled ?? false) ? 'bg-purple-500 flex justify-end' : 'bg-gray-800 flex justify-start'
              }`}
            >
              <span className="w-3 h-3 rounded-full bg-white shadow-sm" />
            </button>
          </div>
  
          {(activeNode.properties.textStrokeEnabled ?? false) && (
            <div className="space-y-4 pt-1 pl-3 border-l-2 border-purple-500/20 animate-fadeIn">
              <div className="space-y-1.5">
                <span className="text-[9px] uppercase font-bold text-gray-500">Stroke Color</span>
                <input 
                  type="color" 
                  value={activeNode.properties.textStrokeColor || '#000000'}
                  onChange={(e) => changeProperty('properties.textStrokeColor', e.target.value)}
                  className="w-10 h-7 bg-transparent border border-white/10 rounded cursor-pointer shrink-0"
                />
              </div>
  
              <div className="space-y-1.5">
                <div className="flex justify-between items-center text-[9px] text-gray-500 font-bold uppercase">
                  <span>Stroke Width</span>
                  <span>{activeNode.properties.textStrokeWidth ?? 1}px</span>
                </div>
                <input 
                  type="range" 
                  min="0.5" 
                  max="4" 
                  step="0.5"
                  value={activeNode.properties.textStrokeWidth ?? 1} 
                  onChange={(e) => changeProperty('properties.textStrokeWidth', parseFloat(e.target.value))}
                  className="w-full accent-purple-500 h-1 bg-black rounded"
                />
              </div>
            </div>
          )}
  
        </div>
      </details>
  
      {/* SECTION 4: SHADOWS & GLOWS */}
      <details className="group bg-[#0e0f16] border border-white/5 rounded-xl overflow-hidden [&_summary::-webkit-details-marker]:hidden">
        <summary className="flex items-center justify-between p-3 cursor-pointer hover:bg-white/[0.02] select-none transition-all">
          <div className="flex items-center gap-2">
            <Eye className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-[10px] uppercase font-black text-gray-300 tracking-wider">Shadows & Glows</span>
          </div>
          <ChevronDown className="w-3.5 h-3.5 text-gray-500 group-open:rotate-180 transition-transform" />
        </summary>
        <div className="p-3 pt-1 border-t border-white/5 space-y-4 text-gray-300">
          
          {/* CONTAINER DROP SHADOWS */}
          <span className="text-[9px] font-black uppercase text-amber-400 tracking-wider">Box Container Shadow</span>
  
          <div className="flex justify-between items-center bg-[#13141f] p-2 rounded-lg border border-white/5">
            <span className="text-[9px] font-bold uppercase text-gray-400">Enable Drop Shadow</span>
            <button 
              onClick={() => changeProperty('properties.shadowEnabled', !(activeNode.properties.shadowEnabled ?? true))}
              className={`w-8 h-4 rounded-full p-0.5 transition-colors cursor-pointer ${
                (activeNode.properties.shadowEnabled ?? true) ? 'bg-amber-500 flex justify-end' : 'bg-gray-800 flex justify-start'
              }`}
            >
              <span className="w-3 h-3 rounded-full bg-white shadow-sm" />
            </button>
          </div>
  
          {(activeNode.properties.shadowEnabled ?? true) && (
            <div className="space-y-4 pt-1 pl-3 border-l-2 border-amber-500/20 animate-fadeIn">
              <div className="space-y-1.5">
                <span className="text-[9px] uppercase font-bold text-gray-500">Shadow Color</span>
                <input 
                  type="color" 
                  value={activeNode.properties.shadowColor || '#000000'}
                  onChange={(e) => changeProperty('properties.shadowColor', e.target.value)}
                  className="w-10 h-7 bg-transparent border border-white/10 rounded cursor-pointer shrink-0"
                />
              </div>
  
              <div className="space-y-1.5">
                <div className="flex justify-between items-center text-[9px] text-gray-500 font-bold uppercase">
                  <span>Shadow Blur Radius</span>
                  <span>{activeNode.properties.shadowBlur ?? 25}px</span>
                </div>
                <input 
                  type="range" 
                  min="0" 
                  max="100" 
                  step="2"
                  value={activeNode.properties.shadowBlur ?? 25} 
                  onChange={(e) => changeProperty('properties.shadowBlur', parseInt(e.target.value))}
                  className="w-full accent-amber-500 h-1 bg-black rounded"
                />
              </div>
  
              <div className="space-y-1.5">
                <div className="flex justify-between items-center text-[9px] text-gray-500 font-bold uppercase">
                  <span>Drop Distance</span>
                  <span>{activeNode.properties.shadowDistance ?? 8}px</span>
                </div>
                <input 
                  type="range" 
                  min="0" 
                  max="50" 
                  step="1"
                  value={activeNode.properties.shadowDistance ?? 8} 
                  onChange={(e) => changeProperty('properties.shadowDistance', parseInt(e.target.value))}
                  className="w-full accent-amber-500 h-1 bg-black rounded"
                />
              </div>
            </div>
          )}
  
          {/* TEXT OUTLINE / drop shadow outline */}
          <div className="pt-2 border-t border-white/5">
            <span className="text-[9px] font-black uppercase text-amber-400 tracking-wider">Multi-Shadow Text Outline</span>
          </div>
  
          <div className="flex justify-between items-center bg-[#13141f] p-2 rounded-lg border border-white/5">
            <span className="text-[9px] font-bold uppercase text-gray-400">Enable Outline Shadow</span>
            <button 
              onClick={() => changeProperty('properties.textOutlineEnabled', !(activeNode.properties.textOutlineEnabled ?? false))}
              className={`w-8 h-4 rounded-full p-0.5 transition-colors cursor-pointer ${
                (activeNode.properties.textOutlineEnabled ?? false) ? 'bg-amber-500 flex justify-end' : 'bg-gray-800 flex justify-start'
              }`}
            >
              <span className="w-3 h-3 rounded-full bg-white shadow-sm" />
            </button>
          </div>
  
          {(activeNode.properties.textOutlineEnabled ?? false) && (
            <div className="space-y-4 pt-1 pl-3 border-l-2 border-amber-500/20 animate-fadeIn">
              <div className="space-y-1.5">
                <span className="text-[9px] uppercase font-bold text-gray-500">Outline Color</span>
                <input 
                  type="color" 
                  value={activeNode.properties.textOutlineColor || '#000000'}
                  onChange={(e) => changeProperty('properties.textOutlineColor', e.target.value)}
                  className="w-10 h-7 bg-transparent border border-white/10 rounded cursor-pointer shrink-0"
                />
              </div>
            </div>
          )}
  
          {/* TEXT GLOW */}
          <div className="pt-2 border-t border-white/5">
            <span className="text-[9px] font-black uppercase text-amber-400 tracking-wider">Text Glow Accent</span>
          </div>
  
          <div className="flex justify-between items-center bg-[#13141f] p-2 rounded-lg border border-white/5">
            <span className="text-[9px] font-bold uppercase text-gray-400">Enable Soft Glow</span>
            <button 
              onClick={() => changeProperty('properties.textGlowEnabled', !(activeNode.properties.textGlowEnabled ?? false))}
              className={`w-8 h-4 rounded-full p-0.5 transition-colors cursor-pointer ${
                (activeNode.properties.textGlowEnabled ?? false) ? 'bg-amber-500 flex justify-end' : 'bg-gray-800 flex justify-start'
              }`}
            >
              <span className="w-3 h-3 rounded-full bg-white shadow-sm" />
            </button>
          </div>
  
          {(activeNode.properties.textGlowEnabled ?? false) && (
            <div className="space-y-4 pt-1 pl-3 border-l-2 border-amber-500/20 animate-fadeIn">
              <div className="space-y-1.5">
                <span className="text-[9px] uppercase font-bold text-gray-500">Glow Color</span>
                <input 
                  type="color" 
                  value={activeNode.properties.textGlowColor || '#a855f7'}
                  onChange={(e) => changeProperty('properties.textGlowColor', e.target.value)}
                  className="w-10 h-7 bg-transparent border border-white/10 rounded cursor-pointer shrink-0"
                />
              </div>
  
              <div className="space-y-1.5">
                <div className="flex justify-between items-center text-[9px] text-gray-500 font-bold uppercase">
                  <span>Glow Blur Amount</span>
                  <span>{activeNode.properties.textGlowBlur ?? 8}px</span>
                </div>
                <input 
                  type="range" 
                  min="3" 
                  max="30" 
                  step="1"
                  value={activeNode.properties.textGlowBlur ?? 8} 
                  onChange={(e) => changeProperty('properties.textGlowBlur', parseInt(e.target.value))}
                  className="w-full accent-amber-500 h-1 bg-black rounded"
                />
              </div>
            </div>
          )}
  
        </div>
      </details>
  
      {/* SECTION 5: WORD HIGHLIGHT LAYER */}
      <details className="group bg-[#0e0f16] border border-white/5 rounded-xl overflow-hidden [&_summary::-webkit-details-marker]:hidden" open>
        <summary className="flex items-center justify-between p-3 cursor-pointer hover:bg-white/[0.02] select-none transition-all">
          <div className="flex items-center gap-2">
            <Target className="w-3.5 h-3.5 text-yellow-400" />
            <span className="text-[10px] uppercase font-black text-gray-300 tracking-wider">Highlight Layer</span>
          </div>
          <ChevronDown className="w-3.5 h-3.5 text-gray-500 group-open:rotate-180 transition-transform" />
        </summary>
        <div className="p-3 pt-1 border-t border-white/5 space-y-4 text-gray-300">
          
          {/* Enable Toggle */}
          <div className="flex justify-between items-center bg-[#13141f] p-2 rounded-lg border border-white/5">
            <span className="text-[9px] font-bold uppercase text-gray-400">Enable Active Highlight Box</span>
            <button 
              onClick={() => changeProperty('properties.highlightEnabled', !(activeNode.properties.highlightEnabled ?? true))}
              className={`w-8 h-4 rounded-full p-0.5 transition-colors cursor-pointer ${
                (activeNode.properties.highlightEnabled ?? true) ? 'bg-yellow-500 flex justify-end' : 'bg-gray-800 flex justify-start'
              }`}
            >
              <span className="w-3 h-3 rounded-full bg-white shadow-sm" />
            </button>
          </div>
  
          {(activeNode.properties.highlightEnabled ?? true) && (
            <div className="space-y-4 pt-1 border-t border-white/5 animate-fadeIn">
              
              {/* Highlight Box Background Color */}
              <div className="space-y-1.5">
                <span className="text-[9px] uppercase font-bold text-gray-500">Highlight Box Color</span>
                <div className="flex gap-2">
                  <input 
                    type="color" 
                    value={activeNode.properties.activeColor || '#eab308'}
                    onChange={(e) => changeProperty('properties.activeColor', e.target.value)}
                    className="w-10 h-7 bg-transparent border border-white/10 rounded cursor-pointer shrink-0"
                  />
                  <input 
                    type="text" 
                    value={activeNode.properties.activeColor ?? '#eab308'}
                    onChange={(e) => changeProperty('properties.activeColor', e.target.value)}
                    className="w-full bg-black/40 border border-white/5 rounded-lg px-2 text-[10px] text-white focus:outline-none focus:ring-1 focus:ring-yellow-500/50"
                  />
                </div>
              </div>
  
              {/* Highlight Opacity */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-center text-[9px] text-gray-500 font-bold uppercase">
                  <span>Box Opacity</span>
                  <span>{Math.round((activeNode.properties.highlightOpacity ?? 1) * 100)}%</span>
                </div>
                <input 
                  type="range" 
                  min="0.1" 
                  max="1" 
                  step="0.05"
                  value={activeNode.properties.highlightOpacity ?? 1} 
                  onChange={(e) => changeProperty('properties.highlightOpacity', parseFloat(e.target.value))}
                  className="w-full accent-yellow-500 h-1 bg-black rounded"
                />
              </div>
  
              {/* Box Corner Radius */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-center text-[9px] text-gray-500 font-bold uppercase">
                  <span>Box Corner Radius</span>
                  <span>{activeNode.properties.highlightRadius ?? 6}px</span>
                </div>
                <input 
                  type="range" 
                  min="0" 
                  max="24" 
                  step="1"
                  value={activeNode.properties.highlightRadius ?? 6} 
                  onChange={(e) => changeProperty('properties.highlightRadius', parseInt(e.target.value))}
                  className="w-full accent-yellow-500 h-1 bg-black rounded"
                />
              </div>
  
              {/* Horizontal Padding */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-center text-[9px] text-gray-500 font-bold uppercase">
                  <span>Horizontal Padding</span>
                  <span>{activeNode.properties.highlightPaddingX ?? 8}px</span>
                </div>
                <input 
                  type="range" 
                  min="0" 
                  max="32" 
                  step="1"
                  value={activeNode.properties.highlightPaddingX ?? 8} 
                  onChange={(e) => changeProperty('properties.highlightPaddingX', parseInt(e.target.value))}
                  className="w-full accent-yellow-500 h-1 bg-black rounded"
                />
              </div>
  
              {/* Vertical Padding */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-center text-[9px] text-gray-500 font-bold uppercase">
                  <span>Vertical Padding</span>
                  <span>{activeNode.properties.highlightPaddingY ?? 4}px</span>
                </div>
                <input 
                  type="range" 
                  min="0" 
                  max="24" 
                  step="1"
                  value={activeNode.properties.highlightPaddingY ?? 4} 
                  onChange={(e) => changeProperty('properties.highlightPaddingY', parseInt(e.target.value))}
                  className="w-full accent-yellow-500 h-1 bg-black rounded"
                />
              </div>
  
              {/* Animation curve */}
              <div className="space-y-1.5">
                <span className="text-[9px] uppercase font-bold text-gray-500">Animation Interpolation</span>
                <select
                  value={activeNode.properties.highlightCurve ?? 'spring'}
                  onChange={(e) => changeProperty('properties.highlightCurve', e.target.value)}
                  className="w-full bg-black/40 border border-white/5 rounded-lg px-2.5 py-1.5 text-[10px] text-white focus:outline-none"
                >
                  <option value="spring">Spring (Adobe Style, Natural Physics)</option>
                  <option value="easeInOut">Ease In Out (CapCut Style, Smooth)</option>
                  <option value="linear">Linear (Constant Velocity)</option>
                </select>
              </div>
  
              {/* Animation Speed */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-center text-[9px] text-gray-500 font-bold uppercase">
                  <span>Transition Duration</span>
                  <span>{activeNode.properties.highlightSpeed ?? 0.2}s</span>
                </div>
                <input 
                  type="range" 
                  min="0.05" 
                  max="1" 
                  step="0.05"
                  value={activeNode.properties.highlightSpeed ?? 0.2} 
                  onChange={(e) => changeProperty('properties.highlightSpeed', parseFloat(e.target.value))}
                  className="w-full accent-yellow-500 h-1 bg-black rounded"
                />
              </div>
  
            </div>
          )}
  
        </div>
      </details>
  
      {/* SECTION 6: TYPOGRAPHY SPACING */}
      <details className="group bg-[#0e0f16] border border-white/5 rounded-xl overflow-hidden [&_summary::-webkit-details-marker]:hidden">
        <summary className="flex items-center justify-between p-3 cursor-pointer hover:bg-white/[0.02] select-none transition-all">
          <div className="flex items-center gap-2">
            <Sliders className="w-3.5 h-3.5 text-rose-400" />
            <span className="text-[10px] uppercase font-black text-gray-300 tracking-wider">Typography Spacing</span>
          </div>
          <ChevronDown className="w-3.5 h-3.5 text-gray-500 group-open:rotate-180 transition-transform" />
        </summary>
        <div className="p-3 pt-1 border-t border-white/5 space-y-4 text-gray-300">
          
          {/* Letter spacing */}
          <div className="space-y-1.5">
            <div className="flex justify-between items-center text-[9px] text-gray-500 font-bold uppercase">
              <span>Character Spacing</span>
              <span>{activeNode.properties.charSpacing ?? 0}px</span>
            </div>
            <input 
              type="range" 
              min="-5" 
              max="20" 
              step="1"
              value={activeNode.properties.charSpacing ?? 0} 
              onChange={(e) => changeProperty('properties.charSpacing', parseInt(e.target.value))}
              className="w-full accent-rose-500 h-1 bg-black rounded"
            />
          </div>
  
          {/* Line spacing */}
          <div className="space-y-1.5">
            <div className="flex justify-between items-center text-[9px] text-gray-500 font-bold uppercase">
              <span>Line Height Spacing</span>
              <span>{activeNode.properties.lineSpacing ?? 1.2}</span>
            </div>
            <input 
              type="range" 
              min="0.8" 
              max="2.5" 
              step="0.1"
              value={activeNode.properties.lineSpacing ?? 1.2} 
              onChange={(e) => changeProperty('properties.lineSpacing', parseFloat(e.target.value))}
              className="w-full accent-rose-500 h-1 bg-black rounded"
            />
          </div>
  
          {/* Word spacing */}
          <div className="space-y-1.5">
            <div className="flex justify-between items-center text-[9px] text-gray-500 font-bold uppercase">
              <span>Word Box Gap</span>
              <span>{activeNode.properties.wordSpacing ?? 12}px</span>
            </div>
            <input 
              type="range" 
              min="0" 
              max="50" 
              step="2"
              value={activeNode.properties.wordSpacing ?? 12} 
              onChange={(e) => changeProperty('properties.wordSpacing', parseInt(e.target.value))}
              className="w-full accent-rose-500 h-1 bg-black rounded"
            />
          </div>
  
        </div>
      </details>
  
      {/* SECTION 7: TEXT ANIMATIONS PRESET */}
      <details className="group bg-[#0e0f16] border border-white/5 rounded-xl overflow-hidden [&_summary::-webkit-details-marker]:hidden" open>
        <summary className="flex items-center justify-between p-3 cursor-pointer hover:bg-white/[0.02] select-none transition-all">
          <div className="flex items-center gap-2">
            <Activity className="w-3.5 h-3.5 text-cyan-400" />
            <span className="text-[10px] uppercase font-black text-gray-300 tracking-wider">Cinematic Word Entrance</span>
          </div>
          <ChevronDown className="w-3.5 h-3.5 text-gray-500 group-open:rotate-180 transition-transform" />
        </summary>
        <div className="p-3 pt-1 border-t border-white/5 space-y-4 text-gray-300">
          
          {/* Preset Select */}
          <div className="space-y-1.5">
            <span className="text-[9px] uppercase font-bold text-gray-500">Active Word Animation Preset</span>
            <select
              value={activeNode.properties.textAnimationPreset ?? 'fade'}
              onChange={(e) => changeProperty('properties.textAnimationPreset', e.target.value)}
              className="w-full bg-black/40 border border-white/5 rounded-lg px-2.5 py-1.5 text-[10px] text-white focus:outline-none"
            >
              <option value="fade">Fade Reveal (Classic, Gentle)</option>
              <option value="slide">Slide Rise (Dynamic, Modern)</option>
              <option value="zoom">Zoom Focus (Energetic, Playful)</option>
              <option value="bounce">Bounce (High Energy, Retro)</option>
              <option value="blur">Cinematic Motion Blur (Premium Cinema)</option>
              <option value="pop">Inflate / Pop (Cartoon, Bold)</option>
              <option value="scale">Subtle Scale Grow (Clean, Corporate)</option>
              <option value="none">None (Instant Cut)</option>
            </select>
          </div>
  
        </div>
      </details>
  
    </div>
  )}
            </div>
          );
};
