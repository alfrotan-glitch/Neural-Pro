import React, { useState, useEffect, useMemo } from 'react';
import { getAudioMixController } from '../../features/video-studio/playback/audio';
import { motion } from 'motion/react';
import { useProjectStore } from '../../store/useProjectStore';
import { isTimeInClip } from '../../features/video-studio/project/time/intervals';

interface AudioWaveOverlayProps {
  clipId?: string;
  isPlaying: boolean;
  currentTime: number;
  initialScript?: any[];
  properties?: any;
  onPropertiesChange?: (patch: any) => void;
}

export const AudioWaveOverlay: React.FC<AudioWaveOverlayProps> = ({ 
  clipId, 
  isPlaying, 
  currentTime,
  initialScript,
  properties = {},
  onPropertiesChange
}) => {
  const { tracks } = useProjectStore();

  const styleMode = properties.styleMode || 'neo-bars';
  const waveColor = properties.waveColor || 'cyan';
  const sensitivity = properties.sensitivity ?? 1.0;
  const glowEffect = properties.glowEffect ?? true;

  const updateProperty = (key: string, value: any) => {
    if (onPropertiesChange) {
      onPropertiesChange({ [key]: value });
    }
  };

  const [isHovered, setIsHovered] = useState<boolean>(false);
  const [audioLevel, setAudioLevel] = useState<number>(0);
  const [frequencyData, setFrequencyData] = useState<Float32Array | null>(null);

  // Sample the same Web Audio graph used by Preview playback so the visualizer
  // responds to real media amplitude and spectrum frequencies in real-time.
  useEffect(() => {
    if (!isPlaying) {
      setAudioLevel(0);
      setFrequencyData(null);
      return;
    }

    let rafId = 0;
    let lastSampleTime = 0;

    const sample = (now: number) => {
      // Throttle React state updates to ~30fps to prevent massive render lag
      if (now - lastSampleTime > 33) {
        lastSampleTime = now;
        const mix = getAudioMixController();
        const level = mix.getAggregateRmsLevel();
        const freqs = mix.getAggregateFrequencyData(64);
        setAudioLevel(level);
        setFrequencyData(freqs);
      }
      rafId = requestAnimationFrame(sample);
    };

    rafId = requestAnimationFrame(sample);
    return () => cancelAnimationFrame(rafId);
  }, [isPlaying]);

  // Determine active clips and waveform at the current playhead time
  const { isSpeaking, timelineWaveformPeak, activeCaptionClip } = useMemo(() => {
    // Check if there is an active text track clip (caption/subtitle) at playhead
    const activeCaption = tracks
      .find(t => t.type === 'text')
      ?.clips.find(clip => isTimeInClip(currentTime, clip));

    // Check active audio/video clips at playhead
    let highestPeak = 0;
    let hasAudioClipAtTime = false;

    tracks.forEach(track => {
      if (track.isMuted) return;
      if (track.type === 'audio' || track.type === 'video') {
        track.clips.forEach(clip => {
          if (isTimeInClip(currentTime, clip)) {
            hasAudioClipAtTime = true;
            // Sample baked waveform peaks if available
            const peaks = clip.properties?.waveformData;
            if (Array.isArray(peaks) && peaks.length > 0) {
              const relativeTime = currentTime - clip.startAt + (clip.trim?.in ?? 0);
              const progress = Math.max(0, Math.min(1, relativeTime / Math.max(0.1, clip.duration)));
              const peakIndex = Math.min(peaks.length - 1, Math.floor(progress * peaks.length));
              const peakVal = (Number(peaks[peakIndex]) || 0) / 100;
              highestPeak = Math.max(highestPeak, peakVal);
            }
          }
        });
      }
    });

    const activeSpeechOrSound = hasAudioClipAtTime || !!activeCaption;
    return {
      isSpeaking: activeSpeechOrSound,
      timelineWaveformPeak: highestPeak,
      activeCaptionClip: activeCaption,
    };
  }, [tracks, currentTime]);

  // Determine the active speaker's gender dynamically to compute the skew/tilt factor
  const activeSpeakerGender = useMemo(() => {
    if (!isPlaying) return 'none' as const;

    // 1. Search current timeline caption clip properties
    const activeTimelineCaption = tracks
      .find(t => t.type === 'text')
      ?.clips.find(c => isTimeInClip(currentTime, c));

    if (activeTimelineCaption) {
      const speakerName = activeTimelineCaption.properties.speaker || '';
      const text = activeTimelineCaption.properties.textContent || '';
      
      if (speakerName) {
        const lowerName = speakerName.toLowerCase();
        const isFemale = lowerName.includes('host a') || lowerName.includes('sarah') || lowerName.includes('julia') || lowerName.includes('female') || lowerName.includes('woman') || lowerName.includes('she');
        const isMale = lowerName.includes('host b') || lowerName.includes('james') || lowerName.includes('male') || lowerName.includes('man') || lowerName.includes('he');
        if (isFemale) return 'female' as const;
        if (isMale) return 'male' as const;
      }
      
      if (text) {
        const lowerText = text.toLowerCase();
        if (lowerText.startsWith('sarah:') || lowerText.startsWith('julia:') || lowerText.startsWith('host a:')) {
          return 'female' as const;
        }
        if (lowerText.startsWith('james:') || lowerText.startsWith('host b:')) {
          return 'male' as const;
        }
      }
    }

    // 2. Query initialScript segment if available
    if (initialScript && initialScript.length > 0) {
      const totalDur = useProjectStore.getState().totalDuration;
      const segmentDuration = totalDur / initialScript.length;
      const estimatedIdx = Math.min(
        initialScript.length - 1,
        Math.floor(currentTime / segmentDuration)
      );
      const line = initialScript[estimatedIdx];
      if (line) {
        const speakerName = line.speaker || '';
        const lowerName = speakerName.toLowerCase();
        const isFemale = lowerName.includes('host a') || lowerName.includes('sarah') || lowerName.includes('julia') || lowerName.includes('female') || lowerName.includes('woman');
        const isMale = lowerName.includes('host b') || lowerName.includes('james') || lowerName.includes('male') || lowerName.includes('man');
        if (isFemale) return 'female' as const;
        if (isMale) return 'male' as const;
      }
    }

    // 3. robust fallback: alternate speakers every 7 seconds
    const segmentIndex = Math.floor(currentTime / 7.0);
    return segmentIndex % 2 === 0 ? ('female' as const) : ('male' as const);
  }, [tracks, currentTime, isPlaying, initialScript]);

  // Generate dynamic wave heights with custom speaker skew and frequency multipliers
  const barCount = 64;
  const bars = useMemo(() => {
    const array = [];
    
    // Tone mapping (pitch tracking):
    // Female voice: Higher pitch (faster, sharper, more energetic ripples)
    // Male voice: Lower pitch (deeper, smoother, more grounded cycles)
    const pitchShift = activeSpeakerGender === 'female' ? 1.65 : (activeSpeakerGender === 'male' ? 0.9 : 1.2);
    
    for (let i = 0; i < barCount; i++) {
      const x = i / (barCount - 1);
      
      // Symmetrical & envelope window
      let window = Math.pow(Math.sin(x * Math.PI), 1.2);
      if (isPlaying && isSpeaking) {
        if (activeSpeakerGender === 'female') {
          window = Math.pow(Math.sin(x * Math.PI), 1.2) * (1.6 - x * 1.2);
        } else if (activeSpeakerGender === 'male') {
          window = Math.pow(Math.sin(x * Math.PI), 1.2) * (0.4 + x * 1.2);
        }
      }

      let height = 4; 
      if (isPlaying) {
        if (isSpeaking) {
          // 1. Direct real-time WebAudio frequency bin (0..1)
          const realFreqVal = (frequencyData && frequencyData.length > i ? (frequencyData[i] ?? 0) : 0);

          // 2. Audio level (RMS) + timeline baked peak level
          const effectiveAudioEnergy = Math.max(audioLevel * 1.4, timelineWaveformPeak * 1.2, realFreqVal * 1.1);

          // 3. Natural voice modulation dynamics (jitter and pitch phase)
          const voiceJitter = Math.sin(currentTime * 36.0 + i * 1.2) * 4.0;
          const harmonicA = Math.sin(x * Math.PI * 3.0 * pitchShift - currentTime * 10.0 * pitchShift) * 16;
          const harmonicB = Math.cos(x * Math.PI * 6.0 * pitchShift + currentTime * 16.0 * pitchShift) * 9;
          const waveShape = Math.abs(harmonicA + harmonicB + voiceJitter);

          // Blend real frequency bins (dominant) with wave dynamics
          if (effectiveAudioEnergy > 0.01) {
            const freqComponent = (realFreqVal * 85) + (effectiveAudioEnergy * 45);
            const dynamicWaveComponent = waveShape * Math.min(1.0, effectiveAudioEnergy * 1.5) * 0.45;
            height = (3 + freqComponent + dynamicWaveComponent) * window * sensitivity;
          } else {
            // Very subtle idle speaking presence
            height = (4 + Math.sin(currentTime * 4.0 + i * 0.3) * 2.5) * window;
          }
        } else {
          // Low-intensity soft idle breath when silent / no audio
          const slowWave = Math.sin(x * Math.PI * 3.0 - currentTime * 2.0) * 3.5;
          height = (3 + Math.abs(slowWave)) * window;
        }
      } else {
        // Paused aesthetic wave
        const frozenWave = Math.sin(x * Math.PI * 4.0) * 8 + Math.cos(x * Math.PI * 8.0) * 2;
        height = (6 + Math.abs(frozenWave)) * window;
      }

      // Ensure minimal center boundary visibility
      const baseline = window * 3;
      array.push(Math.min(98, Math.max(baseline, height)));
    }
    return array;
  }, [isPlaying, isSpeaking, currentTime, sensitivity, activeSpeakerGender, audioLevel, frequencyData, timelineWaveformPeak]);

  // Color preset styles
  const colorMap = {
    cyan: {
      from: 'from-cyan-500',
      via: 'via-blue-500',
      to: 'to-indigo-500',
      glow: 'shadow-[0_0_20px_rgba(6,182,212,0.6)]',
      border: 'border-cyan-500/30',
      bg: 'bg-cyan-500',
      text: 'text-cyan-400',
      lightBg: 'bg-cyan-500/10',
    },
    emerald: {
      from: 'from-emerald-400',
      via: 'via-teal-500',
      to: 'to-cyan-500',
      glow: 'shadow-[0_0_20px_rgba(16,185,129,0.6)]',
      border: 'border-emerald-500/30',
      bg: 'bg-emerald-500',
      text: 'text-emerald-400',
      lightBg: 'bg-emerald-500/10',
    },
    pink: {
      from: 'from-pink-500',
      via: 'via-rose-500',
      to: 'to-purple-600',
      glow: 'shadow-[0_0_20px_rgba(236,72,153,0.6)]',
      border: 'border-pink-500/30',
      bg: 'bg-pink-500',
      text: 'text-pink-400',
      lightBg: 'bg-pink-500/10',
    },
    amber: {
      from: 'from-amber-400',
      via: 'via-orange-500',
      to: 'to-red-500',
      glow: 'shadow-[0_0_20px_rgba(245,158,11,0.6)]',
      border: 'border-amber-500/30',
      bg: 'bg-amber-500',
      text: 'text-amber-400',
      lightBg: 'bg-amber-500/10',
    },
    indigo: {
      from: 'from-indigo-500',
      via: 'via-violet-600',
      to: 'to-purple-600',
      glow: 'shadow-[0_0_20px_rgba(99,102,241,0.6)]',
      border: 'border-indigo-500/30',
      bg: 'bg-indigo-500',
      text: 'text-indigo-400',
      lightBg: 'bg-indigo-500/10',
    },
    white: {
      from: 'from-white',
      via: 'via-white',
      to: 'to-zinc-300',
      glow: 'shadow-[0_0_20px_rgba(255,255,255,0.85)]',
      border: 'border-white/30',
      bg: 'bg-white',
      text: 'text-white',
      lightBg: 'bg-white/10',
    }
  };

  const selectedColor = colorMap[waveColor as keyof typeof colorMap] ?? colorMap.white;

  const colorHex = useMemo(() => {
    switch (waveColor) {
      case 'cyan': return '#06b6d4';
      case 'emerald': return '#10b981';
      case 'pink': return '#ec4899';
      case 'amber': return '#f59e0b';
      case 'indigo': return '#6366f1';
      case 'white': return '#ffffff';
      default: return '#ffffff';
    }
  }, [waveColor]);

  const glowShadowColor = useMemo(() => {
    switch (waveColor) {
      case 'cyan': return 'rgba(6,182,212,0.8)';
      case 'emerald': return 'rgba(16,185,129,0.8)';
      case 'pink': return 'rgba(236,72,153,0.8)';
      case 'amber': return 'rgba(245,158,11,0.8)';
      case 'indigo': return 'rgba(99,102,241,0.8)';
      case 'white': return 'rgba(255,255,255,0.9)';
      default: return 'rgba(255,255,255,0.9)';
    }
  }, [waveColor]);

  return (
    <div 
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="absolute inset-0 w-full h-full flex flex-col items-center justify-between p-4 bg-transparent overflow-hidden select-none"
    >
      {/* 
        NO SPEAKER INDICATORS OR FLOATING LABELS ("liable گوینده نداشته باشد")
        Prisinte overlay with background = None.
      */}
      
      {/* Top Header Mode Toggle on Hover (Extremely minimal, quiet metadata) */}
      <div className={`w-full flex items-center justify-between px-3 py-1.5 bg-black/80 rounded-xl border border-white/10 backdrop-blur-md z-20 transition-opacity duration-300 ${isHovered ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}>
        <div className="flex items-center gap-2">
          <span className="text-[9px] font-mono font-bold tracking-wider text-white/50">WAVE OVERLAY</span>
        </div>
        <div className="flex items-center gap-1">
          {(['fluid-wave', 'neo-bars', 'retro-eq', 'radial-pulse', 'cyber-sine'] as const).map((mode) => (
            <button 
              key={mode}
              onClick={() => updateProperty("styleMode", mode)} 
              className={`px-2 py-0.5 rounded text-[9px] font-bold transition capitalize ${styleMode === mode ? 'bg-white/15 text-white' : 'text-gray-400 hover:text-white'}`}
            >
              {mode.replace('-', ' ')}
            </button>
          ))}
        </div>
      </div>

      {/* Main Wave Visualization Frame */}
      <div className="flex-1 w-full flex items-center justify-center relative overflow-hidden my-4 z-10">
        
        {/* Style 1: Fluid wave curve */}
        {styleMode === 'fluid-wave' && (
          <div className="w-full h-32 flex items-center justify-center relative">
            <svg viewBox="0 0 1000 200" className="w-full h-full overflow-visible">
              <defs>
                <linearGradient id={`grad-${clipId}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={colorHex} stopOpacity="0.4" />
                  <stop offset="100%" stopColor="#000000" stopOpacity="0" />
                </linearGradient>
              </defs>
              
              <path
                d={`M 0 100 ${bars.map((h, i) => {
                  const x = (i / (barCount - 1)) * 1000;
                  const phaseShift = isPlaying ? Math.sin(currentTime * 8 + i * 0.5) * 8 : 0;
                  const y = 100 + (i % 2 === 0 ? -1 : 1) * h * 0.65 + phaseShift;
                  return `L ${x} ${y}`;
                }).join(' ')} L 1000 100`}
                fill="none"
                stroke={colorHex}
                strokeWidth="1.2"
                opacity="0.3"
                className="transition-all duration-75 ease-linear"
              />

              <path
                d={`M 0 100 ${bars.map((h, i) => {
                  const x = (i / (barCount - 1)) * 1000;
                  const y = 100 + (i % 2 === 0 ? -1 : 1) * h * 0.8;
                  return `L ${x} ${y}`;
                }).join(' ')} L 1000 100`}
                fill={`url(#grad-${clipId})`}
                stroke={colorHex}
                strokeWidth="3.2"
                strokeLinecap="round"
                className="transition-all duration-75 ease-linear"
                style={{
                  filter: glowEffect ? `drop-shadow(0px 0px 10px ${glowShadowColor})` : 'none'
                }}
              />
            </svg>
          </div>
        )}

        {/* Style 2: Symmetric glowing audio bars */}
        {styleMode === 'neo-bars' && (
          <div className="h-40 w-full flex items-center justify-center gap-[4px] px-4">
            {bars.map((h, i) => (
              <div 
                key={i} 
                className="flex-1 flex items-center justify-center h-full"
              >
                <div 
                  className={`w-[4px] rounded-full bg-gradient-to-b ${selectedColor.from} ${selectedColor.to} transition-all duration-75 ease-linear`}
                  style={{
                    height: `${h}%`,
                    boxShadow: glowEffect ? `0 0 12px ${glowShadowColor}` : 'none'
                  }}
                />
              </div>
            ))}
          </div>
        )}

        {/* Style 3: Retro EQ Grid */}
        {styleMode === 'retro-eq' && (
          <div className="h-40 w-full flex items-center justify-between gap-1.5 px-4 max-w-lg">
            {bars.slice(0, 24).map((h, i) => {
              const litGrids = Math.floor(h / 10);
              return (
                <div key={i} className="flex-1 flex flex-col-reverse justify-start gap-[2px] h-32">
                  {Array.from({ length: 10 }).map((_, gridIdx) => {
                    const isLit = gridIdx <= litGrids;
                    let gridBg = 'bg-zinc-800/20';
                    if (isLit) {
                      if (gridIdx >= 8) gridBg = 'bg-red-500 shadow-[0_0_8px_#ef4444]';
                      else if (gridIdx >= 5) gridBg = 'bg-orange-500 shadow-[0_0_6px_#f97316]';
                      else gridBg = 'bg-emerald-500 shadow-[0_0_6px_#10b981]';
                    }
                    return (
                      <div 
                        key={gridIdx} 
                        className={`w-full h-2 rounded-sm transition-all duration-100 ${gridBg}`}
                      />
                    );
                  })}
                </div>
              );
            })}
          </div>
        )}

        {/* Style 4: Radial Circle Pulse */}
        {styleMode === 'radial-pulse' && (
          <div className="relative w-44 h-44 flex items-center justify-center">
            <div 
              className={`absolute inset-4 rounded-full transition-all duration-200 ${selectedColor.lightBg} border ${selectedColor.border} flex items-center justify-center`}
              style={{
                transform: `scale(${1 + ((bars[0] ?? 0) / 320)})`,
                boxShadow: glowEffect ? `inset 0 0 30px ${glowShadowColor}` : 'none'
              }}
            >
              <div className="text-center">
                <span className="text-[10px] font-mono font-bold tracking-widest text-white/60">DYNAMIC</span>
              </div>
            </div>

            <svg viewBox="0 0 200 200" className="absolute inset-0 w-full h-full overflow-visible rotate-90">
              {bars.map((h, i) => {
                const angle = (i / barCount) * Math.PI * 2;
                const innerRadius = 55;
                const outerRadius = innerRadius + h * 0.38;
                
                const x1 = 100 + innerRadius * Math.cos(angle);
                const y1 = 100 + innerRadius * Math.sin(angle);
                const x2 = 100 + outerRadius * Math.cos(angle);
                const y2 = 100 + outerRadius * Math.sin(angle);

                return (
                  <line
                    key={i}
                    x1={x1}
                    y1={y1}
                    x2={x2}
                    y2={y2}
                    stroke={colorHex}
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    opacity={0.8 + (h / 450)}
                    className="transition-all duration-75 ease-linear"
                  />
                );
              })}
            </svg>
          </div>
        )}

        {/* Style 5: Cyber Laser Line */}
        {styleMode === 'cyber-sine' && (
          <div className="w-full h-32 flex flex-col justify-center relative px-6">
            <div className={`h-[1px] w-full absolute bg-white/5 left-0 right-0 z-0`} />
            <svg viewBox="0 0 1000 200" className="w-full h-full overflow-visible relative z-10">
              <path
                d={`M 0 100 ${bars.map((h, i) => {
                  const x = (i / (barCount - 1)) * 1000;
                  const y = 100 + Math.sin(currentTime * 12 + i * 0.6) * h * 0.7;
                  return `L ${x} ${y}`;
                }).join(' ')} L 1000 100`}
                fill="none"
                stroke={colorHex}
                strokeWidth="3.5"
                strokeLinecap="round"
                style={{
                  filter: glowEffect ? `drop-shadow(0px 0px 10px ${glowShadowColor})` : 'none'
                }}
                className="transition-all duration-75 ease-linear"
              />
            </svg>
          </div>
        )}

      </div>

      {/* Settings / Configuration Footer */}
      <div className={`w-full bg-black/80 rounded-xl p-2.5 border border-white/10 backdrop-blur-md flex flex-wrap gap-4 items-center justify-between z-20 transition-opacity duration-300 ${isHovered ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}>
        
        {/* Color presets */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono font-bold text-gray-400">COLOR:</span>
          <div className="flex items-center gap-1.5">
            {(['cyan', 'emerald', 'pink', 'amber', 'indigo', 'white'] as const).map((c) => (
              <button
                key={c}
                onClick={() => updateProperty("waveColor", c)}
                className={`w-4.5 h-4.5 rounded-full border-2 transition transform hover:scale-110 active:scale-95 ${
                  c === 'cyan' ? 'bg-cyan-500' : c === 'emerald' ? 'bg-emerald-500' : c === 'pink' ? 'bg-pink-500' : c === 'amber' ? 'bg-amber-500' : c === 'indigo' ? 'bg-indigo-500' : 'bg-white shadow-[0_0_8px_rgba(255,255,255,0.4)]'
                } ${waveColor === c ? 'border-white scale-110 shadow-lg' : 'border-transparent opacity-60'}`}
                title={c}
              />
            ))}
          </div>
        </div>

        {/* Sensitivity & Controls */}
        <div className="flex items-center gap-4 flex-1 justify-end">
          {/* Glow Toggle */}
          <button 
            onClick={() => updateProperty("glowEffect", !glowEffect)}
            className={`px-2 py-1 rounded text-[9px] font-bold border transition ${
              glowEffect ? 'bg-white/10 border-white/20 text-white' : 'bg-white/5 border-white/10 text-gray-400'
            }`}
          >
            GLOW {glowEffect ? 'ON' : 'OFF'}
          </button>

          {/* Slider for sensitivity */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono font-bold text-gray-400">BOUNCE:</span>
            <input 
              type="range" 
              min="0.4" 
              max="2.0" 
              step="0.1" 
              value={sensitivity}
              onChange={(e) => updateProperty("sensitivity", parseFloat(e.target.value))}
              className="w-20 h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-white"
            />
            <span className="text-[9px] font-mono font-bold text-white w-6 text-right">
              {sensitivity.toFixed(1)}x
            </span>
          </div>
        </div>

      </div>
    </div>
  );
};
