# Contract: Environment

**Normative.** Every variable must be declared here or it does not exist.
**Revised 2026-09-09** for the AI Studio Web App runtime.

---

## 1. Injection model

The Google AI Studio Web App runtime **injects some variables automatically**; others must be
supplied by the operator through the **AI Studio Secrets panel**. Anything not in either category
does not exist at runtime and must not be designed around.

| Source | Variables |
|---|---|
| **AI Studio auto-injects** | `GEMINI_API_KEY`, `APP_URL`, `PORT` (host-dependent), `NODE_ENV` (host-dependent), `DISABLE_HMR` (AI Studio dev) |
| **Operator adds via the Secrets panel** | any additional secret (e.g. `AI_MODEL_*`, `AI_ALLOW_SIMULATION`) |
| **Not available** | variables we invent without declaring them as secrets; local `.env` files are **not** deployed |

Evidence: repository `.env.example` states that AI Studio "automatically injects this at runtime
from user secrets" (`GEMINI_API_KEY`) and "automatically injects this at runtime with the Cloud
Run service URL" (`APP_URL`).

## 2. Variables

| Variable | Layer | Injected by | Required | Default | Behaviour if absent |
|---|---|---|---|---|---|
| `GEMINI_API_KEY` | server | **AI Studio** | for AI | – | `/api/ai/*`, `/api/captions/*` ⇒ `503 AI_NOT_CONFIGURED`; `/api/health/ai` ⇒ `configured:false`. **Never** fall back to fabricated content |
| `APP_URL` | server | **AI Studio** | no | – | The AI Studio service URL. May be used for self-referential links. **Not dead documentation** (corrected 2026-09-09) |
| `PORT` | server | host | no | `3000` | `3000` is the **AI Studio convention**; read `process.env.PORT ?? 3000` so optional external deployment also works |
| `NODE_ENV` | server | host | no | – | `production` gates static serving and error verbosity (external deployment only) |
| `DISABLE_HMR` | build | AI Studio | no | – | disables Vite HMR in the AI Studio dev container (`vite.config.ts`) |
| `AI_MODEL_SCRIPT` | server | operator (Secrets) | no | `gemini-3.1-pro-preview` | registry default |
| `AI_MODEL_SPEECH` | server | operator (Secrets) | no | `gemini-2.5-flash-preview-tts` | registry default |
| `AI_MODEL_CAPTIONS` | server | operator (Secrets) | no | `gemini-3.5-flash` | registry default |
| `AI_ALLOW_SIMULATION` | server | operator (Secrets) | no | `false` | simulated responses disabled; enabling marks every response `degraded:true` |
| `AI_DAILY_TOKEN_BUDGET` | server | operator (Secrets) | no | – | unlimited (logged) |
| `EXPORT_API_TOKEN` | server | operator (Secrets) | – | – | **OBSOLETE** — removed with the server export API (WP-01) |
| `NEURALPRO_TMPDIR` | server | – | – | – | **REMOVED** — the server performs no filesystem work (AS-INV-10) |
| `VITE_*` | client | – | – | – | none exist; any future client variable must be non-secret and listed here |

## 3. Rules

1. **No secret ever reaches the client bundle.** `vite.config.ts` `define` must not reference
   `GEMINI_API_KEY` or any secret (D-021 removes the latent mechanism).
2. **Fail closed.** A missing required variable disables the feature and reports it; it never
   degrades to fabricated output (AS-INV-07 / INV-010).
3. **No absolute filesystem paths and no server filesystem work** (AS-INV-10).
4. **No hard-coded ports**, but `3000` remains the AI Studio default (D-015, P2).
5. **Startup validation.** The server validates its environment at boot and logs a structured
   `env.report` line (**names only, never values**) plus `env.missing` for each required-but-
   absent variable.
6. **Custom variables are declared here and in `.env.example`**, or the feature is removed.

## 4. `.env.example` (current — AI Studio scaffold, to be extended by WP-07)

```
# GEMINI_API_KEY: Required for Gemini AI API calls.
# AI Studio automatically injects this at runtime from user secrets.
GEMINI_API_KEY="MY_GEMINI_API_KEY"

# APP_URL: The URL where this applet is hosted.
# AI Studio automatically injects this at runtime with the Cloud Run service URL.
APP_URL="MY_APP_URL"
```

**Gap (D-028, narrowed):** `PORT`, `NODE_ENV`, `DISABLE_HMR`, `AI_MODEL_*` and
`AI_ALLOW_SIMULATION` are undocumented. `.env.example` is **present** — the earlier statement
that it was missing is corrected.

## 5. Client-side capability contract

The app requires, and must **probe** (AS-INV-09):
`VideoEncoder`, `AudioEncoder`, `VideoFrame`, `AudioData`, `createImageBitmap`,
`OfflineAudioContext`, `structuredClone`, `CanvasRenderingContext2D`, `IndexedDB`,
plus a delivery strategy (`<a download>` or File System Access).

`GET /api/runtime/capabilities` returns the **server-side** facts (operations available, AI
configured, no media processing, no durable storage). The client combines that with its own
browser probe and shows an explicit, actionable message when a required capability is missing.
Silent failure is not acceptable.
