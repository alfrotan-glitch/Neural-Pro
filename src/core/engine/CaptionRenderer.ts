import type { ClipNode } from '../../features/video-studio/project/types/project';
import { isTimeInClip } from '../../features/video-studio/project/time/intervals';
import {
  getActiveWordIndex,
  type CaptionWord,
} from './captionRenderModel';
import { createCaptionRenderPlan, getCaptionCanvasPlacement } from '../../features/video-studio/captions/services/captionRenderPlan';
import { getCaptionThemeDefinition } from '../../features/video-studio/captions/services/captionThemeDefinitions';
import { getCaptionFontString, getCaptionVisualContract, getLetterSpacingTextWidth } from '../../features/video-studio/captions/services/captionVisualContract';
import { resolveCaptionAnimationState } from '../../features/video-studio/captions/services/captionAnimationContract';

export interface CanvasRenderOptions {
  width: number;
  height: number;
}

export class CaptionRenderer {
  public static getActiveCaption(clips: ClipNode[], currentTime: number): ClipNode | null {
    return clips.find(
      (clip) => isTimeInClip(currentTime, clip),
    ) ?? null;
  }

  public static getActiveWordIndex(
    words: CaptionWord[] | undefined,
    currentTime: number,
    clipStartAt = 0,
  ): number {
    return getActiveWordIndex(words, currentTime, clipStartAt);
  }

