export interface CaptionWord {
  word: string;
  start: number;
  end: number;
}

export interface CaptionSegment {
  words: CaptionWord[];
  start: number;
  end: number;
}

export interface CaptionTimelineState {
  activeWords: CaptionWord[];
  activeIdx: number;
  activeSegmentIndex: number;
  segments: CaptionSegment[];
}

export const CAPTION_THEMES = [
  'karaoke',
  'glow',
  'highlight',
  'minimal',
  'clean',
  'pop',
  'bounce',
  'shadow-pop',
  'split-reveal',
  'bold-impact',
  'gradient-flow',
  'moving-box',
  'underline',
  'chat-bubble',
  'handwritten',
  'flip-rotate',
  'confetti-burst',
  'outline-stroke',
  'word-stack',
  'typewriter',
  'line',
  'box',
  'cinematic',
  'spring',
] as const;

export type CaptionTheme = (typeof CAPTION_THEMES)[number];

export function isCaptionTheme(value: unknown): value is CaptionTheme {
  return typeof value === 'string' && (CAPTION_THEMES as readonly string[]).includes(value);
}

export function getActiveWordIndex(
  words: CaptionWord[] | undefined,
  currentTime: number,
  clipStartAt = 0,
): number {
  if (!words?.length) return -1;

  const firstWordStart = words[0]?.start ?? 0;
  const isRelative = firstWordStart < clipStartAt - 0.5 && clipStartAt > 0;
  const targetTime = isRelative
    ? Math.max(0, currentTime - clipStartAt)
    : currentTime;

  const exactIndex = words.findIndex(
    (word) => targetTime >= word.start && targetTime < word.end,
  );
  if (exactIndex >= 0) return exactIndex;

  let lastSpoken = -1;
  for (let i = 0; i < words.length; i += 1) {
    const word = words[i];
    if (!word) break;
    if (targetTime >= word.end) lastSpoken = i;
    else break;
  }

  if (lastSpoken >= 0) return lastSpoken;
  return targetTime >= (words[0]?.start ?? 0) ? 0 : -1;
}

export function buildCaptionSegments(words: CaptionWord[]): CaptionSegment[] {
  if (!words.length) return [];

  const segments: CaptionSegment[] = [];
  let currentWords: CaptionWord[] = [];

  for (let index = 0; index < words.length; index += 1) {
    const word = words[index];
    if (!word) continue;
    currentWords.push(word);

    const isSplitPoint =
      index === words.length - 1 || /[,.!?،؛]$/.test(word.word.trim());

    if (isSplitPoint) {
      segments.push({
        words: currentWords,
        start: currentWords[0]?.start ?? word.start,
        end: word.end,
      });
      currentWords = [];
    }
  }

  return segments;
}

export function getSegmentedWords(
  words: CaptionWord[] | undefined,
  textContent: string,
  captionDisplayMode: 'phrase' | 'sentence' = 'phrase',
  currentTime: number,
  clipStart: number,
  clipDuration: number,
  clipEnd?: number,
): CaptionTimelineState {
  if (!words?.length) {
    const parts = textContent.split(/\s+/).filter(Boolean);
    const generatedWords = parts.map((word, index) => ({
      word,
      start: clipStart + (index * clipDuration) / Math.max(1, parts.length),
      end: clipStart + ((index + 1) * clipDuration) / Math.max(1, parts.length),
    }));

    return {
      activeWords: generatedWords,
      activeIdx: generatedWords.length ? getActiveWordIndex(generatedWords, currentTime, clipStart) : -1,
      activeSegmentIndex: generatedWords.length ? 0 : -1,
      segments: generatedWords.length
        ? [{ words: generatedWords, start: clipStart, end: clipEnd ?? clipStart + clipDuration }]
        : [],
    };
  }

  if (captionDisplayMode !== 'sentence') {
    return {
      activeWords: words,
      activeIdx: getActiveWordIndex(words, currentTime, clipStart),
      activeSegmentIndex: 0,
      segments: [{
        words,
        start: clipStart,
        end: clipEnd ?? clipStart + clipDuration,
      }],
    };
  }

  const segments = buildCaptionSegments(words);
  if (!segments.length) {
    return {
      activeWords: words,
      activeIdx: getActiveWordIndex(words, currentTime, clipStart),
      activeSegmentIndex: 0,
      segments: [{ words, start: clipStart, end: clipEnd ?? clipStart + clipDuration }],
    };
  }

  const adjusted = segments.map((segment) => ({ ...segment, words: [...segment.words] }));
  const firstSegment = adjusted[0];
  const lastSegment = adjusted[adjusted.length - 1];
  if (!firstSegment || !lastSegment) {
    return {
      activeWords: words,
      activeIdx: getActiveWordIndex(words, currentTime, clipStart),
      activeSegmentIndex: 0,
      segments: [{ words, start: clipStart, end: clipEnd ?? clipStart + clipDuration }],
    };
  }
  firstSegment.start = Math.min(firstSegment.start, clipStart);
  lastSegment.end = Math.max(
    lastSegment.end,
    clipEnd ?? clipStart + clipDuration,
  );

  for (let index = 0; index < adjusted.length - 1; index += 1) {
    const current = adjusted[index];
    const next = adjusted[index + 1];
    if (!current || !next) continue;
    const midpoint = (current.end + next.start) / 2;
    current.end = midpoint;
    next.start = midpoint;
  }

  let activeSegmentIndex = adjusted.findIndex(
    (segment) => currentTime >= segment.start && currentTime < segment.end,
  );

  if (activeSegmentIndex < 0) {
    activeSegmentIndex = currentTime < firstSegment.start ? 0 : adjusted.length - 1;
  }

  const activeSegment = adjusted[activeSegmentIndex] ?? lastSegment;

  return {
    activeWords: activeSegment.words,
    activeIdx: getActiveWordIndex(activeSegment.words, currentTime, clipStart),
    activeSegmentIndex,
    segments: adjusted,
  };
}
