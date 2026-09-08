# Media Pipeline

**Status:** current + target. Owns timing authority, duration authority and seek authority.

---

## 1. Time model

Three coordinate systems. Getting the mapping wrong is the root of most A/V defects.

```
projectTime  (timeline seconds, [0, projectDuration))       ← authoritative for UI & export
     │
     │  mediaTimeMapper.projectTimeToSourceTime(clip, t)
     ▼
sourceTime   (seconds within the clip's own media)          ← what <video>.currentTime uses
     │
     │  frame = round(sourceTime * fps)
     ▼
frameIndex
```

### Canonical rules (already correct — preserve)

* `getCanonicalClipPlaybackRate` clamps speed to `[0.0625, 16]`, default 1.
* `getClipSourceRange` returns `{ start, end | null }`; `end === null` means "no valid
  trim-out, do not invent one".
* `projectTimeToSourceTime = trim.in + (projectTime − clip.startAt) * speed`, clamped to
  `trim.out` when present.
* `getCanonicalClipTimelineDuration = min(declaredDuration, sourceDuration / speed)`.
* `calculateProjectDuration = max over clips of (startAt + canonicalTimelineDuration)`.

**Single authority confirmed:** `calculateProjectDuration` is used by the store, history,
persistence and validation; `totalDuration` is never written independently
(`setTotalDuration` ignores its argument and recomputes). This is healthy — keep it.

## 2. Where the time model breaks

| Defect | Location | Effect |
|---|---|---|
| **D-024** generated-audio duration | `VideoStudioPro.tsx:216` sets `duration = trim.out = state.totalDuration` (the *previous* project length, e.g. 45 s) instead of the real WAV duration | a 15-minute generated podcast is placed on the timeline and **exported as 45 s**. `getOfflineAudioSourceDuration` then clamps: `min(end − start, timelineDuration × rate)` |
| Caption FPS | `DEFAULT_CAPTION_FPS = 30` hard-coded; `server.ts:883/919/970/1010` pass no fps | `HH:MM:SS:FF` timecodes are wrong for 24/60 fps projects (D-022) |
| WAV header | `App.tsx:240 createWavUrlFromBytes(bytes, sampleRate = 24000)` | assumes 24 kHz/mono/16-bit with no validation against the TTS response → wrong speed/pitch, silently |
| Trim-out fallback | `VideoPlayer.tsx:551` `clipTrimOut = Number.isFinite(clip.trim?.out) ? clip.trim!.out : (clip.trim?.in ?? 0) + clip.duration` | invents a source range where the canonical mapper deliberately returns `null` |
| Non-determinism | `waveformData: Array.from({length:45}, () => Math.floor(Math.random()*30)+10)` | persisted randomness (D-027) |

## 3. Duration authority (target)

**INV-011:** the duration of a media-backed clip is **measured once, at import**, cached on the
`AssetRecord`, and never re-derived from a different source.

```
import → AssetRegistry.measure(assetId) → MediaProbe { duration, width, height, sampleRate?, channels? }
       → AssetRecord.duration = probe.duration
       → clip.duration / clip.trim.out derived from it
       → export & preview both read AssetRecord.duration
```

`measure()` uses a detached `HTMLMediaElement` (or `decodeAudioData` for audio-only) and
awaits `loadedmetadata` with a timeout. If measurement fails, the asset is
`durationUnknown` and the UI must say so — it must not default to `30.0`/`10.0` the way
`ResourceSidebar.handleFileUpload` does today.

**D-024 fix:** the podcast-audio sync effect must `await` the measurement before creating the
clip, and use the measured duration for `duration` and `trim.out`.

## 4. Seek authority

**INV-012:** exactly one component seeks a media element for a given purpose at a time.

Today:
* Preview playback: `multiMediaSyncController` + `frameAccurateVideoClock` per element.
* Export: `seekActiveVideoClips` on the *same* elements (after `isExporting` disables the
  playback effects). This is the "Export owns seeking while exporting" contract — it works
  **only because** the elements belong to Preview (which is exactly the coupling being
  removed).

Target: the `ExportMediaPool` owns seeking for export; `multiMediaSyncController` owns seeking
for preview; they never share an element. `seekMediaElement` (15 s timeout, tolerance 1 ms,
AbortSignal-aware) is already a good primitive and should be reused by both.

## 5. Decode / frame pipeline

```
AssetId
 → AssetRegistry.get(id) → Blob
 → resolveUrl(id) → object URL (tracked)
 → <video> / <img> / decodeAudioData
 → for export: ExportMediaPool holds detached elements; seek() awaits a presented frame
 → CanvasExportRenderer.drawImage(videoEl, …)
 → new VideoFrame(canvas, { timestamp: round(frameIndex / fps * 1e6) })
 → VideoEncoder.encode(frame, { keyFrame })
```

### Known issues in the current pipeline

| Issue | Detail |
|---|---|
| Frame-present guarantee | `seekActiveVideoClips` awaits `seeked`, but there is no verification that the element has actually *presented* the target frame (`requestVideoFrameCallback` would provide this). Under load this can encode a stale frame. |
| No decode timeout in export | `seekMediaElement` has a 15 s timeout ✔ but export never surfaces which clip timed out |
| Image decode | `loadExportImageSource` correctly prefers `createImageBitmap` and revokes the fallback object URL ✔ |
| Audio extraction | `audioExtractionService` creates **3 object URLs** (lines 211/223/234) with **no** revoke → leak |
| Cover scaling | see [rendering-architecture.md](rendering-architecture.md) §5 (D-005) |

## 6. Audio model

```
OfflineAudioContext(2, ceil(duration * sampleRate), 44100)
  per audio-bearing clip:
    source = createBufferSource(); buffer = decoded; playbackRate = mix.playbackRate
    gain   = createGain();          envelope: setValueAtTime/linearRamp (fade in/out, monotonic)
    pan    = createStereoPanner()
    source.start(startAt, mix.trimIn, min(requestedSourceDuration, availableSourceDuration))
    source.stop(endAt)
startRendering()
```

Strengths to preserve: the monotonic fade envelope (prevents mid-clip gain jumps), the
`trimIn`/`sourceDuration` clamping, and typed `AudioRenderError` with `code` and `cause`.

Issues: `sampleRate` is hard-coded to 44100 at the call site while `audioBuffer.sampleRate`
is used for the encoder; a mismatch is possible if a source is not 44.1 kHz. Target: one
`AudioRenderSampleRate` authority, negotiated from `AudioContext.sampleRate` with an explicit
resample step.

## 7. Video/audio length reconciliation

```
videoFrames   = ceil(projectDuration * fps)          → video length = frames / fps
audioBuffer   = duration `projectDuration` seconds   → audio length = projectDuration
```

The difference is sub-frame and acceptable. Target asserts
`|videoLength − audioLength| < 1/fps + ε` and logs a warning otherwise.

**Current P1:** with D-024 the mismatch is not sub-frame — it is 45 s vs 15 min.
