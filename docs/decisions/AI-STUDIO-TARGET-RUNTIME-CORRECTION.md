# AI Studio Target Runtime Correction Register

**Status:** Accepted — this document is the authoritative record of the architecture correction
performed after the project owner clarified the intended target runtime.
**Date:** 2026-09-09
**Authority:** Project owner clarification → Principal Architect reconciliation.

---

## 0. The correction in one sentence

> **Neural-Pro's primary runtime target is the Google AI Studio Web App environment.
> Cloud Run is not a mandatory runtime dependency.**

The previous blueprint treated **Cloud Run** as the deployment target and derived its runtime
contract from Cloud Run's container contract. That was an architectural error: it optimised for
an *optional external* deployment path instead of the environment the application is actually
built, developed and used in.

---

## 1. Previous assumption

The blueprint (committed `1e17e8c`) stated, in `docs/architecture/deployment-architecture.md`,
`docs/architecture/runtime-topology.md`, `docs/architecture/ai-architecture.md` and ADR-001:

* "Deployment target: Google AI Studio Build mode → **Cloud Run**."
* "Cloud Run sets `PORT` (default 8080); container must bind `0.0.0.0:$PORT`" — with D-015
  (`const PORT = 3000`) classified as a **hard deployment blocker**.
* "Cloud Run's `/tmp` is RAM-backed" used as the primary argument for removing the server-side
  export path.
* "Statelessness", "graceful shutdown", "container boot with `PORT=8080`" as release gates
  G-21…G-23.
* ADR-001 §"Decision" item 1 named Cloud Run as the deployment target.

The blueprint's *research* section correctly recorded that AI Studio Build mode produces a
client + server-side Node runtime and deploys to Cloud Run. The error was **emphasis and
dependency direction**: the Cloud Run container contract was treated as the architectural
driver, so any capability that Cloud Run lacked was treated as unavailable and any Cloud Run
constraint was treated as a Neural-Pro constraint.

## 2. Why it was wrong or incomplete

1. **Wrong dependency direction.** Neural-Pro is opened, developed, run, tested and used
   **inside Google AI Studio**. Cloud Run is only the *optional publish path* that AI Studio
   itself offers. Architecting for the publish path made an optional target load-bearing.
2. **Wrong capability oracle.** Under the previous framing, "does Cloud Run support X?" decided
   "does Neural-Pro support X?". The correct question is "does the **Google AI Studio Web App
   runtime** support X?" — where AI Studio is the authority and Cloud Run is merely its
   (documented) substrate.
3. **It produced at least one wrong severity.** D-015 (`const PORT = 3000`) was graded a *hard
   deployment blocker*. Hard-coded 3000 is in fact the **AI Studio convention** — the app runs
   in AI Studio today with it. It is a portability defect for external deployment, not an
   AI Studio blocker. (Correction recorded in §5.)
4. **It omitted the AI Studio-specific application contract entirely.** The repository contains
   an **AI Studio app manifest** (`metadata.json`) and an AI Studio scaffold `README.md` with a
   live `ai.studio/apps/…` URL. The blueprint never inspected either, and its WP-12 hygiene
   instruction would have **deleted the app manifest as a "scratch file"**. This is corrected
   in §5 and in the file ownership matrix.
