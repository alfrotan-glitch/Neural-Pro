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

export const AudioInspectorPanel: React.FC = () => {
  const {
    activeNode, tracks, selectedNodeIds, trackType, currentTime,
    updateNodeProperty, updateNodesProperty, setSelectedNodeIds, setCurrentTime, showToast,
    videoTab, setVideoTab, uniformScale, setUniformScale, chromaEnabled, setChromaEnabled, chromaColor, setChromaColor, chromaIntensity, setChromaIntensity, chromaShadow, setChromaShadow, activeMask, setActiveMask, maskFeather, setMaskFeather, maskWidth, setMaskWidth, maskHeight, setMaskHeight, maskRotation, setMaskRotation, animCategory, setAnimCategory, animSearch, setAnimSearch, videoAnimations, handleAlign,
    audioTab, setAudioTab, eqLow, setEqLow, eqMid, setEqMid, eqHigh, setEqHigh, activeVoiceFx, setActiveVoiceFx, translateLang, setTranslateLang, selectedVoice, setSelectedVoice,
    textTab, setTextTab, templateCategory, setTemplateCategory, captionSearch, setCaptionSearch, isTranslating, setIsTranslating, isTTSGenerating, setIsTTSGenerating, isGeneratingCaptions, setIsGeneratingCaptions, isRefiningCaptions, setIsRefiningCaptions, captionPrompt, setCaptionPrompt, applyScope, setApplyScope, restorePunctuation, setRestorePunctuation, grammarPrompt, setGrammarPrompt, grammarPreset, setGrammarPreset, typographyPresets, customPresets, setCustomPresets, getSubtitlesList, handleAutoCaptionGenerate, handleSrtUpload, handleSrtExport, handleAiRefine, handleAddNewCaption, textColorInputRef, activeColorInputRef, bgInputRef
  } = useInspectorController();

          const volume = activeNode.properties.levelDb ?? 0;
          const fadeIn = activeNode.properties.fadeIn ?? 0;
          const fadeOut = activeNode.properties.fadeOut ?? 0;
        const noiseReduction = activeNode.properties.noiseReduction ?? false;
        const enhanceVoice = activeNode.properties.enhanceVoice ?? false;
        const normalize = activeNode.properties.normalize ?? false;
        const audioTranslator = activeNode.properties.audioTranslator ?? false;
        const separateAudio = activeNode.properties.separateAudio ?? false;

          return (
            <div className="space-y-4" id="audio_inspector_panel">
              <UniversalTransformControls id="audio_universal_transform" />

              {/* Top 3 Tab Headers */}
              <div className="flex bg-[#11121a] p-1 rounded-lg border border-white/5" id="audio_tabs_header">
                {(['basic', 'voice_fx', 'equalizer'] as const).map((tab) => {
                  const labelMap = {
                    basic: 'Volume & Processing',
                    voice_fx: 'Voice Changer',
                    equalizer: 'Equalizer'
                  };
                  return (
                    <button
                      key={tab}
                      id={`audio_tab_btn_${tab}`}
                      onClick={() => setAudioTab(tab)}
                      className={`flex-1 py-1 text-[9.5px] font-bold rounded-md transition-all cursor-pointer capitalize ${
                        audioTab === tab 
                          ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-400/20' 
                          : 'text-gray-400 hover:text-white'
                      }`}
                    >
                      {labelMap[tab]}
                    </button>
                  );
                })}
              </div>
  
              {/* TAB 1: BASIC (Volume DB, Soft Fades, Audio Processing switches) */}
              {audioTab === 'basic' && (
                <div className="space-y-3" id="audio_tab_basic_content">
                  
                  {/* Volume db gain */}
                  <SliderRow 
                    label="Volume / Gain" 
                    value={volume} 
                    min={-60} 
                    max={12} 
                    unit=" dB"
                    icon={Volume2}
                    onChange={(v) => updateNodesProperty(selectedNodeIds, 'properties.levelDb', v)}
                    onReset={() => updateNodesProperty(selectedNodeIds, 'properties.levelDb', 0)}
                  />
  
                  {/* Soft Fades (Fade In / Fade Out) */}
                  <div className="grid grid-cols-2 gap-2" id="fade_sliders_wrapper">
                    <div className="bg-black/10 border border-white/[0.02] p-2 rounded-xl space-y-1">
                      <div className="flex justify-between text-[9px] font-medium text-gray-400">
                        <span>Fade In</span>
                        <span className="text-cyan-400 font-bold">{fadeIn}s</span>
                      </div>
                      <input 
                        type="range" min="0" max="10" step="0.1" value={fadeIn}
                        onChange={(e) => updateNodesProperty(selectedNodeIds, 'properties.fadeIn', parseFloat(e.target.value))}
                        className="w-full accent-cyan-400 h-1 bg-black rounded"
                      />
                    </div>
  
                    <div className="bg-black/10 border border-white/[0.02] p-2 rounded-xl space-y-1">
                      <div className="flex justify-between text-[9px] font-medium text-gray-400">
                        <span>Fade Out</span>
                        <span className="text-cyan-400 font-bold">{fadeOut}s</span>
                      </div>
                      <input 
                        type="range" min="0" max="10" step="0.1" value={fadeOut}
                        onChange={(e) => updateNodesProperty(selectedNodeIds, 'properties.fadeOut', parseFloat(e.target.value))}
                        className="w-full accent-cyan-400 h-1 bg-black rounded"
                      />
                    </div>
                  </div>
  
                  {/* Audio Processing features */}
                  <div className="space-y-2 pt-2 border-t border-white/[0.04]" id="audio_processing_section">
                    <span className="text-[10px] uppercase font-black text-gray-400 tracking-wider block">Intelligent Audio Processing</span>
  
                    <ToggleRow 
                      label="Loudness Normalization" 
                      description="Standardize dialogue track gain level output to industry standard -14 LUFS."
                      value={normalize}
                      icon={Shield}
                      onChange={(v) => updateNodesProperty(selectedNodeIds, 'properties.normalize', v)}
                    />
  
                    <ToggleRow 
                      label="Voice Enhance & Clarify" 
                      description="Boost high-mid speech frequency ranges to make vocals crispy clear."
                      value={enhanceVoice}
                      icon={Sparkle}
                      onChange={(v) => updateNodesProperty(selectedNodeIds, 'properties.enhanceVoice', v)}
                    />
  
                    <ToggleRow 
                      label="Noise Reduction Filter" 
                      description="Eliminate ambient mic hums, ventilation buzz and environmental noise."
                      value={noiseReduction}
                      icon={Wand2}
                      onChange={(v) => updateNodesProperty(selectedNodeIds, 'properties.noiseReduction', v)}
                    />
  
                    <ToggleRow 
                      label="AI Audio Translator" 
                      description="Translate vocal dialogue on-the-fly and generate a matching translation voice."
                      value={audioTranslator}
                      icon={Languages}
                      onChange={(v) => updateNodesProperty(selectedNodeIds, 'properties.audioTranslator', v)}
                    />
  
                    {audioTranslator && (
                      <div className="animate-fadeIn ml-6 pl-3 border-l border-white/10 space-y-2">
                        <span className="text-[9px] font-bold text-gray-500 uppercase">Target Translation Language</span>
                        <div className="flex gap-1.5">
                          {[
                            { val: 'es', label: 'Spanish' },
                            { val: 'fa', label: 'Persian' },
                            { val: 'fr', label: 'French' }
                          ].map(lang => (
                            <button
                              key={lang.val}
                              onClick={() => {
                                setTranslateLang(lang.val);
                                showToast(`🌐 Switched audio translation target: ${lang.label}`);
                              }}
                              className={`flex-1 py-1 rounded text-[9px] font-bold border transition-all cursor-pointer ${
                                translateLang === lang.val 
                                  ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20' 
                                  : 'bg-black/20 border-white/5 text-gray-400 hover:text-white'
                              }`}
                            >
                              {lang.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
  
                    <ToggleRow 
                      label="Acoustic Voice Separator" 
                      description="Split and isolate vocal dialogue lines separate from ambient backgrounds."
                      value={separateAudio}
                      icon={Layers}
                      onChange={(v) => updateNodesProperty(selectedNodeIds, 'properties.separateAudio', v)}
                    />
  
                    {separateAudio && (
                      <div className="animate-fadeIn ml-6 pl-3 border-l border-white/10 flex gap-2">
                        <button 
                          onClick={() => showToast('🎙️ Isolate Vocals: keeping dialog elements intact')}
                          className="flex-1 py-1 bg-[#111218] hover:bg-cyan-500/10 hover:text-cyan-400 border border-white/10 text-[9px] font-bold rounded transition-all cursor-pointer"
                        >
                          🎙️ Isolate Vocals
                        </button>
                        <button 
                          onClick={() => showToast('🎸 Isolate Instrumental: muting active vocals')}
                          className="flex-1 py-1 bg-[#111218] hover:bg-cyan-500/10 hover:text-cyan-400 border border-white/10 text-[9px] font-bold rounded transition-all cursor-pointer"
                        >
                          🎸 Mute Dialog
                        </button>
                      </div>
                    )}
                  </div>
  
                </div>
              )}
  
              {/* TAB 2: VOICE EFFECTS (Voice Changer presets) */}
              {audioTab === 'voice_fx' && (
                <div className="space-y-3 animate-fadeIn" id="audio_tab_voice_changer">
                  <span className="text-[10px] uppercase font-black text-gray-400 tracking-wider block">Voice Changer Filters</span>
                  
                  <div className="grid grid-cols-2 gap-2" id="voice_presets_grid">
                    {[
                      { id: 'none', name: 'Original Tone', desc: 'No voice effects active', icon: '🎤' },
                      { id: 'deep', name: 'Deep Voice Bass', desc: 'Adds rich low frequencies', icon: '🧔' },
                      { id: 'helium', name: 'Helium Squeak', desc: 'Boosts vocal pitches high', icon: '🎈' },
                      { id: 'robot', name: 'Futuristic Robot', desc: 'Adds cold metallic vocoder', icon: '🤖' },
                      { id: 'reverb', name: 'Starlight Reverb', desc: 'Simulates cathedral halls', icon: '🏰' },
                      { id: 'monster', name: 'Beastly Growl', desc: 'Adds thick beast growling', icon: '👿' },
                      { id: 'radio', name: 'Vintage Radio', desc: 'Simulates telephone radio', icon: '📻' },
                      { id: 'megaphone', name: 'Direct Megaphone', desc: 'Loud voice shout filter', icon: '📢' },
                    ].map((vox) => {
                      const isActive = activeVoiceFx === vox.id;
                      return (
                        <button
                          key={vox.id}
                          onClick={() => {
                            setActiveVoiceFx(vox.id);
                            showToast(`🔊 Applied Voice Presets: ${vox.name}`);
                          }}
                          className={`bg-[#111218] border rounded-xl p-2.5 text-left hover:bg-[#151722] transition-all cursor-pointer flex gap-2 items-center group relative ${
                            isActive ? 'border-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.2)]' : 'border-white/5'
                          }`}
                        >
                          <span className="text-xl bg-black/30 w-7 h-7 rounded-lg flex items-center justify-center shrink-0">{vox.icon}</span>
                          <div className="min-w-0">
                            <p className="text-[10px] font-bold text-gray-200 truncate group-hover:text-cyan-400 transition-colors">{vox.name}</p>
                            <p className="text-[8px] text-gray-500 truncate leading-relaxed mt-0.5">{vox.desc}</p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
  
              {/* TAB 3: EQUALIZER (Graphic EQ Sliders and visual spectrum) */}
              {audioTab === 'equalizer' && (
                <div className="space-y-4 animate-fadeIn" id="audio_tab_equalizer">
                  
                  {/* Visual Spectrogram Waveform animation simulation */}
                  <div className="bg-black/40 border border-white/5 rounded-xl p-4 flex items-end justify-center gap-1.5 h-16 relative overflow-hidden">
                    <div className="absolute top-2 left-2 flex items-center gap-1">
                      <Activity className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
                      <span className="text-[8px] font-bold text-gray-500 uppercase tracking-widest font-mono">Real-time DB Spectrum</span>
                    </div>
                    {[20, 45, 78, 32, 90, 60, 15, 80, 52, 38, 70, 42, 65, 85, 20, 40].map((height, i) => (
                      <div 
                        key={i} 
                        className="w-1.5 bg-gradient-to-t from-cyan-600 to-cyan-400 rounded-t"
                        style={{ 
                          height: `${Math.max(10, Math.min(100, height + (eqLow * 0.5) + (eqMid * 0.3) + (eqHigh * 0.2)))}%`,
                          animation: `pulse 1.2s infinite ease-in-out ${i * 0.08}s` 
                        }}
                      />
                    ))}
                  </div>
  
                  {/* 3 Band EQ Sliders */}
                  <div className="space-y-3" id="eq_sliders_wrapper">
                    <span className="text-[10px] uppercase font-black text-gray-400 tracking-wider block">3-Band Equalizer</span>
  
                    {/* Low Bass */}
                    <div className="space-y-1">
                      <div className="flex justify-between text-[9px] font-medium text-gray-400">
                        <span>Low (Bass Boost)</span>
                        <span className={`font-mono font-bold ${eqLow !== 0 ? 'text-cyan-400' : ''}`}>{eqLow > 0 ? `+${eqLow}` : eqLow}dB</span>
                      </div>
                      <input 
                        type="range" min="-15" max="15" value={eqLow} 
                        onChange={(e) => setEqLow(parseInt(e.target.value))}
                        className="w-full accent-cyan-400 h-1 bg-black rounded"
                      />
                    </div>
  
                    {/* Mid Frequency */}
                    <div className="space-y-1">
                      <div className="flex justify-between text-[9px] font-medium text-gray-400">
                        <span>Mid (Dialogue Focus)</span>
                        <span className={`font-mono font-bold ${eqMid !== 0 ? 'text-cyan-400' : ''}`}>{eqMid > 0 ? `+${eqMid}` : eqMid}dB</span>
                      </div>
                      <input 
                        type="range" min="-15" max="15" value={eqMid} 
                        onChange={(e) => setEqMid(parseInt(e.target.value))}
                        className="w-full accent-cyan-400 h-1 bg-black rounded"
                      />
                    </div>
  
                    {/* High Treble */}
                    <div className="space-y-1">
                      <div className="flex justify-between text-[9px] font-medium text-gray-400">
                        <span>High (Vocal Air)</span>
                        <span className={`font-mono font-bold ${eqHigh !== 0 ? 'text-cyan-400' : ''}`}>{eqHigh > 0 ? `+${eqHigh}` : eqHigh}dB</span>
                      </div>
                      <input 
                        type="range" min="-15" max="15" value={eqHigh} 
                        onChange={(e) => setEqHigh(parseInt(e.target.value))}
                        className="w-full accent-cyan-400 h-1 bg-black rounded"
                      />
                    </div>
  
                    {/* EQ controls reset */}
                    <button 
                      onClick={() => {
                        setEqLow(0);
                        setEqMid(0);
                        setEqHigh(0);
                        showToast('🧹 Cleaned Equalizer curves');
                      }}
                      className="w-full py-1.5 rounded bg-white/5 hover:bg-white/10 text-[9px] font-bold text-gray-400 hover:text-white transition-all cursor-pointer uppercase tracking-wider"
                    >
                      Reset Equalizer Curves
                    </button>
                  </div>
                </div>
              )}
  
            </div>
          );
};
