# File Ownership Matrix

**Purpose:** guarantee that two concurrent work packages never edit the same file.

Columns: **current owner** (today's de facto authority), **target owner** (module that will own
it after the programme), **WP** (who may modify it), **allowed agents**, **dependency
sensitivity** (what breaks elsewhere if this changes), **merge risk**.

Legend — dependency sensitivity: `H` high (many dependents / canonical) · `M` medium ·
`L` low (leaf).
Merge risk: `H` (contended, likely conflicts) · `M` · `L`.

---

## 1. Server

| Path | Current owner | Target owner | WP | Allowed agents | Sens. | Merge risk |
|---|---|---|---|---|---|---|
| `server.ts` (1 172) | nobody (monolith) | `server/app.ts` + `server/operations/*` | WP-01, WP-07, WP-09 | Backend/API Security, DevOps | **H** | **H** |
| `server/operations/**` (new) | – | server | WP-01, WP-09 | Backend/API Security | M | M |
| `server/config/models.ts` (new) | – | server | WP-01, WP-09 | Backend/API Security | **H** | M |
| `server/prompts/**` (new) | – | server | WP-09, WP-12 | Backend/API Security, Docs | M | L |
| `vite.config.ts` | build | build | WP-07 | DevOps | M | M |
| `package.json` / `package-lock.json` | – | – | WP-07 (deps), WP-12 (name) | DevOps | **H** | **H** |
| `tsconfig.json` | build | build | WP-00, WP-08 | Staff Eng | **H** | M |
| `.env.example` (new) | – | – | WP-07 | DevOps | L | L |
| `Dockerfile` (new) | – | – | WP-07 | DevOps | M | L |
| `.github/workflows/**` (new) | – | – | WP-00, WP-07 | DevOps | M | L |

## 2. Export

| Path | Current owner | Target owner | WP | Allowed agents | Sens. | Merge risk |
|---|---|---|---|---|---|---|
| `src/core/engine/render/ExportMediaRegistry.ts` | export | **deleted** | WP-02 | Media Pipeline | **H** | **H** |
| `src/core/engine/render/CanvasExportRenderer.ts` (1 009) | export | `src/infra/render/CanvasExportRenderer.ts` | WP-02, WP-03 | Media Pipeline | **H** | **H** |
| `src/features/video-studio/export/services/webcodecsExport.ts` (1 043) | export | `src/infra/encode/webcodecsExport.ts` | WP-02, WP-03, WP-11 | Media Pipeline, Perf | **H** | **H** |
| `src/features/video-studio/export/services/exportService.ts` (399) | export | `src/app/workflows/export/*` | WP-02, WP-03, WP-12 | Media Pipeline | M | M |
| `src/lib/webcodecs-export.ts` | export (?) | verify/delete | WP-02, WP-12 | Media Pipeline | L | L |
| `src/features/video-studio/export/components/ExportQueueManager.tsx` | UI | `src/ui/export/ExportQueue.tsx` | WP-04 | React Lead, Workflow Arch | **H** | **H** |
| `src/features/video-studio/export/components/ExportJobManager.tsx` (207) | UI | `src/ui/export/ExportJobCard.tsx` | WP-04 | React Lead | M | M |
| `src/features/video-studio/export/components/ExportPanel.tsx` | UI | `src/ui/export/*` | WP-04, WP-12 | React Lead, UX | M | M |
| `src/features/video-studio/export/types/export.ts`, `settings.ts`, `codecs.ts` | export | contracts | WP-02, WP-04 | Media Pipeline | **H** | M |
| `src/store/useExportStore.ts` (226) | store | `src/app/state/exportStore.ts` | WP-04 | Workflow Arch | **H** | **H** |
| `src/features/video-studio/audio/services/projectAudioRenderService.ts` | audio | `src/infra/audio/*` | WP-03, WP-11 | Media Pipeline | **H** | M |
| `src/features/video-studio/audio/services/audioRenderService.ts` | audio | `src/infra/audio/*` | WP-03, WP-11 | Media Pipeline | M | M |
| `src/features/video-studio/audio/services/audioMixModel.ts` | audio | `src/domain/audio/*` | WP-11 | Media Pipeline | **H** | M |
| `src/features/video-studio/audio/services/audioExtractionService.ts` (248) | audio | `src/infra/audio/*` | WP-11 | Media Pipeline, Perf | M | M |
| `src/features/video-studio/playback/audio/AudioMixController.ts` (240) | audio | `src/infra/audio/AudioMixController.ts` | WP-11 | Media Pipeline | **H** | M |
| `src/core/engine/exportConverter.ts`, `exportEncodingSettings.ts`, `exportResolution.ts` | export | `src/domain/export/*` | WP-03 | Media Pipeline | M | L |

