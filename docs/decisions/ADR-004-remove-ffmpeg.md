# ADR-004 — Remove the Server-Side FFmpeg Export Path

**Status:** Accepted
**Date:** 2026-09-08

## Context

`server.ts` implements a three-phase server export: `/api/export/start` creates
`/tmp/session_<32 hex>` (+ audio dir), `/api/export/upload-frame(s)` and
`/api/export/upload-audio` accept files, `/api/export/finish` runs
`spawn('ffmpeg', [...], { shell: false })`.

Measured facts:
* `which ffmpeg` → **not found**; the finish route fails with `spawn ffmpeg ENOENT`.
* FFmpeg is **not** a declared dependency in `package.json` and is absent from the Cloud Run
  base image.
* The endpoint is **unauthenticated** outside `NODE_ENV=production` (D-003).
* Frame uploads allow **~7.2 GB/min/IP** of disk writes with no TTL (S-4).
* Temp paths are hard-coded `/tmp/...` (D-023) — Windows-incompatible, and `/tmp` is RAM-backed
  on Cloud Run.
* The client already has a working WebCodecs export path that produces the real product
  output.

## Decision

Delete the entire server-side FFmpeg export path:
`/api/export/start`, `/api/export/upload-frame`, `/api/export/upload-frames`,
`/api/export/upload-audio`, `/api/export/finish`, the session table, the session GC timer, the
`ffmpegSupportsEncoder` cache and the `FinalizeResponse` type.

Browser-side WebCodecs export becomes the **only** export path. If a server-side encoder is
ever required, it must arrive as an explicit, versioned, declared dependency with its own
parity tests.

## Consequences

* Removes two P0/P1 security findings (S-2, S-4) and one portability defect (D-023).
* Removes a native-binary dependency, making Cloud Run deploy viable.
* Removes ~1 000 LOC of server code and the `/tmp` RAM-pressure risk.
* No user-visible feature loss: the client export path is the one that works.
* `spawn` disappears from the codebase entirely.

## Alternatives considered

* **Bundle a static FFmpeg binary (ffmpeg-static)** — rejected: ~70 MB native binary, a
  supply-chain and install-fragility risk (the install is already broken, D-012), and it does
  not fix the authentication or disk-exhaustion problems.
* **Keep it, add auth and TTL** — rejected: it would still be an undeclared system dependency
  and a second, divergent export back-end with no parity tests.
