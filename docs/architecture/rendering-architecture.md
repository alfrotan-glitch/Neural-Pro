# Rendering Architecture

**Status:** current (with two reproduced divergences) + target.
This document owns the **Preview/Export parity contract**.

---

## 1. The canonical rendering model (target)

```
ProjectSnapshot
   ↓  (1)
CanonicalTimeline          clip timeline intervals, speed, trim — clipTimelineDuration
   ↓  (2)
ActiveClipResolution       which clips are visible at time T — previewCompositorIndex
   ↓  (3)
MediaResolution            AssetId → decoded frame source — ExportMediaPool / <video>/<img>
   ↓  (4)
CanonicalTransformMatrix   ONE matrix per clip — getCanonicalTransformMatrix
   ↓  (5)
CanonicalGeometry          85 % composition frame — getMediaFrameGeometry
   ↓  (6)
Clipping                   media is clipped to the canonical frame
   ↓  (7)
Effects                    filter + blend — getMediaVisualEffects
   ↓  (8)
Composite                  z-order — getPreviewLayerZIndex
   ↓  (9)
Frame                      DOM subtree (Preview) | Canvas2D (Export)
```

**Rule:** steps 1–8 are shared code. Only step 9 differs, and it may only differ by
*rendering technology*, never by semantics.

## 2. Current state — where the model breaks

| Step | Preview | Export | Status |
|---|---|---|---|
| 1 CanonicalTimeline | `getEffectiveClipTimelineDuration` | same | ✔ |
| 2 ActiveClipResolution | atomic render snapshot | **recomputed** (`renderSnapshot` is `undefined`) | ✘ F2 |
| 3 MediaResolution | React-mounted `<video>` | **DOM scrape** of the same nodes | ✘ F1 |
| 4 Transform | `getPreviewTransformCss` → `T·S·R` | `ctx.translate/rotate/scale` → `T·R·S` | ✘ **D-004** |
| 5 Geometry | `width:85%/height:85%` | `getMediaFrameGeometry` | ✔ |
| 6 Clipping | `overflow-hidden` | **none** | ✘ **D-005** |
| 7 Effects | `cssFilter`/`cssBlendMode` | `canvasFilter`/`canvasCompositeOperation` | ✔ (shared) |
| 8 Composite | `zIndex` | same `zIndex` | ✔ |
| 9 Frame | DOM | Canvas2D | ✔ (by design) |

## 3. The parity contract (normative)

For any project snapshot `P` and any time `T`, let `ClipVisuals(P, T, clipId)` be the tuple:

```
( active,
  sourceFrameTime,
  box:   { x, y, width, height }        // canonical 85 % frame, pre-transform
  matrix: DOMMatrix                     // translate · rotate · scale, in ONE fixed order
  clipPath: Rect                        // the region media may paint into
  opacity, filter, compositeOperation,
  zIndex )
```

**INV-003 (parity):** `ClipVisuals` computed for Preview and for Export MUST be equal,
component-wise, to within `1e-6` for geometry and exactly for enumerated values.

Permitted differences (rendering technology only):
* antialiasing / resampling kernel
* text rasterisation hinting
* colour management rounding
* `rounded-lg` corner radius — **only if** explicitly mirrored in export (currently D-026)

Forbidden differences: timing, transforms, scaling, clipping, opacity, blend mode, active
clip selection, crop, positioning, FPS, duration.

## 4. Defect D-004 — transform composition order

**Evidence** (`audit/repro-transform-order.mts`, exit 1):

```
Preview : transform: translate3d(x,y,0) scale(sx,sy) rotate(r)   →  M = T · S · R
Export  : ctx.translate(); ctx.rotate(); ctx.scale();            →  M = T · R · S

scaleX=200 scaleY=100 rotation=45
  Preview corner → (1803.122,  252.437)
  Export  corner → (1478.560,  829.436)      drift = 662.019 px
scaleX=150 scaleY=90  rotation=15                    drift = 145.389 px
uniform scale + rotation                             drift =   0.000 px
non-uniform scale, no rotation                       drift =   0.000 px
```

`S` and `R` commute iff `sx == sy`. Therefore the divergence appears exactly when
`scaleX ≠ scaleY` **and** `rotation ≠ 0` — both are user-reachable via
`UniversalTransformControls`.

**Repair (WP-03).** Add one authority:

```ts
// clipTransformModel.ts
export function getCanonicalTransformMatrix(
  t: CanonicalClipTransform, w: number, h: number
): DOMMatrix                       // T(origin + x, origin + y) · R(rot) · S(sx, sy)
export function getPreviewTransformCss(transform): string   // derived FROM the matrix
```

Preview must derive its CSS from the same matrix (`matrix.toString()` or the equivalent
`translate/rotate/scale` sequence emitted in the canonical order). Export calls
`ctx.setTransform(matrix)`. One definition, two consumers.

