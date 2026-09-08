# Workflow W2 — Text-to-Speech

**Owner WP:** WP-09
**Contracts:** [../contracts/ai-integration.md](../contracts/ai-integration.md) §5

---

## 1. Trigger

Podcast script ready → **Generate Audio** (subscribe generator) or per-line TTS.

## 2. Steps (target)

| # | Step | Checkpoint | Retry | Timeout |
|---|---|---|---|---|
| 1 | `validateInput` | – | no | 1 s | lines ≤ 20, each ≤ 2000 chars, voice names from the allowed set |
| 2 | `chunk` | – | no | 1 s | ≤ 10 lines per request |
| 3 | `synthesize` (per chunk) | ✔ | 3 (429/5xx/timeout) | 180 s |
| 4 | `validate` | – | no | 5 s | non-empty, declared `sampleRate`/`channels` in the allowed set, base64 decodable |
| 5 | `decode` | – | no | 30 s | `decodeAudioData` → authoritative `AudioBuffer` |
| 6 | `concatenate` | ✔ | no | 30 s | explicit policy: direct concatenation; optional cross-fade declared in settings |
| 7 | `buildWav` | – | no | 10 s | 44-byte header **derived from the decoded buffer** |
| 8 | `persistAsset` | ✔ | no | 30 s | measured duration ⇒ fixes D-024 |
| 9 | `cleanup` | – | no | 5 s | revoke the previous object URL |

## 3. Current defects in this workflow

| ID | Defect | Evidence |
|---|---|---|
| D-009 | Any server failure returns 200 with `Buffer.alloc(44 + 24000*2)` — exactly **1.00 s of silence** | `server.ts:216,236` + `generateSimulatedContent` |
| – | WAV header hard-codes 24 kHz / mono / 16-bit with no validation | `App.tsx:240 createWavUrlFromBytes(bytes, sampleRate = 24000)` |
| – | Inline unbounded retry loop for HTTP 429 (3 attempts, fixed delay, no jitter) | `App.tsx` `generateAudio` |
| – | `mockTTS` mode (`VITE_MOCK_TTS === 'true'`) generates local silence; env var **undocumented** | `App.tsx` |
| D-024 | Downstream clip duration assumed = previous `totalDuration` | `VideoStudioPro.tsx:216` |

## 4. Target behaviour on failure

No silence-as-success. Any failure yields a typed error, a `failed` run, and a message that
names the cause class (not the internals). Retries are counted and surfaced
("Retrying 2 of 3…").

## 5. Validation rules (normative)

```ts
allowedSampleRates = [8000, 16000, 22050, 24000, 32000, 44100, 48000];
allowedChannels    = [1, 2];
```

* declared `sampleRate` ∉ set ⇒ `AI_RESPONSE_INVALID`
* decoded duration differs from declared by > 250 ms ⇒ `AI_RESPONSE_INVALID`
* decoded buffer is all zeros (peak amplitude 0) ⇒ `AI_RESPONSE_INVALID` ("silent audio")
* concatenation produces a duration differing from the sum by > 50 ms ⇒ log a warning

## 6. Tests

| Test | Method |
|---|---|
| WAV header matches the decoded buffer | parse the generated header, compare with `AudioBuffer` |
| Declared ≠ actual sample rate is rejected | fixture with a mismatched response |
| Silent response is rejected | fixture with all-zero bytes |
| Retry is bounded | inject 3 × 429 then success; inject 4 × 429 → fail |
| Previous object URL revoked | instrument create/revoke, assert balance |
| Measured duration reaches the clip | end-to-end: generate → clip.duration === decoded duration |
