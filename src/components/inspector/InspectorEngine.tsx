import React, { useState, useEffect } from 'react';
import { useProjectStore } from '../../store/useProjectStore';
import { createTrackSnapshotCommand } from '../../features/video-studio/project/commands';
import { createDedicatedTimelineTrack, smartInsertClip } from '../../features/video-studio/project/services/projectService';
import { normalizeCaptionTheme, resolveCaptionImportTheme, normalizeCaptionTiming } from '../../features/video-studio/captions/services/captionImportService';
import { parseCaptionTimestamp, secondsToFrameTimecode } from '../../features/video-studio/captions/services/captionTimecodeService';
import { getProjectFps } from '../../features/video-studio/captions/services/captionProjectFps';
import { runCaptions } from '../../app/workflows/captions/runCaptionsWorkflow';
import { getAiGateway } from '../../infra/ai/HttpAiGateway';
import { toAppError } from '../../domain/errors/appError';
import { importSrtFile } from '../../features/video-studio/captions/services/srtImporter';
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
import { InspectorProvider, InspectorController, CustomTextPreset } from './InspectorController';
import { VideoInspectorPanel } from './panels/VideoInspectorPanel';
import { AudioInspectorPanel } from './panels/AudioInspectorPanel';
import { TextInspectorPanel } from './panels/TextInspectorPanel';
import { VisualElementInspectorPanel } from './panels/VisualElementInspectorPanel';


