# AI Architecture

**Status:** current (P0-insecure) + target.
Owns **INV-005** (no anonymous client controls model/configuration) and
**INV-010** (AI failure cannot appear as successful AI output).

---

## 1. Current state

### 1.1 Integrations

| Purpose | Model ID (as written) | Call site |
|---|---|---|
| Podcast script generation | `gemini-3.1-pro-preview` | `App.tsx:582` → `/api/generateContent` |
| Text-to-speech | `gemini-2.5-flash-preview-tts` | `App.tsx:733` → `/api/generateContent` |
| Caption generation | `gemini-3.5-flash` | `server.ts` `/api/generate-captions` |
| Caption refinement | `gemini-3.5-flash` | `/api/refine-captions`, `/api/parse-srt` |

The client constructs a fake SDK (`App.tsx:8-21`) that POSTs its argument verbatim; the server
does `ai.models.generateContent(req.body)` (`server.ts:232`).

### 1.2 The P0

```
POST /api/generateContent   {"model": "...", "contents": "...", "config": {...}}
   → server.ts:232   ai.models.generateContent(req.body)
```

The anonymous caller controls **model, contents, systemInstruction, responseSchema,
maxOutputTokens, temperature, tools, safetySettings, candidateCount**. The only limit is
30 requests/min/IP.

**Reproduced:** with a dummy key set, a crafted body produced an outbound request to
`generativelanguage.googleapis.com` (server log, `server.ts:232`). Impact: unbounded billing
on the project key, system-prompt override, tool/grounding abuse, output-size amplification.

### 1.3 The second P0: fake success

```
server.ts:216  if (!apiKey)      → return res.json(simulated)          // HTTP 200, no flag
server.ts:236  catch (err)       → return res.json(simulated)          // HTTP 200, no flag
```

`generateSimulatedContent` returns:
* a canned croissant/tech/generic dialogue for script requests;
* **`Buffer.alloc(44 + 24000*2)` — exactly 1.00 second of digital silence** — for TTS.

`/api/generateContent` sets **no** `fallback` / `degraded` / `source` marker (unlike
`/api/generate-captions`, which does). `App.tsx` never checks for one. The header shows a
**hard-coded** green "API Connected" badge.

Net effect: every failure — missing key, quota exceeded, invalid key, safety block, network
error — is indistinguishable from success, and the user receives fabricated media.

---

## 2. Target: AI service boundary

### 2.1 Principles

1. The client requests an **approved operation**, never a model call.
2. The server owns **model, system instruction, schema, limits, retry, timeout, cost**.
3. Failures are **typed and visible**. Fabricated output is forbidden in production paths.

### 2.2 Operation allowlist

```
POST /api/ai/script         { topic, channelName, duration, style, level, speakerCount,
                              audience, pace, realism, hostA, hostB, batch, totalBatches }
POST /api/ai/speech         { lines: [{speaker, emotion, text}], voiceConfig, speakerNames }
POST /api/captions/generate { audioClipName, duration, topicPrompt, projectFps }
POST /api/captions/refine   { captions, grammarPrompt, restorePunctuation, projectFps }
POST /api/captions/parse-srt{ srtContent, refine, projectFps }
POST /api/captions/export-srt { captions, projectFps }
```

`/api/generateContent` is **removed**. Migration: a 410 Gone response with a migration note
for one release, then deletion (ADR-005).

### 2.3 Model registry (single authority)

```ts
// server/config/models.ts
export const AI_MODELS = {
  script:   { id: process.env.AI_MODEL_SCRIPT   ?? 'gemini-3.1-pro-preview',  maxOutputTokens: 8192 },
  speech:   { id: process.env.AI_MODEL_SPEECH   ?? 'gemini-2.5-flash-preview-tts' },
  captions: { id: process.env.AI_MODEL_CAPTIONS ?? 'gemini-3.5-flash',        maxOutputTokens: 4096 },
} as const;
```

No model ID appears anywhere else in the codebase. `responseSchema`, `systemInstruction`,
`temperature`, `maxOutputTokens` and `candidateCount` live next to the registry, per operation.

### 2.4 Request pipeline (every operation)

```
1. authenticate/authorise        (see security/security-model.md)
2. rate limit                    (per IP AND per session/token; token bucket)
3. validate body against a schema → 400 VALIDATION_FAILED
4. size limits                   (bytes, array length, per-field length)
5. build the model request SERVER-SIDE from the registry
6. timeout                       (AbortSignal + per-operation budget)
7. call                          (no client-supplied model/config, ever)
8. validate the response against the schema → 502 AI_RESPONSE_INVALID on mismatch
9. cost accounting               (tokens in/out where available; counters for alerting)
10. structured log               (requestId, operation, model, latency, status, errorCode)
```

### 2.5 Error mapping

| Condition | HTTP | Error code | Retryable |
|---|---|---|---|
| Missing/invalid body | 400 | `VALIDATION_FAILED` | no |
| No auth token | 401 | `UNAUTHENTICATED` | no |
| Operation not permitted | 403 | `FORBIDDEN` | no |
| Rate limited | 429 | `RATE_LIMITED` | yes (client, with `Retry-After`) |
| Upstream timeout | 504 | `AI_TIMEOUT` | yes |
| Upstream 429 / quota | 503 | `AI_RATE_LIMITED` | yes (bounded) |
| Response fails schema | 502 | `AI_RESPONSE_INVALID` | no |
| Key not configured | 503 | `AI_NOT_CONFIGURED` | no |
| Other upstream error | 502 | `AI_UPSTREAM_ERROR` | maybe |

**No branch returns 200 with substitute content.** If a *demo mode* is wanted, it must be
opt-in via an explicit `AI_ALLOW_SIMULATION=true` env var **and** every response must carry
`"source":"simulated","degraded":true`, **and** the UI must render a persistent banner.
Default is off.

### 2.6 Prompt construction

Prompt strings move to `server/prompts/*.ts` as templates. User-supplied values
(`topic`, `topicPrompt`, `grammarPrompt`, `srtContent`, names) are:
* length-bounded,
* inserted via an explicit delimiter block (`<<<USER_INPUT>>>…<<<END_USER_INPUT>>>`),
* accompanied by an instruction that text inside the block is data, not instructions.

This does not eliminate prompt injection, but it makes the boundary explicit and testable,
and it removes the current situation where user text is spliced into the middle of a system
instruction with no delimiter.

### 2.7 TTS specifics

* Chunking stays client-side (10 lines) but moves into workflow W2.
* The response's declared sample rate / channel count must be read and **validated** before
  the WAV header is written. Mismatch → `AI_RESPONSE_INVALID`.
* Duration is measured by decoding, not assumed (fixes D-024 at the source).

### 2.8 Observability

Every call logs:
```
{ requestId, operation, model, latencyMs, status, errorCode,
  inputBytes, outputBytes, tokensIn?, tokensOut?, attempt, ip }
```
No prompt text, no response text, no key. (Log-level `debug` may record a **hash** of the
prompt for correlation.)
