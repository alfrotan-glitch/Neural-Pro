# Workflow W3 — Caption Processing

**Owner WP:** WP-07 (server hardening), WP-09
**Contracts:** [../contracts/ai-integration.md](../contracts/ai-integration.md) §6, [../contracts/api.md](../contracts/api.md) §4

---

## 1. Trigger

* **Generate** (Gemini, from an audio clip name + duration + topic prompt)
* **Import SRT**
* **Refine** (grammar/punctuation)
* **Export SRT**

## 2. Steps (target)

| # | Step | Checkpoint | Retry | Timeout |
|---|---|---|---|---|
| 1 | `validateInput` | – | no | 1 s | duration ∈ (0, 86400]; `projectFps` ∈ [1,120]; sizes bounded |
| 2 | `parseOrGenerate` | ✔ | 3 | 60 s | `/api/captions/generate` \| `/parse-srt` |
| 3 | `validateTiming` | – | no | 5 s | monotonic, non-overlapping, within `[0, duration]`, end > start |
| 4 | `convertFps` | – | no | 1 s | **all** `HH:MM:SS:FF` conversions use `projectFps` |
| 5 | `normalize` | ✔ | 1 | 30 s | optional punctuation/casing refinement |
| 6 | `persist` | – | no | 10 s | captions into the project; deterministic ids (no `Math.random()`) |

## 3. Current defects

| ID | Defect | Evidence |
|---|---|---|
| D-022 | `DEFAULT_CAPTION_FPS = 30` hard-coded; `server.ts:883/919/970/1010` pass no fps | wrong `FF` field for 24/60 fps projects |
| D-009 | `/api/generate-captions` returns 200 with `fallback:true` when the key is missing or the call fails | the client never checks `fallback`, so fabricated captions are inserted |
| V3 | `server.ts:9` imports `src/features/video-studio/captions/services/captionTimecodeService` | server → browser-feature dependency |
| D-027 | caption ids generated with `Math.random()` | non-deterministic; breaks diffing, undo and tests |

## 4. Target

* `projectFps` is a **required** field on every caption endpoint and every conversion call.
* `DEFAULT_CAPTION_FPS` is deleted.
* Timecode functions move to `src/domain/captions/timecode.ts`, imported by both server and
  features (breaks V3).
* Failure ⇒ typed error; the client shows it. No `fallback:true` success.
* Caption ids are derived from `sha1(start|end|text)` — stable across runs.

## 5. Validation rules (normative)

```ts
0 <= start < end <= mediaDuration
captions[i].end <= captions[i+1].start        (non-overlapping; allow equality)
text.length <= 500
words: monotonically increasing, within [start, end]
```

Violations ⇒ `AI_RESPONSE_INVALID` (generated) or `VALIDATION_FAILED` (imported), with the
index of the offending block in `error.context`.

## 6. Rendering

`CaptionRenderer` (557 LOC) is a **canvas-only** renderer with `static getActiveCaption`,
`getActiveWordIndex` and `renderToCanvas`. It has no DOM counterpart, so Preview's captions
are rendered by a separate mechanism — a parity risk independent of D-004/D-005.
Target: captions are just another `CanonicalRenderLayer` with `kind:'text'`, driven by the
same plan for both targets. `CaptionRenderer`'s draw stack becomes the `canvas-export`
implementation of that layer type.

## 7. Tests

| Test | Method |
|---|---|
| FPS propagation | generate at 24/30/60 fps, assert the `FF` field differs correctly |
| Timing validation | fixtures for overlapping / negative / out-of-range |
| Deterministic ids | same input ⇒ same ids across runs |
| No fallback success | key absent ⇒ `AI_NOT_CONFIGURED`, never 200 with captions |
| Caption layer parity | compare the exported text layer with the plan used by Preview |
