# Contract: Error Model

**Normative.** Owns **INV-010** (AI failure cannot appear as successful AI output).

---

## 1. Shape

```ts
export type ErrorCode =
  // validation
  | 'VALIDATION_FAILED' | 'SCHEMA_MISMATCH' | 'OUT_OF_RANGE' | 'EMPTY_INPUT'
  // auth
  | 'UNAUTHENTICATED' | 'FORBIDDEN' | 'OPERATION_NOT_ALLOWED'
  // limits
  | 'RATE_LIMITED' | 'QUOTA_EXCEEDED' | 'PAYLOAD_TOO_LARGE' | 'RESOURCE_EXHAUSTED'
  // lifecycle
  | 'TIMEOUT' | 'CANCELLED' | 'EXPIRED' | 'NOT_FOUND' | 'CONFLICT'
  // dependencies
  | 'AI_NOT_CONFIGURED' | 'AI_UPSTREAM_ERROR' | 'AI_TIMEOUT' | 'AI_RATE_LIMITED'
  | 'AI_RESPONSE_INVALID' | 'AI_SAFETY_BLOCKED'
  | 'MEDIA_PREPARE_FAILED' | 'MEDIA_DECODE_FAILED' | 'MEDIA_LOAD_FAILED' | 'MEDIA_CORS_FAILED'
  | 'RENDER_FAILED' | 'ENCODE_FAILED' | 'MUX_FAILED'
  | 'PERSISTENCE_FAILED' | 'PERSISTENCE_QUOTA' | 'PERSISTENCE_CORRUPT' | 'ASSET_MISSING'
  | 'DEPENDENCY_UNAVAILABLE'
  // internal
  | 'INTERNAL' | 'NOT_IMPLEMENTED';

export interface AppError {
  readonly code: ErrorCode;
  readonly message: string;              // SAFE for end users — no internals, no paths, no keys
  readonly detail?: string;              // developer diagnostics; server-side or dev-only
  readonly retryable: boolean;
  readonly cause?: unknown;
  readonly context?: Readonly<Record<string, string | number>>;  // clipId, assetId, stepId…
}
```

## 2. HTTP mapping

| Code | HTTP | Retryable |
|---|---|---|
| `VALIDATION_FAILED`, `SCHEMA_MISMATCH`, `OUT_OF_RANGE`, `EMPTY_INPUT` | 400 | no |
| `UNAUTHENTICATED` | 401 | no |
| `FORBIDDEN`, `OPERATION_NOT_ALLOWED` | 403 | no |
| `NOT_FOUND` | 404 | no |
| `CONFLICT` | 409 | no |
| `PAYLOAD_TOO_LARGE` | 413 | no |
| `RATE_LIMITED` / `AI_RATE_LIMITED` | 429 / 503 | yes (`Retry-After`) |
| `QUOTA_EXCEEDED`, `RESOURCE_EXHAUSTED` | 429 | no |
| `AI_NOT_CONFIGURED` | 503 | no |
| `AI_UPSTREAM_ERROR`, `AI_RESPONSE_INVALID` | 502 | no / no |
| `AI_TIMEOUT`, `TIMEOUT` | 504 | yes |
| `AI_SAFETY_BLOCKED` | 422 | no |
| `INTERNAL`, `NOT_IMPLEMENTED` | 500 / 501 | no |

## 3. Workflow mapping

| Error code | Workflow effect |
|---|---|
| retryable codes | `running → retrying → running` while attempts remain |
| `CANCELLED` | any non-terminal → `cancelled` |
| `TIMEOUT` / `EXPIRED` | → `expired` (terminal) if retries are exhausted |
| `ASSET_MISSING`, `MEDIA_*` | step fails; run fails; recovery offers relink |
| `VALIDATION_FAILED` | → `failed` immediately (never retried) |
| anything else | → `failed` (terminal), checkpoint retained for recovery |

## 4. Retryability rules

Retry is **allowlisted**, not denylisted. Only:
`RATE_LIMITED`, `AI_RATE_LIMITED`, `AI_TIMEOUT`, `TIMEOUT`, `DEPENDENCY_UNAVAILABLE`.
Everything else fails fast. Retries are bounded (`RetryPolicy.maxAttempts`, default 3),
backed off, jittered, and counted in logs.

## 5. Safe messages

| Situation | User sees | Log carries |
|---|---|---|
| AI key missing | "AI features are not configured on this server." | `AI_NOT_CONFIGURED`, no key material |
| Upstream 429 | "The AI service is rate limiting requests. Retrying…" | `AI_RATE_LIMITED`, attempt, backoff |
| Response fails schema | "The AI service returned an unexpected response." | `AI_RESPONSE_INVALID`, schema path, **hashed** payload |
| Media decode fails | "Could not decode `<clip name>`." | `MEDIA_DECODE_FAILED`, assetId, mimeType, URL host only |
| Export frame fails | "Rendering stopped at frame N." | `RENDER_FAILED`, clipId, phase, stack |
| Asset missing | "Media `<name>` is missing. Relink it to continue." | `ASSET_MISSING`, assetId |

**Forbidden in user-facing messages:** absolute paths, stack traces, API keys, internal host
names, raw upstream error bodies.

## 6. No fake success

> **INV-010.** No code path may convert an operational failure into a successful response.

Concretely forbidden:
* returning HTTP 200 with substitute/generated content when an AI call failed;
* returning a placeholder render when media could not be decoded;
* reporting "Saved" when the persisted document contains unresolvable references;
* reporting "API Connected" without querying the server.

**Degraded mode** is allowed only when:
1. it is explicitly enabled (`AI_ALLOW_SIMULATION=true`), **and**
2. every response carries `source:'simulated'` and `degraded:true`, **and**
3. the UI renders a persistent, dismissible-only-after-acknowledgement banner.

Today's behaviour violates all three (D-009): `/api/generateContent` returns fabricated
scripts and **1.00 second of silence** for TTS with HTTP 200 and no flags, and `App.tsx`
shows a hard-coded green "API Connected" badge.

## 7. Client error handling

```ts
try { … } catch (e) {
  const err = toAppError(e);            // normalises unknown throws
  logger.error('workflow.step_failed', { runId, stepId, code: err.code, … });
  run.fail(err);                        // workflow runtime owns the state transition
  toast(err.message);                   // safe message only
}
```

Unknown throws become `INTERNAL` with a generic safe message; the original is attached as
`cause` and logged, never shown.
