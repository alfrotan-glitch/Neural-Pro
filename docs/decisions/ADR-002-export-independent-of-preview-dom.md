# ADR-002 — Export Must Not Depend on the Preview DOM

**Status:** Accepted
**Date:** 2026-09-08

## Context

`ExportMediaRegistry.scanForExportFromPlayer()` does:

```ts
document.querySelectorAll<HTMLVideoElement>('[data-export-media-clip-id]')
```

Those elements are rendered by `VideoPlayer.tsx:497` from `renderSnapshot.byRole.video` —
**only the clips active at the current playhead**. Export scans once, after
`setCurrentTime(0)`.

Measured on the default project: the registry contains only `v1_clip`, while
**795 of 1350 frames (58.9 %)** require `v2_clip` or `v3_clip`; those frames fall through to
`if (!drawn)` and are painted as a purple gradient placeholder with the clip name.

Additional couplings: if the Preview panel is closed or re-docked, **zero** elements exist;
React may replace the nodes mid-export; export cannot be tested headlessly.

## Decision

Export resolves media through `ExportMediaPool`, which is driven by `AssetId` and creates
**detached** media elements. Export must never:
* call `document.querySelector` / `querySelectorAll`,
* read a React ref belonging to the Preview,
* require any component to be mounted.

`ExportMediaRegistry` is deleted. The `[data-export-media-clip-id]` attribute is removed once
no consumer remains (it is also used by debugging tooling — tracked in WP-12).

## Consequences

* Export becomes testable in a Node/jsdom harness with a fake `AssetRegistry`.
* Export becomes correct in the presence of a closed/re-docked Preview.
* A lint rule bans `document.querySelector` outside `src/infra/**`.
* Required test invariant #5 ("export succeeds with the preview unmounted") becomes possible
  and mandatory.

## Alternatives considered

* **Keep scraping but scan at every frame** (seek per frame to force the DOM to update):
  rejected — 1350 React commits per export, unbounded slowness, and it still couples export to
  a mounted component.
* **Render a hidden second copy of the Preview for export**: rejected — same coupling, plus
  double the decode cost.
