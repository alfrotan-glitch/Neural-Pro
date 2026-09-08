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
import { SliderRow, ToggleRow, SelectRow } from '../InspectorFieldControls';
import { UniversalTransformControls } from '../UniversalTransformControls';

export const VideoInspectorPanel: React.FC = () => {
  const {
    activeNode, tracks, selectedNodeIds, trackType, currentTime,
    updateNodeProperty, updateNodesProperty, setSelectedNodeIds, setCurrentTime, showToast,
    videoTab, setVideoTab, uniformScale, setUniformScale, chromaEnabled, setChromaEnabled, chromaColor, setChromaColor, chromaIntensity, setChromaIntensity, chromaShadow, setChromaShadow, activeMask, setActiveMask, maskFeather, setMaskFeather, maskWidth, setMaskWidth, maskHeight, setMaskHeight, maskRotation, setMaskRotation, animCategory, setAnimCategory, animSearch, setAnimSearch, videoAnimations, handleAlign,
    audioTab, setAudioTab, eqLow, setEqLow, eqMid, setEqMid, eqHigh, setEqHigh, activeVoiceFx, setActiveVoiceFx, translateLang, setTranslateLang, selectedVoice, setSelectedVoice,
    textTab, setTextTab, templateCategory, setTemplateCategory, captionSearch, setCaptionSearch, isTranslating, setIsTranslating, isTTSGenerating, setIsTTSGenerating, isGeneratingCaptions, setIsGeneratingCaptions, isRefiningCaptions, setIsRefiningCaptions, captionPrompt, setCaptionPrompt, applyScope, setApplyScope, restorePunctuation, setRestorePunctuation, grammarPrompt, setGrammarPrompt, grammarPreset, setGrammarPreset, typographyPresets, customPresets, setCustomPresets, getSubtitlesList, handleAutoCaptionGenerate, handleSrtUpload, handleSrtExport, handleAiRefine, handleAddNewCaption, textColorInputRef, activeColorInputRef, bgInputRef
  } = useInspectorController();

          const scale = activeNode.transform.scale ?? 100;
          const x = activeNode.transform.x ?? 0;
        const y = activeNode.transform.y ?? 0;
        const rotation = activeNode.transform.rotation ?? 0;
        const opacity = activeNode.transform.opacity ?? 100;
        const blendMode = activeNode.properties.blendMode ?? 'normal';

        // Video AI Tools
        const aiEnhance = activeNode.properties.aiEnhance ?? false;
        const aiNoiseReduce = activeNode.properties.aiNoiseReduce ?? false;
        const aiBgChange = activeNode.properties.aiBgChange ?? false;
        const aiBgRemove = activeNode.properties.aiBgRemove ?? false;
        const aiExpand = activeNode.properties.aiExpand ?? false;
        const aiRemix = activeNode.properties.aiRemix ?? false;
        const aiLipSync = activeNode.properties.aiLipSync ?? false;

          return (
            <div className="space-y-4" id="video_inspector_panel">
              {/* Top 4 Tab Headers */}
              <div className="flex bg-[#11121a] p-1 rounded-lg border border-white/5" id="video_tabs_header">
                {(['basic', 'remove_bg', 'mask', 'animation'] as const).map((tab) => {
                  const labelMap = {
                    basic: 'Basic',
                    remove_bg: 'Remove BG',
                    mask: 'Mask',
                    animation: 'Animation'
                  };
                  return (
                    <button
                      key={tab}
                      id={`video_tab_btn_${tab}`}
                      onClick={() => setVideoTab(tab)}
                      className={`flex-1 py-1 text-[10px] font-bold rounded-md transition-all cursor-pointer capitalize ${
                        videoTab === tab 
                          ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-400/20 shadow-lg' 
                          : 'text-gray-400 hover:text-white'
                      }`}
                    >
                      {labelMap[tab]}
                    </button>
                  );
                })}
              </div>
  
              {/* TAB 1: BASIC (Transform, Alignment, Blend, AI Tools) */}
              {videoTab === 'basic' && (
                <div className="space-y-4" id="video_tab_basic_content">
                  
                  <UniversalTransformControls id="video_universal_transform" />
  
                  {/* 2. Intelligent Alignment Section (Yellow borders visual buttons) */}
                  <div className="space-y-2 bg-[#14151e]/40 border border-white/5 p-3 rounded-xl" id="alignment_section">
                    <span className="text-[10px] uppercase font-black text-gray-400 tracking-wider block">Smart Canvas Alignment</span>
                    <div className="flex gap-2">
                      {(['left', 'right', 'top', 'bottom', 'center'] as const).map((pos) => {
                        const posLabels = { left: 'Left', right: 'Right', top: 'Top', bottom: 'Bottom', center: 'Center' };
                        return (
                          <button
                            key={pos}
                            onClick={() => handleAlign(pos)}
                            className="flex-1 py-1 px-1 text-[8.5px] font-bold uppercase rounded border border-yellow-500/40 hover:border-yellow-400 hover:text-yellow-300 hover:bg-yellow-500/10 text-yellow-500/80 transition-all cursor-pointer text-center bg-black/25"
                            title={`Snap clip to ${pos}`}
                          >
                            {posLabels[pos]}
                          </button>
                        );
                      })}
                    </div>
                  </div>
  
                  {/* 3. Blend Opacity & Mode Section */}
                  <div className="space-y-1" id="blend_composite_section">
                    <span className="text-[10px] uppercase font-black text-gray-400 tracking-wider block">Blend / Composite</span>
                    
                    <SliderRow 
                      label="Opacity" 
                      value={opacity} 
                      min={0} 
                      max={100} 
                      unit="%"
                      icon={Eye}
                      onChange={(v) => updateNodesProperty(selectedNodeIds, 'transform.opacity', v)}
                      onReset={() => updateNodesProperty(selectedNodeIds, 'transform.opacity', 100)}
                    />
  
                    <SelectRow 
                      label="Blend Mode" 
                      value={blendMode}
                      options={[
                        { value: 'normal', label: 'Normal' },
                        { value: 'multiply', label: 'Multiply' },
                        { value: 'screen', label: 'Screen' },
                        { value: 'overlay', label: 'Overlay' },
                        { value: 'darken', label: 'Darken' },
                        { value: 'lighten', label: 'Lighten' }
                      ]}
                      icon={SlidersHorizontal}
                      onChange={(v) => updateNodesProperty(selectedNodeIds, 'properties.blendMode', v)}
                    />
                  </div>
  
                  {/* 4. AI Tools switches list */}
                  <div className="space-y-2 pt-2 border-t border-white/[0.04]" id="ai_tools_section">
                    <span className="text-[10px] uppercase font-black text-purple-400 tracking-wider block flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5" />
                      AI Intelligent Tools
                    </span>
  
                    <ToggleRow 
                      label="Enhance Quality" 
                      description="AI upscale and enhance overall lighting & picture crispness."
                      value={aiEnhance}
                      icon={Wand2}
                      onChange={(v) => updateNodesProperty(selectedNodeIds, 'properties.aiEnhance', v)}
                    />
  
                    <ToggleRow 
                      label="Reduce Image Noise" 
                      description="Remove sensor grains and low-light dynamic blur artifacts."
                      value={aiNoiseReduce}
                      icon={Shield}
                      onChange={(v) => updateNodesProperty(selectedNodeIds, 'properties.aiNoiseReduce', v)}
                    />
  
                    <ToggleRow 
                      label="Change Background" 
                      description="Intelligently replace the backdrop with custom generated theme templates."
                      value={aiBgChange}
                      icon={Image}
                      onChange={(v) => updateNodesProperty(selectedNodeIds, 'properties.aiBgChange', v)}
                    />
  
                    <ToggleRow 
                      label="AI Cutout Removal" 
                      description="Isolate subject from surroundings instantly without losing details."
                      value={aiBgRemove}
                      icon={Activity}
                      onChange={(v) => updateNodesProperty(selectedNodeIds, 'properties.aiBgRemove', v)}
                    />
  
                    <ToggleRow 
                      label="AI Expand" 
                      description="Expand borders using generative modeling based on surround elements."
                      value={aiExpand}
                      icon={Layers}
                      onChange={(v) => updateNodesProperty(selectedNodeIds, 'properties.aiExpand', v)}
                    />
  
                    <ToggleRow 
                      label="AI Remix Mode" 
                      description="Match and apply stylized color theme LUTs on subject dynamically."
                      value={aiRemix}
                      icon={Palette}
                      onChange={(v) => updateNodesProperty(selectedNodeIds, 'properties.aiRemix', v)}
                    />
  
                    <ToggleRow 
                      label="Lip Sync Synchronizer" 
                      description="Track face markers and synchronize dialogue mouth movements seamlessly."
                      value={aiLipSync}
                      icon={Smile}
                      onChange={(v) => updateNodesProperty(selectedNodeIds, 'properties.aiLipSync', v)}
                    />
                  </div>
  
                </div>
              )}
  
              {/* TAB 2: REMOVE BG (Chroma Key & Auto cutout) */}
              {videoTab === 'remove_bg' && (
                <div className="space-y-4" id="video_tab_remove_bg">
                  <div className="bg-black/10 border border-white/[0.02] p-3 rounded-xl space-y-2">
                    <div className="flex items-center gap-2">
                      <Wand2 className="w-4 h-4 text-cyan-400 animate-pulse" />
                      <span className="text-[10px] font-bold uppercase tracking-wider text-white">Smart Chroma Key Cutout</span>
                    </div>
                    <p className="text-[8px] text-gray-500 leading-relaxed">
                      Remove green backdrop or separate the subject from the video frame using professional chroma filters.
                    </p>
  
                    <ToggleRow 
                      label="Enable Chroma Key" 
                      value={chromaEnabled} 
                      onChange={(v) => {
                        setChromaEnabled(v);
                        showToast(`🟢 Chroma Key removal ${v ? 'Enabled' : 'Disabled'}`);
                      }}
                    />
  
                    {chromaEnabled && (
                      <div className="space-y-3 pt-2 border-t border-white/5 animate-fadeIn">
                        {/* Color Picker row */}
                        <div className="flex items-center justify-between bg-black/30 p-2 rounded-lg">
                          <span className="text-[9px] font-bold text-gray-400 uppercase">Target Color</span>
                          <div className="flex items-center gap-2">
                            <input 
                              type="color" 
                              value={chromaColor} 
                              onChange={(e) => setChromaColor(e.target.value)}
                              className="w-7 h-7 bg-transparent border-none cursor-pointer"
                            />
                            <span className="text-[10px] font-mono font-bold text-gray-300 uppercase">{chromaColor}</span>
                          </div>
                        </div>
  
                        {/* Intensity Slider */}
                        <div className="space-y-1">
                          <div className="flex justify-between text-[9px] font-medium text-gray-400">
                            <span>Removal Strength</span>
                            <span className="text-cyan-400 font-bold">{chromaIntensity}%</span>
                          </div>
                          <input 
                            type="range" min="0" max="100" value={chromaIntensity} 
                            onChange={(e) => setChromaIntensity(parseInt(e.target.value))}
                            className="w-full accent-cyan-400 h-1 bg-black rounded"
                          />
                        </div>
  
                        {/* Shadow Slider */}
                        <div className="space-y-1">
                          <div className="flex justify-between text-[9px] font-medium text-gray-400">
                            <span>Edge Softness / Shadow</span>
                            <span className="text-cyan-400 font-bold">{chromaShadow}%</span>
                          </div>
                          <input 
                            type="range" min="0" max="100" value={chromaShadow} 
                            onChange={(e) => setChromaShadow(parseInt(e.target.value))}
                            className="w-full accent-cyan-400 h-1 bg-black rounded"
                          />
                        </div>
                      </div>
                    )}
                  </div>
  
                  <div className="bg-[#11121a] border border-white/5 rounded-xl p-3 flex items-center justify-between group hover:border-cyan-500/20 transition-all">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded bg-cyan-500/10 flex items-center justify-center text-xs">🧠</div>
                      <div>
                        <p className="text-[10px] font-bold text-gray-200">One-Click Auto Cutout</p>
                        <p className="text-[8px] text-gray-500">AI separates subject automatically without key colors</p>
                      </div>
                    </div>
                    <button 
                      onClick={() => showToast('✨ Extracting portrait cutout with local neural network...')}
                      className="text-[8.5px] border border-cyan-400/30 hover:border-cyan-400 hover:text-cyan-400 bg-cyan-400/5 px-2.5 py-1 rounded font-bold cursor-pointer uppercase transition-all"
                    >
                      Run Auto
                    </button>
                  </div>
                </div>
              )}
  
              {/* TAB 3: MASK (Mask overlay) */}
              {videoTab === 'mask' && (
                <div className="space-y-4" id="video_tab_mask">
                  <div className="bg-black/10 border border-white/[0.02] p-3 rounded-xl space-y-2">
                    <span className="text-[10px] uppercase font-black text-gray-400 tracking-wider block">Mask Shape Selection</span>
                    
                    {/* Grid of mask types */}
                    <div className="grid grid-cols-4 gap-1.5" id="mask_types_grid">
                      {[
                        { id: 'none', label: 'None', icon: '🚫' },
                        { id: 'linear', label: 'Linear', icon: '➖' },
                        { id: 'circle', label: 'Circle', icon: '⚪' },
                        { id: 'rectangle', label: 'Rectangle', icon: '⬜' }
                      ].map(mask => (
                        <button
                          key={mask.id}
                          onClick={() => {
                            setActiveMask(mask.id as any);
                            showToast(`🎭 Applied ${mask.label} Video Mask filter`);
                          }}
                          className={`py-2 rounded-lg flex flex-col items-center justify-center border transition-all cursor-pointer ${
                            activeMask === mask.id 
                              ? 'bg-cyan-500/10 border-cyan-400 text-cyan-300 font-bold' 
                              : 'bg-black/20 border-white/5 text-gray-400 hover:text-white hover:bg-black/30'
                          }`}
                        >
                          <span className="text-sm mb-1">{mask.icon}</span>
                          <span className="text-[8px] uppercase tracking-wide">{mask.label}</span>
                        </button>
                      ))}
                    </div>
  
                    {activeMask !== 'none' && (
                      <div className="space-y-3 pt-3 border-t border-white/5 animate-fadeIn">
                        {/* Feather Slider */}
                        <div className="space-y-1">
                          <div className="flex justify-between text-[9px] font-medium text-gray-400">
                            <span>Mask Feather (Blur edges)</span>
                            <span className="text-cyan-400 font-bold">{maskFeather}px</span>
                          </div>
                          <input 
                            type="range" min="0" max="100" value={maskFeather} 
                            onChange={(e) => setMaskFeather(parseInt(e.target.value))}
                            className="w-full accent-cyan-400 h-1 bg-black rounded"
                          />
                        </div>
  
                        {/* Width/Height Sliders */}
                        {activeMask !== 'linear' && (
                          <>
                            <div className="space-y-1">
                              <div className="flex justify-between text-[9px] font-medium text-gray-400">
                                <span>Mask Width</span>
                                <span className="text-cyan-400 font-bold">{maskWidth}%</span>
                              </div>
                              <input 
                                type="range" min="10" max="200" value={maskWidth} 
                                onChange={(e) => setMaskWidth(parseInt(e.target.value))}
                                className="w-full accent-cyan-400 h-1 bg-black rounded"
                              />
                            </div>
  
                            <div className="space-y-1">
                              <div className="flex justify-between text-[9px] font-medium text-gray-400">
                                <span>Mask Height</span>
                                <span className="text-cyan-400 font-bold">{maskHeight}%</span>
                              </div>
                              <input 
                                type="range" min="10" max="200" value={maskHeight} 
                                onChange={(e) => setMaskHeight(parseInt(e.target.value))}
                                className="w-full accent-cyan-400 h-1 bg-black rounded"
                              />
                            </div>
                          </>
                        )}
  
                        {/* Rotation Slider */}
                        <div className="space-y-1">
                          <div className="flex justify-between text-[9px] font-medium text-gray-400">
                            <span>Mask Rotation Angle</span>
                            <span className="text-cyan-400 font-bold">{maskRotation}°</span>
                          </div>
                          <input 
                            type="range" min="0" max="360" value={maskRotation} 
                            onChange={(e) => setMaskRotation(parseInt(e.target.value))}
                            className="w-full accent-cyan-400 h-1 bg-black rounded"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
  
              {/* TAB 4: ANIMATION (In / Out / Combo presets with search & cards grid) */}
              {videoTab === 'animation' && (
                <div className="space-y-3" id="video_tab_animation">
                  {/* Search Animations Box */}
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-gray-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
                    <input 
                      type="text" 
                      placeholder="Search transition effects..."
                      value={animSearch}
                      onChange={(e) => setAnimSearch(e.target.value)}
                      className="w-full bg-[#111218] border border-white/5 rounded-lg pl-8 pr-3 py-1.5 text-[9.5px] text-white focus:outline-none focus:ring-1 focus:ring-cyan-400/50"
                    />
                  </div>
  
                  {/* Sub-tabs inside animation: In / Out / Combo */}
                  <div className="flex gap-1 bg-black/40 p-1 rounded-lg border border-white/5">
                    {(['in', 'out', 'combo'] as const).map((cat) => {
                      const labelMap = { in: 'In (Entrance)', out: 'Out (Exit)', combo: 'Combo Loop' };
                      return (
                        <button
                          key={cat}
                          onClick={() => setAnimCategory(cat)}
                          className={`flex-1 py-1 text-[8.5px] font-bold rounded uppercase transition-all cursor-pointer ${
                            animCategory === cat 
                              ? 'bg-cyan-500/20 text-cyan-400' 
                              : 'text-gray-500 hover:text-white'
                          }`}
                        >
                          {labelMap[cat]}
                        </button>
                      );
                    })}
                  </div>
  
                  {/* Duration Slider */}
                  <div className="bg-black/10 border border-white/[0.02] p-2.5 rounded-xl space-y-1">
                    <div className="flex justify-between text-[9px] font-medium text-gray-400">
                      <span>Animation Duration</span>
                      <span className="text-cyan-400 font-bold">1.0s</span>
                    </div>
                    <input 
                      type="range" min="0.1" max="5.0" step="0.1" defaultValue="1.0"
                      onChange={(e) => {
                        updateNodesProperty(selectedNodeIds, 'properties.animationDuration', parseFloat(e.target.value));
                      }}
                      className="w-full accent-cyan-400 h-1 bg-black rounded"
                    />
                  </div>
  
                  {/* Scrollable grid cards */}
                  <div className="grid grid-cols-2 gap-2 max-h-[160px] overflow-y-auto custom-scrollbar pr-1" id="animation_cards_grid">
                    {videoAnimations
                      .filter(anim => anim.type === animCategory && anim.name.toLowerCase().includes(animSearch.toLowerCase()))
                      .map((anim) => {
                        const isActive = activeNode.properties.animationPreset === anim.id;
                        return (
                          <button
                            key={anim.id}
                            id={`anim_preset_card_${anim.id}`}
                            onClick={() => {
                              updateNodesProperty(selectedNodeIds, 'properties.animationPreset', anim.id);
                              showToast(`🎬 Set Entrance Motion: ${anim.name}`);
                            }}
                            className={`bg-[#111218] border rounded-xl p-2.5 text-left hover:bg-[#151722] transition-all cursor-pointer relative group ${
                              isActive ? 'border-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.2)]' : 'border-white/5'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <span className="text-lg bg-black/30 w-7 h-7 rounded-lg flex items-center justify-center">{anim.thumbnail}</span>
                              <div className="min-w-0">
                                <p className="text-[10px] font-bold text-gray-200 truncate group-hover:text-cyan-400 transition-colors">{anim.name}</p>
                                <p className="text-[8px] text-gray-500 mt-0.5">{anim.duration}s preset</p>
                              </div>
                            </div>
                          </button>
                        );
                      })}
                  </div>
                </div>
              )}
  
            </div>
          );
};
