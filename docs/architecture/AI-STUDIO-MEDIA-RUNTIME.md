# AI Studio Media Runtime

**Status:** normative for the AI Studio Web App runtime.
**Scope:** capability classification (A–E), canonical export strategy (A–D), FFmpeg evaluation,
media capability contracts.
**Related:** [../decisions/AI-STUDIO-TARGET-RUNTIME-CORRECTION.md](../decisions/AI-STUDIO-TARGET-RUNTIME-CORRECTION.md),
[../decisions/ADR-015-ai-studio-web-app-primary-runtime.md](../decisions/ADR-015-ai-studio-web-app-primary-runtime.md),
[export-architecture.md](export-architecture.md),
[media-pipeline.md](media-pipeline.md).

---

## 1. The central distinction

Capabilities in this application belong to **two different machines**, and conflating them is
how the previous blueprint went wrong.

| Layer | Where it executes | Whose capability it is |
|---|---|---|
| React UI, Canvas, WebCodecs, Web Audio, IndexedDB, Blob URLs, MediaSource, `HTMLMediaElement` | the **end user's browser** (inside the AI Studio preview frame or the published app) | the **user's** browser — AI Studio does not execute it |
| Express routes, Gemini calls, caption processing, secrets | the **AI Studio server-side Node.js runtime** (in an AI Studio-managed container) | **AI Studio** |

Consequences:

* **WebCodecs availability is a user-browser question**, not an AI Studio question. AI Studio
  cannot make a browser support WebCodecs; Neural-Pro must **detect and explain**.
* **Canvas/Web Audio/IndexedDB** are likewise browser capabilities. The only AI Studio-specific
  wrinkle is that the preview runs inside a **frame**, which can impose a permissions policy
  and (unknown) sandbox attributes — see §3, rows `P-01`, `P-02`.
* **FFmpeg, `spawn`, filesystem** are server-runtime questions, and they are answered by
  AI Studio documentation — which is silent on subprocesses and provides no media binary.

---

## 2. Capability classification (A–E)

**A** = officially supported · **B** = supported with documented constraints ·
**C** = RUNTIME-UNKNOWN — EXECUTABLE VERIFICATION REQUIRED · **D** = unsupported/incompatible ·
**E** = optional external deployment capability

### 2.1 Required table

