import React, { createContext, useContext } from 'react';
import type { ClipNode, Track } from '../../features/video-studio/project/types/project';
import type { Command } from '../../core/commands/types';

export type VideoTab = 'basic' | 'remove_bg' | 'mask' | 'animation';
export type AudioTab = 'basic' | 'voice_fx' | 'equalizer';
export type TextTab = 'captions' | 'text_style' | 'templates' | 'advanced';
export type AnimCategory = 'in' | 'out' | 'combo';
export type MaskType = 'none' | 'linear' | 'circle' | 'rectangle';

export interface TypographyPreset { styleId: string; name: string; color: string; outlineColor: string; bgColor: string; size: number; font: string; bold: boolean; }
export interface CustomTextPreset { styleId: string; name: string; color: string; outlineColor?: string; bgColor?: string; size: number; font: string; bold: boolean; italic?: boolean; underline?: boolean; charSpacing?: number; lineSpacing?: number; wordSpacing?: number; captionTheme?: string; }

export interface InspectorController {
  activeNode: ClipNode;
  tracks: Track[];
  selectedNodeIds: string[];
  trackType: Track['type'] | undefined;
  currentTime: number;

  updateNodeProperty: (nodeId: string, path: string, value: unknown) => void;
  updateNodesProperty: (nodeIds: string[], path: string, value: unknown) => void;
  executeCommand: (command: Command) => void;
  setSelectedNodeIds: (ids: string[]) => void;
  setCurrentTime: (time: number) => void;
  showToast: (message: string) => void;

  videoTab: VideoTab;
  setVideoTab: React.Dispatch<React.SetStateAction<VideoTab>>;
  uniformScale: boolean;
  setUniformScale: React.Dispatch<React.SetStateAction<boolean>>;
  chromaEnabled: boolean;
  setChromaEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  chromaColor: string;
  setChromaColor: React.Dispatch<React.SetStateAction<string>>;
  chromaIntensity: number;
  setChromaIntensity: React.Dispatch<React.SetStateAction<number>>;
  chromaShadow: number;
  setChromaShadow: React.Dispatch<React.SetStateAction<number>>;
  activeMask: MaskType;
  setActiveMask: React.Dispatch<React.SetStateAction<MaskType>>;
  maskFeather: number;
  setMaskFeather: React.Dispatch<React.SetStateAction<number>>;
  maskWidth: number;
  setMaskWidth: React.Dispatch<React.SetStateAction<number>>;
  maskHeight: number;
  setMaskHeight: React.Dispatch<React.SetStateAction<number>>;
  maskRotation: number;
  setMaskRotation: React.Dispatch<React.SetStateAction<number>>;
  animCategory: AnimCategory;
  setAnimCategory: React.Dispatch<React.SetStateAction<AnimCategory>>;
  animSearch: string;
  setAnimSearch: React.Dispatch<React.SetStateAction<string>>;
  videoAnimations: Array<{type: string; id: string; name: string; duration: number; thumbnail: string}>;
  handleAlign: (position: 'left' | 'right' | 'top' | 'bottom' | 'center') => void;

  audioTab: AudioTab;
  setAudioTab: React.Dispatch<React.SetStateAction<AudioTab>>;
  eqLow: number;
  setEqLow: React.Dispatch<React.SetStateAction<number>>;
  eqMid: number;
  setEqMid: React.Dispatch<React.SetStateAction<number>>;
  eqHigh: number;
  setEqHigh: React.Dispatch<React.SetStateAction<number>>;
  activeVoiceFx: string;
  setActiveVoiceFx: React.Dispatch<React.SetStateAction<string>>;
  translateLang: string;
  setTranslateLang: React.Dispatch<React.SetStateAction<string>>;
  selectedVoice: string;
  setSelectedVoice: React.Dispatch<React.SetStateAction<string>>;

  textTab: TextTab;
  setTextTab: React.Dispatch<React.SetStateAction<TextTab>>;
  templateCategory: string;
  setTemplateCategory: React.Dispatch<React.SetStateAction<string>>;
  captionSearch: string;
  setCaptionSearch: React.Dispatch<React.SetStateAction<string>>;
  isTranslating: boolean;
  setIsTranslating: React.Dispatch<React.SetStateAction<boolean>>;
  isTTSGenerating: boolean;
  setIsTTSGenerating: React.Dispatch<React.SetStateAction<boolean>>;
  isGeneratingCaptions: boolean;
  setIsGeneratingCaptions: React.Dispatch<React.SetStateAction<boolean>>;
  isRefiningCaptions: boolean;
  setIsRefiningCaptions: React.Dispatch<React.SetStateAction<boolean>>;
  captionPrompt: string;
  setCaptionPrompt: React.Dispatch<React.SetStateAction<string>>;
  applyScope: 'single' | 'all';
  setApplyScope: React.Dispatch<React.SetStateAction<'single' | 'all'>>;
  restorePunctuation: boolean;
  setRestorePunctuation: React.Dispatch<React.SetStateAction<boolean>>;
  grammarPrompt: string;
  setGrammarPrompt: React.Dispatch<React.SetStateAction<string>>;
  grammarPreset: string;
  setGrammarPreset: React.Dispatch<React.SetStateAction<string>>;
  typographyPresets: TypographyPreset[];
  customPresets: CustomTextPreset[];
  setCustomPresets: React.Dispatch<React.SetStateAction<CustomTextPreset[]>>;
  getSubtitlesList: () => Array<{id: string; frame: string; text: string; duration: number; start: number}>;
  handleAutoCaptionGenerate: () => Promise<void>;
  handleSrtUpload: (event: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
  handleSrtExport: () => Promise<void>;
  handleAiRefine: () => Promise<void>;
  handleAddNewCaption: () => void;
  textColorInputRef: React.RefObject<HTMLInputElement | null>;
  activeColorInputRef: React.RefObject<HTMLInputElement | null>;
  bgInputRef: React.RefObject<HTMLInputElement | null>;
}

const InspectorContext = createContext<InspectorController | null>(null);

export const InspectorProvider: React.FC<React.PropsWithChildren<{value: InspectorController}>> = ({ value, children }) => (
  <InspectorContext.Provider value={value}>{children}</InspectorContext.Provider>
);

export function useInspectorController(): InspectorController {
  const value = useContext(InspectorContext);
  if (!value) throw new Error('Inspector panels must be rendered inside InspectorProvider');
  return value;
}