## 3. Render / preview

| Path | Current owner | Target owner | WP | Allowed agents | Sens. | Merge risk |
|---|---|---|---|---|---|---|
| `src/features/video-studio/playback/services/clipTransformModel.ts` | render | `src/domain/render/transform.ts` | WP-03 | Media Pipeline | **H** | **H** |
| `src/features/video-studio/playback/services/mediaFrameGeometry.ts` | render | `src/domain/render/geometry.ts` | WP-03 | Media Pipeline | **H** | M |
| `src/features/video-studio/playback/services/mediaVisualEffects.ts` | render | `src/domain/render/effects.ts` | WP-03 | Media Pipeline | M | L |
| `src/features/video-studio/playback/compositor/previewCompositor.ts` | render | `src/domain/render/compositor/*` | WP-03, WP-05 | Media Pipeline, Staff Eng | **H** | **H** |
| `src/features/video-studio/playback/compositor/previewCompositorIndex.ts` | render | `src/domain/render/compositor/index.ts` | WP-03 | Media Pipeline | **H** | M |
| `src/features/video-studio/playback/compositor/layerOrder.ts` | render | `src/domain/render/*` | WP-03 | Media Pipeline | M | L |
| `src/features/video-studio/playback/services/atomicRenderSnapshot.ts` (130) | render | `src/domain/render/snapshot.ts` | WP-03 | Media Pipeline | **H** | M |
| `src/features/video-studio/playback/services/renderSnapshotRegressionGate.ts` | diagnostics | decide: wire or delete | WP-03 | Media Pipeline, QA | M | M |
| `src/features/video-studio/playback/services/renderSnapshotDiagnostics.ts` + `renderDiagnostic*.ts` (17 files) | diagnostics | decide: keep as a tool or delete | WP-03, WP-12 | Media Pipeline, QA | L | L |
| `src/components/player/VideoPlayer.tsx` (1 153) | UI | `src/ui/preview/*` | WP-02, WP-03, WP-08 | React Lead, Media Pipeline | **H** | **H** |
| `src/features/video-studio/playback/services/mediaTimeMapper.ts` | time | `src/domain/time/mediaTime.ts` | WP-03, WP-11 | Staff Eng | **H** | M |
| `src/features/video-studio/playback/services/transportClock.ts` (227) | time | `src/infra/playback/transportClock.ts` | WP-04, WP-11 | Workflow Arch, Media Pipeline | **H** | M |
| `src/features/video-studio/playback/services/multiMediaSyncController.ts`, `mediaSyncController.ts`, `frameAccurateVideoClock.ts`, `presentedFrameBarrier.ts`, `atomicMediaFrameCommit.ts` | playback | `src/infra/playback/*` | WP-11 | Media Pipeline | **H** | M |
| `src/features/video-studio/playback/services/previewTransformInteractionService.ts` (615) | UI+domain | split: `src/app/interaction/*` + `src/domain/render/*` | WP-08 | React Lead, Staff Eng | M | **H** |
| `src/features/video-studio/playback/services/mediaHealthController.ts` | playback | `src/infra/playback/*` | WP-11 | Media Pipeline | M | L |

