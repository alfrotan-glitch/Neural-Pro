# ADR-001 — Google AI Studio Execution Model and Deployment Target

**Status:** Accepted
**Date:** 2026-09-08

## Context

The programme requires the product to be developable and runnable "through Google AI Studio
workflows". Three different things were candidates:

1. **AI Studio Build mode** — generates/maintains a full-stack app (React client + **Node.js
   server runtime**), provisions `GEMINI_API_KEY` as a **server-side secret**, one-click
   deploy to **Cloud Run**, GitHub tab for local ↔ AI Studio sync.
2. **Google Opal** — a *separate* product: visual node-based mini-app/workflow builder, cloud
   execution.
3. **Antigravity agent** — the agentic coding harness that edits the repo with full context.

Research ([Build mode docs](https://ai.google.dev/gemini-api/docs/aistudio-build-mode)) shows
there is **no first-class workflow *runtime*** inside AI Studio that would execute this
application's workflows. Opal cannot host this codebase.

## Decision

1. **Deployment target: Google AI Studio Build mode → Cloud Run.** The Express server is
   legitimate and supported; it must obey the Cloud Run contract (`PORT`, `0.0.0.0`, health
   probe, statelessness, no system binaries).
2. **No platform workflow orchestrator.** The W1–W5 workflows are **in-application** domain
   workflows implemented in this repository (ADR-003).
3. **`GEMINI_API_KEY` is server-side only.** The current server-side proxy pattern is correct
   and is kept; no client-side key, no `VITE_`-prefixed secret, no `define` injection.
4. **Development loop:** the GitHub tab is used to push to a branch, work locally, and pull
   back into AI Studio. The multi-agent work-package model is compatible with this loop.

## Consequences

* `PORT` must come from the environment (D-015 becomes a hard blocker, WP-07).
* The server must boot without any system binary (ADR-004).
* `/api/health` and `/api/health/ai` become first-class contract endpoints.
* Documentation must not claim Opal compatibility.

## Alternatives considered

* **Opal-hosted workflows** — rejected: cannot host this codebase; generates mini-apps from
  prompts.
* **Firebase/GCP-hosted orchestrator (Workflows, Cloud Tasks)** — rejected: adds a control
  plane, cost and failure modes for workflows that are inherently client-side (media in the
  browser) or single-step AI calls already proxied by our server.
