# ADR-009 — No Fabricated Success

**Status:** Accepted
**Date:** 2026-09-08

## Context

Two code paths convert failure into apparent success:

```ts
// server.ts:216   if (!apiKey) return res.json(simulated);
// server.ts:236   catch (e) { return res.json(simulated); }
```

`generateSimulatedContent` returns a canned croissant/tech dialogue for script requests and
`Buffer.alloc(44 + 24000 * 2)` — **exactly 1.00 second of digital silence** — for TTS.
`/api/generateContent` sets **no** `fallback`/`degraded` marker (unlike
`/api/generate-captions`), the client never checks for one, and `App.tsx` renders a
**hard-coded** green "API Connected" badge.

The result is that a missing key, quota exhaustion, an invalid key, a safety block and a
network error are all indistinguishable from success. Users receive fabricated media and
believe the product worked.

## Decision

1. **No code path may convert an operational failure into a successful response** (INV-010).
2. Every failure yields a typed `AppError` with a safe message
   ([../contracts/errors.md](../contracts/errors.md)).
3. `AI_NOT_CONFIGURED` is a `503` with an explicit message; the UI reads
   `/api/health/ai` for its connection indicator.
4. Degraded/simulation mode may exist only when **all** of:
   * `AI_ALLOW_SIMULATION=true` is set explicitly (default `false`), **and**
   * every response carries `source:'simulated'` and `degraded:true`, **and**
   * the UI shows a persistent banner naming the degradation.
5. Any substitute render (placeholder media, missing-asset fill) must be accompanied by a
   warning in the result and surfaced in the UI — never silent.
6. "Saved successfully" must not be reported when the persisted document contains
   unresolvable references.

## Consequences

* Users see failures instead of fabrications; support burden shifts from "the output is
  nonsense" to "AI is not configured", which is actionable.
* Every AI-dependent workflow needs an explicit failure branch (WP-09).
* Tests must cover: key absent, upstream 429, upstream timeout, malformed response,
  safety block.

## Alternatives considered

* **Keep simulation for demo/development** — accepted **only** under the gated conditions in
  §4; the current behaviour is simulation with no gate and no marker, which is the defect.
