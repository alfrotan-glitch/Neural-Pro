import React, { useEffect, useMemo, useRef } from 'react';
import { motion, type TargetAndTransition } from 'motion/react';
import { confettiAngle } from '../../features/video-studio/captions/services/captionPreviewDeterminism';
import { ensureCaptionFont } from '../../features/video-studio/captions/services/captionFontRegistry';
import { isCaptionTheme, type CaptionWord, type CaptionTheme } from '../../core/engine/captionRenderModel';
import { createCaptionRenderPlan } from '../../features/video-studio/captions/services/captionRenderPlan';
import { toCaptionPreviewAdapter } from '../../features/video-studio/captions/services/captionPreviewAdapter';
import { getCaptionVisualContract } from '../../features/video-studio/captions/services/captionVisualContract';
import { resolveCaptionAnimationState } from '../../features/video-studio/captions/services/captionAnimationContract';

interface SubtitleRendererProps {
  textContent: string;
  words?: { word: string; start: number; end: number }[];
  currentTime: number;
  theme: CaptionTheme | string;
  style: React.CSSProperties;
  
  // Custom display options
  captionDisplayMode?: 'phrase' | 'sentence';
  clipId?: string;
  clipStart?: number;
  clipEnd?: number;
  bounceDuration?: number;

  // Custom appearance options
  // Container
  containerWidth?: number;
  containerHeight?: number;
  containerAutoWidth?: boolean;
  containerAutoHeight?: boolean;
  padding?: number;
  containerMargin?: number;
  radius?: number;
  alignment?: string;
  
  // Background
  bgEnabled?: boolean;
  backgroundColor?: string;
  bgOpacity?: number;
  bgGradientEnabled?: boolean;
  bgGradientColor?: string;
  bgGradientDirection?: string;
  bgBlur?: number;
  bgGlassEffect?: boolean;
  
  // Border
  borderEnabled?: boolean;
  borderWidth?: number;
  borderColor?: string;
  borderStyle?: string;
  
  // Shadow
  shadowEnabled?: boolean;
  shadowColor?: string;
  shadowBlur?: number;
  shadowDistance?: number;
  shadowOpacity?: number;
  
  // Text
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: string;
  textColor?: string;
  textStrokeEnabled?: boolean;
  textStrokeColor?: string;
  textStrokeWidth?: number;
  textOutlineEnabled?: boolean;
  textOutlineColor?: string;
  textOutlineBlur?: number;
  textGlowEnabled?: boolean;
  textGlowColor?: string;
  textGlowBlur?: number;
  charSpacing?: number;
  lineSpacing?: number;
  wordSpacing?: number;
  
  // Highlight
  highlightEnabled?: boolean;
  activeColor?: string;
  highlightOpacity?: number;
  highlightRadius?: number;
  highlightPaddingX?: number;
  highlightPaddingY?: number;
  highlightSpeed?: number;
  highlightCurve?: 'spring' | 'easeInOut' | 'linear';
  highlightFollowMode?: 'word' | 'character' | 'line';
  
  // Animation
  textAnimationPreset?: string;
  containerAnimationEnabled?: boolean;

  // --- UNIQUE CONFIGURATIONS FOR THEMES (captionTemplates) ---
  // Moving Box properties
  movingBoxBgColor?: string;
  movingBoxRadius?: number;
  movingBoxBorderWidth?: number;
  movingBoxBorderColor?: string;
  movingBoxPaddingX?: number;
  movingBoxPaddingY?: number;
  movingBoxScale?: number;
  movingBoxShadowOpacity?: number;

  // Karaoke properties
  karaokeActiveScale?: number;
  karaokeInactiveOpacity?: number;
  karaokeInactiveColor?: string;
  karaokeActiveBold?: boolean;

  // Underline properties
  underlineColor?: string;
  underlineHeight?: number;
  underlineGap?: number;
  underlineStyle?: 'solid' | 'dashed' | 'double';
  underlineAnimation?: string;

  // Glow properties
  glowColor?: string;
  glowRadius?: number;
  glowBrightness?: number;
  glowPulseSpeed?: number;
  glowInactiveBlur?: number;

  // Highlight properties
  highlightBgColor?: string;
  highlightBorderColor?: string;
  highlightBorderWidth?: number;
  highlightTextColor?: string;

  // Pop properties
  popScale?: number;
  popRotation?: number;
  popBorderColor?: string;
  popBounceStiffness?: number;
  popBounceDamping?: number;

  // Bounce properties
  bounceHeight?: number;
  bounceRotate?: number;
  bounceScale?: number;
  bounceStiffness?: number;
  bounceDamping?: number;

  // Minimal properties
  minimalShowDot?: boolean;
  minimalDotColor?: string;
  minimalLetterSpacing?: number;
  minimalActiveLetterSpacing?: number;
  minimalScale?: number;
  minimalOpacity?: number;

  // Typewriter properties
  typewriterCursorType?: string;
  typewriterCursorSpeed?: number;
  typewriterCursorColor?: string;
  typewriterCursorSize?: number;

