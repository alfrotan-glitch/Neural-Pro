# Contract: Rendering

**Normative.** Owns **INV-003** (preview/export parity).

---

## 1. Canonical plan

`buildCanonicalRenderPlan()` is the **only** producer of a render plan. Both renderers consume
its output. It is pure: `(snapshot, time, fps, mediaResolver) → CanonicalRenderPlan`.

```ts
export interface CanonicalRenderPlan {
  readonly time: number;
  readonly width: number;
  readonly height: number;
  readonly fps: number;
  readonly background: string;
  readonly layers: readonly CanonicalRenderLayer[];   // z-ascending
}

export interface CanonicalRenderLayer {
  readonly clipId: string;
  readonly role: 'video' | 'overlay' | 'text' | 'background' | 'audio-visual';
  readonly matrix: DOMMatrix;                  // canonical, order-fixed — see §3
  readonly frame: Rect;                        // canonical 85 % composition frame, pre-transform
  readonly clipPath: Rect & { radius: number };// region the layer may paint into
  readonly opacity: number;                    // 0..1
  readonly filter: string;                     // CSS filter string (both targets accept it)
  readonly compositeOperation: GlobalCompositeOperation;
  readonly source: CanonicalRenderSource;
}

export type CanonicalRenderSource =
  | { kind: 'video';  assetId: AssetId; clipId: string; sourceTime: number }
  | { kind: 'image';  assetId: AssetId }
  | { kind: 'overlay'; sourceId: string; props: Readonly<Record<string, unknown>> }
  | { kind: 'text';   content: string; style: CaptionStyle; words?: readonly WordTiming[] };
```

## 2. Geometry

```ts
MEDIA_FRAME_SIZE_PERCENT = 85;                       // single constant
getMediaFrameGeometry(w, h) → { width: 0.85w, height: 0.85h, x: (w−0.85w)/2, y: (h−0.85h)/2 }
```

One constant, one function, both targets. `VideoPlayer.tsx` currently re-states `85%` as a CSS
literal in two places (lines 518–519 and 619–620) — these must use the shared constant.

## 3. Transform matrix (the D-004 fix)

```
M = T(originX + x, originY + y) · R(rotation°) · S(scale·scaleX/100², scale·scaleY/100²)
```

* `originX = width / 2`, `originY = height / 2`.
* Order is **fixed and canonical**. It matches the export canvas's current
  `translate → rotate → scale` sequence, which is the safer of the two because it keeps scale
  in the rotated frame (the visually expected behaviour for a rotated, non-uniformly scaled
  box in an editor).
* `getPreviewTransformCss` **must be derived from `getCanonicalTransformMatrix`**, not
  hand-written. This is what makes the two renderers provably identical.
* Preview applies it via `ctx.setTransform(matrix)`-equivalent CSS (`matrix(...)`).
* Export applies it via `ctx.setTransform(matrix)`.

## 4. Clipping (the D-005 fix)

The layer's `clipPath` is the canonical frame (plus `radius`). Both renderers **must** clip:

* Preview: `overflow: hidden` + `border-radius: <radius>px` on the frame element.
* Export: `ctx.save(); ctx.beginPath(); ctx.roundRect(…); ctx.clip(); …; ctx.restore();`

Cover scaling (`object-fit: cover`) is `scale = max(boxW / mediaW, boxH / mediaH)` in **both**
targets, and the overflow is clipped in **both**.

## 5. Effects

`getMediaVisualEffects()` is the single authority for `filter` and blend mode. Preview uses
`cssFilter`/`cssBlendMode`; export uses `canvasFilter`/`canvasCompositeOperation`. The mapping
must stay 1:1 — adding a blend mode requires updating both sides in the same commit.

## 6. FPS

`RenderFpsAuthority` resolves one fps for a render pass and threads it into:
frame count, encoder `framerate`, frame timestamps, caption timecode conversion, and progress
estimation. No module may default fps independently.

## 7. Renderer interface

```ts
export interface Renderer {
  readonly id: 'dom-preview' | 'canvas-export';
  render(plan: CanonicalRenderPlan, target: RenderTarget): void;
}
```

Conformance requirement: for the same `CanonicalRenderPlan`, the set of visible pixels must
differ only by antialiasing, text hinting and colour rounding. Verified by
[media-parity-testing.md](../testing/media-parity-testing.md).

## 8. Invariants

| ID | Invariant | Test |
|---|---|---|
| INV-003 | Preview and export semantic layers are identical | plan-equality test (grid of transforms/aspect ratios) |
| INV-003a | Transform matrices are equal | `repro-transform-order.mts` (must exit 0) |
| INV-003b | Clipping is equal | `repro-media-cover-clip.mts` (must exit 0) |
| INV-003c | Active clip selection is identical | snapshot vs recomputed plan |
| INV-003d | FPS is identical across frame count, encoder and timecodes | fps-authority test |
