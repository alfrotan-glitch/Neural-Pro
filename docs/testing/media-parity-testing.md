# Media Parity Testing

**Goal:** prove, mechanically, that Preview and Export agree.
Owns **INV-003**.

---

## 1. Levels of parity

| Level | What is compared | Class | Feasible today? |
|---|---|---|---|
| L0 **semantic** | the `CanonicalRenderPlan` used by both targets | executable | **Yes** (after WP-03) |
| L1 **geometric** | computed rectangles / matrices / clip paths | executable | **Yes** (after WP-03) |
| L2 **pixel** | rendered frames, with a tolerance | browser | **Yes**, with Playwright |
| L3 **temporal** | frame *k* of an export equals frame *k* of a preview capture | browser | Yes, slower |
| L4 **perceptual** | SSIM/VMAF over a clip sequence | browser | Optional (nice-to-have) |

**Current status:** L1 is **FAIL** (D-004, D-005 reproduced). L2+ is **BLOCKED** — no browser
runtime has been provisioned in this environment, and L2 is meaningless until L1 passes.

## 2. L1 — the executable parity suite

Property-based over a generated grid:

```
scaleX   ∈ {50, 100, 137.5, 200, 300}
scaleY   ∈ {50, 90, 100, 240}
rotation ∈ {0, 15, 45, 90, 180, 270, 359.9}
x, y     ∈ {0, ±120, ±640}
scale    ∈ {100, 150}
opacity  ∈ {0, 0.5, 1}
```

For each combination, assert preview and export produce the **same** `DOMMatrix` (component
tolerance `1e-6`) and the **same** clip rect.

Plus the aspect-ratio clipping grid (D-005):

```
media  ∈ { 1920×1080, 640×480, 1080×1920, 2048×858, 1000×1000 }
frame  ∈ { 1632×918, 960×540, 540×960 }
```

For each, assert preview's clipped box equals export's clipped box (tolerance `1e-6`).

Plus the active-clip parity check: for a generated timeline sampled at 1000 times, assert
`selectActivePreviewCompositorPlan(index, t)` equals the plan recomputed from the snapshot —
which is what will hold once `renderSnapshot` is threaded through.

## 3. L2 — pixel parity (browser)

```
1. build a deterministic fixture project (committed assets or generated synthetic media;
   NO network)
2. render frame k with the export renderer into an offscreen canvas
3. mount the preview renderer in a real browser at time k, screenshot the composition element
4. normalise both to the same size
5. compare with pixelmatch
6. assert: differing pixels ≤ 0.5 % and no differing pixel exceeds ΔE 32
```

Tolerances are **declared**, not tuned per run. If a run must be re-tuned, that is a defect
report, not a tolerance edit.

### Blockers to clear first

* a Chromium/Playwright runtime must be installed (environment work, WP-00/WP-06);
* fixtures must be local (the default project streams from
  `commondatastorage.googleapis.com` and `soundhelix.com`);
* synthetic media generator: a canvas-drawn video with a known frame counter, so a wrong
  source time is detectable by inspection.

## 4. Captions parity

`CaptionRenderer` is canvas-only; Preview renders captions by another mechanism. The same L1
comparison applies to the `text` layer: identical content, position, style tokens, and active
word index at time *t*.

## 5. Audio parity

Preview uses the interactive `AudioContext`; export uses `OfflineAudioContext`. Assert, for a
fixture project:

* identical clip set and time mapping,
* identical gain envelope breakpoints (`setValueAtTime`/ramp targets),
* identical `playbackRate`, `trimIn`, `sourceDuration`, `start`/`stop` times,
* sample-rate mismatch surfaced (never silently resampled),
* rendered peak/RMS within tolerance.

## 6. Reporting

Each parity run emits a machine-readable report:

```json
{ "level": "L1", "cases": 1234, "passed": 1234, "failed": 0,
  "maxGeometricError": 1.2e-7, "generatedAt": "…", "commit": "…" }
```

The report is attached to the PR and archived. A run that did not execute reports
`"status":"UNVERIFIED"` — never `"passed":0,"failed":0` implying success.
