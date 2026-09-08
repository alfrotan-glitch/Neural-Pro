# Threat Model

**Method:** STRIDE-lite over the two trust boundaries. Each entry states the attack, the
evidence that it is (or is not) real, and the control that closes it.

| ID | Threat | STRIDE | Evidence | Severity | Control | WP |
|---|---|---|---|---|---|---|
| T-01 | **Arbitrary Gemini invocation.** Anonymous caller posts `{"model":…,"contents":…,"config":…}` to `/api/generateContent`; server forwards verbatim. | E, D | `server.ts:232`; reproduced outbound request to `generativelanguage.googleapis.com` with attacker-chosen model/systemInstruction | **P0** | Remove the passthrough; operation allowlist + server-owned model registry | WP-01 |
| T-02 | **Unauthenticated server-side file write + process spawn.** `/api/export/start` creates `/tmp/session_<hex>` and allocates a container with no auth in non-production; uploaded frames write to disk. | E, D, S | reproduced: anonymous request → directory created → `spawn ffmpeg ENOENT`; 7.2 GB/min/IP | **P0** | Remove the FFmpeg export API entirely (ADR-004) | WP-01 |
| T-03 | **Billing/cost amplification.** Large `maxOutputTokens`, high `candidateCount`, expensive models, or repeated calls. | D | unbounded in the passthrough; only 30 req/min/IP | **P0** | Server-owned limits; per-IP **and** per-token buckets; daily budget | WP-01 |
| T-04 | **Prompt injection into the system instruction.** User text is spliced into a prompt template with no delimiter. | T, E | podcast/caption prompt builders | P1 | Delimiter blocks + "content is data" instruction + output schema validation | WP-09 |
| T-05 | **Fabricated output trusted as real.** Server returns 200 with simulated script / 1 s of silence; client shows a hard-coded "API Connected" badge. | T, S, R | `server.ts:216,236`; `App.tsx` badge | **P1** | INV-010: typed failures, no 200-with-substitute, badge from `/api/health/ai` | WP-09 |
| T-06 | **Disk exhaustion.** 1920×1080 JPEG frames, 60/s, anonymous, never cleaned on timeout. | D | measured 7.2 GB/min/IP | **P1** | Endpoint removed; any future temp use gets `os.tmpdir()` + cap + TTL | WP-01 |
| T-07 | **Denial of wallet via TTS.** Speech is the most expensive operation; no per-operation limit. | D | no speech-specific limit | P1 | 10/min/IP, 20/min/token, 20-line request cap, concurrency 2 | WP-01 |
| T-08 | **Malicious media file** (decoder exploit, zip bomb, huge dimensions). | E, D | `multer` 100 MB disk, `createImageBitmap`, `decodeAudioData` | P2 | Size caps, dimension caps, decode timeouts, typed `MEDIA_DECODE_FAILED` | WP-05 |
| T-09 | **XSS** via AI text, file names, or captions. | T | **no** `innerHTML`/`dangerouslySetInnerHTML`/`eval`/`new Function` found — currently safe | P2 | Lint rule banning them; sanitise download filenames | WP-07 |
| T-10 | **Secret leakage into the bundle.** | I | none found today, but the `define` mechanism exists (D-021) | P2 | Remove the mechanism; build-time assertion (S-R5) | WP-07 |
| T-11 | **Information disclosure in errors.** | I | error bodies echo upstream text | P2 | Safe-message policy ([../contracts/errors.md](../contracts/errors.md) §5) | WP-07 |
| T-12 | **CSRF / cross-origin abuse.** | S, E | no CORS configured (same-origin only); no cookie auth | P3 | Bearer token (not a cookie); no CORS headers; `SameSite` if cookies are ever added | WP-01 |
| T-13 | **Resource exhaustion in the browser** (memory leak → tab crash → unsaved work). | D | D-014, D-016 (199 stale handlers), audio URL leaks | P2 | INV-008 + WP-11 resource lifecycle | WP-11 |
| T-14 | **Supply-chain / install integrity.** | T | `better-sqlite3` (unused) breaks `npm install`; no lockfile policy in CI | P2 | Remove the dependency; `npm ci` in CI; dependency review | WP-07 |
| T-15 | **Stale authorisation after deployment change** (token semantics change, old clients). | S | n/a | P3 | Versioned tokens; `/api/health` reports `apiVersion` | WP-07 |

## Residual risks accepted

| Risk | Why accepted |
|---|---|
| No user accounts | Out of scope for v1; session tokens give rate-limit + revocation without identity |
| IndexedDB readable by any script on the origin | Standard for offline-first editors; mitigated by never storing secrets there |
| Prompt injection cannot be fully prevented | Mitigated, not eliminated; output schema validation bounds the damage |
| Browser-side export consumes client resources | Inherent to the chosen architecture (no server rendering) |