  public static renderToCanvas(
    ctx: CanvasRenderingContext2D,
    clip: ClipNode,
    currentTime: number,
    options: CanvasRenderOptions,
  ): void {
    const plan = createCaptionRenderPlan(clip, currentTime);
    const props = plan.style;
    const textContent = plan.textContent;
    const theme = plan.theme;
    const themeDefinition = getCaptionThemeDefinition(theme);
    const width = Math.max(1, options.width);
    const height = Math.max(1, options.height);
    const scale = Math.max(0.6, height / 720);
    const opacity = plan.transform.opacity / 100;
    const visual = getCaptionVisualContract({ theme, ...props, alignment: props.alignment });

    const activeWords = plan.timeline.activeWords;
    if (!activeWords.length) return;

    const activeIndex = plan.timeline.activeIdx;
    const fontSize = visual.fontSize * (plan.transform.scale / 100) * scale;
    const fontWeight = visual.fontWeight;
    const baseFontFamily = visual.fontFamily;

    const activeColor = String(props.activeColor ?? props.highlightBgColor ?? '#facc15');
    const textColor = String(props.textColor ?? '#ffffff');
    const inactiveColor = String(props.karaokeInactiveColor ?? textColor);
    const inactiveOpacity = clamp(Number(props.karaokeInactiveOpacity ?? 0.6), 0.05, 1);
    const wordSpacing = visual.wordSpacing * scale;
    const padding = visual.padding * scale;
    const fontStyle = getCaptionFontString({ ...visual, fontSize }, 1).replace(`${fontSize}px`, `${fontSize}px`);

    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.font = fontStyle;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';

    const wordsText = activeWords.map((word) => String(word.word ?? ''));
    const letterSpacing = visual.letterSpacing * scale;
    const metrics = wordsText.map((word) => getLetterSpacingTextWidth(word, (glyph) => ctx.measureText(glyph).width, letterSpacing));
    const totalTextWidth = metrics.reduce((sum, value) => sum + value, 0) + Math.max(0, metrics.length - 1) * wordSpacing;
    const containerWidth = visual.autoWidth ? totalTextWidth + padding * 2 : visual.containerWidth * scale;
    const containerHeight = visual.autoHeight ? fontSize * visual.lineHeight + padding * 2 : visual.containerHeight * scale;

    const placement = getCaptionCanvasPlacement(width, height, containerHeight, plan.transform.y);
    const transformX = plan.transform.x;
    const finalX = placement.centerX + transformX;
    const finalY = placement.centerY;

    ctx.translate(finalX, finalY);
    ctx.rotate((plan.transform.rotation * Math.PI) / 180);
    const uniformScale = (plan.transform.scale ?? 100) / 100;
    const sx = uniformScale * ((plan.transform.scaleX ?? 100) / 100);
    const sy = uniformScale * ((plan.transform.scaleY ?? 100) / 100);
    ctx.scale(sx, sy);

    const boxX = -containerWidth / 2;
    const boxY = -containerHeight / 2;

    this.drawContainer(ctx, props, theme, boxX, boxY, containerWidth, containerHeight, scale);

    if (theme === 'clean' && props.cleanIndicatorBar) {
      ctx.save();
      ctx.fillStyle = String(props.cleanIndicatorColor ?? activeColor);
      roundedRect(ctx, boxX + 8 * scale, boxY + 10 * scale, 3.5 * scale, containerHeight - 20 * scale, 2 * scale);
      ctx.fill();
      ctx.restore();
    }

    let cursorX = getStartX(
      visual.textAlign,
      boxX,
      containerWidth,
      padding,
      totalTextWidth,
    );

    if (themeDefinition.canvasBehavior === 'word-stack') {
      this.drawWordStack(ctx, wordsText, metrics, activeIndex, props, scale, currentTime, activeColor, textColor);
      ctx.restore();
      return;
    }

    for (let index = 0; index < wordsText.length; index += 1) {
      const word = wordsText[index] ?? '';
      const wordWidth = metrics[index] ?? 0;
      const isActive = index === activeIndex;
      const wordData = activeWords[index];
      const phase = normalizeProgress(currentTime, wordData?.start ?? 0, wordData?.end ?? 0);

      ctx.save();
      let drawX = cursorX;
      let drawY = 0;

      // Generic text-animation presets are resolved from the same frame-based
      // contract used by Preview. Theme-specific animation families retain
      // their existing specialized branches below.
      const usesGenericPreset = !['pop', 'bounce', 'flip-rotate', 'split-reveal'].includes(theme);
      if (usesGenericPreset) {
        const animationState = resolveCaptionAnimationState({
          preset: props.textAnimationPreset,
          progress: phase,
          active: isActive,
        });
        ctx.globalAlpha *= animationState.opacity;
        ctx.translate(drawX + wordWidth / 2 + animationState.x * scale, drawY + animationState.y * scale);
        ctx.scale(animationState.scale, animationState.scale);
        ctx.rotate((animationState.rotate * Math.PI) / 180);
        if (animationState.blurPx > 0) {
          ctx.filter = `blur(${animationState.blurPx * scale}px)`;
        }
        drawX = -wordWidth / 2;
        drawY = 0;
      }

      if (theme === 'pop' && isActive) {
        const scaleValue = Number(props.popScale ?? 1.25);
        ctx.translate(drawX + wordWidth / 2, drawY);
        ctx.scale(scaleValue, scaleValue);
        ctx.rotate((Number(props.popRotation ?? -4) * Math.PI) / 180);
        drawX = -wordWidth / 2;
      } else if (theme === 'bounce' && isActive) {
        drawY += Number(props.bounceHeight ?? -10) * scale;
        ctx.translate(drawX + wordWidth / 2, drawY);
        ctx.scale(Number(props.bounceScale ?? 1.15), Number(props.bounceScale ?? 1.15));
        drawX = -wordWidth / 2;
      } else if ((theme === 'karaoke' || theme === 'glow' || theme === 'line') && isActive) {
        const activeScale = Number(props.karaokeActiveScale ?? 1.12);
        ctx.translate(drawX + wordWidth / 2, drawY);
        ctx.scale(activeScale, activeScale);
        drawX = -wordWidth / 2;
      } else if (theme === 'spring' && isActive) {
        ctx.translate(drawX + wordWidth / 2, drawY);
        ctx.scale(1.12, 1.12);
        drawX = -wordWidth / 2;
      } else if (theme === 'split-reveal') {
        const direction = props.splitRevealDirection === 'vertical' ? 'vertical' : 'horizontal';
        const distance = (1 - easeOutCubic(phase)) * Number(props.splitRevealGap ?? 28) * scale;
        if (direction === 'horizontal') drawX += (index % 2 === 0 ? -distance : distance);
        else drawY -= distance;
        ctx.globalAlpha *= isActive ? 1 : clamp(0.35 + phase * 0.65, 0.2, 1);
      } else if (theme === 'flip-rotate' && isActive) {
        const rotation = (1 - easeOutCubic(phase)) * Math.PI * 0.5;
        if (props.flipRotateAxis === 'z') ctx.rotate(rotation);
        else ctx.scale(1, clamp(Math.cos(rotation), 0.08, 1));
      }

      this.configureTextContext(ctx, props, theme, isActive, activeColor, textColor, inactiveColor, inactiveOpacity, scale, currentTime, phase, fontSize);

      if (theme === 'highlight' && isActive) {
        const padX = Number(props.highlightPaddingX ?? 8) * scale;
        const padY = Number(props.highlightPaddingY ?? 4) * scale;
        const radius = Number(props.highlightRadius ?? 8) * scale;
        ctx.save();
        ctx.fillStyle = String(props.highlightBgColor ?? activeColor);
        roundedRect(ctx, drawX - padX, -fontSize / 2 - padY, wordWidth + padX * 2, fontSize + padY * 2, radius);
        ctx.fill();
        if (Number(props.highlightBorderWidth ?? 0) > 0) {
          ctx.strokeStyle = String(props.highlightBorderColor ?? '#ffffff');
          ctx.lineWidth = Number(props.highlightBorderWidth ?? 1) * scale;
          ctx.stroke();
        }
        ctx.restore();
      }

      if (theme === 'moving-box' && isActive) {
        const padX = Number(props.movingBoxPaddingX ?? 8) * scale;
        const padY = Number(props.movingBoxPaddingY ?? 4) * scale;
        ctx.save();
        ctx.fillStyle = String(props.movingBoxBgColor ?? activeColor);
        roundedRect(ctx, drawX - padX, -fontSize / 2 - padY, wordWidth + padX * 2, fontSize + padY * 2, Number(props.movingBoxRadius ?? 8) * scale);
        ctx.fill();
        if (Number(props.movingBoxBorderWidth ?? 0) > 0) {
          ctx.strokeStyle = String(props.movingBoxBorderColor ?? '#ffffff');
          ctx.lineWidth = Number(props.movingBoxBorderWidth ?? 1) * scale;
          ctx.stroke();
        }
        ctx.restore();
      }

      if (theme === 'underline' && isActive) {
        ctx.save();
        ctx.strokeStyle = String(props.underlineColor ?? activeColor);
        ctx.lineWidth = Number(props.underlineHeight ?? 3) * scale;
        const underlineY = fontSize / 2 + Number(props.underlineGap ?? 4) * scale;
        ctx.beginPath();
        ctx.moveTo(drawX, underlineY);
        ctx.lineTo(drawX + wordWidth, underlineY);
        ctx.stroke();
        ctx.restore();
      }

      const visibleWord = visual.uppercase ? word.toUpperCase() : word;

      if (theme === 'bold-impact' || theme === 'outline-stroke' || props.textStrokeEnabled) {
        const strokeWidth = theme === 'bold-impact'
          ? Number(props.boldImpactBorderWidth ?? props.textStrokeWidth ?? 2) * scale
          : Number(props.outlineStrokeWidth ?? props.textStrokeWidth ?? 2) * scale;
        if (strokeWidth > 0) {
          ctx.save();
          ctx.strokeStyle = String(
            theme === 'bold-impact'
              ? props.boldImpactBorderColor ?? props.textStrokeColor ?? '#000000'
              : props.outlineStrokeColor ?? props.textStrokeColor ?? '#000000',
          );
          ctx.lineWidth = strokeWidth;
          ctx.strokeText(visibleWord, drawX, drawY);
          ctx.restore();
        }
      }

      if (theme === 'cinematic' && isActive) {
        this.fillTextWithLetterSpacing(ctx, visibleWord, drawX, drawY, letterSpacing);
      } else {
        if (letterSpacing !== 0) this.fillTextWithLetterSpacing(ctx, visibleWord, drawX, drawY, letterSpacing);
        else ctx.fillText(visibleWord, drawX, drawY);
      }

      if (theme === 'typewriter' && isActive) {
        ctx.save();
        ctx.fillStyle = String(props.typewriterCursorColor ?? activeColor);
        ctx.fillRect(drawX + wordWidth + 3 * scale, -fontSize / 2, Math.max(1, Number(props.typewriterCursorSize ?? 2) * scale), fontSize);
        ctx.restore();
      }

      if (theme === 'confetti-burst' && isActive && phase < 0.85) {
        this.drawConfetti(ctx, drawX + wordWidth / 2, 0, Number(props.confettiBurstCount ?? 10), String(props.confettiBurstColorList ?? '#ff0000,#00ff00,#0000ff,#ffff00,#ff00ff'), Number(props.confettiBurstRadius ?? 50) * scale, phase);
      }

      ctx.restore();
      cursorX += wordWidth + wordSpacing;
    }

    if (theme === 'chat-bubble') {
      // The bubble background is rendered by drawContainer; this pass only adds the tail.
      if (props.chatBubbleTail) {
        ctx.save();
        ctx.fillStyle = String(props.chatBubbleBgColor ?? 'rgba(0,0,0,.75)');
        ctx.translate(boxX + 18 * scale, boxY + containerHeight - 2 * scale);
        ctx.rotate(Math.PI / 4);
        ctx.fillRect(-5 * scale, -5 * scale, 10 * scale, 10 * scale);
        ctx.restore();
      }
    }

    ctx.restore();
  }

