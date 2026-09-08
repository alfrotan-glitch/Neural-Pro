import type { CaptionTheme } from '../../../../core/engine/captionRenderModel';
import { parseCaptionTimestamp } from './captionTimecodeService';
export { parseCaptionTimestamp } from './captionTimecodeService';

export interface CaptionImportBlock {
  id: string;
  start_time: string | number;
  end_time: string | number;
  text: string;
  words?: Array<{ word: string; start: number; end: number }>;
  speaker?: string;
  wordTimingSource?: 'native' | 'inferred' | 'unknown';
}

export interface CaptionImportThemeContext {
  preferredTheme?: unknown;
  activeCaptionTheme?: unknown;
  existingCaptionTheme?: unknown;
}

const THEME_ALIASES: Record<string, CaptionTheme> = {
  cap_box: 'box',
  cap_line: 'line',
  cap_glow: 'glow',
  cap_karaoke: 'karaoke',
};

export function normalizeCaptionTheme(value: unknown): CaptionTheme | null {
  if (typeof value !== 'string') return null;
  const normalized = THEME_ALIASES[value] ?? value;
  const allowed: readonly string[] = [
    'karaoke','glow','highlight','minimal','clean','pop','bounce','shadow-pop',
    'split-reveal','bold-impact','gradient-flow','moving-box','underline',
    'chat-bubble','handwritten','flip-rotate','confetti-burst','outline-stroke',
    'word-stack','typewriter','line','box','cinematic','spring',
  ];
  return allowed.includes(normalized) ? normalized as CaptionTheme : null;
}

export function resolveCaptionImportTheme(context: CaptionImportThemeContext = {}): CaptionTheme {
  return (
    normalizeCaptionTheme(context.preferredTheme) ??
    normalizeCaptionTheme(context.activeCaptionTheme) ??
    normalizeCaptionTheme(context.existingCaptionTheme) ??
    'karaoke'
  );
}

export function normalizeCaptionTiming(block: CaptionImportBlock) {
  const startAt = parseCaptionTimestamp(block.start_time);
  const endAt = parseCaptionTimestamp(block.end_time);
  if (endAt <= startAt) {
    throw new Error(`Caption ${block.id} has non-positive duration`);
  }

  const duration = Number((endAt - startAt).toFixed(6));
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error(`Caption ${block.id} has invalid duration`);
  }

  if (block.words?.length) {
    let previousEnd = startAt;
    for (let index = 0; index < block.words.length; index += 1) {
      const word = block.words[index];
      if (!word) {
        throw new Error(`Caption ${block.id} contains an invalid word entry`);
      }
      if (!Number.isFinite(word.start) || !Number.isFinite(word.end) || word.end <= word.start) {
        throw new Error(`Caption ${block.id} contains invalid word timing`);
      }
      if (word.start < startAt - 1e-6 || word.end > endAt + 1e-6) {
        throw new Error(`Caption ${block.id} contains word timing outside block bounds`);
      }
      if (index === 0 && Math.abs(word.start - startAt) > 1e-6) {
        throw new Error(`Caption ${block.id} word timing does not start at block start`);
      }
      if (Math.abs(word.start - previousEnd) > 1e-6) {
        throw new Error(`Caption ${block.id} word timing contains a gap or overlap`);
      }
      previousEnd = word.end;
    }
    if (Math.abs(previousEnd - endAt) > 1e-6) {
      throw new Error(`Caption ${block.id} word timing does not end at block end`);
    }
  }

  return { startAt, endAt, duration };
}
