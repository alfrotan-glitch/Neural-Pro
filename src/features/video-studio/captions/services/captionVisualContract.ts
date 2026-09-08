export interface CaptionVisualContractInput {
  theme: string;
  fontFamily?: unknown;
  fontSize?: unknown;
  fontWeight?: unknown;
  charSpacing?: unknown;
  lineSpacing?: unknown;
  wordSpacing?: unknown;
  padding?: unknown;
  containerWidth?: unknown;
  containerHeight?: unknown;
  containerAutoWidth?: unknown;
  containerAutoHeight?: unknown;
  textAlign?: unknown;
  alignment?: unknown;
  boldImpactLetterSpacing?: unknown;
  boldImpactUppercase?: unknown;
  handwrittenFont?: unknown;
  [key: string]: unknown;
}

export interface CaptionVisualContract {
  fontFamily: string;
  fontSize: number;
  fontWeight: string;
  letterSpacing: number;
  lineHeight: number;
  wordSpacing: number;
  padding: number;
  containerWidth: number;
  containerHeight: number;
  autoWidth: boolean;
  autoHeight: boolean;
  textAlign: 'left' | 'center' | 'right';
  uppercase: boolean;
}

function finite(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeAlign(value: unknown): 'left' | 'center' | 'right' {
  return value === 'left' || value === 'right' ? value : 'center';
}

export function resolveCaptionFontWeight(input: CaptionVisualContractInput): string {
  const theme = String(input.theme || 'karaoke');
  if (theme === 'bold-impact') return '900';
  if (input.fontWeight !== undefined && input.fontWeight !== null && String(input.fontWeight).trim() !== '') {
    return String(input.fontWeight);
  }
  if (input.bold === false) return '400';
  return '700';
}

/**
 * Single source of truth for caption typography/layout inputs consumed by
 * browser Preview and Canvas Export. Pixel scaling is applied by each render
 * target after this contract is resolved.
 */
export function getCaptionVisualContract(input: CaptionVisualContractInput): CaptionVisualContract {
  const theme = String(input.theme || 'karaoke');
  const fallbackFamily = String(input.fontFamily ?? 'Inter, sans-serif');
  const fontFamily = theme === 'bold-impact'
    ? 'Impact, Arial Black, sans-serif'
    : theme === 'handwritten'
      ? `${String(input.handwrittenFont ?? 'Caveat')}, Caveat, Pacifico, cursive`
      : fallbackFamily;
  const fontSize = Math.max(8, finite(input.fontSize, 22));
  const fontWeight = resolveCaptionFontWeight(input);
  const letterSpacing = theme === 'cinematic'
    ? 1
    : theme === 'minimal'
      ? finite(input.minimalLetterSpacing, 0)
      : theme === 'bold-impact'
        ? finite(input.boldImpactLetterSpacing, 1)
        : finite(input.charSpacing, 0);
  return {
    fontFamily,
    fontSize,
    fontWeight,
    letterSpacing,
    lineHeight: Math.max(0.5, finite(input.lineSpacing, 1.2)),
    wordSpacing: Math.max(0, finite(input.wordSpacing, 12)),
    padding: Math.max(16, finite(input.padding, 16)),
    containerWidth: Math.max(1, finite(input.containerWidth, 550)),
    containerHeight: Math.max(1, finite(input.containerHeight, 110)),
    autoWidth: input.containerAutoWidth !== false,
    autoHeight: input.containerAutoHeight !== false,
    textAlign: normalizeAlign(input.alignment ?? input.textAlign),
    uppercase: theme === 'bold-impact' && input.boldImpactUppercase !== false,
  };
}

export function getCaptionFontString(contract: CaptionVisualContract, scale = 1): string {
  return `${contract.fontWeight} ${Math.max(8, contract.fontSize * scale)}px ${contract.fontFamily}`;
}

export function getLetterSpacingTextWidth(
  text: string,
  measureGlyph: (glyph: string) => number,
  letterSpacing: number,
): number {
  const glyphs = Array.from(text);
  if (!glyphs.length) return 0;
  return glyphs.reduce((sum, glyph) => sum + measureGlyph(glyph), 0) + Math.max(0, glyphs.length - 1) * letterSpacing;
}
