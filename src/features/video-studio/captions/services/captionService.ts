import {
  buildCaptionSegments,
  getActiveWordIndex,
  getSegmentedWords,
  isCaptionTheme,
  type CaptionWord as EngineCaptionWord,
} from '../../../../core/engine/captionRenderModel';
import type { CaptionSegment, CaptionWord } from '../types/caption';

export interface CaptionTimingContext {
  clipStartAt: number;
  clipDuration: number;
  currentTime: number;
  displayMode: 'sentence' | 'phrase';
}

function toEngineWord(word: CaptionWord): EngineCaptionWord {
  return {
    word: word.text,
    start: word.startTime,
    end: word.endTime,
  };
}

function toDomainSegment(segment: { words: EngineCaptionWord[]; start: number; end: number }, index: number): CaptionSegment {
  return {
    id: `segment_${index}_${segment.start}_${segment.end}`,
    startTime: segment.start,
    endTime: segment.end,
    text: segment.words.map((word) => word.word).join(' '),
    words: segment.words.map((word, wordIndex) => ({
      id: `word_${index}_${wordIndex}_${word.start}_${word.end}`,
      text: word.word,
      startTime: word.start,
      endTime: word.end,
    })),
  };
}

export function getCaptionWordsForTime(
  words: CaptionWord[],
  context: CaptionTimingContext,
): { words: CaptionWord[]; activeIndex: number } {
  const engineWords = words.map(toEngineWord);
  const timeline = getSegmentedWords(
    engineWords,
    engineWords.map((word) => word.word).join(' '),
    context.displayMode,
    context.currentTime,
    context.clipStartAt,
    context.clipDuration,
    context.clipStartAt + context.clipDuration,
  );

  return {
    words: timeline.activeWords.map((word, index) => ({
      id: `active_word_${index}_${word.start}_${word.end}`,
      text: word.word,
      startTime: word.start,
      endTime: word.end,
    })),
    activeIndex: timeline.activeIdx,
  };
}

export function segmentCaptionWords(words: CaptionWord[]): CaptionSegment[] {
  return buildCaptionSegments(words.map(toEngineWord)).map(toDomainSegment);
}

export function getActiveCaptionWordIndex(
  words: CaptionWord[],
  currentTime: number,
  clipStartAt = 0,
): number {
  return getActiveWordIndex(
    words.map(toEngineWord),
    currentTime,
    clipStartAt,
  );
}

export { isCaptionTheme };
