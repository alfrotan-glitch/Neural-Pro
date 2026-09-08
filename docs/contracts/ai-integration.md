# Contract: AI Integration

**Normative.** Owns **INV-005** (client never controls model/config) and **INV-010**.

---

## 1. Boundary

```
Browser                             Server
───────                             ──────
WorkflowRuntime
  └─ AiGateway (interface)
       └─ HttpAiGateway  ──HTTPS──►  /api/ai/<operation>
                                        ├─ auth
                                        ├─ rate limit
                                        ├─ schema validate
                                        ├─ build request from MODELS registry
                                        ├─ timeout
                                        ├─ call @google/genai
                                        ├─ validate response
                                        └─ typed result | typed error
```

## 2. Client contract

```ts
export interface AiGateway {
  script(req: ScriptRequest,  signal?: AbortSignal): Promise<ScriptResult>;
  speech(req: SpeechRequest,  signal?: AbortSignal): Promise<SpeechResult>;
  health(signal?: AbortSignal): Promise<AiHealth>;
}

export interface AiHealth { configured: boolean; operations: readonly string[]; }
```

The client may send **only** operation inputs. It may **not** send: model ids, system
instructions, generation config, tools, safety settings, or raw `contents`.

## 3. Server contract

```ts
export const AI_MODELS = {
  script:   { id: process.env.AI_MODEL_SCRIPT   ?? 'gemini-3.1-pro-preview',      maxOutputTokens: 8192 },
  speech:   { id: process.env.AI_MODEL_SPEECH   ?? 'gemini-2.5-flash-preview-tts' },
  captions: { id: process.env.AI_MODEL_CAPTIONS ?? 'gemini-3.5-flash',            maxOutputTokens: 4096 },
} as const;
```

Operation handlers live in `server/operations/*.ts`. Each handler:

1. validates input with a schema → 400 `VALIDATION_FAILED`;
2. builds the request **entirely** from `AI_MODELS[op]` + server-side prompts;
3. wraps the call in `AbortSignal.timeout(limit)`;
4. validates the parsed response against the output schema → 502 `AI_RESPONSE_INVALID`;
5. returns `{ ok:true, data }` or a typed error.

## 4. Prompt handling

* Prompts are server-side templates in `server/prompts/`.
* User text is inserted inside an explicit delimiter block:
  `<<<USER_INPUT>>>\n{text}\n<<<END_USER_INPUT>>>`, with an instruction that content inside
  the block is data.
* User text is length-bounded before insertion.
* A test asserts that no user field can escape the delimiter block into the instruction
  region (injection regression test).

## 5. TTS contract

```
request  { lines, voiceConfig }
response { audio: { mimeType, base64, sampleRate, channels, durationSeconds } }
```

Client obligations:
1. validate `sampleRate`/`channels` are in the allowed set;
2. decode with `decodeAudioData` to obtain the **authoritative** duration;
3. cross-check `durationSeconds` against the decoded duration (tolerance 250 ms) →
   mismatch ⇒ `AI_RESPONSE_INVALID`;
4. build the WAV header **from the decoded buffer**, not from assumptions;
5. persist the asset with the measured duration (fixes D-024).

## 6. Caption FPS contract

**Every** caption endpoint takes `projectFps` and uses it for all `HH:MM:SS:FF` conversions.
`DEFAULT_CAPTION_FPS` is deleted (D-022).

## 7. Cost and abuse controls

| Control | Value |
|---|---|
| Per-IP rate limit | 30/min (text), 10/min (speech) |
| Per-token rate limit | 60/min (text), 20/min (speech) |
| Max output tokens | server-owned per operation |
| Max input length | bounded per field |
| Concurrent upstream calls per token | 2 |
| Daily token budget (optional) | `AI_DAILY_TOKEN_BUDGET`; over budget ⇒ `QUOTA_EXCEEDED` |
| Logging | counts, latency, status, errorCode — never prompt or response text |

## 8. Degraded/simulation mode

Off by default. `AI_ALLOW_SIMULATION=true` enables it **and** every response then carries
`{ source:'simulated', degraded:true }` **and** the UI shows a persistent banner. Absence of
the key without simulation enabled ⇒ `503 AI_NOT_CONFIGURED`.

## 9. Removed surface

`/api/generateContent` and the fake client SDK (`App.tsx:8-21`) are removed (ADR-005). The
fake SDK's only purpose was to make the client *look* like `@google/genai`; it is exactly the
indirection that allowed arbitrary passthrough.
