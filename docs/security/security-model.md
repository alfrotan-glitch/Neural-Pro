# Security Model

**Status:** target. Current state is described alongside; every gap has an ID and a WP.

---

## 1. Trust boundaries

```
┌───────────────────────────┐        ┌───────────────────────────┐
│ Browser (untrusted)       │  HTTPS │ Node server (trusted-ish) │
│  · user-uploaded media    │ ─────► │  · validates everything   │
│  · user-typed prompts     │        │  · owns GEMINI_API_KEY    │
│  · localStorage / IDB     │ ◄───── │  · never trusts input     │
└───────────────────────────┘        └────────────┬──────────────┘
                                                  │ server-side secret
                                                  ▼
                                     ┌───────────────────────────┐
                                     │ Google Generative Language│
                                     │ API (external, metered)   │
                                     └───────────────────────────┘
```

The browser is **fully untrusted**. It supplies no model id, no generation config, no path,
and no decision about authorisation.

## 2. Authentication / authorisation

| Surface | Current | Target |
|---|---|---|
| AI + captions endpoints | **none** | session token (see below) |
| Export API | `EXPORT_API_TOKEN` **but only enforced when `NODE_ENV === 'production'`** | privileged endpoints closed in **all** environments (D-003) |
| Static assets | public | public |
| Cloud Run ingress | default (public) | public for the SPA; API routes protected by the session token |

### Session token (chosen model)

There is no user-account system, and adding one is out of scope. Instead:

```
GET /api/session  → { token: <signed, short-lived>, expiresAt }
                    signed with a server-generated secret held in memory or env
                    bound to: issuedAt, scope:['ai','captions'], nonce
Protected routes require Authorization: Bearer <token>
```

Properties: gives a per-session rate-limit bucket, a revocation handle, and a CSRF-resistant
bearer (not a cookie), without user management. Tokens are **not** persisted to
`localStorage`; they live in memory and are re-fetched on reload.

## 3. Secrets

| Rule | Statement |
|---|---|
| S-R1 | `GEMINI_API_KEY` exists **only** in the server process environment |
| S-R2 | No secret is referenced by `vite.config.ts` `define` (D-021 removes the latent mechanism) |
| S-R3 | No secret is logged, echoed in an error, or included in a response |
| S-R4 | `.env*` files are gitignored; `.env.example` contains names and empty values only (**currently missing — D-028**) |
| S-R5 | A build-time test asserts no `AIza…` pattern and no `GEMINI_API_KEY` value in `dist/**` |

**Verified clean today:** `grep -o 'AIzaSy[A-Za-z0-9_-]*'` over `dist/assets/*.js` → empty.
The single `GEMINI_API_KEY` match inside the bundle is the SDK's own option name, not a value.

## 4. Input validation

Every server route validates its body against an explicit schema **before** any use. Rules:
* exact object shape, no unknown keys (or explicitly allowlisted extras);
* string length bounds on every free-text field;
* numeric ranges on every numeric field;
* array length bounds;
* enum membership for mode/style/level fields.

## 5. Output encoding

* No `dangerouslySetInnerHTML`, `innerHTML`, `eval`, or `new Function` — **verified absent**
  across `src/` and `server.ts`.
* React escapes by default; this must stay true (a lint rule bans the four APIs above).
* Downloaded files are generated `Blob`s with an explicit MIME type; names are sanitised
  (strip path separators and control characters) before use in `download` attributes.

## 6. Process execution

* `spawn(..., { shell: false })` — **verified correct**.
* After ADR-004 there is **no** `spawn` at all; if any is reintroduced it must be shell-free,
  argument-array based, allowlisted, and timeout-bounded.

## 7. Denial of service

| Vector | Current | Target |
|---|---|---|
| Disk exhaustion via `/api/export/upload-frame(s)` | **7.2 GB/min/IP** (S-4) | **removed** with the FFmpeg path |
| AI cost amplification | unbounded model/config chosen by the client (S-1) | server-owned model, tokens, schema; per-IP **and** per-token limits; daily budget |
| Large uploads | 100 MB multer limit, no global cap | 100 MB per file, plus a per-session total |
| Expensive regex / parsing | SRT parser is line-based | bounded input size + step timeout |

## 8. Client-side storage

* Project documents and asset bytes in IndexedDB are **origin-scoped** and readable by any
  script on the origin. No secrets, tokens or keys may be stored there (or in
  `localStorage`).
* Quota errors are handled (see [../contracts/persistence.md](../contracts/persistence.md) §7).

## 9. Transport

* HTTPS enforced by the host (Cloud Run provides a managed certificate).
* `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`,
  `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: DENY`,
  and a `Content-Security-Policy` allowing only `'self'` for scripts plus the media sources
  actually used.

## 10. Logging

Never logged: keys, tokens, prompt text, response text, full file paths, request bodies.
Always logged: `requestId`, operation, status, latency, error code, counts.

## 11. Gap register → WP

| Gap | ID | WP |
|---|---|---|
| Unauthenticated verbatim Gemini passthrough | S-1 / D-002 | WP-01 |
| Export API open outside production | S-2 / D-003 | WP-01 |
| Failures return 200 with fabricated content | S-3 / D-009 | WP-09 |
| Disk exhaustion via frame upload | S-4 | WP-01 |
| Missing `.env.example` / secret guidance | S-5 | WP-07 |
| No rate limit per token (only per IP) | S-6 | WP-01 |
| No security headers | S-7 | WP-07 |
| Process/error details in responses | S-8 | WP-07 |
| `/tmp` writes (multi-tenant-host risk) | S-9 / D-023 | WP-07 |
| No CSP | S-10 | WP-07 |
| Undocumented `VITE_MOCK_TTS` | S-11 | WP-09 |
| No dependency/secret scanning in CI | S-12 | WP-07 |
