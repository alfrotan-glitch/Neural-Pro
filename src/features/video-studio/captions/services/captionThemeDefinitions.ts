import type { CaptionTheme } from '../../../../core/engine/captionRenderModel';

export interface CaptionThemeDefinition {
  id: CaptionTheme;
  previewClassName: string;
  canvasBehavior: 'standard' | 'word-stack' | 'animated';
  usesActiveWord: boolean;
}

const definitions: Record<CaptionTheme, CaptionThemeDefinition> = {
  karaoke: { id: 'karaoke', previewClassName: 'caption-theme-karaoke', canvasBehavior: 'animated', usesActiveWord: true },
  glow: { id: 'glow', previewClassName: 'caption-theme-glow', canvasBehavior: 'animated', usesActiveWord: true },
  highlight: { id: 'highlight', previewClassName: 'caption-theme-highlight', canvasBehavior: 'animated', usesActiveWord: true },
  minimal: { id: 'minimal', previewClassName: 'caption-theme-minimal', canvasBehavior: 'standard', usesActiveWord: true },
  clean: { id: 'clean', previewClassName: 'caption-theme-clean', canvasBehavior: 'standard', usesActiveWord: true },
  pop: { id: 'pop', previewClassName: 'caption-theme-pop', canvasBehavior: 'animated', usesActiveWord: true },
  bounce: { id: 'bounce', previewClassName: 'caption-theme-bounce', canvasBehavior: 'animated', usesActiveWord: true },
  'shadow-pop': { id: 'shadow-pop', previewClassName: 'caption-theme-shadow-pop', canvasBehavior: 'animated', usesActiveWord: true },
  'split-reveal': { id: 'split-reveal', previewClassName: 'caption-theme-split-reveal', canvasBehavior: 'animated', usesActiveWord: true },
  'bold-impact': { id: 'bold-impact', previewClassName: 'caption-theme-bold-impact', canvasBehavior: 'standard', usesActiveWord: true },
  'gradient-flow': { id: 'gradient-flow', previewClassName: 'caption-theme-gradient-flow', canvasBehavior: 'animated', usesActiveWord: true },
  'moving-box': { id: 'moving-box', previewClassName: 'caption-theme-moving-box', canvasBehavior: 'animated', usesActiveWord: true },
  underline: { id: 'underline', previewClassName: 'caption-theme-underline', canvasBehavior: 'animated', usesActiveWord: true },
  'chat-bubble': { id: 'chat-bubble', previewClassName: 'caption-theme-chat-bubble', canvasBehavior: 'standard', usesActiveWord: true },
  handwritten: { id: 'handwritten', previewClassName: 'caption-theme-handwritten', canvasBehavior: 'animated', usesActiveWord: true },
  'flip-rotate': { id: 'flip-rotate', previewClassName: 'caption-theme-flip-rotate', canvasBehavior: 'animated', usesActiveWord: true },
  'confetti-burst': { id: 'confetti-burst', previewClassName: 'caption-theme-confetti-burst', canvasBehavior: 'animated', usesActiveWord: true },
  'outline-stroke': { id: 'outline-stroke', previewClassName: 'caption-theme-outline-stroke', canvasBehavior: 'standard', usesActiveWord: true },
  'word-stack': { id: 'word-stack', previewClassName: 'caption-theme-word-stack', canvasBehavior: 'word-stack', usesActiveWord: true },
  typewriter: { id: 'typewriter', previewClassName: 'caption-theme-typewriter', canvasBehavior: 'animated', usesActiveWord: true },
  line: { id: 'line', previewClassName: 'caption-theme-line', canvasBehavior: 'animated', usesActiveWord: true },
  box: { id: 'box', previewClassName: 'caption-theme-box', canvasBehavior: 'standard', usesActiveWord: true },
  cinematic: { id: 'cinematic', previewClassName: 'caption-theme-cinematic', canvasBehavior: 'animated', usesActiveWord: true },
  spring: { id: 'spring', previewClassName: 'caption-theme-spring', canvasBehavior: 'animated', usesActiveWord: true },
};

export function getCaptionThemeDefinition(theme: CaptionTheme): CaptionThemeDefinition {
  return definitions[theme];
}
