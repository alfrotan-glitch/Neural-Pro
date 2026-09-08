# Resource Lifecycle Testing

Owns **INV-008** (every acquired resource is released) and the evidence for D-014 / D-016.

---

## 1. Principle

A resource test does not check that code "looks like" it cleans up. It **instruments the
platform API** and counts.

```
acquire(resource)  → counter++
release(resource)  → counter--
                     assert balance == 0 at the end of every operation,
                     on success, on failure, and on cancellation
```

## 2. Instrumented APIs

| Resource | Acquire | Release | Current status |
|---|---|---|---|
| Object URL | `URL.createObjectURL` | `URL.revokeObjectURL` | **0 revoke calls in `App.tsx`** (D-014); `audioExtractionService` creates 3 with none revoked; timeline `handleLinkOrReplaceMediaFile` creates one per call, never revoked |
| Timers | `setInterval` / `setTimeout` | `clearInterval` / `clearTimeout` | `ExportQueueManager` interval; not verified on unmount |
| Event listeners | `addEventListener` | `removeEventListener` | **D-016: 199 stale `ondequeue` handlers per 200 stalled frames** |
| `VideoEncoder` | constructor | `close()` | closed in `finally` ✔ |
| `AudioEncoder` | constructor | `close()` | closed in `finally` ✔ |
| `VideoFrame` | constructor | `close()` | closed in `finally` ✔ |
| `ImageBitmap` | `createImageBitmap` | `close()` | closed per export ✔ |
| `AudioContext` | constructor | `close()` | **no disposal path documented for `AudioMixController`** |
| Media element | created / `src` set | `src=''; load()` | pool-owned after WP-02 |
| Muxer | constructor | `dispose`/finalize | **not released on abort today** |
| AbortController | constructor | `abort()` | leaked tokens in `RenderPipeline` |

## 3. Harness

```ts
export interface ResourceProbe {
  snapshot(): Record<string, number>;
  assertBalanced(op: string): void;     // throws with the diff
  leaks(): Record<string, number>;
}

installResourceProbe();   // patches URL, setInterval, addEventListener, …
```

Each work package that acquires a resource adds an assertion.

## 4. Required scenarios

For **each** workflow, assert balance after:
1. success,
2. failure at every step (fault injection),
3. cancellation at every step,
4. timeout at every step,
5. unmount of the owning component,
6. completion followed by a second run (no accumulation).

## 5. Specific known leaks to close

| ID | Leak | Evidence | WP |
|---|---|---|---|
| D-014 | `App.tsx` creates object URLs for TTS/generated audio, replaces them, never revokes | 0 `revokeObjectURL` occurrences | WP-11 |
| D-014 | `VirtualizedTimeline.handleLinkOrReplaceMediaFile` (~line 904) mints a URL per call | source inspection | WP-11 |
| D-014 | `audioExtractionService` lines 211/223/234 | source inspection | WP-11 |
| D-016 | `ondequeue` handler not restored on the 100 ms timeout path | `audit/repro-ondequeue-leak.cjs` → 199 stale handlers | WP-11 |
| – | `AudioMixController` `AudioContext` never closed | source inspection | WP-11 |
| – | `ResourceSidebar` revokes only *unreferenced* URLs on unmount; referenced ones leak | lines 249-272 | WP-11 |

## 6. Memory-growth test (browser class)

```
1. mount the app with a fixture project
2. run operation X 50 times (export, TTS, media replace)
3. force GC (--expose-gc) or use performance.measureUserAgentSpecificMemory()
4. assert retained heap growth < threshold and JS heap returns to within X % of baseline
```

This is the only test that catches **accumulating** leaks that individual balance checks
miss. It runs in the browser class and is required for RUNTIME CERTIFICATION of the export
and TTS paths.

## 7. Acceptance

A work package touching a resource-owning module may only pass its gate when:
* the balance probe is zero for every scenario in §4, and
* `audit/repro-ondequeue-leak.cjs` exits 0, and
* the memory-growth test shows no monotonic growth across 50 iterations.