## 4. Project state, timeline, persistence

| Path | Current owner | Target owner | WP | Allowed agents | Sens. | Merge risk |
|---|---|---|---|---|---|---|
| `src/features/video-studio/project/types/project.ts` | domain | `src/domain/project/types.ts` | WP-05, WP-08 | Staff Eng | **H** | **H** |
| `src/store/useProjectStore.ts` (494) | store | `src/app/state/projectStore.ts` | WP-05, WP-08 | Staff Eng, Workflow Arch | **H** | **H** |
| `src/store/useHistoryStore.ts` (90) | store | `src/app/history/CommandHistory.ts` | WP-08 | Staff Eng | **H** | M |
| `src/features/video-studio/project/services/projectPersistenceService.ts` | persistence | `src/infra/persistence/projectStore.ts` | WP-05 | Staff Eng, Backend | **H** | **H** |
| `src/features/video-studio/project/services/projectService.ts` | project | `src/app/project/*` | WP-05 | Staff Eng | M | M |
| `src/features/video-studio/project/validation/**` (3) | domain | `src/domain/project/validation/*` | WP-05, WP-08 | Staff Eng | **H** | M |
| `src/features/video-studio/project/time/clipBounds.ts`, `intervals.ts` | domain | `src/domain/time/*` | WP-08 | Staff Eng | M | L |
| `src/core/engine/clipTimelineDuration.ts` | domain (duplicate for cycle) | `src/domain/time/clipDuration.ts` | WP-08 | Staff Eng | **H** | M |
| `src/core/engine/projectDuration.ts` | domain | `src/domain/time/projectDuration.ts` | WP-08, WP-11 | Staff Eng | **H** | M |
| `src/core/commands/*.ts` (4) | commands | `src/app/commands/*` | WP-08, WP-12 | Staff Eng | **H** | M |
| `src/features/video-studio/timeline/**` (23 files) | UI+domain | `src/ui/timeline/*` + `src/domain/timeline/*` | WP-08, WP-11, WP-12 | React Lead, Staff Eng | **H** | **H** |
| `src/components/timeline/VirtualizedTimeline.tsx` | UI | `src/ui/timeline/*` | WP-05, WP-08, WP-11, WP-12 | React Lead | **H** | **H** |
| `src/components/workspace/ResourceSidebar.tsx` | UI | `src/ui/workspace/*` | WP-05, WP-11, WP-12 | React Lead | **H** | **H** |
| `src/features/video-studio/shared/types/identity.ts` | domain | `src/domain/identity.ts` | WP-05 | Staff Eng | M | L |

## 5. AI / captions / overlays

| Path | Current owner | Target owner | WP | Allowed agents | Sens. | Merge risk |
|---|---|---|---|---|---|---|
| `src/App.tsx` | UI + business logic | `src/ui/App.tsx` (thin) + `src/app/workflows/*` | WP-09, WP-08 | React Lead, Backend | **H** | **H** |
| `src/features/video-studio/captions/services/captionTimecodeService.ts` | captions | `src/domain/captions/timecode.ts` | WP-07, WP-09 | Backend, Staff Eng | **H** | M |
| `src/features/video-studio/captions/**` (other 15) | captions | `src/domain/captions/*` + `src/ui/captions/*` | WP-09, WP-12 | Backend, React Lead | M | M |
| `src/core/engine/CaptionRenderer.ts` (557) | render | `src/infra/render/CaptionRenderer.ts` | WP-03, WP-09 | Media Pipeline | **H** | M |
| `src/features/video-studio/overlays/**` (7) | overlays | `src/domain/overlays/*` | WP-03 | Media Pipeline | M | L |
| `src/features/video-studio/animation/**` (6) | animation | `src/domain/animation/*` | WP-08 | Staff Eng | M | L |

## 6. Shell / UI

