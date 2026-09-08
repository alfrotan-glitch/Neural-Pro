# Workflow W1 — Podcast Generation

**Owner WP:** WP-09 (AI hardening), WP-08 (move out of `App.tsx`)
**Contracts:** [../contracts/workflows.md](../contracts/workflows.md), [../contracts/ai-integration.md](../contracts/ai-integration.md)

---

## 1. Trigger

`SubscribeGenerator` → topic + settings + batch N of M → **Generate**.

## 2. Steps (target)

| # | Step | Checkpoint | Retry | Timeout |
|---|---|---|---|---|
| 1 | `validateInput` | – | no | 1 s | topic non-empty ≤ 500, batch ∈ [1,50], speaker count consistent |
| 2 | `generateScript` | ✔ | 3 (AI transients) | 120 s | `POST /api/ai/script` |
| 3 | `validateScript` | – | no | 1 s | schema-conformant, ≥ 1 line, line bounds, speakers ∈ {Host A, Host B} |
| 4 | `prepareTts` | – | no | 1 s | chunk into ≤ 10-line batches |
| 5 | `synthesizeChunks` | ✔ per chunk | 3 | 180 s each | `POST /api/ai/speech`; **client-side chunk retry retained but bounded + jittered** |
| 6 | `validateAudio` | – | no | 10 s | non-silent, duration within expected bounds, declared rate matches decoded |
| 7 | `persistAsset` | ✔ | no | 30 s | `AssetRegistry.put` with the **measured** duration |
| 8 | `updateProject` | – | no | 5 s | create audio clip with the real duration and matching `trim.out` |
| 9 | `cleanup` | – | no | 5 s | revoke the previous object URL |

## 3. Current implementation (as-executed)

`App.tsx generatePodcast` (~120 lines):
* builds a prompt with `topic`, `channelName`, `duration`, `style`, `level`, `speakerCount`,
  `audience`, `pace`, `realism`, `hostA`, `hostB`, `batch`, `totalBatches`;
* calls the fake SDK → `POST /api/generateContent` with a client-built `config.responseSchema`
  and `systemInstruction`;
* if `candidates[0].content?.parts[0]?.text` is missing → **throws**, but by then the server
  may already have returned 200 with fabricated content;
* sets `podcastScripts` React state; downloads SRT/JSON blobs client-side.

`VideoStudioPro.tsx:216` sync effect then creates the audio clip with
`duration = trim.out = state.totalDuration` — the **previous** project length.

## 4. Required fixes

| Defect | Fix | WP |
|---|---|---|
| D-009 fabricated content | typed failure; `validateScript` rejects non-conformant output; no 200-with-substitute | WP-09 |
| D-024 duration clamp | use the measured duration from step 7 in step 8 | WP-11 |
| D-002 arbitrary passthrough | `/api/ai/script` with a server-owned schema | WP-09 |
| No timeout / no observability | workflow runtime policies + structured logs | WP-04 |
| Logic in `App.tsx` | move to `app/workflows/podcast.ts` | WP-08 |

## 5. Failure behaviour

| Failure | User sees | Run state |
|---|---|---|
| AI not configured | "AI features are not configured on this server." | `failed` (`AI_NOT_CONFIGURED`) |
| Rate limited | "The AI service is rate limiting requests. Retrying (2/3)…" | `retrying` |
| Response invalid | "The AI service returned an unexpected response." | `failed` (`AI_RESPONSE_INVALID`) |
| Timeout | "Script generation timed out." | `expired`/`failed` |
| Cancelled | — | `cancelled`, partial checkpoints retained |
| Audio silent | "Generated audio was silent." | `failed` (`AI_RESPONSE_INVALID`) |

**Never:** a canned croissant dialogue presented as a generated script.
