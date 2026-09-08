# Contract: Environment

**Normative.** Every variable must be declared here or it does not exist.

---

## 1. Variables

| Variable | Layer | Required | Default | Behaviour if absent |
|---|---|---|---|---|
| `PORT` | server | no | `3000` | listens on 3000 (dev); Cloud Run injects 8080 |
| `NODE_ENV` | server | no | – | `production` gates static serving, error verbosity, CSP strictness |
| `GEMINI_API_KEY` | server | for AI | – | `/api/ai/*`, `/api/captions/*` ⇒ `503 AI_NOT_CONFIGURED`; `/api/health/ai` ⇒ `configured:false` |
| `EXPORT_API_TOKEN` | server | **yes** (WP-01+) | – | any remaining privileged export endpoint is **closed** in all environments |
| `NEURALPRO_TMPDIR` | server | no | `os.tmpdir()` | temp scratch dir (only used if a server-side temp path remains) |
| `AI_MODEL_SCRIPT` | server | no | `gemini-3.1-pro-preview` | registry default |
| `AI_MODEL_SPEECH` | server | no | `gemini-2.5-flash-preview-tts` | registry default |
| `AI_MODEL_CAPTIONS` | server | no | `gemini-3.5-flash` | registry default |
| `AI_ALLOW_SIMULATION` | server | no | `false` | simulated responses disabled |
| `AI_DAILY_TOKEN_BUDGET` | server | no | – | unlimited (logged) |
| `APP_URL` | server | no | – | **currently documented but unused** → either wire it to absolute links or delete it |
| `DISABLE_HMR` | build | no | – | Vite HMR enabled |
| `VITE_*` | client | – | – | **none exist today**; any future client-side variable must be non-secret and listed here |

## 2. Rules

1. **No secret ever reaches the client bundle.** `vite.config.ts` `define` must not reference
   `GEMINI_API_KEY` or any secret (D-021 is a latent violation of this rule even though the
   key is currently absent from the bundle — the mechanism must be removed).
2. **Fail closed.** A missing required variable disables the feature and reports it; it never
   degrades to fabricated output.
3. **No absolute paths in code.** Temp directories come from `os.tmpdir()` / `NEURALPRO_TMPDIR`
   with `path.join` (fixes D-023's `/tmp/session_…` hard-coding).
4. **No hard-coded ports.** `PORT` is read once, in one place (fixes D-015).
5. **Startup validation.** The server validates its env at boot and logs a structured
   `env.report` line (names only, never values) plus a `env.missing` warning per required-but-
   absent variable.

## 3. `.env.example` (target, committed)

```
# Server
PORT=3000
NODE_ENV=development
# AI — server-side secret. Google AI Studio injects this automatically on deploy.
GEMINI_API_KEY=
# Optional model overrides
# AI_MODEL_SCRIPT=
# AI_MODEL_SPEECH=
# AI_MODEL_CAPTIONS=
# Degraded/simulation mode: OFF by default. Never enable in production.
AI_ALLOW_SIMULATION=false
# Temporary scratch directory (defaults to os.tmpdir())
# NEURALPRO_TMPDIR=
```

## 4. Client-side capability contract

The app requires, and must **probe**:
`VideoEncoder`, `AudioEncoder`, `VideoFrame`, `AudioData`, `createImageBitmap`,
`OfflineAudioContext`, `structuredClone`, `CanvasRenderingContext2D`.

`GET /api/health` returns the server capability set; the client compares it with a browser
probe and shows an explicit, actionable message when a required capability is missing. Silent
failure is not acceptable.