| Capability | AI Studio support | Evidence | Neural-Pro impact |
|---|---|---|---|
| **Node.js server** | **A** | E-1: "Server-side: A Node.js runtime that allows for secure API calls, database connections, and npm package usage" | `server.ts` is legitimate; keep it |
| **npm** | **A** | E-1; "The Antigravity Agent can install and use packages from the vast npm ecosystem" (E-5) | Dependencies are allowed, but each must be justified; **native builds are class C** |
| **filesystem** | **B** | E-6: apps run in a container; container filesystems are ephemeral and **no built-in storage** is offered ("working on adding direct support… in the future") | Writes are allowed but **never durable**. No server-side media, project or session storage |
| **`/tmp`** | **B** | Same as filesystem; substrate-derived: `/tmp` is writable but memory-backed and ephemeral | The `/tmp/session_*` export pipeline is wrong (D-023). Remove, do not relocate |
| **`spawn()`** | **C** | No Google documentation addresses child-process support in the AI Studio runtime | **Cannot be architected upon.** Removing `spawn` (ADR-004) is therefore mandatory, not stylistic |
| **child processes** | **C** | undocumented | same as above |
| **native binaries** | **C** | npm is supported; native compilation (node-gyp) inside the AI Studio build environment is undocumented; `better-sqlite3` already fails locally (D-012) | Avoid native modules entirely. `better-sqlite3` removal remains required |
| **FFmpeg binary** | **D** | Not provided by the platform; not declared in `package.json`; absent locally (`which ffmpeg` → not found) | Server-side encoding is **not available**. Browser export is the only path |
| **WebCodecs** | **A\*** (browser) | Browser capability — executes in the user's browser, not in AI Studio | **Canonical encoder.** Must be probed: `VideoEncoder.isConfigSupported` |
| **Canvas** | **A\*** (browser) | Browser capability | Canonical compositor for export; must be probed |
| **WebAudio** | **A\*** (browser) | Browser capability; `OfflineAudioContext` for render, `AudioContext` for preview | Canonical audio renderer; sample-rate authority required |
| **MediaSource** | **A\*** (browser) | Browser capability | Not required by Neural-Pro today; do not introduce |
| **Blob URLs** | **A\*** (browser) | Browser capability | **Runtime handles only.** Never durable identity (INV-009) |
| **IndexedDB** | **B** | Browser capability, but the app runs inside an **AI Studio frame**; partitioning/permission behaviour is undocumented (row `P-02`) | Primary durable store; **must be verified inside AI Studio**; must degrade with an explicit message |
| **localStorage** | **B** | Browser capability; same frame caveat; ~5 MB | UI preferences only |
| **server-side file persistence** | **D** | E-6: no built-in storage; filesystem ephemeral | Rejected. Durable assets are browser-side or an approved network store |
| **long-running requests** | **B/C** | Substrate-derived: CPU is allocated during request processing; request timeouts apply; AI Studio does not publish its limits | **Server operations must be short, cancellable and timeout-bounded.** Long work belongs in the browser workflow runtime |
| **server background jobs** | **D/C** | Substrate-derived: CPU throttled outside request processing; no job-runner offering | No server-side job queue. Workflow engine stays application-level |
| **request cancellation** | **C** | Not documented for the AI Studio proxy/frame | Client must not depend on server-side abort semantics alone; client-side `AbortController` + idempotency |
| **streaming (SSE/chunked)** | **C** | Not documented for the AI Studio proxy | Do not architect on streaming. Use request/response with bounded payloads |
| **environment variables** | **B** | E-3/E-11: `GEMINI_API_KEY` and `APP_URL` are auto-injected; other values must be added in the **Secrets** panel | Custom variables must be declared in `.env.example` as Secrets-managed, or removed |
| **secrets** | **A** | E-2/E-3: Settings → Secrets; accessible **server-side only**; never in client code | The Gemini gateway is server-side by construction |
| **Gemini server calls** | **A** | E-3 + repo `metadata.json`: `"majorCapabilities":["MAJOR_CAPABILITY_SERVER_SIDE_GEMINI_API"]` | Canonical AI path; operation allowlist |
| **external APIs / HTTP** | **B** | E-6: "any storage solution that you can connect to over a network, so long as there is not a firewall preventing access from a dynamic IP range" | Allowed. Must be timeout-bounded and failure-typed |
| **persistent database** | **B/E** | E-4 (Firebase auto-provision) and E-6 (network stores) | **Optional adapter only.** Not required for correctness |
| **Firebase** | **B/E** | E-4: Firestore + Firebase Auth auto-provisioned by the agent | Optional future `AssetRegistry` adapter; not in v1 scope |
| **authentication** | **B/E** | E-4: Firebase Auth "Sign in with Google" | Not required for v1; session-token model (ADR-014) stays local to the app |
| **browser APIs (device)** | **B** | E-7: gated by `metadata.json` → `requestFramePermissions` (microphone, camera, display-capture, geolocation, bluetooth, clipboard-read, serial, usb) | `requestFramePermissions: []` today. **No device permission is requested or needed** |
| **WebSockets / multiplayer** | **B** | E-5: "The server-side runtime manages the state and connections" | Not used; do not introduce |
| **build process** | **A** | npm scripts run in the AI Studio environment; Vite dev middleware is the working configuration (E-13) | Keep `tsx server.ts` + Vite middleware; `allowedHosts: true` is required |
| **preview vs runtime differences** | **C** | E-5: "When developing in Build mode, your app is in a **dev container**" — dev ≠ published | All runtime verification must be repeated on a **published** app URL as well as the preview |
| **sharing / running** | **A** | E-1/E-8: Share menu; API calls count toward the owner's usage limits | Cost control (operation allowlist, rate limits) is a **product** requirement, not only a security one |
| **publishing / deployment** | **E** | E-8: Publish → Cloud Run (Starter Tier ≤ 2 apps, 1 region, no billing; Standard → GCP project + billing); custom `*.ai.studio` subdomain | Optional. Never a correctness prerequisite |
| **Docker / custom container** | **E** | Not part of the AI Studio Web App flow | Optional external path only |

