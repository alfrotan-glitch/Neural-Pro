# ADR-008 — Server-Owned AI Model Registry and Operation Allowlist

**Status:** Accepted
**Date:** 2026-09-08

## Context

Client code hard-codes model ids in three places (`gemini-3.1-pro-preview`,
`gemini-2.5-flash-preview-tts`, `gemini-3.5-flash`) and, through the passthrough, also supplies
system instructions and generation config. Model ids are therefore duplicated, unversioned and
unauditable, and a model deprecation requires a client release.

## Decision

1. A single `AI_MODELS` registry in `server/config/models.ts` is the **only** place a model id
   appears. Each entry carries its generation config (`maxOutputTokens`, `temperature`,
   `responseSchema`, `candidateCount`).
2. System instructions live in `server/prompts/`, one template per operation.
3. Clients request **operations**, not models.
4. Overrides are environment-driven (`AI_MODEL_*`), server-side, and logged at boot (names
   only).
5. Responses are validated against an output schema before being returned; a mismatch is
   `502 AI_RESPONSE_INVALID`, never a best-effort parse.

## Consequences

* A model deprecation is a one-line server change (or an env override) with no client release.
* Cost controls become enforceable because token limits are server-owned.
* The client's `AiGateway` surface shrinks to operation inputs.
* A test asserts that no model id string appears outside `server/config/models.ts`.

## Alternatives considered

* **Client-configured models with a server-side allowlist** — rejected: it keeps model
  knowledge duplicated in two places and invites drift between them.
