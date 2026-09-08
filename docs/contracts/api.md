# Contract: Server API

**Normative.** Supersedes the current route set. Owns **INV-005** and **INV-006**.

---

## 1. Principles

1. No endpoint accepts a client-supplied **model id**, **system instruction**, **generation
   config**, **tool list**, or **filesystem path**.
2. Every request body is validated against an explicit schema before use.
3. Every response is either a typed success or a typed error (see [errors.md](errors.md)).
   **No endpoint returns 200 with substitute content.**
4. Rate limits apply per IP **and** per token/session.
5. Every request carries/derives a `requestId`, returned in the response and logged.

## 2. Route set (target)

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/health` | none | liveness + capabilities |
| GET | `/api/health/ai` | none | reports whether AI is configured and which operations exist |
| POST | `/api/ai/script` | session | podcast script generation |
| POST | `/api/ai/speech` | session | text-to-speech |
| POST | `/api/captions/generate` | session | Gemini caption generation |
| POST | `/api/captions/refine` | session | grammar/punctuation refinement |
| POST | `/api/captions/parse-srt` | session | SRT import (+ optional refine) |
| POST | `/api/captions/export-srt` | session | SRT export |
| ~~POST~~ | ~`/api/generateContent`~ | — | **REMOVED** (410 Gone for one release, see ADR-005) |
| ~~POST~~ | ~`/api/export/*`~ | — | **REMOVED** with the FFmpeg path (ADR-004) |

## 3. Common request/response envelope

```
Request   headers: Content-Type: application/json
                   X-Request-Id: <optional; generated if absent>
                   Authorization: Bearer <session token>   (for /api/ai/*, /api/captions/*)

Success   2xx  { ok: true, requestId, data: <per-operation shape> }
Error     4xx/5xx { ok:false, requestId, error: { code, message, retryable, detail? } }
```

## 4. Operation schemas

### `POST /api/ai/script`
```ts
// request
{ topic: string(1..500),
  channelName: string(0..120),
  duration: 'Short (3-5m)' | 'Standard (10m)' | 'Extended (15m)' | …,
  style: string, level: string,
  speakerCount: 'Single Speaker' | 'Dual Speaker',
  audience: string, pace: string, realism: string,
  hostA?: string(0..60), hostB?: string(0..60),
  batch: number(1..50), totalBatches: number(1..50) }
// response data
{ metadata: { title, level, estimated_duration, youtube_hook },
  script: Array<{ speaker: 'Host A'|'Host B', emotion: string, text: string }> }
```

### `POST /api/ai/speech`
```ts
// request
{ lines: Array<{ speaker: string(1..60), emotion?: string, text: string(1..2000) }>  // 1..20
  voiceConfig: { mode: 'single'|'multi',
                 hostA?: VoiceName, hostB?: VoiceName,
                 speakerNames?: [string, string] } }
// response data
{ audio: { mimeType: 'audio/wav'|…, base64: string,
           sampleRate: number, channels: number, durationSeconds: number } }
```
The response **must** declare `sampleRate` and `channels`; the client validates them before
writing a WAV header. `durationSeconds` is cross-checked against the decoded buffer.

### `POST /api/captions/generate`
```ts
// request
{ audioClipName: string(1..300),
  duration: number(0.1..86400),
  topicPrompt: string(0..2000),
  projectFps: number(1..120) }
// response data
{ captions: CaptionBlock[], source: 'gemini' }
```

### `CaptionBlock`
```ts
{ id: string,
  start_time: string,   // HH:MM:SS:FF at projectFps
  end_time: string,
  text: string,
  speaker?: string,
  words?: Array<{ word: string, start: number, end: number }> }
```
**`projectFps` is mandatory on every captions endpoint** (fixes D-022). `DEFAULT_CAPTION_FPS`
is deleted.

## 5. Limits

| Limit | Value | Scope |
|---|---|---|
| JSON body | 10 MB | all |
| `srtContent` | 10 MB | parse-srt |
| Captions array | ≤ 10 000 items | refine / export-srt |
| `lines` per speech request | ≤ 20 | speech |
| Rate (text ops) | 30 / min / IP **and** 60 / min / token | ai/*, captions/* |
| Rate (speech) | 10 / min / IP **and** 20 / min / token | speech |
| Request timeout | 120 s (script), 180 s (speech), 60 s (captions) | per operation |
| `maxOutputTokens` | server-owned, per operation | never client-supplied |

## 6. Removed endpoints and their replacement

| Removed | Replaced by | Note |
|---|---|---|
| `/api/generateContent` | `/api/ai/script`, `/api/ai/speech` | body passthrough removed |
| `/api/export/start` | — (browser-side export) | no server-side session |
| `/api/export/upload-frame(s)` | — | no server-side frame storage |
| `/api/export/upload-audio` | — | no server-side audio storage |
| `/api/export/finish` | — | no `spawn('ffmpeg')` |

## 7. Authentication model

* There is no user account system today. Target: the server issues a short-lived,
  signed **session token** from `GET /api/session`; protected endpoints require
  `Authorization: Bearer <token>`. This gives a per-session rate-limit bucket and a
  revocation handle without introducing user management.
* `EXPORT_API_TOKEN`'s successor (if any privileged server operation remains) must be required
  in **all** environments — fail closed, never open outside production (D-003).

## 8. CORS / headers

* No CORS is required for same-origin deployment — in the **Google AI Studio Web App runtime** the app and its API are served from the same origin (this also holds for the optional publish path).
* Security headers added: `Content-Security-Policy`, `X-Content-Type-Options: nosniff`,
  `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: DENY`,
  `Strict-Transport-Security` (when served over HTTPS).

## 9. Observability

Every response includes `requestId`. Server logs one structured line per request:
`{ requestId, method, path, status, durationMs, ip, tokenId?, operation?, model?, errorCode? }`.
No request or response bodies. No keys.