\* **A for a browser capability** means "supported by modern browsers"; AI Studio does not
mediate it. The residual AI Studio risk is the **frame** (rows `P-01`, `P-02`).

### 2.2 Frame-specific unknowns (the ones that actually bite)

| ID | Unknown | Why it matters | Verification (WP-13) |
|---|---|---|---|
| `P-01` | Can the AI Studio Preview and the Published App **initiate and complete export artifact delivery to the user/browser download surface**? | The entire export deliverable is delivered by `link.click()` on a blob URL (`VideoStudioPro.tsx:619`, `InspectorEngine.tsx:473`, `ExportToast.tsx:121`, `RenderPipeline.ts:179`). If delivery is blocked, the artifact exists but the user cannot obtain it | **Observable delivery contract — must NOT require OS filesystem visibility.** Record four sub-observations: `P-01.a` artifact produced (blob exists, decodes to expected frames/duration) · `P-01.b` delivered to browser/user (download initiated or explicit save completed) · `P-01.c` download permitted (completed, or refused with an observable reason) · `P-01.d` direct filesystem visibility (informational only — `NOT-EXPOSED` / `EXPOSED`). **PASS = `a` AND `b` with `EXECUTED-RUNTIME`/`EXECUTED-BROWSER` evidence.** See [../execution/agents/WP-13.md](../execution/agents/WP-13.md) §6 |
| `P-02` | Is **storage (IndexedDB/localStorage) partitioned or blocked** in the frame? | If the frame is cross-origin/third-party relative to the top-level page, storage may be partitioned or denied → projects would not survive reload | Probe `indexedDB.open()` + a round-trip write/read + `navigator.storage.estimate()` in **both** contexts; verify survival across reload **and** across a new session |
| `P-03` | Are **WebCodecs / OfflineAudioContext** available, initializable, performant and **free of undisclosed throttling** in the frame? | Export correctness and export feasibility on long projects | **Ten sub-observations, each recorded separately:** (1) API availability, (2) initialization success, (3) representative workload (≥ 300 frames), (4) sustained workload where practical, (5) completion/failure behaviour, (6) timing measurements, (7) resource behaviour where observable, (8) Preview-vs-Published comparison, (9) any runtime-imposed throttling or timeout, (10) **if throttling cannot be measured, mark it `UNKNOWN`**. **Do not infer absence of throttling from a small successful test; three agreeing runs are not evidence about throttling** |
| `P-04` | Does the frame impose a **CSP** that blocks blob: workers/canvas or `media-src`? | Canvas capture and media decode | Capture `console`/CSP report events during a full export |
| `P-05` | Proxy behaviour for **long requests** and **abort** | Timeouts must be client-enforced anyway | Time an intentionally slow endpoint; measure whether the client sees a timeout or a proxy error |
| `P-06` | Do the **dev container (Context P)** and the **published app (Context U)** differ? | Export may pass in preview and fail when published | Compare **thirteen measurable dimensions** in both contexts: boot success · server availability · Gemini access · browser APIs · storage · media loading · export · download/delivery · request duration · cancellation · CSP · network behaviour · capability report. **If a material difference exists, record separate certification status (`G-31-P` / `G-31-U`)** |

None of the above may be answered by reasoning. Each is a **gate item**, evaluated **independently** in **Context P** (Preview) and **Context U** (Published) — see `G-31-P` and `G-31-U` in [../quality/AI-STUDIO-COMPATIBILITY-GATE.md](../quality/AI-STUDIO-COMPATIBILITY-GATE.md).

Every observation carries an evidence class: `EXECUTED-RUNTIME` · `EXECUTED-BROWSER` · `STATIC-EVIDENCE` · `DOCUMENTED-PLATFORM` · `INFERRED` · `BLOCKED` · `UNKNOWN`. A runtime PASS may not rest on static or documentary evidence alone.

