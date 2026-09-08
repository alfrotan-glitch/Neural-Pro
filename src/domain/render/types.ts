import type { DOMMatrix2D } from './transform';

export type CanonicalRenderRole = 'video' | 'overlay' | 'text' | 'background' | 'audio-visual';

export interface CanonicalRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface CanonicalClipPath extends CanonicalRect {
  readonly radius: number;
}

export type CanonicalRenderSource =
  | { readonly kind: 'video'; readonly assetId?: string; readonly clipId: string; readonly sourceTime: number; readonly url?: string }
  | { readonly kind: 'image'; readonly assetId?: string; readonly url?: string }
  | { readonly kind: 'overlay'; readonly sourceId: string; readonly props: Readonly<Record<string, unknown>> }
  | { readonly kind: 'text'; readonly content: string; readonly style?: Readonly<Record<string, unknown>>; readonly words?: readonly unknown[] };

export interface CanonicalRenderLayer {
  readonly clipId: string;
  readonly role: CanonicalRenderRole;
  readonly matrix: DOMMatrix2D;
  readonly frame: CanonicalRect;
  readonly clipPath: CanonicalClipPath;
  readonly opacity: number;
  readonly filter: string;
  readonly compositeOperation: GlobalCompositeOperation;
  readonly source: CanonicalRenderSource;
  readonly zIndex: number;
}

export interface CanonicalRenderPlan {
  readonly time: number;
  readonly width: number;
  readonly height: number;
  readonly fps: number;
  readonly background: string;
  readonly layers: readonly CanonicalRenderLayer[];
}
