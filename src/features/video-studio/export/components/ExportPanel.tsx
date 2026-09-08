// src/features/video-studio/export/components/ExportPanel.tsx
import React, { useState, useMemo } from 'react';
import { useExportStore, ExportFPS, AudioBitrate } from '../../../../store/useExportStore';
import type { ExportJob } from '../../../../store/useExportStore';
import { useProjectStore } from '../../../../store/useProjectStore';
import { convertToExportProject } from '../../../../core/engine/exportConverter';
import { ResolutionSelector } from './ResolutionSelector';
import { CodecSelector } from './CodecSelector';
import { QualitySelector } from './QualitySelector';
import { EncoderSelector } from '../../../../core/engine/EncoderSelector';
import { SmartExportAnalyzer } from '../../../../core/engine/SmartExportAnalyzer';
import { getExportDimensions } from '../../../../core/engine/exportResolution';
import {
  calculateRecommendedVideoBitrate,
  formatBitrate,
  getQualityBitrateOptions,
  getVideoBitrateRange,
} from '../../../../core/engine/exportEncodingSettings';
import { 
  Film, X, Download, Copy, Check, Info, Settings, Code, Volume2, ShieldCheck, Play, Cpu, Zap 
} from 'lucide-react';
import { motion } from 'motion/react';
import { RenderDiagnosticReplayViewer } from '../../playback/components/RenderDiagnosticReplayViewer';
import { createDiagnosticFrameResolver } from '../../playback/services/renderDiagnosticFrameNavigator';

interface ExportPanelProps {
  onClose: () => void;
  onStartExport: (settings: ExportJob['settings']) => void;
}