  private static fillTextWithLetterSpacing(
    ctx: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
    letterSpacing: number,
  ): void {
    if (letterSpacing === 0 || text.length < 2) {
      ctx.fillText(text, x, y);
      return;
    }
    let cursorX = x;
    const glyphs = Array.from(text);
    for (const glyph of glyphs) {
      ctx.fillText(glyph, cursorX, y);
      cursorX += ctx.measureText(glyph).width + letterSpacing;
    }
  }

  private static drawContainer(
    ctx: CanvasRenderingContext2D,
    props: Record<string, unknown>,
    theme: string,
    x: number,
    y: number,
    width: number,
    height: number,
    scale: number,
  ): void {
    const background = theme === 'chat-bubble'
      ? String(props.chatBubbleBgColor ?? 'rgba(0,0,0,.78)')
      : String(props.backgroundColor ?? 'rgba(0,0,0,.75)');
    const bgEnabled = theme === 'box' || props.bgEnabled !== false;

    if (bgEnabled && background !== 'transparent') {
      ctx.save();
      ctx.globalAlpha *= Number(props.bgOpacity ?? 0.75);

      if (props.bgGradientEnabled) {
        const gradient = ctx.createLinearGradient(
          x,
          y,
          x + width,
          y + height,
        );
        gradient.addColorStop(0, background);
        gradient.addColorStop(1, String(props.bgGradientColor ?? '#a855f7'));
        ctx.fillStyle = gradient;
      } else {
        ctx.fillStyle = background;
      }

      roundedRect(ctx, x, y, width, height, Number(props.radius ?? props.chatBubbleRadius ?? 12) * scale);
      ctx.fill();

      if (props.borderEnabled) {
        ctx.strokeStyle = String(props.borderColor ?? 'rgba(255,255,255,.15)');
        ctx.lineWidth = Number(props.borderWidth ?? 1) * scale;
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  private static configureTextContext(
    ctx: CanvasRenderingContext2D,
    props: Record<string, unknown>,
    theme: string,
    isActive: boolean,
    activeColor: string,
    textColor: string,
    inactiveColor: string,
    inactiveOpacity: number,
    scale: number,
    currentTime: number,
    phase: number,
    fontSize: number,
  ): void {
    const baseColor = isActive ? activeColor : inactiveColor;
    ctx.fillStyle = baseColor;
    ctx.globalAlpha *= isActive ? 1 : (theme === 'karaoke' || theme === 'glow' || theme === 'line' ? inactiveOpacity : 1);

    if (theme === 'minimal') {
      ctx.globalAlpha *= isActive ? 1 : Number(props.minimalOpacity ?? 0.55);
      ctx.fillStyle = isActive ? activeColor : textColor;
      ctx.font = `${props.bold === false ? '400' : '700'} ${fontSize}px ${String(props.fontFamily ?? 'Inter, sans-serif')}`;
    }

    if (theme === 'clean') {
      ctx.fillStyle = isActive ? activeColor : textColor;
    }

    if (theme === 'shadow-pop') {
      ctx.fillStyle = isActive ? activeColor : textColor;
      ctx.shadowColor = String(props.shadowPopColor ?? 'rgba(0,0,0,.65)');
      ctx.shadowBlur = Number(props.shadowPopBlur ?? 4) * scale;
      const offset = (isActive ? Number(props.shadowPopActiveOffset ?? 4) : Number(props.shadowPopOffset ?? 2)) * scale;
      ctx.shadowOffsetX = offset;
      ctx.shadowOffsetY = offset;
    }

    if (theme === 'glow' && isActive) {
      const glowColor = String(props.glowColor ?? activeColor);
      const glowRadius = Number(props.glowRadius ?? 12) * scale;
      ctx.fillStyle = glowColor;
      ctx.shadowColor = glowColor;
      ctx.shadowBlur = glowRadius;
    }

    if (theme === 'bold-impact') {
      ctx.font = `900 ${fontSize}px Impact, Arial Black, sans-serif`;
      ctx.fillStyle = isActive ? activeColor : textColor;
    }

    if (theme === 'gradient-flow') {
      const angle = (Number(props.gradientFlowAngle ?? 90) * Math.PI) / 180;
      const travel = Math.sin(currentTime * Number(props.gradientFlowSpeed ?? 1.5)) * fontSize * 2;
      const gradient = ctx.createLinearGradient(
        Math.cos(angle) * -fontSize + travel,
        Math.sin(angle) * -fontSize,
        Math.cos(angle) * fontSize + travel,
        Math.sin(angle) * fontSize,
      );
      gradient.addColorStop(0, String(props.gradientFlowStartColor ?? '#22d3ee'));
      gradient.addColorStop(0.5, String(props.gradientFlowEndColor ?? '#a855f7'));
      gradient.addColorStop(1, String(props.gradientFlowStartColor ?? '#22d3ee'));
      ctx.fillStyle = gradient;
    }

    if (theme === 'outline-stroke') {
      ctx.fillStyle = 'transparent';
      ctx.strokeStyle = String(props.outlineStrokeColor ?? '#ffffff');
      ctx.lineWidth = Number(props.outlineStrokeWidth ?? 2) * scale;
    }

    if (theme === 'handwritten') {
      ctx.font = `700 ${fontSize}px ${String(props.handwrittenFont ?? 'Caveat')}, Caveat, cursive`;
      ctx.fillStyle = String(props.handwrittenColor ?? activeColor);
    }

    if (props.textStrokeEnabled && theme !== 'outline-stroke' && theme !== 'bold-impact') {
      ctx.strokeStyle = String(props.textStrokeColor ?? '#000000');
      ctx.lineWidth = Number(props.textStrokeWidth ?? 2) * scale;
    }

    if (props.shadowEnabled !== false && theme !== 'shadow-pop' && theme !== 'glow') {
      ctx.shadowColor = String(props.shadowColor ?? 'rgba(0,0,0,.65)');
      ctx.shadowBlur = Number(props.shadowBlur ?? 8) * scale;
      const distance = Number(props.shadowDistance ?? 2) * scale;
      ctx.shadowOffsetX = distance;
      ctx.shadowOffsetY = distance;
    }

    if (props.textGlowEnabled && theme !== 'glow') {
      ctx.shadowColor = String(props.textGlowColor ?? activeColor);
      ctx.shadowBlur = Number(props.textGlowBlur ?? 8) * scale;
    }

    // Prevent stale transforms/shadows from leaking between words.
    void phase;
  }

  private static drawWordStack(
    ctx: CanvasRenderingContext2D,
    words: string[],
    metrics: number[],
    activeIndex: number,
    props: Record<string, unknown>,
    scale: number,
    currentTime: number,
    activeColor: string,
    textColor: string,
  ): void {
    const maxItems = Math.max(0, Number(props.wordStackMaxItems ?? 2));
    const spacing = Number(props.wordStackSpacing ?? 34) * scale;
    const start = Math.max(0, activeIndex - maxItems);
    const end = Math.min(words.length - 1, activeIndex + maxItems);
    ctx.textAlign = 'center';

    for (let index = start; index <= end; index += 1) {
      const distance = index - activeIndex;
      ctx.save();
      ctx.translate(0, distance * spacing);
      const factor = distance === 0 ? 1.15 : 0.82;
      ctx.globalAlpha *= distance === 0 ? 1 : 0.35;
      ctx.scale(factor, factor);
      ctx.fillStyle = distance === 0 ? activeColor : textColor;
      const word = words[index];
      const metric = metrics[index];
      if (word === undefined || metric === undefined) {
        ctx.restore();
        continue;
      }
      ctx.fillText(word, -metric / 2, 0);
      ctx.restore();
    }
    void currentTime;
  }

  private static drawConfetti(
    ctx: CanvasRenderingContext2D,
    centerX: number,
    centerY: number,
    count: number,
    colorList: string,
    radius: number,
    phase: number,
  ): void {
    const colors = colorList.split(',').map((color) => color.trim()).filter(Boolean);
    const safeCount = Math.max(1, Math.min(100, Math.round(count)));
    const progress = easeOutCubic(phase);

    for (let index = 0; index < safeCount; index += 1) {
      const angle = (index / safeCount) * Math.PI * 2;
      const distance = radius * progress;
      const x = centerX + Math.cos(angle) * distance;
      const y = centerY + Math.sin(angle) * distance;
      const size = Math.max(2, radius * 0.045);
      ctx.save();
      ctx.globalAlpha *= 1 - phase;
      ctx.fillStyle = colors[index % colors.length] ?? '#ffffff';
      ctx.translate(x, y);
      ctx.rotate(angle + phase * Math.PI);
      ctx.fillRect(-size / 2, -size / 2, size, size);
      ctx.restore();
    }
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function normalizeProgress(time: number, start: number, end: number): number {
  if (end <= start) return 1;
  return clamp((time - start) / (end - start), 0, 1);
}

function easeOutCubic(value: number): number {
  const t = clamp(value, 0, 1);
  return 1 - (1 - t) ** 3;
}

function getStartX(
  alignment: string,
  boxX: number,
  containerWidth: number,
  padding: number,
  totalTextWidth: number,
): number {
  if (alignment === 'left') return boxX + padding;
  if (alignment === 'right') return boxX + containerWidth - padding - totalTextWidth;
  return -totalTextWidth / 2;
}

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  const r = Math.max(0, Math.min(radius, Math.min(width, height) / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}
