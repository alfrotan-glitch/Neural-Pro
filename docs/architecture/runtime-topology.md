# Runtime Topology

**Revised 2026-09-09.** Primary target: **Google AI Studio Web App runtime**.
Capability detail: [AI-STUDIO-MEDIA-RUNTIME.md](AI-STUDIO-MEDIA-RUNTIME.md).
Correction record: [../decisions/AI-STUDIO-TARGET-RUNTIME-CORRECTION.md](../decisions/AI-STUDIO-TARGET-RUNTIME-CORRECTION.md).

---

## 1. Google AI Studio execution model — what it actually is

**Reconciled.** Three distinct things are commonly conflated; two apply:

| Platform | What it is | Applies? |
|---|---|---|
| **AI Studio Build mode (Web App)** | Authoring + running environment: a React client **and** a server-side **Node.js runtime**; npm packages; server-side secrets; Firebase provisioning on request; preview frame; Publish; GitHub two-way sync | **YES — this is the target** |
| **Google Opal** | A separate product: visual node-based mini-app builder | **NO** — cannot host this codebase |
| **Antigravity agent** | The agentic harness that edits the project with full-repo context | **YES** — this is how "development through AI Studio" manifests |

**There is no platform workflow *runtime* that executes Neural-Pro's workflows.** W1–W5 are
in-application, and the workflow engine lives in the app (ADR-003).

### Verified platform facts (fetched 2026-09-09)

| Fact | Source | Impact |
|---|---|---|
| Web apps get a full-stack environment: React client + **Node.js server-side runtime** (secure API calls, database connections, npm) | Build mode doc | `server.ts` is legitimate |
| `GEMINI_API_KEY` auto-configured as a **server-side secret**; never in client code | Build mode doc, *API Key management* | The gateway pattern is confirmed and mandatory |
| Firebase Firestore + Auth can be auto-provisioned by the agent | Build mode / fullstack doc | Optional future persistence adapter |
| Server-side runtime can manage **real-time multiplayer state and connections**; "in Build mode, your app is in a **dev container**" | fullstack doc | Dev ≠ published; verify both |
| **"AI Studio apps are standard apps running in a Cloud Run container."** No built-in storage: "We are working on adding direct support for storage in the future" | Build mode doc, FAQ | Substrate is containerised; **no server-side durable storage** |
| Network-accessible storage is usable "so long as there is not a firewall preventing access from a dynamic IP range" | same | External stores are an *option*, not a default |
| Device/Navigator APIs are gated by `metadata.json` → `requestFramePermissions` | Build mode doc, FAQ | Our manifest requests **none** |
| Publish → "Each Google AI Studio deployment creates a corresponding service in Cloud Run"; Starter Tier ≤ 2 apps, 1 region, no billing; custom `*.ai.studio` subdomains | Deploying doc | Publishing exists and is optional |
| Sharing: API calls count toward the owner's usage limits | Build mode doc | Cost control is a product requirement |

### Repository-side evidence that this app *is* an AI Studio app

| Evidence | Meaning |
|---|---|
| `metadata.json` with `majorCapabilities: ["MAJOR_CAPABILITY_SERVER_SIDE_GEMINI_API"]` | AI Studio app manifest |
| `README.md`: "View your app in AI Studio: https://ai.studio/apps/bdf5ad65-…" | Live AI Studio app id |
| `.env.example`: "AI Studio automatically injects this at runtime from user secrets" / `APP_URL` = "the Cloud Run service URL" | AI Studio-injected environment |
| `vite.config.ts`: "HMR is disabled in AI Studio via `DISABLE_HMR`"; `allowedHosts: true` for the proxied host | AI Studio dev loop |
| `server.ts` sends `User-Agent: aistudio-build` on Gemini calls (4 sites) | Built in Build mode |

---

## 2. Topology

### 2.1 AI Studio (primary)

```
┌─ Google AI Studio ─────────────────────────────────────────────────────────┐
│  Code tab (Antigravity)   GitHub tab (two-way sync)   Secrets panel          │
│                                                                             │
│  ┌─ Preview frame (dev container) ────────────────────────────────────────┐  │
│  │  React SPA  ← executes in the END USER's browser                       │  │
│  │   · Canvas2D, WebCodecs, Web Audio, IndexedDB, Blob URLs               │  │
│  │   · Export runs HERE (browser-native)                                  │  │
│  │   · Capability probe at startup                                        │  │
│  └───────────────────────────┬───────────────────────────────────────────┘  │
│                              │ same-origin HTTP                             │
│  ┌─ Server-side Node.js runtime ─────────────────────────────────────────┐  │
│  │  /api/health · /api/health/ai · /api/runtime/capabilities             │  │
│  │  /api/ai/{script,speech} · /api/captions/{generate,refine,parse,srt}  │  │
│  │  npm packages · process.env.GEMINI_API_KEY (secret)                    │  │
│  │  NO media processing · NO durable writes · NO background jobs          │  │
│  └───────────────────────────┬───────────────────────────────────────────┘  │
└──────────────────────────────┼──────────────────────────────────────────────┘
                               ▼
                  generativelanguage.googleapis.com  (metered)
```

### 2.2 Published app (same shape, different context)

```
https://<name>.ai.studio   (or the AI Studio-provisioned service URL)
   → same client bundle, same server runtime, same secrets
   → DIFFERENT frame/origin context ⇒ storage and download behaviour must be re-verified (P-02, P-01)
```

### 2.3 Local development

```
tsx server.ts → express on 0.0.0.0:3000 + Vite middleware (HMR on demand)
```

Measured: boots; `/api/health` → 200. Without `server.allowedHosts`, Vite rejects proxied hosts
with HTTP 403 — fixed during the audit.

## 3. Network egress

| Destination | Direction | Failure mode today |
|---|---|---|
| `generativelanguage.googleapis.com` | server (AI Studio runtime) | any failure → HTTP 200 + fabricated content (D-009) |
| `commondatastorage.googleapis.com` | browser (demo video) | silent broken media |
| `www.soundhelix.com` | browser (demo audio) | silent broken media |
| arbitrary `customLogoUrl` | browser | export throws, unnamed clip |

## 4. Filesystem and storage

| Layer | Writable | Durable | Use |
|---|---|---|---|
| AI Studio server container | yes (substrate) | **no** — ephemeral, no built-in storage | nothing. The `/tmp/session_*` pipeline is removed |
| Browser IndexedDB | yes | yes (origin-scoped; frame behaviour = `P-02`) | **canonical** durable store for assets + documents |
| Browser `localStorage` | yes | yes, ~5 MB | UI preferences only |
| Blob/object URLs | in-memory | **no** | runtime handles only (INV-009 / AS-INV-06) |

## 5. Process model (target)

```
AI Studio Web App
  └── Node server (stateless, bounded, timeout-limited)
        ├── health + capability endpoints        (unauthenticated, read-only)
        ├── /api/ai/<operation>                  (allowlisted, validated, rate-limited)
        ├── /api/captions/<operation>            (validated, rate-limited)
        └── static SPA
Browser (user's)
  └── SPA
        ├── CapabilityProbe
        ├── WorkflowRuntime   (W1–W5; owns cancellation, retry, timeout, recovery)
        ├── AssetRegistry     (IndexedDB; AssetId + measured media properties)
        ├── ExportMediaPool   (detached elements; independent of Preview DOM)
        └── Renderers         (DOM preview | Canvas export — one canonical plan)
```