  // Clean properties
  cleanContrast?: number;
  cleanIndicatorBar?: boolean;
  cleanIndicatorColor?: string;

  // Shadow Pop properties
  shadowPopColor?: string;
  shadowPopBlur?: number;
  shadowPopOffset?: number;
  shadowPopActiveOffset?: number;

  // Word Stack properties
  wordStackDirection?: 'up' | 'down' | 'horizontal';
  wordStackSpacing?: number;
  wordStackMaxItems?: number;

  // Split Reveal properties
  splitRevealGap?: number;
  splitRevealDuration?: number;
  splitRevealDirection?: 'horizontal' | 'vertical';

  // Bold Impact properties
  boldImpactUppercase?: boolean;
  boldImpactLetterSpacing?: number;
  boldImpactBorderWidth?: number;
  boldImpactBorderColor?: string;

  // Gradient Flow properties
  gradientFlowStartColor?: string;
  gradientFlowEndColor?: string;
  gradientFlowSpeed?: number;
  gradientFlowAngle?: number;

  // Chat Bubble properties
  chatBubbleBgColor?: string;
  chatBubbleTextColor?: string;
  chatBubbleRadius?: number;
  chatBubblePaddingX?: number;
  chatBubblePaddingY?: number;
  chatBubbleTail?: boolean;

  // Handwritten properties
  handwrittenFont?: string;
  handwrittenDrawSpeed?: number;
  handwrittenColor?: string;

  // Flip/Rotate properties
  flipRotateAxis?: 'x' | 'y' | 'z';
  flipRotateDuration?: number;
  flipRotatePerspective?: number;

  // Confetti Burst properties
  confettiBurstCount?: number;
  confettiBurstColorList?: string;
  confettiBurstRadius?: number;

  // Outline Stroke properties
  outlineStrokeColor?: string;
  outlineStrokeWidth?: number;
  outlineStrokeFillOpacity?: number;
}

