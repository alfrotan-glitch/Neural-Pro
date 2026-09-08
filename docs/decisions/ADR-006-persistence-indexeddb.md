# ADR-006 — IndexedDB + AssetId as the Persistence Model

**Status:** Accepted
**Date:** 2026-09-08

## Context

`projectPersistenceService` stores the project — including `clip.properties.videoUrl` — in
`localStorage`. Uploaded media produces `URL.createObjectURL(...)` values, which are:

* scoped to the creating document,
* invalidated on reload,
* therefore dead after a refresh.

Measured: `blob:` URLs are written verbatim into `localStorage`; on reload the clips resolve
to nothing while the save toast reports success. The demo project (remote HTTPS URLs)
survives, which is why the defect is easy to miss.

`better-sqlite3` is declared but **never referenced**, and it breaks `npm install`.

## Decision

1. **Project documents**: IndexedDB (`neuralpro` / `projects`), keyed by `projectId`, with an
   explicit `schemaVersion`. localStorage keeps **UI preferences only**.
2. **Asset bytes**: IndexedDB (`neuralpro` / `assets`), keyed by `AssetId`, storing `Blob`s.
3. **Identity**: clips reference `AssetId`, never a URL. `blob:` URLs are runtime handles,
   minted by `AssetRegistry.resolveUrl()` and tracked for revocation.
4. **Backing store hidden behind an interface**, so a future server-backed adapter does not
   require domain changes.
5. Remove `better-sqlite3` from `package.json`.

## Rationale for IndexedDB

| Option | Verdict |
|---|---|
| IndexedDB | **Chosen.** Native `Blob` storage (no base64 bloat), large quota, async, transactional, no dependency, offline-capable. |
| Cache API | Semantically wrong (HTTP responses), awkward keying, weaker guarantees. |
| OPFS | Good but more complex and less universally available for random-access blobs. |
| localStorage + base64 | 5 MB limit, synchronous, +33 % size. |
| Server + object storage | Rejected for v1: adds auth, cost and a network dependency to an offline-first editor. Possible later behind the same interface. |

## Consequences

* User media survives reload.
* Export can resolve every asset without a DOM.
* Object-URL lifecycle becomes explicit and testable (INV-008).
* Migration shim needed for `schemaVersion` 1 documents (see ADR-013).
* Quota handling becomes a first-class error path.

## Alternatives considered

* **Persist base64 in localStorage** — rejected on quota and synchronous-write grounds.
* **Persist to the server** — rejected for v1 (above), but the `AssetRegistry` interface keeps
  the option open.
