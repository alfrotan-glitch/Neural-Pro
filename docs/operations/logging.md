# Logging

**Status:** target. Today there is no structured logging; diagnostics are `console.log` with
Persian strings and emoji, plus a `console.error` that prints `String(error)`.

---

## 1. Format

One JSON object per line, to stdout. The Google AI Studio Web App runtime captures stdout as
structured logs when the line is valid JSON (the same holds for the optional publish path).

```json
{ "ts":"2026-09-08T12:34:56.789Z", "level":"info", "event":"ai.request",
  "requestId":"req_01J…", "operation":"speech", "model":"gemini-2.5-flash-preview-tts",
  "status":200, "durationMs":1843, "attempt":1, "tokensIn":412, "tokensOut":null,
  "ip":"…", "tokenId":"tok_ab12" }
```

## 2. Levels

| Level | Use |
|---|---|
| `error` | an operation failed and the user was told |
| `warn` | degraded behaviour, retry attempted, invariant close to a limit |
| `info` | lifecycle: request served, run started/finished, job transition |
| `debug` | step-level detail; disabled by default |

## 3. Events (normative names)

**Server**
`server.start`, `server.env_missing`, `request.start`, `request.end`, `ai.request`,
`ai.retry`, `ai.failure`, `ai.not_configured`, `rate_limit.triggered`,
`validation.failed`, `auth.failed`, `export.api_removed`, `process.error`,
`server.shutdown`, `resource.leaked`.

**Workflow (client, forwarded to console + optional telemetry endpoint)**
`workflow.started`, `workflow.step_started`, `workflow.step_retry`,
`workflow.step_succeeded`, `workflow.step_failed`, `workflow.progress`,
`workflow.cancelled`, `workflow.timed_out`, `workflow.completed`,
`workflow.recovered`, `workflow.illegal_transition`.

**Media / render**
`media.prepare`, `media.decode_failed`, `media.missing`, `render.frame`, `render.parity`,
`export.progress`, `export.completed`, `export.failed`, `resource.acquired`,
`resource.released`, `resource.leaked`.

## 4. Required fields

| Field | Always? |
|---|---|
| `ts`, `level`, `event` | ✔ |
| `requestId` | server requests |
| `runId`, `workflowId`, `stepId`, `attempt` | workflow events |
| `errorCode` | on any non-success |
| `durationMs` | on completion events |

## 5. Never logged

API keys, tokens, prompt text, response text, request/response bodies, absolute filesystem
paths, user file contents, full URLs with query strings.

Prompts may be logged as a **hash** (`sha256` truncated to 16 hex) at `debug` level for
correlation only.

## 6. Client logging

```ts
logger.info('workflow.step_started', { runId, workflowId, stepId, attempt });
logger.error('export.failed', { runId, code, phase, frameIndex });
```

In development the client logger pretty-prints; in production it emits JSON at `warn`+ only.
No telemetry endpoint is contacted without explicit user consent (no analytics today).

## 7. Replacing today's diagnostics

| Today | Replacement |
|---|---|
| `console.log('🚀 Starting Gemini API server…')` | `logger.info('server.start', {port, nodeEnv})` |
| `console.log('✅ Gemini API key loaded.')` | `logger.info('server.env', {geminiApiKey: true})` — **name only, never value** |
| `console.error('Error generating content:', error)` | `logger.error('ai.failure', {requestId, errorCode, detail: safeString(error)})` |
| `console.error(String(error))` in `VideoStudioPro` | structured with `runId`, `phase`, `code` |
| Persian/emoji toasts | i18n messages keyed by `errorCode` (see [i18n.md](i18n.md)) |

## 8. Retention and cost

Logs are retained by the platform (AI Studio / optional Cloud Run → Cloud Logging). Because the
log volume is dominated by request lines, no per-frame client logging is emitted in
production.
