# ADR-010 — Measured Duration Is Authoritative

**Status:** Accepted
**Date:** 2026-09-08

## Context

A clip's duration is derived in at least six places, and they disagree:

| Site | Behaviour |
|---|---|
| `ResourceSidebar.handleFileUpload` | defaults video to `30.0`, audio to `10.0` when probing fails |
| `getCanonicalClipSourceDuration` | reads `trim.out − trim.in`, else persisted `sourceMediaDuration` / `mediaDuration` / `sourceDuration`, else `null` |
| `VideoStudioPro.tsx:216` | sets a generated-audio clip's `duration` and `trim.out` to **`state.totalDuration`** — the *previous* project length |
| `getOfflineAudioSourceDuration` | clamps `min(end − start, timelineDuration × playbackRate)` |
| `App.tsx` TTS | writes a WAV header assuming 24 kHz / mono / 16-bit with no validation |
| `projectPersistenceService` | persists whatever the above produced |

Measured effect (D-024): a 15-minute generated podcast is placed on the timeline as 45 s and
**exported as 45 s**. The clamp in `getOfflineAudioSourceDuration` then makes the truncation
authoritative for audio too.

## Decision

1. Duration, dimensions, sample rate and channel count are **measured once at import** by
   `AssetRegistry.measure()` and cached on the `AssetRecord`.
2. `AssetRecord.duration` is authoritative for clip duration, timeline bounds, export frame
   count and audio render length.
3. Persisted per-clip duration fields remain as a cache but are **revalidated** against the
   asset record on load; a mismatch is resolved in favour of the measurement and logged.
4. A generated asset (podcast/TTS) is measured **before** the clip is created; the workflow
   awaits the measurement (no `totalDuration` assumption).
5. Measurement failure ⇒ the asset is `durationUnknown`; the clip cannot be created with a
   defaulted duration; the UI states the problem. Defaults of `30.0`/`10.0` are removed.
6. The WAV header is derived from the decoded `AudioBuffer`, never from assumptions.

## Consequences

* D-024 closes at both ends (creation and clamping).
* Import becomes slightly slower (one probe per asset) — acceptable, and it removes a class
  of silent truncation.
* `getOfflineAudioSourceDuration`'s clamp remains as a safety net but no longer changes correct
  values.

## Alternatives considered

* **Trust the persisted duration** — rejected: it is the mechanism by which the 45 s
  truncation became durable.
* **Re-probe on every load** — rejected as wasteful; measurement is cached and revalidated.
