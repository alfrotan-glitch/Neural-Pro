/**
 * SRT parsing/serialisation and caption timing invariants (server side).
 *
 * Every conversion takes an explicit `projectFps` — `DEFAULT_CAPTION_FPS` no
 * longer exists anywhere (D-022).
 */
import {
  parseCaptionTimestamp,
  secondsToFrameTimecode,
  secondsToSrtTimestamp,
} from '../../src/features/video-studio/captions/services/captionTimecodeService';
import { appError } from '../errors';
import type { CaptionBlockInput } from '../schemas/operations';

export interface ParsedSrtBlock {
  id: string;
  start_time: string;
  end_time: string;
  text: string;
  words: { word: string; start: number; end: number }[];
  wordTimingSource: 'inferred';
}

/** Parses SRT text into caption blocks with linearly inferred word timings. */
export function parseSrtContent(srt: string, projectFps: number): ParsedSrtBlock[] {
  const blocks = srt.replace(/^\uFEFF/, '').trim().split(/\r?\n(?:[ \t]*\r?\n)+/);
  const captions: ParsedSrtBlock[] = [];

  blocks.forEach((block, index) => {
    const lines = block.split(/\r?\n/);
    if (lines.length < 3) return;

    const timingIndex = lines.findIndex((line) =>
      /\d{2}:\d{2}:\d{2}[,.]\d{3}\s*-->\s*\d{2}:\d{2}:\d{2}[,.]\d{3}/.test(line),
    );
    if (timingIndex < 0) return;
    const timeLine = lines[timingIndex];
    if (timeLine === undefined) return;
    const timeMatch = timeLine.match(/(\d{2}:\d{2}:\d{2}[,.]\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}[,.]\d{3})/);
    if (!timeMatch) return;
    const srtStart = timeMatch[1];
    const srtEnd = timeMatch[2];
    if (!srtStart || !srtEnd) return;

    const startSeconds = parseCaptionTimestamp(srtStart, projectFps);
    const endSeconds = parseCaptionTimestamp(srtEnd, projectFps);
    if (!(endSeconds > startSeconds)) return;

    const text = lines
      .slice(timingIndex + 1)
      .join(' ')
      .replace(/<[^>]*>/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!text) return;

    const wordsList = text.split(/\s+/).filter((word) => word.length > 0);
    const blockDuration = endSeconds - startSeconds;
    const wordDuration = blockDuration / (wordsList.length || 1);

    const words = wordsList.map((word, idx) => ({
      word,
      start: Number((startSeconds + idx * wordDuration).toFixed(6)),
      end: Number((idx === wordsList.length - 1 ? endSeconds : startSeconds + (idx + 1) * wordDuration).toFixed(6)),
    }));

    captions.push({
      id: `uploaded_cap_${index + 1}`,
      start_time: normaliseSrt(srtStart, projectFps),
      end_time: normaliseSrt(srtEnd, projectFps),
      text,
      words,
      wordTimingSource: 'inferred',
    });
  });

  return captions;
}

function normaliseSrt(value: string, projectFps: number): string {
  const parsed = parseCaptionTimestamp(value.trim().replace('.', ','), projectFps);
  return secondsToSrtTimestamp(parsed);
}

export function exportToSrtString(captions: readonly CaptionBlockInput[], projectFps: number): string {
  return captions
    .map((cap, index) => {
      const start = secondsToSrtTimestamp(parseCaptionTimestamp(cap.start_time, projectFps));
      const end = secondsToSrtTimestamp(parseCaptionTimestamp(cap.end_time, projectFps));
      return `${index + 1}\n${start} --> ${end}\n${cap.text}\n`;
    })
    .join('\n');
}

/** Converts caption block boundaries to `HH:MM:SS:FF` at the project frame rate. */
export function toFrameTimecodes(captions: readonly CaptionBlockInput[], projectFps: number): CaptionBlockInput[] {
  return captions.map((cap) => ({
    ...cap,
    start_time: secondsToFrameTimecode(parseCaptionTimestamp(cap.start_time, projectFps), projectFps),
    end_time: secondsToFrameTimecode(parseCaptionTimestamp(cap.end_time, projectFps), projectFps),
  }));
}

/**
 * Domain invariants: ordered, non-overlapping blocks whose word timings tile the
 * block exactly. Returns a typed error instead of silently accepting bad timing.
 */
export function assertCaptionTiming(captions: readonly CaptionBlockInput[], projectFps: number): void {
  if (captions.length === 0) {
    throw appError({ code: 'EMPTY_INPUT', message: 'No caption blocks were provided.' });
  }

  let previousEnd = -1;
  captions.forEach((cap, index) => {
    let start: number;
    let end: number;
    try {
      start = parseCaptionTimestamp(cap.start_time, projectFps);
      end = parseCaptionTimestamp(cap.end_time, projectFps);
    } catch {
      throw appError({
        code: 'VALIDATION_FAILED',
        message: 'Caption timestamps are not in a supported format.',
        context: { index, id: cap.id },
      });
    }
    if (!(end > start)) {
      throw appError({
        code: 'OUT_OF_RANGE',
        message: 'A caption block ends before it starts.',
        context: { index, id: cap.id },
      });
    }
    if (start < previousEnd - 1e-6) {
      throw appError({
        code: 'OUT_OF_RANGE',
        message: 'Caption blocks overlap.',
        context: { index, id: cap.id },
      });
    }
    previousEnd = end;

    const words = cap.words ?? [];
    if (words.length === 0) return;

    let cursor = start;
    for (const word of words) {
      if (!(word.end > word.start)) {
        throw appError({ code: 'OUT_OF_RANGE', message: 'A caption word has an invalid time range.', context: { index, id: cap.id } });
      }
      if (word.start < cursor - 1e-6 || word.end > end + 1e-6) {
        throw appError({ code: 'OUT_OF_RANGE', message: 'Caption word timings fall outside their block.', context: { index, id: cap.id } });
      }
      cursor = word.end;
    }
  });
}

/**
 * Refinement must be text-only: identical ids, boundaries and word timings.
 * A mismatch is a hard `AI_RESPONSE_INVALID` — the original is never replaced.
 */
export function assertRefinementIsTextOnly(
  original: readonly CaptionBlockInput[],
  refined: readonly CaptionBlockInput[],
): void {
  if (refined.length !== original.length) {
    throw appError({
      code: 'AI_RESPONSE_INVALID',
      message: 'The AI service returned an unexpected response.',
      detail: `block count changed: ${original.length} -> ${refined.length}`,
    });
  }
  original.forEach((source, index) => {
    const target = refined[index];
    if (!target || target.id !== source.id || target.start_time !== source.start_time || target.end_time !== source.end_time) {
      throw appError({
        code: 'AI_RESPONSE_INVALID',
        message: 'The AI service returned an unexpected response.',
        detail: `block ${index} identity or timing changed`,
      });
    }
    const sourceWords = source.words ?? [];
    const targetWords = target.words ?? [];
    if (sourceWords.length !== targetWords.length) {
      throw appError({
        code: 'AI_RESPONSE_INVALID',
        message: 'The AI service returned an unexpected response.',
        detail: `block ${index} word count changed`,
      });
    }
    sourceWords.forEach((word, wordIndex) => {
      const out = targetWords[wordIndex];
      if (!out || out.start !== word.start || out.end !== word.end) {
        throw appError({
          code: 'AI_RESPONSE_INVALID',
          message: 'The AI service returned an unexpected response.',
          detail: `block ${index} word ${wordIndex} timing changed`,
        });
      }
    });
  });
}