export const ExportPanel: React.FC<ExportPanelProps> = ({ onClose, onStartExport }) => {
  const {
    resolution,
    fps,
    codec,
    quality,
    audioBitrate,
    videoBitrate,
    format,
    setFps,
    setAudioBitrate,
    setVideoBitrate,
    setVideoBitrateMode,
    videoBitrateMode,
    setFormat,
  } = useExportStore();

  const tracks = useProjectStore((s) => s.tracks);
  const animations = useProjectStore((s) => s.animations) ?? [];
  const projectMetadata = useProjectStore((s) => s.metadata);
  const projectFps = projectMetadata?.fps || fps;
  const totalDuration = useProjectStore((s) => s.totalDuration);
  const projectName = projectMetadata?.title || 'Untitled Project';

  const [activeTab, setActiveTab] = useState<'settings' | 'json' | 'diagnostics'>('settings');
  const [copied, setCopied] = useState(false);
  const exportFormat = format;
  const actualVideoDuration = totalDuration;

  const recommendedVideoBitrate = useMemo(
    () => calculateRecommendedVideoBitrate(resolution, fps, quality, codec),
    [resolution, fps, quality, codec]
  );

  const bitrateRange = useMemo(
    () => getVideoBitrateRange(resolution, fps, codec),
    [resolution, fps, codec]
  );

  const bitrateOptions = useMemo(
    () => getQualityBitrateOptions(resolution, fps, codec, quality),
    [resolution, fps, codec, quality]
  );

  // Compute smart export optimization dynamically
  const smartAnalysis = useMemo(() => {
    return SmartExportAnalyzer.computeOptimization(tracks, {
      resolution,
      fps,
      codec: (codec === 'H.264' || codec === 'H.265' || codec === 'AV1') ? codec : 'H.264',
      quality,
    });
  }, [tracks, resolution, fps, codec, quality]);

  // Generate the clean JSON render instructions using the export converter
  const jsonRenderInstruction = useMemo(() => {
    const state = useProjectStore.getState();
    const mockState = {
      projectId: state.projectId || 'proj_' + projectName.replace(/\s+/g, '_').toLowerCase(),
      currentTime: state.currentTime,
      isPlaying: state.isPlaying,
      selectedNodeIds: state.selectedNodeIds,
      tracks,
      totalDuration: actualVideoDuration,
      metadata: {
        title: projectName,
        resolution: getExportDimensions(resolution),
        fps,
      },
    };
    return convertToExportProject(mockState);
  }, [projectName, tracks, actualVideoDuration, resolution, fps, codec, quality, audioBitrate]);

  // Formatted string of the JSON instructions
  const jsonString = useMemo(() => JSON.stringify(jsonRenderInstruction, null, 2), [jsonRenderInstruction]);

  // Calculate estimated file size from the actual selected encoding settings.
  const estimatedFileSize = useMemo(() => {
    const audioBps = Number.parseInt(audioBitrate, 10) * 1000;
    const totalBitrate = videoBitrate + audioBps;
    const sizeInMB = (totalBitrate * actualVideoDuration) / 8 / 1_000_000;
    if (sizeInMB < 1) return `${(sizeInMB * 1024).toFixed(0)} KB`;
    if (sizeInMB >= 1024) return `${(sizeInMB / 1024).toFixed(2)} GB`;
    return `${sizeInMB.toFixed(1)} MB`;
  }, [videoBitrate, audioBitrate, actualVideoDuration]);

  // Query dynamic hardware acceleration parameters
  const hardwareDetails = useMemo(() => {
    // Treat any non-standard options gracefully
    const caps = EncoderSelector.getSystemCapabilities();
    const selection = EncoderSelector.selectBestEncoder({
      preferredCodec: (codec === 'H.264' || codec === 'H.265' || codec === 'AV1') ? codec : 'H.264',
      allowHardwareAcceleration: true
    });
    return { caps, selection };
  }, [codec]);

  const handleCopyJson = () => {
    navigator.clipboard.writeText(jsonString);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleStartRender = () => {
    onStartExport({
      resolution,
      fps,
      codec,
      quality,
      audioBitrate,
      videoBitrate,
      format: exportFormat,
    });
  };

  return (
    <div className="absolute inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 z-50 overflow-y-auto">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 15 }}
        className="bg-[#0b0c11] border border-white/10 rounded-2xl w-full max-w-3xl shadow-[0_0_50px_rgba(168,85,247,0.25)] flex flex-col max-h-[90vh] overflow-hidden"
      >
        {/* Premiere Pro style top header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/5 bg-[#0e0f15]">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-purple-500/10 text-purple-400 border border-purple-500/20">
              <Film className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-xs font-black text-white uppercase tracking-wider">
                Export Settings / رندر و خروجی پروژه
              </h3>
              <p className="text-[9px] text-gray-500 font-medium">
                Advanced hardware accelerated render engine & encoding manager
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/5 text-gray-400 hover:text-white transition-all cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Selection */}
        <div className="flex bg-[#07080c] px-5 border-b border-white/5 shrink-0">
          <button
            onClick={() => setActiveTab('settings')}
            className={`py-3 px-4 text-[10px] font-bold uppercase tracking-wider flex items-center gap-2 border-b-2 transition-all cursor-pointer ${
              activeTab === 'settings' 
                ? 'border-purple-500 text-purple-400 font-black' 
                : 'border-transparent text-gray-400 hover:text-white'
            }`}
          >
            <Settings className="w-3.5 h-3.5" />
            <span>Format Settings</span>
          </button>
          <button
            onClick={() => setActiveTab('diagnostics')}
            className={`py-3 px-4 text-[10px] font-bold uppercase tracking-wider flex items-center gap-2 border-b-2 transition-all cursor-pointer ${
              activeTab === 'diagnostics' 
                ? 'border-purple-500 text-purple-400 font-black' 
                : 'border-transparent text-gray-400 hover:text-white'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Render Diagnostics</span>
          </button>
          <button
            onClick={() => setActiveTab('json')}
            className={`py-3 px-4 text-[10px] font-bold uppercase tracking-wider flex items-center gap-2 border-b-2 transition-all cursor-pointer ${
              activeTab === 'json' 
                ? 'border-purple-500 text-purple-400 font-black' 
                : 'border-transparent text-gray-400 hover:text-white'
            }`}
          >
            <Code className="w-3.5 h-3.5" />
            <span>Render JSON Instructions</span>
          </button>
        </div>

        {/* Scrollable content section */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {activeTab === 'settings' ? (
            <>
              {/* Resolution settings */}
              <ResolutionSelector />

              {/* Codec selection */}
              <CodecSelector />

              {/* Quality preset */}
              <QualitySelector />

              {/* Video bitrate */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">
                    Video Bitrate / بیت‌ریت ویدیو
                  </label>
                  <span className="text-[9px] font-mono font-bold text-purple-400">
                    Recommended: {formatBitrate(recommendedVideoBitrate)}
                  </span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-2">
                  <select
                    value={videoBitrate}
                    onChange={(e) => setVideoBitrate(Number(e.target.value))}
                    className="w-full bg-[#12131a] border border-white/5 rounded-lg py-2 px-2.5 text-[10px] font-mono font-bold text-gray-300 focus:outline-none focus:border-purple-500 cursor-pointer"
                  >
                    {bitrateOptions.map((option) => (
                      <option key={`${option.label}-${option.bitrate}`} value={option.bitrate}>
                        {option.label} — {formatBitrate(option.bitrate)}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => setVideoBitrateMode(videoBitrateMode === 'auto' ? 'custom' : 'auto')}
                    className={`px-3 rounded-lg border text-[9px] font-bold uppercase tracking-wider ${
                      videoBitrateMode === 'auto'
                        ? 'border-purple-500/40 bg-purple-500/10 text-purple-300'
                        : 'border-white/10 bg-white/5 text-gray-400'
                    }`}
                  >
                    {videoBitrateMode === 'auto' ? 'Auto' : 'Custom'}
                  </button>
                </div>
                <div className="flex items-center justify-between text-[8px] text-gray-500 font-mono">
                  <span>Supported range: {formatBitrate(bitrateRange.min)} – {formatBitrate(bitrateRange.max)}</span>
                  <span>Selected: {formatBitrate(videoBitrate)}</span>
                </div>
              </div>

              {/* Row for FPS, Format and Audio Bitrate */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* FPS Selection */}
                <div className="space-y-2">
                  <label className="text-[9px] font-bold text-gray-400 uppercase tracking-wider block">
                    Frame Rate (FPS) / نرخ فریم
                  </label>
                  <div className="grid grid-cols-3 gap-1 bg-[#12131a] p-1 rounded-lg border border-white/5">
                    {([24, 30, 60] as const).map((v) => (
                      <button
                        key={v}
                        onClick={() => setFps(v as ExportFPS)}
                        className={`py-1.5 text-[10px] font-bold rounded-md transition-all cursor-pointer ${
                          fps === v
                            ? 'bg-purple-500 text-white shadow-md font-black'
                            : 'text-gray-400 hover:text-white hover:bg-white/5'
                        }`}
                      >
                        {v} FPS
                      </button>
                    ))}
                  </div>
                </div>

                {/* Format selection */}
                <div className="space-y-2">
                  <label className="text-[9px] font-bold text-gray-400 uppercase tracking-wider block">
                    File Format / فرمت فایل
                  </label>
                  <div className="grid grid-cols-3 gap-1 bg-[#12131a] p-1 rounded-lg border border-white/5">
                    {(['mp4', 'webm', 'mkv'] as const).map((fmt) => {
                      const supported = fmt === 'mp4';
                      return (
                        <button
                          key={fmt}
                          type="button"
                          disabled={!supported}
                          title={supported ? 'Production format' : `${fmt.toUpperCase()} export is not implemented yet`}
                          onClick={() => supported && setFormat(fmt)}
                          className={`py-1.5 text-[9px] font-black uppercase rounded-md transition-all ${
                            !supported
                              ? 'text-gray-600 cursor-not-allowed opacity-50'
                              : exportFormat === fmt
                                ? 'bg-purple-500 text-white shadow-md font-black cursor-pointer'
                                : 'text-gray-400 hover:text-white hover:bg-white/5 cursor-pointer'
                          }`}
                        >
                          {fmt}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Audio AAC Bitrate */}
                <div className="space-y-2">
                  <label className="text-[9px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                    <Volume2 className="w-3.5 h-3.5 text-gray-400" />
                    <span>Audio AAC Bitrate / بیت‌ریت صدا</span>
                  </label>
                  <select
                    value={audioBitrate}
                    onChange={(e) => setAudioBitrate(e.target.value as AudioBitrate)}
                    className="w-full bg-[#12131a] border border-white/5 rounded-lg py-1.5 px-2.5 text-[10px] font-mono font-bold text-gray-300 focus:outline-none focus:border-purple-500 cursor-pointer"
                  >
                    <option value="128k">128 kbps (Standard Mobile)</option>
                    <option value="192k">192 kbps (High Quality Web)</option>
                    <option value="256k">256 kbps (Lossless Premium)</option>
                    <option value="320k">320 kbps (Studio Master)</option>
                  </select>
                </div>
              </div>

              {/* Hardware Accelerated Encoding Detection Diagnostics */}
              <div className="bg-[#12131a] border border-white/5 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between border-b border-white/5 pb-2">
                  <div className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-wider text-purple-400">
                    <Cpu className="w-3.5 h-3.5" />
                    <span>Hardware Diagnostics / عیب‌یابی کارت گرافیک</span>
                  </div>
                  <span className="inline-flex items-center gap-1 text-[8px] font-extrabold text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded-full">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                    <span>ACTIVE DETECTION</span>
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[9px]">
                  {/* Left Column: Device Info */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between">
                      <span className="text-gray-500">Detected GPU Vendor:</span>
                      <span className="text-gray-300 font-medium truncate max-w-[150px]" title={hardwareDetails.caps.gpuVendor}>{hardwareDetails.caps.gpuVendor}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">GPU Chipset / Renderer:</span>
                      <span className="text-gray-300 font-medium truncate max-w-[150px]" title={hardwareDetails.caps.gpuRenderer}>{hardwareDetails.caps.gpuRenderer}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">WebGPU Accelerated API:</span>
                      <span className={hardwareDetails.caps.hasWebGPUSupport ? 'text-emerald-400 font-bold' : 'text-amber-400 font-medium'}>
                        {hardwareDetails.caps.hasWebGPUSupport ? 'Supported' : 'Not Supported (WebGL Fallback)'}
                      </span>
                    </div>
                  </div>

                  {/* Right Column: Recommended Encoder Profile */}
                  <div className="space-y-1.5 border-t md:border-t-0 md:border-l border-white/5 pt-1.5 md:pt-0 md:pl-3">
                    <div className="flex justify-between">
                      <span className="text-gray-500">Recommended Encoder:</span>
                      <span className="text-purple-400 font-black">{hardwareDetails.caps.recommendedEncoder.id}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Target Selected Codec:</span>
                      <span className="text-indigo-300 font-bold font-mono">{hardwareDetails.selection.selectedEncoder.name}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Speedup Engine Factor:</span>
                      <span className="text-emerald-400 font-black font-mono">
                        {hardwareDetails.selection.selectedEncoder.speedFactor.toFixed(1)}x Faster
                      </span>
                    </div>
                  </div>
                </div>

                {/* Performance estimates slider bars */}
                <div className="bg-black/30 p-2.5 rounded-lg border border-white/5 space-y-2 mt-1">
                  <div className="flex items-center justify-between text-[8px] font-bold text-gray-400 uppercase tracking-wider">
                    <span>Performance Estimation</span>
                    <span className="text-purple-400 text-[9px] font-black font-mono">
                      ~{hardwareDetails.selection.performance.estimatedFps} FPS (1080p Pass)
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-[8.5px]">
                    <div className="space-y-1">
                      <div className="flex justify-between text-[8px] text-gray-500">
                        <span>EST. CPU LOAD</span>
                        <span className="font-mono text-gray-400">{hardwareDetails.selection.performance.cpuOverheadPercent}%</span>
                      </div>
                      <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-purple-500 transition-all duration-500" 
                          style={{ width: `${hardwareDetails.selection.performance.cpuOverheadPercent}%` }} 
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <div className="flex justify-between text-[8px] text-gray-500">
                        <span>EST. GPU LOAD</span>
                        <span className="font-mono text-gray-400">{hardwareDetails.selection.performance.gpuOverheadPercent}%</span>
                      </div>
                      <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-emerald-500 transition-all duration-500" 
                          style={{ width: `${hardwareDetails.selection.performance.gpuOverheadPercent}%` }} 
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Smart Export Optimization / آنالیز هوشمند خروجی */}
              <div className="bg-[#12131a] border border-white/5 rounded-xl p-4 space-y-4">
                <div className="flex items-center justify-between border-b border-white/5 pb-2">
                  <div className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-wider text-amber-400">
                    <Zap className="w-3.5 h-3.5 fill-amber-400/20" />
                    <span>Smart Export Optimization / آنالیز هوشمند خروجی</span>
                  </div>
                  <span className="inline-flex items-center gap-1 text-[8px] font-extrabold text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded-full">
                    <span>AI SUGGESTED</span>
                  </span>
                </div>

                {/* Section A: Analyzed Source Files */}
                <div className="space-y-2">
                  <span className="text-[8.5px] font-bold text-gray-400 uppercase tracking-wider block">
                    Analyzed Source Files / فایل‌های منبع شناسایی‌شده
                  </span>
                  <div className="grid grid-cols-1 gap-2">
                    {smartAnalysis.sourceFiles.map((src, sIdx) => (
                      <div key={sIdx} className="bg-black/20 rounded-lg p-2 flex items-center justify-between border border-white/5 text-[9px]">
                        <div className="flex items-center gap-2">
                          <span className="text-sm">{src.resolution.width > 0 ? '🎬' : '🎵'}</span>
                          <div className="space-y-0.5">
                            <p className="font-bold text-gray-200 truncate max-w-[160px]" title={src.fileName}>
                              {src.fileName}
                            </p>
                            <p className="text-[7.5px] text-gray-500 font-mono">
                              Duration: {src.duration.toFixed(1)}s
                            </p>
                          </div>
                        </div>
                        <div className="text-right font-mono space-y-0.5 text-gray-400 text-[8px]">
                          <div>
                            {src.resolution.width > 0 ? `${src.resolution.width}x${src.resolution.height}` : 'Audio Only'}
                          </div>
                          <div>
                            <span className="uppercase text-amber-400/80">{src.codec}</span>
                            {src.fps > 0 && ` @ ${src.fps}fps`}
                            {src.audioFormat && ` | ${src.audioFormat.replace(/_/g, ' ')}`}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Section B: Pass-Through Status */}
                <div className="p-2.5 rounded-lg bg-black/40 border border-white/5 space-y-2 text-[9px]">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-400 font-bold">Fast Stream Copy Status / کپی بدون انکود مجدد</span>
                    <div className="flex gap-1.5">
                      <span className={`px-1.5 py-0.5 rounded-full font-bold text-[7.5px] ${
                        smartAnalysis.canStreamCopyVideo 
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                          : 'bg-white/5 text-gray-400 border border-white/5'
                      }`}>
                        Video: {smartAnalysis.canStreamCopyVideo ? 'Stream Copy' : 'Transcode'}
                      </span>
                      <span className={`px-1.5 py-0.5 rounded-full font-bold text-[7.5px] ${
                        smartAnalysis.canStreamCopyAudio 
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                          : 'bg-white/5 text-gray-400 border border-white/5'
                      }`}>
                        Audio: {smartAnalysis.canStreamCopyAudio ? 'Stream Copy' : 'Transcode'}
                      </span>
                    </div>
                  </div>

                  {smartAnalysis.whyNoStreamCopy.length > 0 ? (
                    <div className="space-y-1 text-[7.5px] leading-relaxed text-gray-500 pt-1 border-t border-white/5">
                      <p className="font-semibold text-gray-400">Why transcoding is active / علت فعال بودن انکود مجدد:</p>
                      <ul className="list-disc pl-3.5 space-y-0.5">
                        {smartAnalysis.whyNoStreamCopy.map((reason, rIdx) => (
                          <li key={rIdx}>{reason}</li>
                        ))}
                      </ul>
                    </div>
                  ) : (
                    <p className="text-[7.5px] text-emerald-400 pt-1 border-t border-white/5 font-semibold">
                      ✓ Instant stream-copy is active! Unchanged streams will be directly copied without quality rendering.
                    </p>
                  )}
                </div>

                {/* Section C: Recommendations */}
                <div className="bg-[#181922] p-3 rounded-lg border border-amber-500/15 space-y-2.5">
                  <p className="text-[8.5px] font-extrabold text-amber-400 tracking-wider uppercase">
                    Recommended Export Strategy / مشخصات بهینه رندر
                  </p>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    <div className="bg-black/35 p-2 rounded-md border border-white/5">
                      <span className="text-[7.5px] text-gray-500 block uppercase">Codec / کدک</span>
                      <span className="text-[10px] font-black text-amber-300 font-mono">{smartAnalysis.recommendedCodec}</span>
                    </div>
                    <div className="bg-black/35 p-2 rounded-md border border-white/5">
                      <span className="text-[7.5px] text-gray-500 block uppercase">Resolution / وضوح</span>
                      <span className="text-[10px] font-black text-amber-300 font-mono">{smartAnalysis.recommendedResolution}</span>
                    </div>
                    <div className="bg-black/35 p-2 rounded-md border border-white/5">
                      <span className="text-[7.5px] text-gray-500 block uppercase">Bitrate / بیت‌ریت</span>
                      <span className="text-[10px] font-black text-amber-300 font-mono">{smartAnalysis.recommendedBitrate}</span>
                    </div>
                    <div className="bg-black/35 p-2 rounded-md border border-white/5">
                      <span className="text-[7.5px] text-gray-500 block uppercase">Encoder / انکودر</span>
                      <span className="text-[10px] font-black text-amber-300 font-mono truncate block" title={smartAnalysis.recommendedEncoderName}>
                        {smartAnalysis.recommendedEncoderId}
                      </span>
                    </div>
                  </div>

                  <p className="text-[8px] text-gray-400 leading-normal border-t border-white/5 pt-2">
                    {smartAnalysis.explanation}
                  </p>

                  <div className="flex items-center gap-2 pt-1">
                    <div className="flex-1 bg-white/5 h-1.5 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-amber-500 rounded-full transition-all duration-500" 
                        style={{ width: `${smartAnalysis.renderTimeSavingsPercent}%` }}
                      />
                    </div>
                    <span className="text-[8.5px] font-extrabold text-amber-400 font-mono whitespace-nowrap">
                      {smartAnalysis.renderTimeSavingsPercent}% Render Time Saved
                    </span>
                  </div>
                </div>
              </div>

              {/* Estimate Widget */}
              <div className="bg-purple-500/5 border border-purple-500/20 rounded-xl p-4 flex gap-3 items-start">
                <Info className="w-4 h-4 text-purple-400 shrink-0 mt-0.5" />
                <div className="text-[10px] leading-relaxed text-purple-200 w-full space-y-1">
                  <div className="flex justify-between font-bold text-white">
                    <span>Estimated File Size (حجم تقریبی فایل):</span>
                    <span className="font-mono text-purple-400 text-xs font-black">{estimatedFileSize}</span>
                  </div>
                  <p className="text-[8.5px] text-gray-400 leading-normal">
                    Project duration: <strong className="font-mono text-gray-300">{actualVideoDuration.toFixed(1)}s</strong>. Compiled with <strong className="text-purple-300">{hardwareDetails.selection.selectedEncoder.name}</strong>. Render multiplier: <strong className="text-purple-300">{hardwareDetails.selection.performance.renderingTimeMultiplier}x</strong> real-time duration.
                  </p>
                </div>
              </div>
            </>
          ) : activeTab === 'diagnostics' ? (
            <RenderDiagnosticReplayViewer
              projectId={useProjectStore.getState().projectId || projectName}
              defaultKey={`video-studio:render-diagnostic:${useProjectStore.getState().projectId || projectName}`}
              frameRate={projectFps}
              durationSeconds={actualVideoDuration}
              onNavigateToProjectTime={(time) => useProjectStore.getState().setCurrentTime(time)}
              resolveBundleAtTime={(time) => createDiagnosticFrameResolver({
                projectId: useProjectStore.getState().projectId || projectName,
                tracks: useProjectStore.getState().tracks,
                animations: useProjectStore.getState().animations ?? [],
                durationSeconds: useProjectStore.getState().totalDuration,
                fps: useProjectStore.getState().metadata?.fps || fps,
              })(time).bundle}
            />
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  <span className="text-[10px] font-bold text-gray-300 uppercase tracking-wider">
                    Durable JSON render schema
                  </span>
                </div>
                <button
                  onClick={handleCopyJson}
                  className="px-3 py-1 rounded-md text-[9px] font-bold bg-[#12131a] border border-white/5 hover:border-white/15 text-gray-300 hover:text-white transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  <span>{copied ? 'Copied' : 'Copy Schema'}</span>
                </button>
              </div>

              <div className="bg-[#050608] border border-white/5 rounded-xl p-3 max-h-[300px] overflow-auto">
                <pre className="font-mono text-[9px] text-purple-300 leading-relaxed whitespace-pre">
                  {jsonString}
                </pre>
              </div>
              <p className="text-[8.5px] text-gray-500 leading-normal">
                This schema conforms strictly to the <strong className="text-gray-400">ExportProject</strong> architecture and is ready to be directly piped into client/server rendering utilities or video render agents.
              </p>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex gap-3 px-5 py-4 border-t border-white/5 bg-[#0e0f15] shrink-0 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl text-[10px] font-bold border border-white/10 hover:border-white/20 text-gray-300 hover:text-white bg-transparent hover:bg-white/5 transition-all cursor-pointer"
          >
            Cancel / انصراف
          </button>
          <button
            onClick={handleStartRender}
            className="px-5 py-1.5 rounded-xl text-[10px] font-black bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white shadow-lg shadow-purple-500/20 hover:shadow-purple-500/30 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Render Video / شروع رندر پروژه</span>
          </button>
        </div>
      </motion.div>
    </div>
  );
};