---

## 3. Canonical export strategy

### Strategy A — Browser-native export (canonical)

```
React/browser
  → AssetRegistry (IndexedDB) resolves bytes
  → ExportMediaPool: detached media elements, seeked by source time
  → buildCanonicalRenderPlan(snapshot, t, fps, resolver)
  → Canvas2D render
  → VideoEncoder / AudioEncoder (WebCodecs) + mp4-muxer
  → Blob → download
```
* **AI Studio compatibility:** highest. Nothing depends on the server beyond AI/caption
  operations that already exist.
* **Constraints:** user's browser must support WebCodecs; memory is the user's; the artifact is
  delivered in the browser (subject to `P-01`).
* **Verdict:** **CANONICAL.**

### Strategy B — AI Studio server-side export

```
Browser → AI Studio server → media processing → artifact
```
* Requires: a media binary (FFmpeg) or a pure-JS/WASM encoder, plus subprocess or heavy CPU
  work, plus durable or streamed artifact delivery.
* **Blockers:** no FFmpeg binary (**D**); `spawn` undocumented (**C**); CPU allocated during
  request processing (background encoding unreliable); no durable storage for artifacts (**D**);
  frame-upload bandwidth would be enormous.
* **Verdict:** **REJECTED** for the AI Studio Web App runtime. Not merely inconvenient —
  unsupported by documented capability.

### Strategy C — Hybrid

```
Browser: media preparation, rendering, encoding
Server:  AI operations (script/TTS/captions), and ONLY those operations
```
* The server does what it is provably good at (secrets, Gemini, text), with bounded,
  cancellable, timeout-limited requests.
* All media work stays in the browser.
* **Verdict:** **ADOPTED as the operating model.** This is not a compromise — it is the correct
  shape for an AI Studio Web App: the server is a **controlled AI gateway**, not a media
  back-end.

### Strategy D — Optional external deployment

* Only if a capability is genuinely impossible inside AI Studio **and** the project explicitly
  accepts an external dependency.
* No such capability has been identified. Browser-native export covers the product requirement.
* **Verdict:** **NOT ADOPTED.** Remains available by explicit ADR if `P-01…P-06` verification
  shows a hard impossibility.

### Decision

> **Canonical export = Strategy A, operating under the Strategy C server model.
> Strategy B is rejected by capability. Strategy D is available only by explicit ADR.**

### Fallbacks required because of `P-01` (download in frame)

Because the deliverable path is unverified inside the frame, the export runtime must implement
**ordered** delivery strategies rather than a single one:

1. `<a download>` + blob URL (current) — preferred;
2. if the download does not start within a bounded time, present an explicit **"Save as…"**
   affordance using the File System Access API (`showSaveFilePicker`) where available;
3. if neither is possible, present the artifact in a new tab / `object URL` with explicit
   instructions, and keep the `Blob` in memory with a visible "still here" state.

**Never** silently report success when the artifact was not delivered. A failed delivery is a
failed export (`EXPORT_DELIVERY_FAILED`), not a completed one (INV-010).

---

## 4. FFmpeg evaluation (the ten required questions)

| # | Question | Finding | Class |
|---|---|---|---|
| 1 | Package availability | `ffmpeg-static` exists on npm; it downloads a binary at install time | B (npm ok) |
| 2 | Binary compatibility | Depends on the AI Studio container image; unknown; the binary must match the container libc/arch | **C** |
| 3 | Package size | ~70–80 MB per platform binary; multiplies cold start and container size | B (costly) |
| 4 | Startup behaviour | Download-at-install adds install-time network dependency; post-install scripts may not run | **C** |
| 5 | Execution permissions | The binary must be `chmod +x` in an environment we do not control | **C** |
| 6 | Subprocess support | `spawn` is undocumented for the AI Studio runtime | **C** |
| 7 | Sandbox restrictions | Undocumented | **C** |
| 8 | Memory limits | Container memory is AI Studio-managed and not published; encoding 1080p is memory-heavy | **C** |
| 9 | Execution duration | CPU during request processing only; request timeouts apply | **C/D** |
| 10 | Artifact handling | No durable server storage → the artifact must be streamed back in-response or written to ephemeral storage | **D** |

