import type { CanvasElement } from '../../canvas/types/canvas';

export type AudioVisualizationSource = 'voice' | 'music' | 'sfx' | 'master';
export type SoundWaveType = 'bars' | 'radial' | 'line' | 'wave' | 'retro-eq';

export interface SoundWaveVisualizationConfig {
  type: SoundWaveType;
  fftSize: number;
  smoothingTimeConstant: number;
  minDecibels: number;
  maxDecibels: number;
}

export interface SoundWaveStyleConfig {
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  barWidth: number;
  barGap: number;
  barRadius: number;
  multiplier: number;
  glowColor: string;
  glowStrength: number;
  mirrored: boolean;
  radialRadius: number;
  lineThickness: number;
  themePreset: 'neon-violet' | 'cyberpunk-gold' | 'emerald-breeze' | 'crimson-pulse' | 'custom';
}

export interface AudioReactiveConfig {
  scaleReaction: boolean;
  scaleStrength: number;
  colorShiftReaction: boolean;
  opacityReaction: boolean;
  frequencyBand: 'low' | 'mid' | 'high' | 'all';
}

export interface SoundWaveCanvasElement extends CanvasElement {
  type: 'sound-wave';
  source: AudioVisualizationSource;
  visualization: SoundWaveVisualizationConfig;
  style: SoundWaveStyleConfig;
  reactive: AudioReactiveConfig;
}

export interface CtaContentConfig {
  type: 'subscribe' | 'like' | 'bell' | 'follow' | 'instagram' | 'facebook' | 'twitter' | 'tiktok';
  primaryText: string;
  secondaryText?: string;
  avatarUrl?: string;
}

export interface CtaAppearanceConfig {
  theme: 'modern-dark' | 'classic-red' | 'cyberpunk-gold' | 'neon-violet' | 'brand-blue';
  primaryColor: string;
  secondaryColor: string;
  textColor: string;
  accentColor: string;
  borderRadius: number;
  fontSize: number;
  fontFamily: string;
  buttonText: string;
  buttonBgColor: string;
  buttonTextColor: string;
  glowEnabled: boolean;
  glowColor: string;
  glowStrength: number;
}

export interface CtaMotionConfig {
  introType: 'slide-up' | 'elastic-pop' | 'fade-zoom' | 'spring-slide';
  introDuration: number;
  outroType: 'slide-down' | 'shrink-fade' | 'fade' | 'pop-out';
  outroDuration: number;
  hoverPulseSpeed: number;
  hoverPulseAmplitude: number;
  autoActionTime: number;
  actionType: 'click-and-change' | 'scale-bump' | 'color-pulse' | 'none';
}

export interface CtaCanvasElement extends CanvasElement {
  type: 'subscribe';
  properties: {
    content: CtaContentConfig;
    appearance: CtaAppearanceConfig;
    motion: CtaMotionConfig;
  };
}