| Path | Current owner | Target owner | WP | Allowed agents | Sens. | Merge risk |
|---|---|---|---|---|---|---|
| `src/components/VideoStudioPro.tsx` (1 855) | UI + workflow | `src/ui/studio/*` + `src/app/workflows/export/*` | WP-04, WP-08 | React Lead, Workflow Arch | **H** | **H** |
| `src/components/inspector/InspectorEngine.tsx` | UI | `src/ui/inspector/*` | WP-08, WP-12 | React Lead, UX | M | **H** |
| `src/components/inspector/panels/TextInspectorPanel.tsx` | UI | `src/ui/inspector/*` | WP-08, WP-12 | React Lead, UX | M | **H** |
| `src/features/video-studio/**/shell/components/DockableWorkspace.tsx` (213) | shell | `src/ui/shell/*` | WP-08, WP-12 | React Lead, UX | M | M |
| `src/components/workspace/DockableWorkspace.tsx` (2-line re-export) | shell | delete or keep as the public path | WP-08 | React Lead | L | L |
| `src/config/keymap.ts` (254) | config | `src/app/keymap.ts` | WP-08, WP-12 | React Lead, UX | M | L |
| `src/components/subscribe-generator/**` (11) | UI | `src/ui/subscribe/*` | WP-09, WP-12 | React Lead | M | M |
| `src/components/player/**` (4, excl. VideoPlayer) | UI | `src/ui/preview/*` | WP-03, WP-08 | React Lead | M | M |
| `src/main.tsx` | entry | entry + error boundary | WP-07 | React Lead | **H** | L |
| `src/i18n/**` | i18n | `src/i18n/**` | WP-12 | Docs, UX | M | M |

## 7. Verification assets

| Path | Current owner | Target owner | WP | Allowed agents | Sens. | Merge risk |
|---|---|---|---|---|---|---|
| `audit/repro-export-registry.mts` | audit | regression suite | WP-00 (runner only), WP-02 (fix code) | QA | **H** | L |
| `audit/repro-transform-order.mts` | audit | regression suite | WP-00, WP-03 | QA | **H** | L |
| `audit/repro-media-cover-clip.mts` | audit | regression suite | WP-00, WP-03 | QA | **H** | L |
| `audit/repro-export-queue.mts` | audit | regression suite | WP-00, WP-04 | QA | **H** | L |
| `audit/repro-ondequeue-leak.cjs` | audit | regression suite | WP-00, WP-11 | QA | **H** | L |
| `audit/repro-queue-deadlock.mts` | audit | **guard — must stay 0** | WP-00, WP-04 | QA | M | L |
| `tests/**` (191) | nobody | `tests/{unit,integration,static,browser}` | WP-06, WP-12 | QA | **H** | M |
| `docs/**` | architect | architect | docs-owning WP | Docs Lead + the WP owner | L | L |

## 8. Contention hotspots (explicit)

| File | Contenders | Rule |
|---|---|---|
| `server.ts` | WP-01, WP-07, WP-09 | **Serialise in that order.** WP-07 rebases after WP-01; WP-09 after both. |
| `src/App.tsx` | WP-08, WP-09 | WP-09 (AI call migration) first; WP-08 then decomposes. |
| `VideoStudioPro.tsx` | WP-04, WP-08 | WP-04 extracts the export workflow; WP-08 splits the remainder. |
| `CanvasExportRenderer.ts` | WP-02, WP-03 | WP-02 (media resolution) then WP-03 (geometry/parity). |
| `useProjectStore.ts` | WP-05, WP-08 | WP-05 (asset refs) then WP-08 (layer move + cycle break). |
| `VirtualizedTimeline.tsx` | WP-05, WP-08, WP-11, WP-12 | **Serialise**: 05 → 11 → 08 → 12. |
| `clipTransformModel.ts` | WP-03, WP-08 | WP-03 changes semantics; WP-08 only moves it. |
