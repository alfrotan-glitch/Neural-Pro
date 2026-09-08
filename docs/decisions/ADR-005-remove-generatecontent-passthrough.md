# ADR-005 — Remove the Generic Gemini Passthrough

**Status:** Accepted
**Date:** 2026-09-08

## Context

`POST /api/generateContent` forwards the request body verbatim:

```ts
const result = await ai.models.generateContent(req.body);   // server.ts:232
```

The client builds that body in a fake SDK (`App.tsx:8-21`) that mimics `@google/genai`.
An anonymous caller therefore controls `model`, `contents`, `systemInstruction`,
`responseSchema`, `temperature`, `maxOutputTokens`, `candidateCount`, `tools` and
`safetySettings`.

Reproduced: with a dummy key set, a crafted body produced an outbound request to
`generativelanguage.googleapis.com` carrying attacker-chosen model and system instruction.
Impact: unbounded billing on the project key, system-prompt override, tool abuse,
output amplification. The only control is 30 requests/min/IP.

## Decision

1. Delete `/api/generateContent` and the fake client SDK.
2. Replace with an **operation allowlist**: `/api/ai/script`, `/api/ai/speech`,
   `/api/captions/{generate,refine,parse-srt,export-srt}` (see
   [../contracts/api.md](../contracts/api.md)).
3. Model ids, system instructions, generation config, tools and safety settings are
   **server-owned**, in one registry (`server/config/models.ts`) plus per-operation handlers.
4. Every request is schema-validated; every response is schema-validated.
5. Rate limits per IP **and** per session token; optional daily token budget.
6. For one release the removed route returns `410 Gone` with a migration note, then is deleted.

## Consequences

* The client can no longer influence cost, model or instruction.
* Prompt text becomes reviewable in one place (`server/prompts/`).
* The client gains a typed `AiGateway` and loses ~20 lines of shim.
* Requires WP-09 to migrate the podcast and TTS call sites.

## Alternatives considered

* **Keep the passthrough, add auth** — rejected: authentication does not constrain *what* an
  authenticated caller may ask the metered key to do; the abuse surface is the passthrough
  itself.
* **Client-side allowlist enforced by the client** — rejected: the client is untrusted.
* **Proxy through an AI-Studio-style transparent proxy that injects the key but forwards the
  body** — rejected: that is the anti-pattern this ADR removes; the platform's own proxy
  forwards only *its own* constructed requests.
