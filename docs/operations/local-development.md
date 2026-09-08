# Local Development

**Goal:** `npm ci && npm run dev` works on a clean machine, in the browser, and inside an
AI Studio preview.

---

## 1. Prerequisites

| Requirement | Version | Notes |
|---|---|---|
| Node.js | `>=20.18.0 <23` | from `engines` |
| npm | bundled | `npm ci` (lockfile committed) |
| A Chromium-based browser | recent | WebCodecs required for export |
| `GEMINI_API_KEY` | optional | without it, AI features return `503 AI_NOT_CONFIGURED` |

**No** system FFmpeg is required (ADR-004 removes that dependency).

## 2. Commands

```bash
npm ci
cp .env.example .env        # then set GEMINI_API_KEY if you want AI features
npm run dev                 # single port: Express + Vite middleware
npm run typecheck
npm run lint
npm test
npm run build && npm start  # production mode
```

## 3. Ports and hosts

| Concern | Value |
|---|---|
| Dev server port | `PORT` ?? 3000 |
| Bind | `0.0.0.0` |
| Vite HMR | the same port via middleware mode (websocket) |
| Proxied preview hosts | `server.allowedHosts: true` in `vite.config.ts` (**required**; without it Vite returns HTTP 403 to `*.e2b.app`-style hosts) |

## 4. Offline / no-key behaviour

* With no `GEMINI_API_KEY`: `/api/health/ai` → `configured:false`; AI buttons show why;
  no fabricated content is produced.
* With no network: remote demo assets (`commondatastorage.googleapis.com`,
  `soundhelix.com`) fail; the UI must show `MEDIA_CORS_FAILED`/`MEDIA_LOAD_FAILED` naming the
  clip. **Do not** use this as "it works".
* Export works fully offline (browser-side), provided assets are local.

## 5. Common local failures

| Symptom | Cause | Fix |
|---|---|---|
| `npm ci` fails on `better-sqlite3` | native build (D-012) | remove the dependency (WP-07); do not use `--ignore-scripts` as a fix |
| Preview host 403 | Vite host allowlist | `allowedHosts: true` (already applied) |
| Export produces a purple placeholder | export media registry (D-001) | WP-02 |
| Export audio is 45 s for a 15-min podcast | D-024 | WP-11 |
| Reload loses uploaded media | D-006 | WP-05 |
| "API Connected" green with no key | hard-coded badge (D-009) | WP-09 |

## 6. Working inside Google AI Studio

Per [Google AI Studio Build mode](https://ai.google.dev/gemini-api/docs/aistudio-build-mode):

1. Build mode hosts a **client + server-side Node runtime**; the app runs in the canvas.
2. `GEMINI_API_KEY` is provisioned as a **server-side secret** — do not add it to client code,
   and do not add a `VITE_`-prefixed variant.
3. Use the **GitHub tab** to push to a branch and continue locally; changes sync back.
4. **Publish** (optional) deploys the app from AI Studio with the key injected server-side; the
   app must honour `process.env.PORT ?? 3000` for that path. Publishing is **not** required for
   the app to be correct or usable.
5. If you download the ZIP to host elsewhere, you must set `GEMINI_API_KEY` in that host.

## 7. Repository hygiene

* No scratch files at the repo root. **Nine exist today** (`inspect.txt`, `phase*_test_output.*`,
  `fix_typecheck.py`, `find_*.cjs`, …) — removed by WP-12.
* `package.json` `name` is `"react-example"` — rename to `neural-pro` (WP-12).
* Commit messages follow the WP convention (see [../execution/merge-strategy.md](../execution/merge-strategy.md)).
