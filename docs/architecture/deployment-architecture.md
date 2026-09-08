# Deployment Architecture

**Status:** target; current state is **not deployable** (PORT hard-coded, install fails).

---

## 1. Targets

| Target | Primary? | Notes |
|---|---|---|
| **Google AI Studio Build mode → Cloud Run** | **Yes** | The stated product environment. Client + server-side Node runtime; `GEMINI_API_KEY` injected as a server secret; one-click deploy; GitHub tab for local ↔ AI Studio sync. |
| Local development (`npm run dev`) | Yes | Vite middleware + Express on one port |
| Self-hosted Node (`npm run build && npm start`) | Secondary | Any `PORT`-injecting host |
| Static SPA only | No | The app requires the server for AI operations |

**Google Opal is not a deployment target** — it is a separate product that generates mini-apps
from prompts and cannot host this codebase. See ADR-001.

## 2. Container/runtime contract

| Property | Requirement |
|---|---|
| Language/runtime | Node.js (see `engines`: `>=20.18.0 <23`) |
| Port | `Number(process.env.PORT) \|\| 3000` — **mandatory**; Cloud Run injects `PORT` (default 8080) |
| Bind | `0.0.0.0` (already correct) |
| Health | `GET /api/health` (unauthenticated) — used as the Cloud Run startup/liveness probe |
| Startup | Must accept TCP within the Cloud Run startup timeout. No native build at runtime. |
| Statelessness | No request may depend on prior in-process state except the documented session table (which is being removed with the ffmpeg path) |
| Graceful shutdown | Handle `SIGTERM`: stop accepting, drain in-flight, close, exit 0 |
| Memory | Export is browser-side; the server must stay small. `/tmp` is RAM-backed on Cloud Run — hence removing the `/tmp` frame pipeline. |
| Concurrency | Server is I/O-bound (proxying Gemini); export does not use server CPU at all after ADR-004 |

## 3. Build

```
npm ci                 → reproducible install (lockfile committed)
npm run typecheck      → tsc --noEmit
npm run lint           → eslint (added by WP-07)
npm test               → real executable suite (WP-06)
npm run build          → vite build (dist/) + esbuild server.ts → dist/server.cjs
npm start              → node dist/server.cjs
```

Cloud Run source-based deploy runs `npm ci && npm run build` then `npm start`. A
`Dockerfile` is optional; if added it must set `ENV PORT` and use a non-root user.

## 4. Environment contract

See [../contracts/environment.md](../contracts/environment.md). Summary:

| Variable | Required | Default | Notes |
|---|---|---|---|
| `PORT` | no | `3000` | **injected by Cloud Run** |
| `NODE_ENV` | no | – | `production` gates static serving + error verbosity |
| `GEMINI_API_KEY` | for AI | – | server-side secret; AI Studio provisions it |
| `EXPORT_API_TOKEN` | **yes** (after WP-01) | – | export API closed without it in **all** environments |
| `NEURALPRO_TMPDIR` | no | `os.tmpdir()` | target |
| `AI_MODEL_*` | no | registry defaults | server-owned model IDs |
| `AI_ALLOW_SIMULATION` | no | `false` | explicit opt-in demo mode; never default-on |
| `APP_URL` | no | – | **documented today but unused** — use it (for absolute links) or delete it |
| `DISABLE_HMR` | no | – | Vite only |

## 5. Health endpoints (target)

```
GET /api/health
  200 { status:'ok', time, version, commit,
        capabilities: { serverAi: boolean, tmpWritable: boolean } }

GET /api/health/ai
  200 { configured: true,  operations: ['script','speech','captions.generate', …] }
  503 { configured: false, reason: 'AI_NOT_CONFIGURED' }
```

The client's "API Connected" badge reads `/api/health/ai` (fixes D-009's false indicator).

## 6. Current blockers

| ID | Blocker | Evidence |
|---|---|---|
| D-015 | `const PORT = 3000` hard-coded | `server.ts:197` |
| D-012 | `better-sqlite3` breaks `npm install` (and is unused) | `npm install` → node-gyp `ECONNRESET`; 0 references in 41 k LOC |
| D-008 | `spawn('ffmpeg')` — undeclared, absent in Cloud Run | `which ffmpeg` → not found; `/api/export/finish` → `spawn ffmpeg ENOENT` |
| D-028 | No CI, no Dockerfile, no deploy documentation, no health probe beyond `/api/health` | repo inspection |
| – | Vite rejected the proxied preview host (403) | fixed during the audit via `server.allowedHosts: true` |

## 7. Rollback

Deployments are immutable (Cloud Run revisions). Rollback = pin the previous revision. Because
the server is stateless and export is browser-side, no data migration is needed on rollback —
except for **project documents**, which is why `schemaVersion` exists and migrations must be
forward-compatible-by-default (read newer versions you do not understand ⇒ refuse with a clear
message, never corrupt).

## 8. Verification gates (target)

| Gate | Method | Status |
|---|---|---|
| Clean install | `npm ci` in a clean container | **FAIL** today |
| Typecheck / lint / build | CI | PASS / **absent** / PASS |
| Server starts with `PORT=8080` | container run + `curl /api/health` | **BLOCKED** (no container run yet) |
| Static assets served in production mode | `NODE_ENV=production npm start` + fetch `/` | **UNVERIFIED** |
| Graceful shutdown | `SIGTERM` → exit 0 within N s | **UNVERIFIED** |