export const InspectorEngine: React.FC = () => {
  const { 
    selectedNodeIds, 
    setSelectedNodeIds,
    tracks, 
    updateNodeProperty, 
    updateNodesProperty,
    executeCommand,
    totalDuration, 
    timelineZoom, 
    currentTime, 
    setCurrentTime,
    showToast 
  } = useProjectStore();

  const textColorInputRef = React.useRef<HTMLInputElement>(null);
  const activeColorInputRef = React.useRef<HTMLInputElement>(null);
  const bgInputRef = React.useRef<HTMLInputElement>(null);

  // Selected tab states per node type
  const [videoTab, setVideoTab] = useState<'basic' | 'remove_bg' | 'mask' | 'animation'>('basic');
  const [audioTab, setAudioTab] = useState<'basic' | 'voice_fx' | 'equalizer'>('basic');
  const [textTab, setTextTab] = useState<'captions' | 'text_style' | 'templates' | 'advanced'>('text_style');
  const [templateCategory, setTemplateCategory] = useState<string>('all');

  // Animation category and search inside Video Tab -> Animation
  const [animCategory, setAnimCategory] = useState<'in' | 'out' | 'combo'>('in');
  const [animSearch, setAnimSearch] = useState<string>('');

  // Captions filter and search inside Text Tab -> Captions
  const [captionSearch, setCaptionSearch] = useState<string>('');
  const [isTranslating, setIsTranslating] = useState<boolean>(false);
  const [isTTSGenerating, setIsTTSGenerating] = useState<boolean>(false);
  const [selectedVoice, setSelectedVoice] = useState<string>('sweet_girl');
  const [isGeneratingCaptions, setIsGeneratingCaptions] = useState<boolean>(false);
  const [isRefiningCaptions, setIsRefiningCaptions] = useState<boolean>(false);
  const [captionPrompt, setCaptionPrompt] = useState<string>('');

  // Equalizer states
  const [eqLow, setEqLow] = useState<number>(0);
  const [eqMid, setEqMid] = useState<number>(0);
  const [eqHigh, setEqHigh] = useState<number>(0);

  // Mask State inside Video -> Mask
  const [activeMask, setActiveMask] = useState<'none' | 'linear' | 'circle' | 'rectangle'>('none');
  const [maskFeather, setMaskFeather] = useState<number>(10);
  const [maskWidth, setMaskWidth] = useState<number>(100);
  const [maskHeight, setMaskHeight] = useState<number>(100);
  const [maskRotation, setMaskRotation] = useState<number>(0);

  // Spacing & Global Scope states
  const [applyScope, setApplyScope] = useState<'single' | 'all'>('single');
  
  // AI Grammar & Punctuation refinement settings states
  const [restorePunctuation, setRestorePunctuation] = useState<boolean>(true);
  const [grammarPrompt, setGrammarPrompt] = useState<string>('');
  const [grammarPreset, setGrammarPreset] = useState<string>('standard');

  // Chroma Key State inside Video -> Remove BG
  const [chromaEnabled, setChromaEnabled] = useState<boolean>(false);
  const [chromaColor, setChromaColor] = useState<string>('#00ff00');
  const [chromaIntensity, setChromaIntensity] = useState<number>(50);
  const [chromaShadow, setChromaShadow] = useState<number>(50);

  // Uniform scale lock state
  const [uniformScale, setUniformScale] = useState<boolean>(true);

  // Audio translator language selection
  const [translateLang, setTranslateLang] = useState<string>('es');

  // Voice changer active preset
  const [activeVoiceFx, setActiveVoiceFx] = useState<string>('none');

  // Load custom presets from localStorage on mount
  const [customPresets, setCustomPresets] = useState<CustomTextPreset[]>(() => {
    try {
      const saved = localStorage.getItem('video_studio_custom_text_presets');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const selectedPrimaryClipId = selectedNodeIds[0];
  // Reset tab settings when selection change
  useEffect(() => {
    setVideoTab('basic');
    setAudioTab('basic');
    setTextTab('text_style');
  }, [selectedPrimaryClipId]);

  useEffect(() => {
    const onOpenEffects = (event: Event) => {
      const detail = (event as CustomEvent<{ clipIds?: string[] }>).detail;
      const clipId = detail?.clipIds?.[0];
      if (!clipId || !selectedNodeIds.includes(clipId)) return;

      const activeTrack = tracks.find((track) =>
        track.clips.some((clip) => clip.id === clipId),
      );

      if (!activeTrack) return;

      if (activeTrack.type === 'video') {
        setVideoTab('animation');
      } else if (activeTrack.type === 'audio') {
        setAudioTab('voice_fx');
      } else if (activeTrack.type === 'text') {
        setTextTab('advanced');
      }
    };

    window.addEventListener('video-studio:timeline:edit-effects', onOpenEffects);
    return () => {
      window.removeEventListener('video-studio:timeline:edit-effects', onOpenEffects);
    };
  }, [selectedNodeIds, tracks]);

  // If no element is selected, render the Global Project Metadata Control Center
  if (selectedNodeIds.length === 0) {
    const videoClipsCount = tracks.filter(t => t.type === 'video').reduce((acc, t) => acc + t.clips.length, 0);
    const audioClipsCount = tracks.filter(t => t.type === 'audio').reduce((acc, t) => acc + t.clips.length, 0);
    const textClipsCount = tracks.filter(t => t.type === 'text').reduce((acc, t) => acc + t.clips.length, 0);

    return (
      <div className="flex flex-col h-full bg-[#06070a] text-gray-200 overflow-y-auto custom-scrollbar p-5" id="inspector_empty_state">
        <div className="flex items-center gap-2.5 mb-5 border-b border-white/5 pb-4">
          <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 shrink-0">
            <Settings className="w-4 h-4 animate-spin-slow" />
          </div>
          <div>
            <h2 className="text-xs font-bold text-gray-100 uppercase tracking-widest">Global Pipeline</h2>
            <p className="text-[8px] text-gray-500 mt-0.5 uppercase tracking-wider font-bold">Active Project Engine</p>
          </div>
        </div>

        {/* Project Spec Card */}
        <div className="bg-[#11121a] border border-white/5 rounded-xl p-4 mb-5 space-y-3.5 shadow-xl">
          <div>
            <label className="text-[9px] uppercase tracking-wider font-extrabold text-gray-400">Current Title</label>
            <div className="mt-1 bg-[#08090d] border border-white/5 rounded-lg px-3 py-2 text-xs font-semibold text-gray-200">
              Croissant Masterclass Recipe
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3.5">
            <div>
              <span className="text-[9px] uppercase tracking-wider font-bold text-gray-500 block">Sequence aspect</span>
              <span className="text-xs font-mono font-bold text-gray-200 mt-1 block">1920 × 1080 <span className="text-[10px] text-gray-500 font-sans font-semibold">(16:9)</span></span>
            </div>
            <div>
              <span className="text-[9px] uppercase tracking-wider font-bold text-gray-500 block">Render fps</span>
              <span className="text-xs font-mono font-bold text-gray-200 mt-1 block">30.00 FPS</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3.5 pt-2.5 border-t border-white/[0.03]">
            <div>
              <span className="text-[9px] uppercase tracking-wider font-bold text-gray-500 block">Length duration</span>
              <span className="text-xs font-mono font-bold text-cyan-400 mt-1 block">{totalDuration.toFixed(2)}s</span>
            </div>
            <div>
              <span className="text-[9px] uppercase tracking-wider font-bold text-gray-500 block">Timeline Zoom</span>
              <span className="text-xs font-mono font-bold text-gray-200 mt-1 block">{Math.round(timelineZoom * 100)}%</span>
            </div>
          </div>
        </div>

        {/* Workspace Analytics */}
        <div className="space-y-2.5">
          <h3 className="text-[9px] uppercase tracking-widest font-extrabold text-gray-400">Composition Overview</h3>
          
          <div className="grid grid-cols-1 gap-2">
            <div className="flex items-center justify-between bg-black/20 border border-white/5 rounded-xl p-3">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-xs">🎬</div>
                <span className="text-[11px] font-bold text-gray-300">Video Tracks</span>
              </div>
              <span className="text-xs font-mono font-bold bg-[#11121a] px-2.5 py-1 rounded-md border border-white/5">{videoClipsCount} clips</span>
            </div>

            <div className="flex items-center justify-between bg-black/20 border border-white/5 rounded-xl p-3">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-xs">🎵</div>
                <span className="text-[11px] font-bold text-gray-300">Audio Tracks</span>
              </div>
              <span className="text-xs font-mono font-bold bg-[#11121a] px-2.5 py-1 rounded-md border border-white/5">{audioClipsCount} clips</span>
            </div>

            <div className="flex items-center justify-between bg-black/20 border border-white/5 rounded-xl p-3">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-xs">💬</div>
                <span className="text-[11px] font-bold text-gray-300">Text & Overlays</span>
              </div>
              <span className="text-xs font-mono font-bold bg-[#11121a] px-2.5 py-1 rounded-md border border-white/5">{textClipsCount} clips</span>
            </div>
          </div>
        </div>

        <div className="mt-auto pt-6 border-t border-white/5 flex flex-col items-center justify-center text-center">
          <Film className="w-5 h-5 text-gray-700 mb-1.5 animate-pulse" />
          <span className="text-[9px] font-bold text-gray-500 uppercase tracking-wide">Select an element to adjust properties</span>
        </div>
      </div>
    );
  }

  // Find active selected clip
  const activeNode = tracks.flatMap(t => t.clips).find(c => c.id === selectedNodeIds[0]);
  if (!activeNode) return null;

  // Retrieve track type of active clip
  const trackType = tracks.find(t => t.clips.some(c => c.id === activeNode.id))?.type;
  if (!trackType) return null;

  // Subtitle items generator
  const getSubtitlesList = () => {
    // Find all text tracks and extract their clips
    const textTrack = tracks.find(t => t.type === 'text');
    if (textTrack && textTrack.clips.length > 0) {
      // Sort clips chronologically by their starting times
      const sortedClips = [...textTrack.clips].sort((a, b) => a.startAt - b.startAt);
      // Display timecodes use the real project frame rate; when the project has
      // no usable fps we show milliseconds instead of inventing frames (D-022).
      const projectFps = useProjectStore.getState().metadata?.fps;
      const hasValidFps = typeof projectFps === 'number' && Number.isFinite(projectFps) && projectFps > 0 && projectFps <= 120;
      return sortedClips.map((clip) => {
        const startSec = clip.startAt;
        const m = Math.floor((startSec % 3600) / 60);
        const s = Math.floor(startSec % 60);
        const pad = (n: number) => n.toString().padStart(2, '0');
        const frameStr = hasValidFps
          ? `${pad(m)}:${pad(s)}:${secondsToFrameTimecode(startSec, projectFps).split(':')[3] ?? '00'}`
          : `${pad(m)}:${pad(s)}.${String(Math.floor((startSec % 1) * 1000)).padStart(3, '0')}`;
        
        return {
          id: clip.id,
          frame: frameStr,
          text: clip.properties.textContent || clip.properties.name || 'Untitled Clip',
          duration: clip.duration,
          start: startSec
        };
      });
    }

    // Fallback static list if no clips exist
    return [
      { id: 'cap1', frame: '00:02:00', text: 'How to Bake the Perfect Croissant 🥐', duration: 8.0, start: 2.0 },
      { id: 'cap2', frame: '00:12:01', text: "Noticing means paying attention.", duration: 4.15, start: 12.05 },
      { id: 'cap3', frame: '00:18:15', text: 'Stirring the buttery batter slowly in the bowl...', duration: 5.20, start: 18.50 },
      { id: 'cap4', frame: '00:24:00', text: 'Letting the yeast activate inside a warm environment.', duration: 4.50, start: 24.00 },
      { id: 'cap5', frame: '00:30:15', text: 'Perfect golden crust layers crispy and warm.', duration: 6.00, start: 30.50 }
    ];
  };

  // Preset typography lists
  const typographyPresets = [
    { name: 'Default White', color: '#ffffff', outlineColor: 'transparent', bgColor: 'transparent', size: 24, font: 'Inter', bold: false, styleId: 'pr1' },
    { name: 'Yellow Highlight', color: '#ffff00', outlineColor: '#000000', bgColor: 'transparent', size: 26, font: 'Inter', bold: true, styleId: 'pr2' },
    { name: 'Minimalist Label', color: '#ffffff', outlineColor: 'transparent', bgColor: '#000000cc', size: 18, font: 'Inter', bold: false, styleId: 'pr3' },
    { name: 'Retro Neon Glow', color: '#ff007f', outlineColor: '#ff007f33', bgColor: 'transparent', size: 28, font: 'Space Grotesk', bold: true, styleId: 'pr4' },
    { name: 'Aqua Cyber Shadow', color: '#00ffff', outlineColor: '#000000', bgColor: 'transparent', size: 25, font: 'JetBrains Mono', bold: true, styleId: 'pr5' },
    { name: 'Red Action Banner', color: '#ffffff', outlineColor: '#ff0000', bgColor: '#ff000033', size: 24, font: 'Space Grotesk', bold: true, styleId: 'pr6' }
  ];

  // Video Animation collections
  const videoAnimations = [
    { id: 'anim1', name: 'Fade In', type: 'in', thumbnail: '🎚️', duration: 1.0 },
    { id: 'anim2', name: 'Zoom In Focus', type: 'in', thumbnail: '🔍', duration: 0.8 },
    { id: 'anim3', name: 'Slide Left Drift', type: 'in', thumbnail: '⬅️', duration: 1.2 },
    { id: 'anim4', name: 'Spin Reveal 360', type: 'in', thumbnail: '🔄', duration: 1.5 },
    { id: 'anim5', name: 'Fade Out Outro', type: 'out', thumbnail: '🌫️', duration: 1.0 },
    { id: 'anim6', name: 'Zoom Out Sink', type: 'out', thumbnail: '🕳️', duration: 0.7 },
    { id: 'anim7', name: 'Slide Right Wave', type: 'out', thumbnail: '➡️', duration: 1.1 },
    { id: 'anim8', name: 'Cinematic Flash Out', type: 'out', thumbnail: '⚡', duration: 0.5 },
    { id: 'anim9', name: 'Glitch Signal Flash', type: 'combo', thumbnail: '👾', duration: 2.0 },
    { id: 'anim10', name: 'Bounce Rhythm Loop', type: 'combo', thumbnail: '🏀', duration: 1.8 },
    { id: 'anim11', name: 'Elastic Pop Combo', type: 'combo', thumbnail: '💥', duration: 1.5 },
    { id: 'anim12', name: 'Heartbeat Pulse Loop', type: 'combo', thumbnail: '💓', duration: 1.6 }
  ];

  // Alignment trigger updates
  const handleAlign = (position: 'left' | 'right' | 'top' | 'bottom' | 'center') => {
    switch (position) {
      case 'left':
        updateNodesProperty(selectedNodeIds, 'transform.x', -500);
        break;
      case 'right':
        updateNodesProperty(selectedNodeIds, 'transform.x', 500);
        break;
      case 'top':
        updateNodesProperty(selectedNodeIds, 'transform.y', -300);
        break;
      case 'bottom':
        updateNodesProperty(selectedNodeIds, 'transform.y', 300);
        break;
      case 'center':
        updateNodesProperty(selectedNodeIds, 'transform.x', 0);
        updateNodesProperty(selectedNodeIds, 'transform.y', 0);
        break;
    }
    showToast(`🎯 Aligned clip position to ${position}`);
  };

  // Auto translate mock execution
  const handleAutoTranslate = () => {
    setIsTranslating(true);
    setTimeout(() => {
      setIsTranslating(false);
      showToast(`🌐 Automatically translated captions to ${translateLang === 'es' ? 'Spanish' : translateLang === 'fa' ? 'Persian' : 'French'}!`);
    }, 1500);
  };

  // TTS Voice generator mock execution
  const handleGenerateTTS = () => {
    setIsTTSGenerating(true);
    setTimeout(() => {
      setIsTTSGenerating(false);
      showToast(`🔊 Generated TTS Audio track with "${selectedVoice === 'sweet_girl' ? 'Sweet Girl' : 'Male Narrator'}" voice preset!`);
    }, 1800);
  };

  // Auto-Captioning pipeline via Gemini API
  const handleAutoCaptionGenerate = async () => {
    setIsGeneratingCaptions(true);
    showToast('⚡ Extracting timeline audio track and invoking Gemini STT pipeline...');
    try {
      const projectFps = getProjectFps();
      const generated = await runCaptions({
        source: 'generate',
        audioClipName: 'lofi_ambient_vibes.mp3',
        duration: totalDuration,
        topicPrompt: captionPrompt,
        projectFps,
      });
      const data = { captions: generated };
      if (data.captions && Array.isArray(data.captions)) {
        // Map response blocks to ClipNodes
        const newClips = data.captions.map((cap: any) => {
          const startSeconds = parseCaptionTimestamp(cap.start_time, projectFps);
          const endSeconds = parseCaptionTimestamp(cap.end_time, projectFps);
          const clipDuration = Math.max(0, parseFloat((endSeconds - startSeconds).toFixed(3)));
          
          return {
            id: cap.id,
            sourceId: 'ai_caption_source',
            startAt: startSeconds,
            duration: clipDuration,
            trim: { in: 0, out: clipDuration },
            transform: { x: 0, y: 65, scale: 100, rotation: 0, opacity: 100 },
            properties: {
              name: `Caption ${cap.id}`,
              textContent: cap.text,
              fontFamily: 'Inter',
              fontSize: 22,
              textColor: '#ffffff',
              color: 'from-pink-600 to-pink-500',
              words: cap.words || [],
              speaker: cap.speaker || 'Host A',
              captionTheme: resolveCaptionImportTheme({
                activeCaptionTheme: tracks.find((track) => track.type === 'text')?.clips.find((clip) => clip.id === selectedNodeIds[0])?.properties?.captionTheme,
                existingCaptionTheme: tracks.find((track) => track.type === 'text')?.clips.find((clip) => normalizeCaptionTheme(clip.properties?.captionTheme))?.properties?.captionTheme,
              })
            }
          };
        });

        const textTrackIndex = tracks.findIndex(t => t.type === 'text');
        if (textTrackIndex !== -1) {
          const newTracks = [...tracks];
          const textTrack = newTracks[textTrackIndex];
          if (!textTrack) {
            showToast('❌ Failed: Could not locate text caption track.');
            return;
          }
          newTracks[textTrackIndex] = {
            ...textTrack,
            clips: newClips
          };
          // Dynamically update tracks on project store directly to render on timeline
          { const project = useProjectStore.getState(); project.executeCommand(createTrackSnapshotCommand('Apply Inspector Track Changes', project.tracks, newTracks)); }
          showToast(`🎉 Generated ${newClips.length} precise auto-captions with word-level highlights!`);
        } else {
          showToast('❌ Failed: Could not locate a text caption track.');
        }
      } else {
        showToast('❌ Auto-captions generation returned an empty or invalid format.');
      }
    } catch (err: any) {
      console.error(err);
      showToast(`❌ STT Service error: ${err.message || 'connection failed'}`);
    } finally {
      setIsGeneratingCaptions(false);
    }
  };

  // Upload and parse SRT subtitle files
  const handleSrtUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    await importSrtFile(file);
    event.target.value = '';
  };

  // Export current timeline captions to an .srt file
  const handleSrtExport = async () => {
    const textTrack = tracks.find(t => t.type === 'text');
    if (!textTrack || textTrack.clips.length === 0) {
      showToast('⚠️ No timeline captions exist to export!');
      return;
    }

    const exportFps = getProjectFps();
    const captionsForApi = textTrack.clips.map(clip => {
      // Explicit project fps — no hidden 30fps default (D-022).
      const hStr = (seconds: number) => secondsToFrameTimecode(seconds, exportFps);
      
      return {
        id: clip.id,
        start_time: hStr(clip.startAt),
        end_time: hStr(clip.startAt + clip.duration),
        text: clip.properties.textContent || '',
      };
    });

    try {
      showToast('📥 Triggering SRT serialization...');
      const data = await getAiGateway().captions.exportSrt({
        captions: captionsForApi,
        projectFps: getProjectFps(),
      });
      if (data.srt) {
        // Create download blob
        const blob = new Blob([data.srt], { type: 'text/srt;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', 'project_subtitles.srt');
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.setTimeout(() => URL.revokeObjectURL(url), 0);
        showToast('📥 Downloaded project_subtitles.srt successfully!');
      } else {
        showToast('❌ Export failed: Invalid response.');
      }
    } catch (err: any) {
      console.error(err);
      showToast('❌ SRT Export failed.');
    }
  };

  // AI Refine pipeline to restore punctuation and capitalization on current captions
  const handleAiRefine = async () => {
    const textTrack = tracks.find(t => t.type === 'text');
    if (!textTrack || textTrack.clips.length === 0) {
      showToast('⚠️ No timeline captions exist to refine!');
      return;
    }

    setIsRefiningCaptions(true);
    showToast('⚡ Refining subtitles with advanced grammar & punctuation engine...');

    try {
      // Filter clips based on applyScope
      const targetClips = applyScope === 'single'
        ? textTrack.clips.filter(clip => selectedNodeIds.includes(clip.id))
        : textTrack.clips;

      if (targetClips.length === 0) {
        showToast('⚠️ Please select at least one subtitle clip to refine!');
        setIsRefiningCaptions(false);
        return;
      }

      const captionsForApi = targetClips.map(clip => {
        const words = clip.properties.words || [];
        const text = clip.properties.textContent || clip.properties.name || '';
        
        const hStr = (seconds: number) => secondsToFrameTimecode(seconds, getProjectFps());

        return {
          id: clip.id,
          start_time: hStr(clip.startAt),
          end_time: hStr(clip.startAt + clip.duration),
          text: text,
          words: words.map((w: any) => ({
            word: w.word,
            start: w.start,
            end: w.end
          }))
        };
      });

      const refineFps = getProjectFps();
      const refinedBlocks = await runCaptions({
        source: 'refine',
        captions: captionsForApi,
        grammarPrompt,
        restorePunctuation,
        projectFps: refineFps,
      });

      const data = { captions: refinedBlocks };
      if (data.captions && Array.isArray(data.captions)) {
        const refinedClips = textTrack.clips.map((clip) => {
          const cap = data.captions.find((c: any) => c.id === clip.id);
          if (!cap) return clip;

          const startSeconds = parseCaptionTimestamp(cap.start_time, refineFps);
          const endSeconds = parseCaptionTimestamp(cap.end_time, refineFps);
          const clipDuration = Math.max(0, parseFloat((endSeconds - startSeconds).toFixed(3)));

          return {
            ...clip,
            startAt: startSeconds,
            duration: clipDuration,
            trim: { in: 0, out: clipDuration },
            properties: {
              ...(clip.properties || {}),
              name: `Refined ${cap.id}`,
              textContent: cap.text,
              words: cap.words || [],
            }
          };
        });

        const textTrackIndex = tracks.findIndex(t => t.type === 'text');
        if (textTrackIndex !== -1) {
          const newTracks = [...tracks];
          const textTrack = newTracks[textTrackIndex];
          if (!textTrack) {
            showToast('❌ Failed: Could not locate text track.');
            return;
          }
          newTracks[textTrackIndex] = {
            ...textTrack,
            clips: refinedClips
          };
          { const project = useProjectStore.getState(); project.executeCommand(createTrackSnapshotCommand('Apply Inspector Track Changes', project.tracks, newTracks)); }
          showToast(`🎉 Refined ${data.captions.length} captions with strict grammatical alignment!`);
        } else {
          showToast('❌ Failed: Could not locate text track.');
        }
      } else {
        showToast('❌ AI Refine failed: Invalid response format.');
      }
    } catch (err: any) {
      console.error(err);
      showToast(`❌ AI Refine error: ${err.message || 'connection failed'}`);
    } finally {
      setIsRefiningCaptions(false);
    }
  };

  const handleAddNewCaption = () => {
    
    const newId = `custom_cap_${Date.now()}`;
    const newClip = {
      id: newId,
      sourceId: 'user_created_caption_source',
      startAt: currentTime,
      duration: 3.0,
      trim: { in: 0, out: 3.0 },
      transform: { x: 0, y: 65, scale: 100, rotation: 0, opacity: 100 },
      properties: {
        name: `Caption`,
        textContent: 'New subtitle text...',
        fontFamily: 'Inter',
        fontSize: 22,
        textColor: '#ffffff',
        color: 'from-pink-600 to-pink-500',
        words: [
          { word: 'New', start: currentTime, end: currentTime + 1.0 },
          { word: 'subtitle', start: currentTime + 1.0, end: currentTime + 2.0 },
          { word: 'text...', start: currentTime + 2.0, end: currentTime + 3.0 }
        ],
        captionTheme: 'karaoke'
      }
    };

    const { tracks: newTracks, trackId: targetTrackId } = smartInsertClip(tracks, 'caption', newClip);
    { const project = useProjectStore.getState(); project.executeCommand(createTrackSnapshotCommand('Add Caption', project.tracks, newTracks)); }
    setSelectedNodeIds([newId]);
    showToast('➕ Added new caption block at playhead!');
  };

  // Render Panel content dynamically based on selected clip type
  const inspectorController: InspectorController = {
    activeNode, tracks, selectedNodeIds, trackType, currentTime,
    updateNodeProperty, updateNodesProperty, executeCommand, setSelectedNodeIds, setCurrentTime, showToast,
    videoTab, setVideoTab, uniformScale, setUniformScale, chromaEnabled, setChromaEnabled, chromaColor, setChromaColor, chromaIntensity, setChromaIntensity, chromaShadow, setChromaShadow, activeMask, setActiveMask, maskFeather, setMaskFeather, maskWidth, setMaskWidth, maskHeight, setMaskHeight, maskRotation, setMaskRotation, animCategory, setAnimCategory, animSearch, setAnimSearch, videoAnimations, handleAlign,
    audioTab, setAudioTab, eqLow, setEqLow, eqMid, setEqMid, eqHigh, setEqHigh, activeVoiceFx, setActiveVoiceFx, translateLang, setTranslateLang, selectedVoice, setSelectedVoice,
    textTab, setTextTab, templateCategory, setTemplateCategory, captionSearch, setCaptionSearch, isTranslating, setIsTranslating, isTTSGenerating, setIsTTSGenerating, isGeneratingCaptions, setIsGeneratingCaptions, isRefiningCaptions, setIsRefiningCaptions, captionPrompt, setCaptionPrompt, applyScope, setApplyScope, restorePunctuation, setRestorePunctuation, grammarPrompt, setGrammarPrompt, grammarPreset, setGrammarPreset,
    typographyPresets, customPresets, setCustomPresets, getSubtitlesList, handleAutoCaptionGenerate, handleSrtUpload, handleSrtExport, handleAiRefine, handleAddNewCaption, textColorInputRef, activeColorInputRef, bgInputRef
  };

  const renderContent = () => {
    switch (trackType) {
      case 'video': return <VideoInspectorPanel />;
      case 'audio': return <AudioInspectorPanel />;
      case 'text': return <TextInspectorPanel />;
      case 'effect': return <VisualElementInspectorPanel />;
      default: return <VisualElementInspectorPanel />;
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#06070a] overflow-y-auto custom-scrollbar p-4 select-none" id="inspector_container">
      {/* Active Clip Title header card */}
      <div className="mb-4 border-b border-white/5 pb-3">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-extrabold uppercase tracking-widest text-cyan-400 bg-cyan-400/10 px-2 py-0.5 rounded border border-cyan-500/20 shadow-inner">
            {trackType} Clip
          </span>
          <span className="text-[9px] font-mono font-bold text-gray-600 truncate">
            {activeNode.id}
          </span>
        </div>
        <h2 className="text-xs font-black text-gray-100 mt-1.5 truncate max-w-full uppercase tracking-wider">
          {activeNode.properties.name || activeNode.properties.textContent || 'Active Clip Selection'}
        </h2>
      </div>

      {/* Render matching category controls */}
      <InspectorProvider value={inspectorController}>{renderContent()}</InspectorProvider>
    </div>
  );
};