**Conclusion.** Seven of ten questions are unresolved, and the unresolved ones are exactly the
ones that determine whether it works at all. Under ADR-000, uncertainty is not converted into
an architectural assumption.

> **Current architectural classification: `D — unsupported for the target runtime`** (the
> position ADR-016 is built on).
>
> **This classification is PROVISIONAL and must be confirmed, not assumed.** Gate criterion
> **AS-13** is a *runtime capability investigation*: it determines whether the AI Studio runtime
> permits native binaries, subprocess execution, FFmpeg, packaged binaries, executable
> permissions and server-side media processing, and classifies the result **A / B / C / D with
> recorded evidence**. AS-13 does **not** presuppose the answer and does **not** PASS because a
> static grep found no `spawn`.
>
> If AS-13 finds a capability the architecture forbids → informational; the ADR-016 decision
> stands unless an ADR changes it. If AS-13 finds that the architecture **uses** a capability the
> runtime does not support → a defect is filed with evidence and an owning WP.
> No `ffmpeg-static` installation, no `spawn`, no server-side encode. The current
> `/api/export/*` pipeline is removed (ADR-004, rationale updated by ADR-015).

**If a future need arises** (e.g. a codec the browser cannot produce), the correct path is an
explicit ADR proposing Strategy D with a *declared* external service, not a silent attempt to
make FFmpeg work in the frame.

---

## 5. Media capability contracts (normative)

```ts
export type CapabilityId =
  | 'media.decode.video' | 'media.decode.audio' | 'media.decode.image'
  | 'encode.video.webcodecs' | 'encode.audio.webcodecs'
  | 'render.canvas2d' | 'render.offscreen'
  | 'audio.offlinecontext'
  | 'storage.indexeddb' | 'storage.persistent'
  | 'delivery.anchor-download' | 'delivery.filesystem-access'
  | 'codec.avc' | 'codec.hevc' | 'codec.vp9' | 'codec.av1'
  | 'container.mp4' | 'container.webm';

export type CapabilityState = 'available' | 'degraded' | 'unavailable' | 'unknown';

export interface CapabilityReport {
  readonly id: CapabilityId;
  readonly state: CapabilityState;
  readonly detail?: string;         // safe for display
  readonly evidence?: string;       // probe output, never secrets
}

export interface MediaRuntimeCapabilities {
  readonly probedAt: number;
  readonly context: 'ai-studio-preview' | 'published-app' | 'local-dev' | 'unknown';
  readonly capabilities: readonly CapabilityReport[];
  canExport(): boolean;             // true only if every required capability is available
  missing(): readonly CapabilityId[];
  deliveryStrategies(): readonly ('anchor-download' | 'filesystem-access' | 'manual')[];
}
```

**Required** for export: `encode.video.webcodecs`, `render.canvas2d`,
`audio.offlinecontext`, `media.decode.video`, one codec, one container, and at least one
delivery strategy. Anything less ⇒ export is **disabled with an explanation**, not attempted.

The probe runs at startup and on demand, and its result is logged once per session
(`runtime.capabilities`). The result is **never cached across versions**.

---

## 6. Consequences for existing work packages

| WP | Consequence |
|---|---|
| WP-02 | Export independence is now *also* the mechanism that makes export testable headlessly — the only environment where we can prove it without a user's browser |
| WP-03 | Parity verification (L1) stays server-free; L2 (pixel) must run **both** in the AI Studio preview and on a published URL (`P-06`) |
| WP-04 | Export workflow must include a **delivery step** with the ordered fallbacks in §3 and a typed `EXPORT_DELIVERY_FAILED` |
| WP-06 | Add the AI Studio compatibility suite (preview + published) |
| WP-07 | Add `GET /api/runtime/capabilities` (server-side facts only, no secrets) |
| WP-13 | Resolve `P-01…P-06` by execution |
