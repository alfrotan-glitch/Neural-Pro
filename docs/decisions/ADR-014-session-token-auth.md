# ADR-014 — Session-Token Authorisation (No User Accounts)

**Status:** Accepted
**Date:** 2026-09-08

## Context

`/api/export/*` uses `EXPORT_API_TOKEN` but **only when `NODE_ENV === 'production'`**, so the
unauthenticated file-write and spawn surface is open in every other environment (D-003;
reproduced). `/api/generateContent` and the captions routes have no authorisation at all.

The product has no user accounts. Introducing authentication with identity is out of scope for
this programme, but per-IP rate limiting alone is insufficient: it gives no per-client bucket
and no revocation handle.

## Decision

1. Remove the privileged export API entirely (ADR-004), closing the largest unauthenticated
   surface rather than guarding it.
2. Introduce a **session token** for the remaining metered operations:
   ```
   GET /api/session → { token, expiresAt, scope:['ai','captions'] }
   ```
   The token is signed (HMAC with a server-held secret), short-lived (default 1 h), and bound
   to `issuedAt` + `scope` + a nonce.
3. Protected routes require `Authorization: Bearer <token>`; missing/invalid ⇒
   `401 UNAUTHENTICATED`, out-of-scope ⇒ `403 FORBIDDEN`.
4. Rate limiting is applied per IP **and** per token; the token bucket is the primary one.
5. Tokens are held **in memory** only — never in `localStorage`, never in a URL.
6. If any privileged server operation is ever reintroduced, its token requirement must be
   enforced in **all** environments. **Authentication must never be conditional on
   `NODE_ENV`.**

## Consequences

* Per-client abuse control and revocation without user management.
* No cookies ⇒ no CSRF surface for the API.
* Any remaining env-conditional authorisation is a defect by definition (WP-01).

## Alternatives considered

* **Full user accounts (OAuth / Identity Platform)** — rejected: out of scope; adds identity
  storage, consent and a migration for no requirement stated in the directive.
* **API key shipped to the client** — rejected: it is not a secret once shipped.
* **No auth, rely on per-IP limits** — rejected: no per-client bucket, no revocation, and
  trivially multiplied across IPs.