const splitWordPunctuation = (word: string) => {
  const match = word.match(/^([^a-zA-Z0-9'’‘\u0600-\u06FF]*)([a-zA-Z0-9'’‘\u0600-\u06FF]+)([^a-zA-Z0-9'’‘\u0600-\u06FF]*)$/);
  if (match) {
    return { prePunc: match[1], stem: match[2], postPunc: match[3] };
  }
  return { prePunc: '', stem: word, postPunc: '' };
};

const EMPTY_WORDS: CaptionWord[] = [];

export const SubtitleRenderer: React.FC<SubtitleRendererProps> = ({
  textContent,
  words = EMPTY_WORDS,
  currentTime,
  theme: themeInput = 'karaoke',
  style,

  captionDisplayMode = 'phrase',
  clipId = 'caption',
  clipStart,
  clipEnd,
  
  // Container defaults
  containerWidth = 550,
  containerHeight = 110,
  containerAutoWidth = true,
  containerAutoHeight = true,
  padding = 16,
  containerMargin = 0,
  radius = 12,
  alignment = 'center',
  
  // Background defaults
  bgEnabled = true,
  backgroundColor = 'rgba(0, 0, 0, 0.75)',
  bgOpacity = 0.75,
  bgGradientEnabled = false,
  bgGradientColor = '#a855f7',
  bgGradientDirection = 'to bottom',
  bgBlur = 4,
  bgGlassEffect = false,
  
  // Border defaults
  borderEnabled = false,
  borderWidth = 1,
  borderColor = 'rgba(255, 255, 255, 0.1)',
  borderStyle = 'solid',
  
  // Shadow defaults
  shadowEnabled = true,
  shadowColor = 'rgba(0, 0, 0, 0.4)',
  shadowBlur = 25,
  shadowDistance = 8,
  shadowOpacity = 0.3,
  
  // Text defaults
  fontFamily = 'Inter',
  fontSize = 22,
  fontWeight = 'bold',
  textColor = '#ffffff',
  textStrokeEnabled = false,
  textStrokeColor = '#000000',
  textStrokeWidth = 1,
  textOutlineEnabled = false,
  textOutlineColor = '#000000',
  textOutlineBlur = 3,
  textGlowEnabled = false,
  textGlowColor = '#a855f7',
  textGlowBlur = 8,
  charSpacing = 0,
  lineSpacing = 1.2,
  wordSpacing = 12,
  
  // Highlight defaults
  highlightEnabled = true,
  activeColor = '#eab308',
  highlightOpacity = 1,
  highlightRadius = 6,
  highlightPaddingX = 8,
  highlightPaddingY = 4,
  highlightSpeed = 0.2,
  highlightCurve = 'spring',
  highlightFollowMode = 'word',
  
  // Animation defaults
  textAnimationPreset = 'fade',
  containerAnimationEnabled = false,

  // --- UNIQUE THEME PROPERTY DEFAULTS ---
  movingBoxBgColor = '#a855f7',
  movingBoxRadius = 8,
  movingBoxBorderWidth = 0,
  movingBoxBorderColor = '#ffffff',
  movingBoxPaddingX = 8,
  movingBoxPaddingY = 4,
  movingBoxScale = 1.05,
  movingBoxShadowOpacity = 0.3,

  karaokeActiveScale = 1.15,
  karaokeInactiveOpacity = 0.4,
  karaokeInactiveColor = '',
  karaokeActiveBold = true,

  underlineColor = '#eab308',
  underlineHeight = 3,
  underlineGap = 4,
  underlineStyle = 'solid',
  underlineAnimation = 'draw',

  glowColor = '#10b981',
  glowRadius = 12,
  glowBrightness = 1.5,
  glowPulseSpeed = 1.2,
  glowInactiveBlur = 1.5,

  highlightBgColor = '#eab308',
  highlightBorderColor = '#ffffff',
  highlightBorderWidth = 0,
  highlightTextColor = '#000000',

  popScale = 1.3,
  popRotation = -5,
  popBorderColor = '#a855f7',
  popBounceStiffness = 300,
  popBounceDamping = 12,

  bounceHeight = -15,
  bounceRotate = 5,
  bounceScale = 1.1,
  bounceStiffness = 300,
  bounceDamping = 12,

  minimalShowDot = true,
  minimalDotColor = '#ffffff',
  minimalLetterSpacing = 0,
  minimalActiveLetterSpacing = 2,
  minimalScale = 1.05,
  minimalOpacity = 0.5,

  typewriterCursorType = '|',
  typewriterCursorSpeed = 0.8,
  typewriterCursorColor = '#ffffff',
  typewriterCursorSize = 22,

  cleanContrast = 0.8,
  cleanIndicatorBar = false,
  cleanIndicatorColor = '#ffffff',

  // Shadow Pop defaults
  shadowPopColor = 'rgba(0,0,0,0.85)',
  shadowPopBlur = 0,
  shadowPopOffset = 4,
  shadowPopActiveOffset = 8,

  // Word Stack defaults
  wordStackDirection = 'up',
  wordStackSpacing = 16,
  wordStackMaxItems = 3,

  // Split Reveal defaults
  splitRevealGap = 8,
  splitRevealDuration = 0.3,
  splitRevealDirection = 'horizontal',

  // Bold Impact defaults
  boldImpactUppercase = true,
  boldImpactLetterSpacing = 1,
  boldImpactBorderWidth = 3,
  boldImpactBorderColor = '#000000',

  // Gradient Flow defaults
  gradientFlowStartColor = '#ec4899',
  gradientFlowEndColor = '#8b5cf6',
  gradientFlowSpeed = 2,
  gradientFlowAngle = 45,

  // Chat Bubble defaults
  chatBubbleBgColor = '#2563eb',
  chatBubbleTextColor = '#ffffff',
  chatBubbleRadius = 12,
  chatBubblePaddingX = 12,
  chatBubblePaddingY = 6,
  chatBubbleTail = true,

  // Handwritten defaults
  handwrittenFont = 'Caveat',
  handwrittenDrawSpeed = 0.4,
  handwrittenColor = '#fbbf24',

  // Flip/Rotate defaults
  flipRotateAxis = 'y',
  flipRotateDuration = 0.4,
  flipRotatePerspective = 800,

  // Confetti Burst defaults
  confettiBurstCount = 10,
  confettiBurstColorList = '#ff0000,#00ff00,#0000ff,#ffff00,#ff00ff',
  confettiBurstRadius = 50,

  // Outline Stroke defaults
  outlineStrokeColor = '#ffffff',
  outlineStrokeWidth = 2,
  outlineStrokeFillOpacity = 0.1,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const theme: CaptionTheme = isCaptionTheme(themeInput) ? themeInput : 'karaoke';

  useEffect(() => {
    void ensureCaptionFont(fontFamily);
    void ensureCaptionFont(handwrittenFont);
  }, [fontFamily, handwrittenFont]);
  
  // Preview and export now consume the same canonical CaptionRenderPlan timing model.
  const renderPlan = useMemo(() => createCaptionRenderPlan({
    clipId: 'preview-caption',
    startAt: clipStart ?? 0,
    duration: Math.max(0, (clipEnd ?? (clipStart ?? 0)) - (clipStart ?? 0)),
    properties: {
      textContent,
      words,
      captionTheme: theme,
      captionDisplayMode,
      fontFamily,
      fontSize,
      fontWeight,
      textColor,
    },
  }, currentTime), [words, textContent, theme, captionDisplayMode, clipStart, clipEnd, currentTime, fontFamily, fontSize, fontWeight, textColor]);

  const previewAdapter = useMemo(() => toCaptionPreviewAdapter(renderPlan), [renderPlan]);
  const visualContract = useMemo(() => getCaptionVisualContract({
    theme, fontFamily, fontSize, fontWeight, charSpacing, lineSpacing, wordSpacing, padding,
    containerWidth, containerHeight, containerAutoWidth, containerAutoHeight, alignment,
    handwrittenFont, boldImpactLetterSpacing, boldImpactUppercase,
    minimalLetterSpacing,
  }), [theme, fontFamily, fontSize, fontWeight, charSpacing, lineSpacing, wordSpacing, padding, containerWidth, containerHeight, containerAutoWidth, containerAutoHeight, alignment, handwrittenFont, boldImpactLetterSpacing, boldImpactUppercase, minimalLetterSpacing]);
  const activeWords = previewAdapter.activeWords;
  const activeIdx = previewAdapter.activeWordIndex;

  // Plain-text fallback is driven by the same canonical CaptionRenderPlan timeline
  // used by Canvas export. This prevents Preview from inventing a second sentence
  // segmentation/timing algorithm when word timestamps are unavailable.
  const displayPlainContent = useMemo(() => {
    if (activeWords.length === 0) return textContent;
    return activeWords.map((word) => String(word.word ?? '')).join(' ').trim() || textContent;
  }, [activeWords, textContent]);

  // Layout & Styling Calculations
  const outerContainerStyle: React.CSSProperties = {
    ...style,
    boxSizing: 'border-box',
    width: visualContract.autoWidth ? 'auto' : `${visualContract.containerWidth}px`,
    height: visualContract.autoHeight ? 'auto' : `${visualContract.containerHeight}px`,
    minWidth: containerAutoWidth ? '260px' : undefined,
    minHeight: containerAutoHeight ? '60px' : undefined,
    padding: `${Math.max(16, visualContract.padding)}px`,
    borderRadius: `${radius}px`,
    margin: `${containerMargin}px`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: visualContract.textAlign === 'left' ? 'flex-start' : visualContract.textAlign === 'right' ? 'flex-end' : 'center',
    position: 'relative',
    overflow: 'hidden',
    boxShadow: shadowEnabled 
      ? `0 ${shadowDistance}px ${shadowBlur}px ${shadowColor}` 
      : 'none',
  };

  const bgLayerStyle: React.CSSProperties = {
    position: 'absolute',
    inset: 0,
    zIndex: 0,
    borderRadius: `${radius}px`,
    opacity: bgOpacity,
    backgroundColor: bgGradientEnabled ? 'transparent' : backgroundColor,
    backgroundImage: bgGradientEnabled 
      ? `linear-gradient(${bgGradientDirection}, ${backgroundColor}, ${bgGradientColor})` 
      : 'none',
    backdropFilter: bgGlassEffect 
      ? `blur(${bgBlur}px) saturate(180%)` 
      : bgBlur > 0 ? `blur(${bgBlur}px)` : 'none',
  };

  const borderLayerStyle: React.CSSProperties = {
    position: 'absolute',
    inset: 0,
    zIndex: 1,
    borderRadius: `${radius}px`,
    border: borderEnabled ? `${borderWidth}px ${borderStyle} ${borderColor}` : 'none',
    pointerEvents: 'none',
  };

  // Text Stroke, Outline & Glow text shadow calculations
  const strokeStyle = textStrokeEnabled
    ? { WebkitTextStroke: `${textStrokeWidth}px ${textStrokeColor}` }
    : {};

  const textOutlineShadow = textOutlineEnabled
    ? `-1px -1px 0 ${textOutlineColor}, 1px -1px 0 ${textOutlineColor}, -1px 1px 0 ${textOutlineColor}, 1px 1px 0 ${textOutlineColor}`
    : '';

  const textGlowShadow = textGlowEnabled
    ? `0 0 ${textGlowBlur}px ${textGlowColor}`
    : '';

  const combinedShadows = [textOutlineShadow, textGlowShadow].filter(Boolean).join(', ');
  const textShadowStyle = combinedShadows ? { textShadow: combinedShadows } : {};

  // Base styled word setup
  const baseWordStyle: React.CSSProperties = {
    fontFamily: visualContract.fontFamily,
    fontSize: `${visualContract.fontSize}px`,
    fontWeight: visualContract.fontWeight as any,
    color: textColor,
    letterSpacing: `${visualContract.letterSpacing}px`,
    lineHeight: visualContract.lineHeight,
    ...strokeStyle,
    ...textShadowStyle,
  };

  // Dynamic Word Animations Config adapted to the specific theme
  const getWordAnimation = (isActive: boolean, progress = isActive ? 1 : 0): { initial: TargetAndTransition; animate: TargetAndTransition } => {
    // If pop theme is chosen
    if (theme === 'pop') {
      return {
        initial: { scale: 0.9, rotate: 0 },
        animate: { 
          scale: isActive ? popScale : 1, 
          rotate: isActive ? popRotation : 0,
          transition: { type: 'spring', stiffness: popBounceStiffness, damping: popBounceDamping }
        }
      };
    }

    // If bounce theme is chosen
    if (theme === 'bounce') {
      return {
        initial: { y: 0, rotate: 0, scale: 1 },
        animate: { 
          y: isActive ? bounceHeight : 0,
          rotate: isActive ? bounceRotate : 0,
          scale: isActive ? bounceScale : 1,
          transition: { type: 'spring', stiffness: bounceStiffness, damping: bounceDamping }
        }
      };
    }

    // If flip-rotate theme is chosen
    if (theme === 'flip-rotate') {
      const rotateXVal = flipRotateAxis === 'x' ? [90, 0] : 0;
      const rotateYVal = flipRotateAxis === 'y' ? [90, 0] : 0;
      const rotateZVal = flipRotateAxis === 'z' ? [45, 0] : 0;
      return {
        initial: { 
          rotateX: flipRotateAxis === 'x' ? 90 : 0, 
          rotateY: flipRotateAxis === 'y' ? 90 : 0, 
          rotateZ: flipRotateAxis === 'z' ? 45 : 0, 
          opacity: 0.4 
        },
        animate: { 
          rotateX: isActive ? rotateXVal : 0,
          rotateY: isActive ? rotateYVal : 0,
          rotateZ: isActive ? rotateZVal : 0,
          opacity: isActive ? 1 : 0.4,
          transition: { duration: flipRotateDuration, ease: 'easeOut' }
        }
      };
    }

    const state = resolveCaptionAnimationState({
      preset: textAnimationPreset,
      progress,
      active: isActive,
    });
    return {
      initial: { opacity: state.opacity, scale: state.scale, x: state.x, y: state.y, rotate: state.rotate, filter: state.blurPx > 0 ? `blur(${state.blurPx}px)` : 'blur(0px)' },
      animate: { opacity: state.opacity, scale: state.scale, x: state.x, y: state.y, rotate: state.rotate, filter: state.blurPx > 0 ? `blur(${state.blurPx}px)` : 'blur(0px)' },
    };
  };

  const highlightTransition = useMemo(() => {
    if (highlightCurve === 'spring') {
      const stiffnessVal = Math.max(100, 400 - (highlightSpeed * 500));
      const dampingVal = Math.max(15, 35 - (highlightSpeed * 50));
      return {
        type: 'spring' as const,
        stiffness: stiffnessVal,
        damping: dampingVal,
        mass: 0.8
      };
    } else if (highlightCurve === 'linear') {
      return {
        type: 'tween' as const,
        ease: 'linear' as const,
        duration: highlightSpeed
      };
    } else {
      return {
        type: 'tween' as const,
        ease: 'easeInOut' as const,
        duration: highlightSpeed
      };
    }
  }, [highlightCurve, highlightSpeed]);

  const springTransition = {
    type: 'spring' as const,
    stiffness: 300,
    damping: 25,
    mass: 0.8,
  };

  // Render plain text fallback if no word timestamps exist
  if (!words || words.length === 0) {
    return (
      <div 
        ref={containerRef}
        style={outerContainerStyle}
        className="relative select-none pointer-events-auto"
        id="plain_subtitle_container"
      >
        {bgEnabled && <div id="plain_bg_layer" style={bgLayerStyle} />}
        {borderEnabled && <div id="plain_border_layer" style={borderLayerStyle} />}
        
        <div 
          style={{
            ...baseWordStyle,
            textAlign: visualContract.textAlign,
            width: '100%',
            boxSizing: 'border-box',
            wordBreak: 'break-word',
            overflowWrap: 'break-word',
          }}
          className="relative z-30 block transition-all duration-300"
          id="plain_text_content"
        >
          {displayPlainContent}
        </div>
      </div>
    );
  }

  return (
    <div 
      ref={containerRef}
      style={outerContainerStyle}
      className="relative select-none pointer-events-auto"
      id="subtitle_container_root"
    >
      {/* 1. SUBTITLE CONTAINER - BACKGROUND LAYER */}
      {bgEnabled && (
        <div 
          id="subtitle_bg_layer"
          style={bgLayerStyle}
          className="transition-all duration-300"
        />
      )}

      {/* 2. SUBTITLE CONTAINER - BORDER LAYER */}
      {borderEnabled && (
        <div 
          id="subtitle_border_layer"
          style={borderLayerStyle}
          className="transition-all duration-300"
        />
      )}

      {/* Clean theme Left Indicator Bar */}
      {theme === 'clean' && cleanIndicatorBar && (
        <motion.div 
          style={{
            position: 'absolute',
            left: '8px',
            top: '12px',
            bottom: '12px',
            width: '3.5px',
            backgroundColor: cleanIndicatorColor,
            borderRadius: '2px',
            zIndex: 10,
          }}
          layoutId={`subtitle-${clipId}-clean-indicator-bar`}
        />
      )}

      {/* 3. TEXT LAYER & ANIMATION CONTROLLER */}
      <div 
        id="subtitle_text_layer"
        style={{
          position: 'relative',
          zIndex: 3,
          width: '100%',
          height: '100%',
          boxSizing: 'border-box',
          wordBreak: 'break-word',
          overflowWrap: 'break-word',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: visualContract.textAlign === 'left' ? 'flex-start' : visualContract.textAlign === 'right' ? 'flex-end' : 'center',
          columnGap: `${visualContract.wordSpacing}px`,
          rowGap: `${Math.max(0, (visualContract.lineHeight - 1) * visualContract.fontSize)}px`,
        }}
      >
        {activeWords.map((w, idx) => {
          const isActive = idx === activeIdx;
          const { prePunc, stem, postPunc } = splitWordPunctuation(w.word);
          const wordProgress = w.end > w.start ? Math.max(0, Math.min(1, (currentTime - w.start) / (w.end - w.start))) : (isActive ? 1 : 0);
          const animProps = getWordAnimation(isActive, wordProgress);

          // Get Custom styling for the word depending on the selected theme and active state
          const wordStyle: React.CSSProperties = { ...baseWordStyle };
          
          if (isActive) {
            if (theme === 'karaoke') {
              if (karaokeActiveBold) wordStyle.fontWeight = 'bold';
              wordStyle.color = activeColor;
              wordStyle.transform = `scale(${karaokeActiveScale})`;
            } else if (theme === 'glow') {
              wordStyle.color = glowColor;
              wordStyle.textShadow = `0 0 ${glowRadius}px ${glowColor}, 0 0 ${glowRadius * 1.8}px ${glowColor}`;
              wordStyle.filter = `brightness(${glowBrightness})`;
            } else if (theme === 'highlight') {
              if (highlightTextColor) wordStyle.color = highlightTextColor;
            } else if (theme === 'minimal') {
              wordStyle.transform = `scale(${minimalScale})`;
              wordStyle.letterSpacing = `${minimalActiveLetterSpacing}px`;
            } else if (theme === 'clean') {
              wordStyle.color = activeColor;
            } else if (theme === 'pop') {
              wordStyle.color = activeColor;
              wordStyle.backgroundColor = `${activeColor}33`; // 20% opacity
              wordStyle.border = `1px solid ${activeColor}66`; // 40% opacity
              wordStyle.padding = '4px 8px';
              wordStyle.borderRadius = '12px';
            } else if (theme === 'bounce') {
              wordStyle.color = activeColor;
            } else if (theme === 'line') {
              wordStyle.color = activeColor;
              wordStyle.transform = `scale(${karaokeActiveScale})`;
              wordStyle.borderBottom = `${Math.max(1, underlineHeight / 2)}px solid ${underlineColor}`;
              wordStyle.paddingBottom = `${Math.max(1, underlineGap / 2)}px`;
            } else if (theme === 'shadow-pop') {
              wordStyle.color = activeColor;
              wordStyle.textShadow = `${shadowPopActiveOffset}px ${shadowPopActiveOffset}px ${shadowPopBlur}px ${shadowPopColor}`;
            } else if (theme === 'split-reveal') {
              wordStyle.color = activeColor;
              wordStyle.letterSpacing = `${splitRevealGap}px`;
              wordStyle.transition = `letter-spacing ${splitRevealDuration}s cubic-bezier(0.175, 0.885, 0.32, 1.275), color 0.2s`;
            } else if (theme === 'bold-impact') {
              wordStyle.color = activeColor;
              wordStyle.fontFamily = '"Impact", "Arial Black", sans-serif';
              wordStyle.fontWeight = '900';
              if (boldImpactUppercase) wordStyle.textTransform = 'uppercase';
              wordStyle.letterSpacing = `${boldImpactLetterSpacing}px`;
              wordStyle.WebkitTextStroke = `${boldImpactBorderWidth}px ${boldImpactBorderColor}`;
              wordStyle.transform = 'scale(1.15)';
            } else if (theme === 'gradient-flow') {
              wordStyle.background = `linear-gradient(${gradientFlowAngle}deg, ${gradientFlowStartColor}, ${gradientFlowEndColor})`;
              wordStyle.WebkitBackgroundClip = 'text';
              wordStyle.WebkitTextFillColor = 'transparent';
              wordStyle.backgroundSize = '200% auto';
              wordStyle.transform = 'scale(1.1)';
              wordStyle.animation = `gradient-flow-anim ${gradientFlowSpeed}s linear infinite`;
            } else if (theme === 'chat-bubble') {
              wordStyle.color = chatBubbleTextColor;
              wordStyle.zIndex = 5;
            } else if (theme === 'handwritten') {
              wordStyle.fontFamily = `"${handwrittenFont}", "Caveat", "Pacifico", "Brush Script MT", cursive`;
              wordStyle.color = handwrittenColor;
              wordStyle.transform = 'scale(1.15) rotate(-2deg)';
            } else if (theme === 'flip-rotate') {
              wordStyle.color = activeColor;
            } else if (theme === 'outline-stroke') {
              wordStyle.color = activeColor;
              wordStyle.WebkitTextStroke = `${outlineStrokeWidth}px ${outlineStrokeColor}`;
              wordStyle.transform = 'scale(1.05)';
            } else if (theme === 'cinematic') {
              // Canonical theme contract: restrained tracking on the active word.
              wordStyle.letterSpacing = '1px';
            } else if (theme === 'spring') {
              // Canonical theme contract: playful active-word scale.
              wordStyle.transform = 'scale(1.12)';
            }
          } else {
            // Unactive word styling
            if (theme === 'karaoke') {
              wordStyle.opacity = karaokeInactiveOpacity;
              if (karaokeInactiveColor) wordStyle.color = karaokeInactiveColor;
            } else if (theme === 'glow') {
              wordStyle.opacity = 0.4;
              if (glowInactiveBlur > 0) {
                wordStyle.filter = `blur(${glowInactiveBlur}px)`;
              }
            } else if (theme === 'minimal') {
              wordStyle.opacity = minimalOpacity;
              wordStyle.letterSpacing = `${minimalLetterSpacing}px`;
            } else if (theme === 'clean') {
              wordStyle.opacity = cleanContrast;
            } else if (theme === 'line') {
              wordStyle.opacity = karaokeInactiveOpacity;
              wordStyle.borderBottom = `${Math.max(1, underlineHeight / 2)}px solid ${underlineColor}66`;
            } else if (theme === 'shadow-pop') {
              wordStyle.opacity = 0.5;
              wordStyle.textShadow = `${shadowPopOffset}px ${shadowPopOffset}px 2px rgba(0,0,0,0.45)`;
            } else if (theme === 'split-reveal') {
              wordStyle.opacity = 0.45;
              wordStyle.letterSpacing = '0px';
            } else if (theme === 'bold-impact') {
              wordStyle.opacity = 0.5;
              wordStyle.fontFamily = '"Impact", "Arial Black", sans-serif';
              wordStyle.fontWeight = '900';
              if (boldImpactUppercase) wordStyle.textTransform = 'uppercase';
              wordStyle.letterSpacing = `${boldImpactLetterSpacing}px`;
              wordStyle.WebkitTextStroke = `1px rgba(0,0,0,0.6)`;
            } else if (theme === 'gradient-flow') {
              wordStyle.opacity = 0.35;
            } else if (theme === 'chat-bubble') {
              wordStyle.opacity = 0.5;
            } else if (theme === 'handwritten') {
              wordStyle.fontFamily = `"${handwrittenFont}", "Caveat", "Pacifico", "Brush Script MT", cursive`;
              wordStyle.opacity = 0.45;
            } else if (theme === 'flip-rotate') {
              wordStyle.opacity = 0.4;
            } else if (theme === 'outline-stroke') {
              wordStyle.color = 'transparent';
              wordStyle.WebkitTextStroke = `${outlineStrokeWidth}px ${outlineStrokeColor}`;
              wordStyle.opacity = outlineStrokeFillOpacity;
            }
          }

          // Custom Word Stack override
          if (theme === 'word-stack') {
            const distance = idx - activeIdx;
            if (Math.abs(distance) > wordStackMaxItems) {
              wordStyle.display = 'none';
            } else {
              wordStyle.position = 'absolute';
              wordStyle.left = '50%';
              wordStyle.transform = `translateX(-50%) translateY(${distance * wordStackSpacing}px) scale(${distance === 0 ? 1.25 : 0.85})`;
              wordStyle.opacity = distance === 0 ? 1 : 0.35;
              wordStyle.color = distance === 0 ? activeColor : textColor;
              wordStyle.transition = 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
              wordStyle.whiteSpace = 'nowrap';
              wordStyle.zIndex = distance === 0 ? 10 : 1;
            }
          }

          return (
            <motion.span
              key={idx}
              data-word-index={idx}
              initial={animProps.initial}
              animate={animProps.animate}
              transition={theme === 'pop' || theme === 'bounce' || theme === 'flip-rotate' ? springTransition : { duration: 0 }}
              style={{
                ...wordStyle,
                display: 'inline-flex',
                alignItems: 'center',
                position: 'relative',
              }}
              className="transition-all duration-200"
            >
              {/* Theme: Moving Box */}
              {theme === 'moving-box' && isActive && (
                <motion.span
                  layoutId={`subtitle-${clipId}-${idx}-moving-box`}
                  style={{
                    position: 'absolute',
                    inset: `-${movingBoxPaddingY}px -${movingBoxPaddingX}px`,
                    backgroundColor: movingBoxBgColor,
                    borderRadius: `${movingBoxRadius}px`,
                    border: movingBoxBorderWidth > 0 ? `${movingBoxBorderWidth}px solid ${movingBoxBorderColor}` : 'none',
                    boxShadow: `0 4px 12px rgba(0,0,0,${movingBoxShadowOpacity})`,
                    zIndex: -1,
                    scale: movingBoxScale,
                  }}
                  transition={highlightTransition}
                  className="pointer-events-none"
                />
              )}

              {/* Theme: Highlight */}
              {theme === 'highlight' && isActive && (
                <motion.span
                  layoutId={`subtitle-${clipStart ?? 0}-highlight`}
                  style={{
                    position: 'absolute',
                    inset: `-${highlightPaddingY}px -${highlightPaddingX}px`,
                    backgroundColor: highlightBgColor,
                    borderRadius: `${highlightRadius}px`,
                    border: highlightBorderWidth > 0 ? `${highlightBorderWidth}px solid ${highlightBorderColor}` : 'none',
                    zIndex: -1,
                  }}
                  transition={highlightTransition}
                  className="pointer-events-none"
                />
              )}

              {/* Theme: Underline */}
              {theme === 'underline' && isActive && (
                <motion.span
                  layoutId={`subtitle-${clipStart ?? 0}-underline`}
                  style={{
                    position: 'absolute',
                    bottom: `-${underlineGap}px`,
                    left: 0,
                    right: 0,
                    height: `${underlineHeight}px`,
                    backgroundColor: underlineColor,
                    borderRadius: '2px',
                    borderBottomStyle: underlineStyle,
                    zIndex: 2,
                  }}
                  className="pointer-events-none"
                  transition={highlightTransition}
                />
              )}

              {/* Theme: Minimal Dot */}
              {theme === 'minimal' && minimalShowDot && isActive && (
                <motion.span
                  layoutId={`subtitle-${clipStart ?? 0}-minimal-dot`}
                  style={{
                    position: 'absolute',
                    bottom: '-6px',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    width: '5px',
                    height: '5px',
                    borderRadius: '50%',
                    backgroundColor: minimalDotColor,
                    zIndex: 2,
                  }}
                  transition={highlightTransition}
                  className="pointer-events-none"
                />
              )}

              {/* Theme: Chat Bubble */}
              {theme === 'chat-bubble' && isActive && (
                <motion.span
                  layoutId={`subtitle-${clipStart ?? 0}-chat-bubble`}
                  style={{
                    position: 'absolute',
                    inset: `-${chatBubblePaddingY}px -${chatBubblePaddingX}px`,
                    backgroundColor: chatBubbleBgColor,
                    borderRadius: `${chatBubbleRadius}px`,
                    zIndex: -1,
                  }}
                  transition={highlightTransition}
                  className="pointer-events-none"
                >
                  {chatBubbleTail && (
                    <span 
                      style={{
                        position: 'absolute',
                        bottom: '-4px',
                        left: '12px',
                        width: '8px',
                        height: '8px',
                        backgroundColor: chatBubbleBgColor,
                        transform: 'rotate(45deg)',
                        borderRadius: '1px',
                      }}
                    />
                  )}
                </motion.span>
              )}

              {/* Theme: Confetti Burst */}
              {theme === 'confetti-burst' && isActive && (
                <span className="absolute inset-0 pointer-events-none overflow-visible">
                  {Array.from({ length: confettiBurstCount }).map((_, pIdx) => {
                    const angle = confettiAngle(`${clipStart ?? 0}:${textContent}:${theme}`, pIdx, confettiBurstCount);
                    const colors = confettiBurstColorList.split(',');
                    const color = colors[pIdx % colors.length] || '#ff00ff';
                    const targetX = Math.cos(angle) * confettiBurstRadius;
                    const targetY = Math.sin(angle) * confettiBurstRadius;
                    return (
                      <motion.span
                        key={pIdx}
                        initial={{ x: 0, y: 0, scale: 0, opacity: 1 }}
                        animate={{ 
                          x: targetX, 
                          y: targetY, 
                          scale: [0, 1.2, 0.8, 0], 
                          opacity: [1, 1, 0.8, 0] 
                        }}
                        transition={{ 
                          duration: 0.6, 
                          ease: 'easeOut',
                        }}
                        style={{
                          position: 'absolute',
                          left: '50%',
                          top: '50%',
                          width: `${4 + (pIdx % 3) * 2}px`,
                          height: `${4 + (pIdx % 3) * 2}px`,
                          borderRadius: pIdx % 2 === 0 ? '50%' : '2px',
                          backgroundColor: color,
                          zIndex: 10,
                        }}
                      />
                    );
                  })}
                </span>
              )}

              {prePunc && <span className="opacity-80" style={{ position: 'relative', zIndex: 1 }}>{prePunc}</span>}
              <span style={{ position: 'relative', zIndex: 1 }}>{stem}</span>
              {postPunc && <span className="opacity-80" style={{ position: 'relative', zIndex: 1 }}>{postPunc}</span>}

              {/* Theme: Typewriter Cursor */}
              {theme === 'typewriter' && isActive && (
                <motion.span
                  initial={{ opacity: 0 }}
                  animate={{ opacity: [0, 1, 0] }}
                  transition={{ repeat: Infinity, duration: typewriterCursorSpeed, ease: 'linear' }}
                  style={{
                    color: typewriterCursorColor,
                    fontSize: `${typewriterCursorSize}px`,
                    marginLeft: '3px',
                    fontWeight: 'bold',
                    display: 'inline-block',
                    position: 'relative',
                    zIndex: 10,
                  }}
                  className="pointer-events-none"
                >
                  {typewriterCursorType}
                </motion.span>
              )}
            </motion.span>
          );
        })}
      </div>
    </div>
  );
};
