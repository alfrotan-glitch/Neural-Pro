# Contract: Project State

**Normative.** Changes require an ADR.

The project model is already well designed. This contract documents it as normative so that
no Work Package changes it accidentally, and adds the two fields required by the target
architecture (`AssetId` references and animation identity).

---

## 1. Shape

```ts
export interface ProjectState {
  readonly projectId: string;
  readonly metadata: ProjectMetadata;
  readonly currentTime: number;          // seconds, [0, totalDuration]
  readonly totalDuration: number;        // DERIVED — see §3
  readonly isPlaying: boolean;           // never persisted as true
  readonly tracks: readonly Track[];
  readonly selectedNodeIds: readonly UUID[];
  readonly selectedKeyframeIds: readonly string[];
  readonly animations: readonly ElementAnimation[];
}

export interface ProjectMetadata {
  readonly title: string;
  readonly resolution: { readonly width: number; readonly height: number };
  readonly fps: number;                  // project fps — display/UI semantics only
}

export interface Track {
  readonly id: string;
  readonly type: TrackType;              // 'video' | 'audio' | 'text' | 'effect' | 'sticker' | …
  readonly isLocked: boolean;
  readonly isMuted: boolean;
  readonly isVisible: boolean;
  readonly isCollapsed?: boolean;
  readonly clips: readonly ClipNode[];
}

export interface ClipNode {
  readonly id: UUID;
  readonly sourceId: string;
  readonly startAt: number;              // timeline seconds, finite, >= 0
  readonly duration: number;             // DECLARED timeline seconds, finite, >= 0
  readonly trim: { readonly in: number; readonly out?: number } | null;
  readonly transform: ClipTransform | null;
  readonly properties: Readonly<Record<string, unknown>>;
}
```

## 2. Mutation authority

**Only `Command.execute(state)` may produce a new `ProjectState`.** A command is pure:
same input ⇒ same output; it never mutates its input; it owns private snapshots of all
constructor data (already the documented rule in `core/commands/types.ts` — keep it).

```
useProjectStore.executeCommand(command)
   → next = command.execute(current)
   → assertNoLockedTrackContentMutation(current.tracks, next.tracks)
   → totalDuration = calculateProjectDuration(next.tracks)
   → selectedNodeIds   = normalizeSelectedNodeIds(next.tracks, next.selectedNodeIds)
   → selectedKeyframeIds = ids ∩ live keyframe ids
   → assertValidProjectState(normalized)
   → set(...)  +  useHistoryStore.addCommand(command)
```

## 3. Derived values (must never be written independently)

| Value | Authority | Rule |
|---|---|---|
| `totalDuration` | `calculateProjectDuration(tracks)` | `max(0, max over clips of (startAt + canonicalTimelineDuration))` |
| canonical clip timeline duration | `getCanonicalClipTimelineDuration(clip)` | `min(declaredDuration, sourceDuration / speed)`; images/text → `declaredDuration` |
| source duration | `getCanonicalClipSourceDuration(clip)` | images & text → `null`; else `trim.out − trim.in` when valid; else persisted `sourceMediaDuration`/`mediaDuration`/`sourceDuration`; else `null` |
| playback rate | `getCanonicalClipPlaybackRate` | clamp `[0.0625, 16]`, default 1 |
| active at time T | `selectActivePreviewCompositorPlan(index, T)` | `[startAt, startAt + canonicalDuration)`; `deactivated` clips excluded |
| project → source time | `projectTimeToSourceTime(clip, t)` | `trim.in + (t − startAt) * speed`, clamped to `trim.out` |
| source → project time | `sourceTimeToProjectTime(clip, s)` | inverse, clamped to the clip end |

**`setTotalDuration(_duration)` already ignores its argument and recomputes.** Keep that.

## 4. Transform contract

```ts
export interface CanonicalClipTransform {
  x: number;        // px offset from composition centre
  y: number;
  scale: number;    // %, > 0, default 100
  scaleX: number;   // %, > 0, default 100
  scaleY: number;   // %, > 0, default 100
  rotation: number; // degrees
  opacity: number;  // 0..100, clamped
}
```

`getCanonicalClipTransform` is the only normaliser (finite-or-default, scale > 0, opacity
clamped). **The composition order is fixed and canonical:**
`T(origin + x, origin + y) · R(rotation) · S(scale·scaleX, scale·scaleY)`.
Both renderers consume `getCanonicalTransformMatrix()` — see
[../architecture/rendering-architecture.md](../architecture/rendering-architecture.md) §4.

## 5. Media references (target — breaks today's shape)

```diff
  properties: {
    name: string;
-   videoUrl?: string;      // blob: | https: | data:
-   audioUrl?: string;
-   imageUrl?: string;
+   videoAssetId?: AssetId | null;
+   audioAssetId?: AssetId | null;
+   imageAssetId?: AssetId | null;
+   videoUrl?: string;      // remote https: ONLY — never blob:, never data:
    …
  }
```

**Rule:** a `blob:` URL may exist in memory (as a resolved handle) but **must never be
serialised**. `createPersistedProjectDocument` asserts this.

## 6. Validation

| Invariant | Enforced by |
|---|---|
| `startAt`, `duration` finite | `assertValidProjectState` |
| no two clips with the same id | `assertValidProjectState` |
| locked tracks' content unchanged by a command | `assertNoLockedTrackContentMutation` |
| selection ⊆ live clip ids | `normalizeSelectedNodeIds` |
| transform normalised | `getCanonicalClipTransform` |
| timeline ordering / no negative durations | `timelineInvariants`, `lockedTrackInvariants` |

All of these **throw**. Target: they throw into a React error boundary (D-013).

## 7. Persistence

See [../architecture/persistence-architecture.md](../architecture/persistence-architecture.md).
Serialisation is `structuredClone` + `assertValidProjectState`; the on-disk envelope is
`ProjectDocumentV2 { schemaVersion: 2, project, assets[] }`.

## 8. Non-determinism ban

`properties.waveformData` is currently generated with `Math.random()` on every sync and then
persisted. Target: derive the waveform from the decoded audio (deterministic), or omit it and
compute at render time. No persisted value may be random.

---

## 9. Canonical core (amended by ADR-017)

**ADR-017** ([../decisions/ADR-017-canonical-core.md](../decisions/ADR-017-canonical-core.md))
establishes `src/domain/core/**` as the canonical kernel for the concepts in §1–§6. Nothing in
§1–§8 above is altered by it; the kernel is how those rules are now *implemented once*.

Mapping from this contract to the kernel:

| Contract section | Kernel authority |
|---|---|
| §3 `totalDuration` | `duration.calculateProjectDuration` |
| §3 canonical clip timeline duration | `duration.getTimelineDuration` |
| §3 source duration / playback rate | `duration.getSourceDuration` · `duration.getPlaybackRate` |
| §3 project ↔ source time | `duration.projectTimeToSourceTime` · `duration.sourceTimeToProjectTime` |
| §3 active at time T | `time.intervalContains` over a half-open `TimeInterval` |
| §4 transform | `transform.canonicalTransform` · `transform.transformMatrix` (`T · R · S`) |
| §1 `fps` | `fps.resolveRenderFps` — the single framerate authority (INV-013) |

Reference: [../architecture/canonical-core.md](../architecture/canonical-core.md).
