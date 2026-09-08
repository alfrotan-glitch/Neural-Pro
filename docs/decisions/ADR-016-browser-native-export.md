# ADR-016 — Browser-Native Export Is the Canonical Export Path

**Status:** Accepted
**Date:** 2026-09-09
**Supports:** ADR-015 · **Updates:** ADR-004 (rationale) · **Detail:**
[../architecture/AI-STUDIO-MEDIA-RUNTIME.md](../architecture/AI-STUDIO-MEDIA-RUNTIME.md)

---

## Context

Neural-Pro is a media application whose product value is the exported artifact. The repository
contains two export paths:

1. a **browser** path (`CanvasExportRenderer` + WebCodecs + `mp4-muxer` + Canvas + Web Audio),
   which is the one that actually works;
2. a **server** path (`/api/export/start` → frame uploads → `spawn('ffmpeg')` → `/api/export/finish`),
   which fails with `spawn ffmpeg ENOENT` because the binary is neither declared nor present.

ADR-004 (2026-09-08) decided to remove the server path, arguing mainly from the Cloud Run
container contract. Under the corrected target runtime (ADR-015) that argument is no longer the
right one, so the decision is re-derived from the actual target: the **Google AI Studio Web App
runtime**.

## Decision

1. **Canonical export path: browser-native (Strategy A).**
   `AssetRegistry → ExportMediaPool → buildCanonicalRenderPlan → Canvas2D → WebCodecs encoders →
   mp4-muxer → Blob → delivery`.
2. **The AI Studio server runtime performs no media processing.** Its role is the controlled AI
   gateway (Strategy C): `generatePodcastScript`, `generateCaptions`, `refineCaptions`,
   `generateSpeech` — bounded, cancellable, timeout-limited text operations.
3. **No FFmpeg, no `ffmpeg-static`, no `spawn`.** FFmpeg is classified **D — unsupported**
   (provisional, pending the AS-13 runtime investigation) for
   the target runtime (seven of ten capability questions unresolved — see
   [../architecture/AI-STUDIO-MEDIA-RUNTIME.md](../architecture/AI-STUDIO-MEDIA-RUNTIME.md) §4).
4. **Capability detection is mandatory.** Required capabilities are probed at startup and before
   export; a missing required capability disables export with an actionable explanation.
   It never silently attempts and fails.
5. **Delivery is part of the export workflow**, with ordered fallbacks
   (`<a download>` → File System Access `showSaveFilePicker` → manual), and a typed
   `EXPORT_DELIVERY_FAILED`. This exists because the behaviour of downloads inside the AI Studio
   preview frame is **RUNTIME-UNKNOWN** (`P-01`).
6. **If a future codec requirement cannot be met in-browser**, the remedy is an explicit ADR
   proposing an external service (Strategy D) with a declared dependency — never a silent
   attempt to make a native binary run in the AI Studio runtime.

## Rationale

* The AI Studio Web App runtime provides no media binary and does not document subprocess
  support; CPU is allocated during request processing, so long background encodes are
  unreliable; there is no durable server storage for artifacts.
* The browser already has the required primitives (Canvas2D, WebCodecs, Web Audio) and already
  has a working implementation in this repository.
* Browser-side export keeps user media on the user's machine — a privacy and cost benefit.
* It is the only strategy that is **testable headlessly** (WP-02), which is what makes export
  verifiable at all.

## Consequences

* `/api/export/*` is removed (unchanged from ADR-004; rationale corrected).
* Export adds a **delivery step** and a capability pre-check — small additional scope for
  WP-04/WP-07.
* Export correctness depends on the **end user's browser**. That is now an explicit, documented
  product assumption with a capability matrix, not an implicit one.
* Two runtime contexts must be certified: the **AI Studio preview frame** and the **published
  app URL** (`P-06`).

## Alternatives considered

| Alternative | Verdict |
|---|---|
| Server-side encode with an installed FFmpeg | **Rejected** — capability class D (§4 of the media runtime doc) |
| WASM encoder on the server (e.g. `ffmpeg.wasm`) | **Rejected** — same CPU/timeout/storage problems, plus a large WASM payload; no advantage over the user's browser doing the same work |
| Upload frames to the server, mux there | **Rejected** — enormous bandwidth, ephemeral storage, no muxer binary |
| Browser render + server mux | **Rejected** — the muxer is the part that needs a binary; `mp4-muxer` already works in the browser |
