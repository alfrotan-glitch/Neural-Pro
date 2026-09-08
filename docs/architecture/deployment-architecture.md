# Runtime & Deployment Architecture

**Revised 2026-09-09** — AI Studio Web App primary; Cloud Run demoted to optional.
See [../decisions/AI-STUDIO-TARGET-RUNTIME-CORRECTION.md](../decisions/AI-STUDIO-TARGET-RUNTIME-CORRECTION.md)
and [../decisions/ADR-015-ai-studio-web-app-primary-runtime.md](../decisions/ADR-015-ai-studio-web-app-primary-runtime.md).

---

## 1. Targets

| Target | Role | Requirement for correctness |
|---|---|---|
| **Google AI Studio Web App runtime** (Build mode) | **PRIMARY.** The app is opened, developed, run, tested and used here | **Mandatory** |
| AI Studio **published app** (`*.ai.studio` / AI Studio-provisioned service) | The same app, shared and runnable by users | **Mandatory to certify** (context `U` in gate G-31) |
| Local development (`npm run dev`) | The developer loop, mirrored through GitHub sync | Mandatory for engineering |
| ZIP download / self-hosted | Portability escape hatch | Optional |
| **Self-managed Cloud Run** | Optional external deployment | **Optional — never a prerequisite** |
| Docker / custom container | Optional external deployment | **Optional** |

> **Rule:** no Neural-Pro requirement, gate, invariant or work package may depend on a
> self-managed Cloud Run deployment, a Docker image, or any other external platform.

## 2. Primary target — the AI Studio Web App runtime

```
Google AI Studio (Build mode)
  ├── Code tab / Antigravity agent      → authoring + maintenance
  ├── Preview frame (dev container)     → client runs in the USER's browser
  ├── Server-side Node.js runtime       → server/ routes, npm packages, secrets
  ├── Secrets panel                     → GEMINI_API_KEY (auto), third-party keys
  ├── GitHub tab                        → two-way sync with this repository
  └── Publish                           → optional: AI Studio-provisioned service + *.ai.studio URL
```

### 2.1 Server contract (AI Studio runtime)

| Property | Requirement |
|---|---|
| Entry | `npm run dev` → `tsx server.ts` (Vite middleware in dev) |
| Port | `process.env.PORT ?? 3000`. `3000` is the **AI Studio convention**; reading `PORT` keeps external deployment working. Bind `0.0.0.0` |
| Vite | dev-only, dynamically imported; `server.allowedHosts: true` (**required** — AI Studio proxies a generated host) |
| HMR | disabled via `DISABLE_HMR=true` inside AI Studio (`vite.config.ts`) |
| Health | `GET /api/health`, `GET /api/health/ai`, `GET /api/runtime/capabilities` (server-side facts only) |
| Scope | Controlled AI/text operations **only**. No media processing, no durable writes, no background jobs |
| Operations | `generatePodcastScript`, `generateSpeech`, `generateCaptions`, `refineCaptions`, `parseSrt`, `exportSrt` |
| Bounded | every operation has a timeout, a bounded retry policy and a bounded payload |
| Secrets | `GEMINI_API_KEY` auto-injected server-side; never in client code |
| Injected vars | `GEMINI_API_KEY`, `APP_URL` (AI Studio injects the service URL — `.env.example` documents both) |

### 2.2 Client contract (end user's browser)

| Property | Requirement |
|---|---|
| Framework | React + Vite SPA |
| Capability probe | Required capabilities probed at startup (see [AI-STUDIO-MEDIA-RUNTIME.md](AI-STUDIO-MEDIA-RUNTIME.md) §5) |
| Export | Browser-native: Canvas2D + WebCodecs + Web Audio + `mp4-muxer` |
| Storage | IndexedDB for assets and project documents; `localStorage` for UI preferences only |
| Frame awareness | Must degrade explicitly if storage or downloads are restricted by the frame (`P-01`, `P-02`) |

### 2.3 App manifest

`metadata.json` is the **AI Studio app manifest** — a first-class, owned file:

```json
{
  "name": "NeuralPodcast PRO",
  "description": "…",
  "requestFramePermissions": [],
  "majorCapabilities": ["MAJOR_CAPABILITY_SERVER_SIDE_GEMINI_API"]
}
```

* `requestFramePermissions: []` — the app requests **no** device permissions. Adding any value
  requires an ADR (AS-INV-13).
* `majorCapabilities` declares server-side Gemini use — consistent with the corrected gateway.
* This file must **never** be deleted as "scratch" (corrected in the file ownership matrix and
  WP-12).

## 3. Optional external deployment (non-required)

The following exist for teams that choose to self-host. **Failing any of them does not make
Neural-Pro incorrect** — it only makes the chosen external path unsupported.

| Item | Status | Gate |
|---|---|---|
| `PORT` from environment | Required anyway (portability) | G-20 |
| `NODE_ENV=production` static serving | Optional | G-22 (optional) |
| Graceful `SIGTERM` shutdown | Optional | G-23 (optional) |
| Container image / Dockerfile | Optional | G-21 (optional) |
| Health probe for the external platform | `/api/health` (already exists) | — |

## 4. Build

```
npm ci                 → reproducible install
npm run typecheck
npm run lint
npm test
npm run build          → vite build (dist/) + esbuild server.ts → dist/server.cjs
npm run dev | npm start
```

`npm run build` output is unchanged. Containerisation is **not** part of the primary flow.

## 5. Environment contract (summary — see [../contracts/environment.md](../contracts/environment.md))

| Variable | Injected by | Required | Notes |
|---|---|---|---|
| `GEMINI_API_KEY` | **AI Studio (auto)** | for AI | server-side secret; never client |
| `APP_URL` | **AI Studio (auto)** | no | the service URL; usable for self-referential links |
| `PORT` | host | no | default `3000` (AI Studio convention) |
| `DISABLE_HMR` | AI Studio | no | Vite only |
| `NODE_ENV` | host | no | external deployment only |
| `EXPORT_API_TOKEN` | operator (Secrets panel) | — | **obsolete** once the export API is removed (WP-01) |
| `AI_MODEL_*` | operator (Secrets panel) | no | server-owned model overrides |
| `AI_ALLOW_SIMULATION` | operator | no | default `false` |

Custom variables are **not** auto-injected by AI Studio; they must be added in the Secrets
panel, or the feature must be removed.

## 6. Verification

| Check | Class | Status |
|---|---|---|
| App boots in the AI Studio preview | browser / AI Studio | **UNVERIFIED** (G-31/AS-01) |
| App boots on a published URL | browser / AI Studio | **UNVERIFIED** (G-31/AS-01, context U) |
| Client/server boundary works | live-service | **UNVERIFIED** (AS-02) |
| Gemini via server-side secret | live-service | **UNVERIFIED** (AS-03) |
| Full flow with no external service | AI Studio | **UNVERIFIED** (AS-14) |
| Container boot with `PORT=8080` | deployment (**optional**) | **BLOCKED** — optional path, no container run |
| Production static serving | deployment (**optional**) | **UNVERIFIED** |
| Graceful shutdown | deployment (**optional**) | **UNVERIFIED** |
