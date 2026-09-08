# Runtime Topology

**Status:** current (measured) + target. Evidence: source inspection, live server probes,
and [Google AI Studio Build mode documentation](https://ai.google.dev/gemini-api/docs/aistudio-build-mode).

---

## 1. Google AI Studio execution model — what it actually is

**Reconciliation required.** The directive asks for "Google AI Studio workflows". Research
shows three distinct things that are commonly conflated, and only two apply to this repo:

| Platform | What it is | Applies to Neural-Pro? |
|---|---|---|
| **AI Studio Build mode** | Generates/maintains a full-stack app: React client **+ Node.js server runtime**; secrets injected server-side; one-click deploy to **Cloud Run**; GitHub tab for local dev ↔ AI Studio sync. | **YES.** This is the deployment + development loop. |
| **Google Opal** (Google Labs) | A *separate* product: visual node-based workflow editor (input nodes → generate nodes → output nodes), cloud execution, shareable URLs. | **NO.** Opal cannot host this codebase; it generates mini-apps from prompts. |
| **Antigravity agent** (in AI Studio) | The agentic coding harness that edits the project with full-repo context. | **YES.** This is how "development through AI Studio" actually manifests. |

**Conclusion (ADR-001):** there is **no first-class Google AI Studio workflow *runtime*** that
will execute Neural-Pro's workflows. Therefore the workflow engine must live **inside the
application**, and must be shaped so it can run on Cloud Run's constraints and be authored by
an agent. "AI Studio compatibility" reduces to a concrete deployment contract (§3).

### Verified platform facts

| Fact | Source | Impact |
|---|---|---|
| Build mode produces client + **server-side Node.js runtime**; npm packages allowed | ai.google.dev Build mode docs | The Express server is legitimate and supported |
| `GEMINI_API_KEY` is auto-configured as a **server-side secret**; never in client code | same | The current server-side proxy is the correct pattern — keep it |
| Deployment target is **Cloud Run**, public URL, key present in server env | same | PORT contract applies |
| Cloud Run sets `PORT` (default 8080); container **must** bind `0.0.0.0:$PORT` | Cloud Run docs | **D-015 is a deployment blocker** |
| ZIP download requires setting `GEMINI_API_KEY` in the hosting env | same | `.env.example` must be complete |
| GitHub tab: develop locally, push, pull back into AI Studio | same | The multi-agent work-package model is compatible with this loop |
| Apps built before 2026-05-14 are auto-upgraded to server-side Gemini | same | Current client has no Gemini client; already compliant |

---

## 2. Current topology

### 2.1 Development (`npm run dev`)

```
tsx server.ts
  ├── express app on 0.0.0.0:3000        ← PORT HARD-CODED (server.ts:197)
  ├── await import('vite') → middlewareMode, appType 'spa'
  │     └── Vite HMR websocket on :24678
  └── routes (see contracts/api.md)
```

Measured: server boots, `/api/health` returns 200. Vite rejects a proxied host with
**HTTP 403 "Blocked request. This host is not allowed."** unless `server.allowedHosts` is set —
observed live; `allowedHosts: true` was added to `vite.config.ts` during the audit.

### 2.2 Production (`npm run build && npm start`)

```
node dist/server.cjs
  ├── NODE_ENV=production path: express.static(dist) + SPA fallback
  ├── Vite is NOT loaded (good — kept out of the production graph)
  └── app.listen(3000, '0.0.0.0')
```

Never exercised. `dist/` builds cleanly (2 271 modules, 8.6 s).

### 2.3 Network egress

| Destination | Used by | Failure mode today |
|---|---|---|
| `generativelanguage.googleapis.com` | `server.ts` via `@google/genai` | **Any** failure → HTTP 200 + fabricated content (D-009) |
| `commondatastorage.googleapis.com` | default demo video clips | silent broken media |
| `www.soundhelix.com` | default demo audio clip | silent broken media |
| external logos (`customLogoUrl`) | `loadExportImageSource` | export throws `AudioRenderError`-class failure |

### 2.4 Filesystem

| Path | Owner | Notes |
|---|---|---|
| `/tmp/session_<32 hex>` | `server.ts` export pipeline | **Absolute POSIX path ×6**; Windows-incompatible; Cloud Run `/tmp` is RAM-backed |
| `dist/` | build | gitignored ✔ |
| `localStorage` | browser persistence | holds blob URLs → dead on reload (D-006) |
| repo root | 9 committed scratch files | `inspect.txt`, `phaseG_test_output*.txt`, `fix_typecheck.py`, `find_*.cjs` |

### 2.5 Browser capability surface (required, undeclared)

`VideoEncoder` · `AudioEncoder` · `VideoFrame` · `AudioData` · `createImageBitmap` ·
`OfflineAudioContext` · `structuredClone` · `CanvasRenderingContext2D.roundRect` ·
`AudioContext` (with `webkitAudioContext` fallback) · `AbortSignal` · `WeakMap`/`WeakSet`.

**No capability probe exists.** On an unsupported browser the user gets a thrown error inside
an async effect and a Persian toast, not a diagnosis.

---

## 3. Target topology

### 3.1 Deployment contract (normative)

| Property | Requirement |
|---|---|
| Port | `const port = Number(process.env.PORT) || 3000` — **never** hard-coded |
| Bind | `0.0.0.0` (already correct) |
| Health | `GET /api/health` → `{status, time, version, capabilities}` including browser-required capability list and `aiConfigured: boolean` |
| Static | `express.static(dist)` + SPA fallback (already correct) |
| Vite | dev-only, dynamically imported (already correct) |
| Filesystem | `os.tmpdir()` with `NEURALPRO_TMPDIR` override; **no writes outside it** |
| FFmpeg | **Removed** (ADR-004) — no undeclared system binaries |
| Secrets | server-only; never in the client bundle; never logged |
| Graceful shutdown | `SIGTERM` → stop accepting, drain, close |
| Statelessness | No request may depend on prior in-process state except the documented session table |

### 3.2 Environment contract (normative — see contracts/environment.md)

| Variable | Layer | Required | Default | Notes |
|---|---|---|---|---|
| `PORT` | server | no | `3000` | **Cloud Run injects it** |
| `NODE_ENV` | server | no | — | `production` gates static serving and error verbosity |
| `GEMINI_API_KEY` | server | yes* | — | AI Studio injects as a server secret. `*required for AI features; absence must be explicit` |
| `EXPORT_API_TOKEN` | server | **yes** | — | After WP-01, export API is **closed** without it, in **all** environments |
| `DISABLE_HMR` | build | no | — | Vite only |
| `APP_URL` | server | no | — | **Currently documented but unused** — either use it or remove it |
| `NEURALPRO_TMPDIR` | server | no | `os.tmpdir()` | target |
| `AI_MODEL_*` | server | no | see ai-architecture | server-owned model IDs |

### 3.3 Capability negotiation (new)

`GET /api/health` returns the server's capability set; `GET /api/health/ai` reports whether
`GEMINI_API_KEY` is configured. The client's "API Connected" badge reads the latter instead of
being hard-coded (D-009).

### 3.4 Process model (target)

```
Cloud Run container (stateless, PORT-driven, scaled to zero)
    └── Node server
          ├── /api/health, /api/health/ai      (unauthenticated, read-only)
          ├── /api/ai/<operation>              (allowlisted, validated, rate-limited)
          ├── /api/captions/*                  (validated, rate-limited)
          └── static SPA
Browser
    └── SPA
          ├── WorkflowRuntime (in-page, single-owner, cancellable)
          ├── ExportMediaPool (independent of Preview DOM)
          └── AssetRegistry (IndexedDB-backed)
```