**Verification.** `audit/repro-transform-order.mts` must exit 0, plus a property test over a
grid of `(scaleX, scaleY, rotation, x, y)` asserting `|Preview − Export| < 1e-6`.

## 5. Defect D-005 — clipping of cover-scaled media

**Evidence** (`audit/repro-media-cover-clip.mts`, exit 1), canvas 1920×1080, frame 1632×918:

```
16:9   1920×1080  → draw 1632.0 ×  918.0   overflow x=0.0    y=0.0     identical
4:3     640× 480  → draw 1632.0 × 1224.0   overflow x=0.0    y=153.0   DIVERGENT
9:16   1080×1920  → draw 1632.0 × 2901.3   overflow x=0.0    y=991.7   DIVERGENT
2.39:1 2048× 858  → draw 2191.2 ×  918.0   overflow x=279.6  y=0.0     DIVERGENT
```

Preview: `<video class="object-cover">` inside a `overflow-hidden` 85 % box → clipped.
Export: `ctx.drawImage(...)` with **no** `ctx.clip()` in the video/image branch (the only
`ctx.clip()` calls are at `CanvasExportRenderer.ts:369` and `:689`, in *other* branches).

**Repair (WP-03).** In the video/image branch:

```ts
ctx.save();
ctx.beginPath();
ctx.roundRect ? ctx.roundRect(drawX, drawY, boxWidth, boxHeight, radius)
              : ctx.rect(drawX, drawY, boxWidth, boxHeight);
ctx.clip();
… drawImage …
ctx.restore();
```

`radius` must come from one shared constant so preview and export agree (fixes D-026 too).

## 6. FPS authority (D-020, D-022)

**Current:** three fps sources.
1. `useProjectStore.metadata.fps` — the project's fps (default 30)
2. React state `exportFps` — used for `totalFrames = ceil(duration * exportFps)`
3. `activeSettings.fps` — passed to `exportVideoWebCodecs` for encoder + timestamps
4. `DEFAULT_CAPTION_FPS = 30` — hard-coded for `HH:MM:SS:FF` caption timecodes

**Target:** one authority — `RenderFpsAuthority`, seeded from `ExportSettings.fps`, threaded
into: frame count, encoder config, frame timestamps, and **all** caption timecode
conversions. `DEFAULT_CAPTION_FPS` is deleted; every `parseCaptionTimestamp` /
`secondsToFrameTimecode` call site takes an explicit fps.

## 7. Renderer interfaces (target)

```ts
// contracts/rendering.md
export interface CanonicalRenderPlan {
  readonly time: number;
  readonly width: number;
  readonly height: number;
  readonly fps: number;
  readonly layers: readonly CanonicalRenderLayer[];   // already z-sorted
}

export interface CanonicalRenderLayer {
  readonly clipId: string;
  readonly role: 'video' | 'overlay' | 'text' | 'background' | 'audio-visual';
  readonly matrix: DOMMatrix;                 // canonical, order-fixed
  readonly frame: { x: number; y: number; width: number; height: number };
  readonly clipPath: { x: number; y: number; width: number; height: number; radius: number };
  readonly opacity: number;                   // 0..1
  readonly filter: string;
  readonly compositeOperation: GlobalCompositeOperation;
  readonly source: CanonicalRenderSource;
}

export type CanonicalRenderSource =
  | { kind: 'video'; assetId: AssetId; sourceTime: number }
  | { kind: 'image'; assetId: AssetId }
  | { kind: 'overlay'; sourceId: string; props: Readonly<Record<string, unknown>> }
  | { kind: 'text'; content: string; style: CaptionStyle };

export interface Renderer {
  render(plan: CanonicalRenderPlan, target: RenderTarget): void;
}
```

`buildCanonicalRenderPlan(snapshot, time, fps, mediaResolver): CanonicalRenderPlan` is the
**only** function allowed to produce a render plan. `CanvasExportRenderer` becomes a thin
`Renderer` implementation; the Preview consumes the same plan through a DOM `Renderer`.

## 8. Parity testing (WP-03 / WP-06)

| Test | Method |
|---|---|
| Transform matrices equal | property test, grid of transform values |
| Clipping equal | the four aspect-ratio cases, extended to a grid |
| Active clip set equal | snapshot vs recomputed, for a generated timeline |
| FPS identical | assert one authority feeds frame count, encoder and timestamps |
| Layer order equal | compare z-sorted id sequences |
| Opacity/filter/blend equal | compare enumerated values |
| **Pixel parity (target)** | render the same plan to an offscreen canvas via both renderers, compare with a tolerance — **BLOCKED** until a browser runtime is available |

Until pixel parity is runnable, parity is **UNVERIFIED** at the pixel level and only
**PASS** at the semantic level.