5. **It did not classify capabilities at all.** The blueprint asserted "npm packages allowed",
   "secrets server-side", "no ffmpeg" without the A–E classification the new target requires,
   and without distinguishing **browser** capabilities (which run in the end user's browser)
   from **AI Studio server-runtime** capabilities (which run in the AI Studio container).

## 3. Correct target

```
Google AI Studio (Build mode / Web App runtime)
   ├── Client        : React + Vite SPA, executed in the END USER's browser
   │                    (browser capabilities = the user's browser, not AI Studio's)
   ├── Server        : AI Studio-supported Node.js server runtime
   │                    (npm packages, server-side secrets, outbound network)
   ├── Secrets       : GEMINI_API_KEY auto-provisioned, server-side ONLY
   ├── Data          : NO built-in server-side persistent storage today
   │                    (network-accessible stores such as Firebase/Supabase are optional)
   └── Publish       : optional — AI Studio Publish (which provisions Cloud Run),
                       ZIP download, or GitHub sync. NEVER a correctness prerequisite.
```

AI operations flow:

```
client intent → validated operation → server-owned configuration → Gemini
```

Export flows:

```
browser media pool → Canvas/WebCodecs/WebAudio → artifact delivered in the browser
```

## 4. Evidence

All evidence is primary: official Google documentation fetched 2026-09-09, plus source-level
inspection of this repository.

| # | Evidence | Source |
|---|---|---|
| E-1 | "For **web apps** (default), AI Studio creates a full-stack environment that includes: **Client-side**: A web frontend (React is the default). **Server-side**: A **Node.js runtime** that allows for secure API calls, database connections, and npm package usage." | [Build apps in Google AI Studio](https://ai.google.dev/gemini-api/docs/aistudio-build-mode) (last updated 2026-08-20) |
| E-2 | "**Secrets management**: Securely store API keys and secrets in the **Settings** menu. These are accessible in your server-side code, keeping them safe from client-side exposure." | same |
| E-3 | "**Server-side only**: API keys are injected into the server-side runtime and are never included in client-side code." / "automatically configures your `GEMINI_API_KEY` as a server-side secret" | same, *Limitations → API Key management* |
| E-4 | "**Firebase Firestore and Authentication**: Automatically provision and set up Firebase… The agent handles the entire setup process." | same |
| E-5 | "**Multiplayer**: Build real-time collaborative experiences directly within AI Studio. The server-side runtime manages the state and connections." / "When developing in Build mode, your app is in a **dev container**." | [Develop full-stack apps](https://ai.google.dev/gemini-api/docs/aistudio-fullstack) |
| E-6 | "**AI Studio apps are standard apps running in a Cloud Run container.** You can use any storage solution that you can connect to over a network, so long as there is not a firewall preventing access from a dynamic IP range. **We are working on adding direct support for storage in the future.**" | Build mode doc, FAQ *"How can I use a database or other storage with my apps?"* |
| E-7 | Browser device APIs are gated by an app manifest: `metadata.json` → `requestFramePermissions` (subset of policy-controlled features: microphone, camera, display-capture, geolocation, bluetooth, clipboard-read, serial, usb). | Build mode doc, FAQ *"How can I access the microphone, webcam, and other Navigator APIs?"* |
| E-8 | "Each Google AI Studio deployment creates a corresponding service in **Cloud Run**." Starter Tier: ≤ 2 apps, single region, no billing account. Standard: GCP project + billing. Custom `*.ai.studio` subdomains. | [Deploying from Google AI Studio](https://ai.google.dev/gemini-api/docs/aistudio-deploying) |
| E-9 | `metadata.json` in the repo root: `{"name":"NeuralPodcast PRO","requestFramePermissions":[],"majorCapabilities":["MAJOR_CAPABILITY_SERVER_SIDE_GEMINI_API"]}` | repository source |
| E-10 | `README.md`: "Run and deploy your AI Studio app — View your app in AI Studio: https://ai.studio/apps/bdf5ad65-6c0d-48f4-8ba5-1e1a337f20ce" | repository source |
| E-11 | `.env.example`: "`GEMINI_API_KEY`: AI Studio automatically injects this at runtime from user secrets… `APP_URL`: AI Studio automatically injects this at runtime **with the Cloud Run service URL**." | repository source |
| E-12 | `server.ts:196 const PORT = 3000;` with `app.listen(PORT,'0.0.0.0')`; `npm run dev` = `tsx server.ts`; four `User-Agent: aistudio-build` headers on Gemini calls | repository source |
| E-13 | `vite.config.ts` comments: "HMR is disabled in AI Studio via `DISABLE_HMR` env var… AI Studio (and any other reverse proxy, e.g. Cloud Run / IDX / sandbox previews) serves this app from a generated host." | repository source |

### Honest note on E-6 (a conflict that must not be papered over)

The official FAQ states that **AI Studio apps run in a Cloud Run container**. The owner's
decision is that **Cloud Run is not the architectural target**. These are not in conflict at the
level that matters, and the resolution is recorded explicitly rather than glossed:

* The **substrate** is a container managed by **AI Studio**. Neural-Pro does not create,
  configure, or depend on a Cloud Run deployment; AI Studio provides it.
* Therefore: **container-level facts may be used to reason about limits** (ephemeral
  filesystem, CPU allocated during request processing, request timeouts), but **no Neural-Pro
  requirement may be expressed as "a Cloud Run deployment exists"**, and no AI Studio
  capability may be assumed merely because generic Cloud Run has it.
* Where a container-level constraint is used as an architectural argument, this document marks
  it as *substrate-derived, not AI-Studio-documented*.

## 5. Architectural consequence

| # | Consequence | Action |
|---|---|---|
| C-1 | Cloud Run demoted from **target** to **optional external deployment path** | Rewrite `deployment-architecture.md`, `runtime-topology.md`; supersede ADR-001 with ADR-015 |
| C-2 | The **AI Studio Web App runtime** is now the capability oracle | New `docs/architecture/AI-STUDIO-MEDIA-RUNTIME.md`; capability table in §7 |
| C-3 | **D-015 reclassified**: hard-coded `PORT = 3000` is the AI Studio convention, not an AI Studio blocker. It remains a defect for external portability and must become `process.env.PORT ?? 3000` so both work | Severity P1 → P2; WP-07 keeps the fix, rationale updated |
| C-4 | **D-023 (`/tmp`) re-argued**: it is now wrong because the AI Studio server filesystem is *ephemeral with no durable storage* (E-6: "working on adding direct support for storage in the future"), and because the export pipeline has no business writing frames there. Cloud Run's RAM-backed `/tmp` is supporting evidence, not the primary argument | ADR-004 rationale updated; conclusion unchanged (remove the server export path) |
| C-5 | **Server-side export (FFmpeg) is rejected by capability, not by convenience**: no FFmpeg binary is provided by the platform and subprocess support is undocumented | ADR-016; canonical export = browser-native (Strategy A) |
| C-6 | **Long-running server work is unreliable**: CPU is allocated during request processing on the container substrate; AI Studio does not expose background-job guarantees | Workflow engine stays **application-level, browser-side** (ADR-003 reaffirmed); server operations must be short, cancellable, timeout-bounded |
| C-7 | **Persistence must be browser-side or an approved network store.** There is no built-in server-side storage. IndexedDB is the default durable store; AI Studio-managed Firestore is an *optional* future adapter behind the same interface | `persistence-architecture.md` unchanged in conclusion, updated in rationale; new runtime-uncertainty R-034 (iframe storage partitioning) |
| C-8 | **`metadata.json` is the AI Studio app manifest, not a scratch file.** `requestFramePermissions: []` is a real, deliberate configuration: the app requests **no** device permissions | Remove from WP-12 deletion list; add to file ownership matrix as an owned, protected file |
| C-9 | **`.env.example` already exists** and documents AI Studio-injected `GEMINI_API_KEY` and `APP_URL` | D-028 partially corrected: `.env.example` is present; the gap is that it does not document `PORT`, `NODE_ENV`, `DISABLE_HMR`, `EXPORT_API_TOKEN`. `APP_URL` is **not** dead — it is AI Studio-injected (E-11) and may be used for self-referential links |
| C-10 | **A runtime-capability gate is required**; capability absence must be *detected*, never assumed | New `docs/quality/AI-STUDIO-COMPATIBILITY-GATE.md`; new invariants in `docs/contracts/AI-STUDIO-RUNTIME-INVARIANTS.md` |
| C-11 | Runtime unknowns must be resolved **by execution inside AI Studio**, not by reasoning | New WP-13 (AI Studio Runtime Verification); gate G-31 |
| C-12 | Terminology is corrected everywhere: "Google AI Studio Web App runtime" for the target; "Cloud Run" only for the optional publish path | Applied across `docs/**`; lint on docs text |

## 6. Documents requiring modification

| Document | Modification | Done |
|---|---|---|
| `docs/decisions/ADR-001-ai-studio-execution-model.md` | Superseded for the Cloud-Run-targeting parts by **ADR-015** (status updated, link added) | ✔ |
| `docs/decisions/ADR-004-remove-ffmpeg.md` | Rationale re-argued from AI Studio capability (C-4/C-5) | ✔ |
| `docs/architecture/deployment-architecture.md` | Rewritten: AI Studio primary, Cloud Run optional | ✔ |
| `docs/architecture/runtime-topology.md` | Rewritten §1–§3 around the AI Studio Web App runtime | ✔ |
| `docs/architecture/system-overview.md` | Target runtime section added; capability summary; freeze pointer | ✔ |
| `docs/architecture/export-architecture.md` | Export runtime reconfirmed browser-native; server path removal rationale updated | ✔ |
| `docs/architecture/persistence-architecture.md` | Rationale updated (no server-side storage; Firestore optional adapter) | ✔ |
| `docs/architecture/workflow-architecture.md` | Reaffirmed application-level; server operations bounded | ✔ |
| `docs/contracts/environment.md` | AI Studio-injected variables documented; custom vars must be Secrets-managed | ✔ |
| `docs/contracts/ai-integration.md` | Operation allowlist restated as the AI Studio server-side secret model | ✔ |
| `docs/security/security-model.md` | Terminology + secret model alignment | ✔ |
| `docs/quality/invariant-register.md` | AS-INV-01…AS-INV-10 added | ✔ |
| `docs/quality/risk-register.md` | R-015/D-015 reclassified; R-033…R-040 added | ✔ |
| `docs/quality/release-gates.md` | G-21…G-23 re-scoped as optional-deployment gates; **G-31 AI Studio compatibility gate** added | ✔ |
| `docs/execution/master-plan.md` | Sequencing updated; WP-13 added | ✔ |
| `docs/execution/dependency-graph.md` | Revised graph + concurrency matrix | ✔ |
| `docs/execution/file-ownership-matrix.md` | New/protected rows: `metadata.json`, `.env.example`, `README.md`, runtime adapters | ✔ |
| `docs/execution/runtime-certification-plan.md` | Stages re-based on AI Studio; external deployment demoted to optional Stage G | ✔ |
| `docs/execution/agents/WP-00.md` … `WP-12.md` | AI Studio verification tasks added where relevant; WP-07/WP-10/WP-12 corrected | ✔ |
| `docs/execution/agents/WP-13.md` | New: AI Studio Runtime Verification | ✔ |
| `AUDIT_REPORT.md` | D-015/D-023/D-028 annotations appended (audit is a historical record — it is annotated, not rewritten) | ✔ |

## 7. Work Packages requiring modification

| WP | Change |
|---|---|
| WP-00 | Must add AI Studio runtime probe scaffolding and the runtime-capability test harness |
| WP-01 | Unchanged in objective; rationale now cites AI Studio server-side secret model (ADR-005/008) |
| WP-02 | Export independence is now **also** an AI Studio compatibility requirement (the preview panel can be closed/re-docked; headless execution is the only testable mode) |
| WP-03 | Unchanged |
| WP-04 | Workflow engine reaffirmed application-level; must add **browser-side** cancellation and bounded server calls |
| WP-05 | Persistence: IndexedDB primary; Firestore recorded as an optional future adapter behind `AssetRegistry`; add iframe-storage verification |
| WP-06 | Add the AI Studio compatibility suite as a first-class suite |
| WP-07 | PORT fix retained but re-scoped (C-3); Dockerfile/CI demoted to **optional external deployment**; add `/api/runtime/capabilities` probe endpoint for WP-13 |
| WP-08 | Unchanged |
| WP-09 | Unchanged |
| WP-10 | Certification re-based on AI Studio; external deployment is Stage G (optional) |
| WP-11 | Unchanged |
| WP-12 | **Corrected**: `metadata.json`, `README.md` and `.env.example` are protected AI Studio files, not scratch |
| **WP-13** | **New**: AI Studio Runtime Verification — resolve every RUNTIME-UNKNOWN by execution inside AI Studio |

## 8. Capability classification summary (detail in `AI-STUDIO-MEDIA-RUNTIME.md` §2)

| Class | Count | Meaning |
|---|---|---|
| **A — officially supported** | 14 | documented by Google; may be architected upon |
| **B — supported with constraints** | 6 | documented, but bounded or managed by AI Studio |
| **C — RUNTIME-UNKNOWN, executable verification required** | 12 | not documented; must be probed inside AI Studio by WP-13 |
| **D — unsupported / incompatible** | 6 | documented absence or contradicts the platform model |
| **E — optional external deployment capability** | 4 | available only if the project accepts an external dependency |

---

## 9. Standing rule

No future document, work package or agent may reintroduce Cloud Run (or any external platform)
as a **prerequisite** for Neural-Pro correctness without an explicit, owner-approved ADR. The
compatibility gate G-31 fails any change that does.
