/**
 * Crash-safe project document store (WP-05).
 *
 * Layout inside the backend:
 *
 *   project:<projectId>            the current sealed envelope (JSON string)
 *   project:<projectId>#rollback   the previous envelope, kept for recovery
 *   project-index                  [{projectId,name,revision,savedAt,...}]
 *
 * Write protocol (single atomic transaction):
 *
 *   1. revision guard — the stored revision must still be the one we read,
 *      otherwise another writer won and we abort with PERSISTENCE_CONFLICT
 *      instead of silently clobbering their work;
 *   2. current envelope → rollback slot;
 *   3. new envelope → primary slot;
 *   4. index entry updated.
 *
 * All four land in ONE transaction, so a crash at any point leaves the previous
 * document fully intact — there is no window where the project is half-written.
 *
 * Read protocol:
 *
 *   primary → verify checksum/order/duration → hand back
 *           → on any verification failure, try the rollback slot and report
 *             `recovered: true` with the original error attached.
 *
 * A corrupt document is never partially hydrated and never silently replaced by
 * an empty project.
 */

import { PersistenceError, asPersistenceError, isPersistenceError } from './errors';
import {
  openEnvelopeFromJson,
  sealDocument,
  type DocumentEnvelope,
  type ProjectDocumentV2,
} from './documentContract';
import type { KeyValueBackend } from './indexedDbBackend';

export interface ProjectSummary {
  readonly projectId: string;
  readonly name: string;
  readonly revision: number;
  readonly savedAt: number;
  readonly duration: number;
  readonly schemaVersion: number;
  readonly migratedFrom?: number;
}

export interface SaveDocumentResult {
  readonly projectId: string;
  readonly revision: number;
  readonly savedAt: number;
  readonly byteLength: number;
  readonly checksum: string;
}

export interface LoadDocumentResult {
  readonly found: boolean;
  readonly projectId: string;
  readonly envelope: DocumentEnvelope | null;
  readonly document: ProjectDocumentV2 | null;
  readonly revision: number;
  readonly recovered: boolean;
  readonly recoveredFrom: 'rollback' | null;
  readonly error: PersistenceError | null;
}

export interface ProjectDocumentStoreOptions {
  readonly clock?: () => number;
}

export const projectKey = (projectId: string): string => `project:${projectId}`;
export const rollbackKey = (projectId: string): string => `project:${projectId}#rollback`;
export const PROJECT_INDEX_KEY = 'project-index';

function parseEnvelope(raw: string | null): { envelope: DocumentEnvelope | null } {
  if (!raw) return { envelope: null };
  try {
    const parsed = JSON.parse(raw) as DocumentEnvelope;
    if (!parsed || typeof parsed !== 'object') return { envelope: null };
    return { envelope: parsed };
  } catch {
    return { envelope: null };
  }
}

export class ProjectDocumentStore {
  private readonly backend: KeyValueBackend;
  private readonly clock: () => number;
  private writeChain: Promise<unknown> = Promise.resolve();

  constructor(backend: KeyValueBackend, options: ProjectDocumentStoreOptions = {}) {
    this.backend = backend;
    this.clock = options.clock ?? (() => Date.now());
  }

  get kind(): string {
    return this.backend.kind;
  }

  /** Serialises saves within this tab so two awaits cannot interleave a revision. */
  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = this.writeChain.then(task, task);
    this.writeChain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  async save(document: ProjectDocumentV2, meta: { migratedFrom?: number } = {}): Promise<SaveDocumentResult> {
    return this.enqueue(async () => {
      const primary = projectKey(document.projectId);
      const previousRaw = await this.backend.get(primary);
      const previous = parseEnvelope(previousRaw).envelope;
      const previousRevision = previous?.revision ?? 0;
      const revision = previousRevision + 1;
      const savedAt = this.clock();

      const envelope = await sealDocument(document, {
        projectId: document.projectId,
        name: document.name,
        revision,
        savedAt,
        ...(meta.migratedFrom !== undefined ? { migratedFrom: meta.migratedFrom } : {}),
      });
      const payload = JSON.stringify(envelope);

      try {
        await this.backend.transaction(async (tx) => {
          const currentRaw = await tx.get(primary);
          const current = parseEnvelope(currentRaw).envelope;
          const currentRevision = current?.revision ?? 0;

          if (currentRevision !== previousRevision) {
            throw new PersistenceError(
              'PERSISTENCE_CONFLICT',
              `Project ${document.projectId} changed under the save (expected revision ${previousRevision}, found ${currentRevision}).`,
              { projectId: document.projectId, expectedRevision: previousRevision, foundRevision: currentRevision },
            );
          }

          if (currentRaw) tx.put(rollbackKey(document.projectId), currentRaw);
          tx.put(primary, payload);

          const indexRaw = await tx.get(PROJECT_INDEX_KEY);
          const index = readIndex(indexRaw);
          const summary: ProjectSummary = {
            projectId: document.projectId,
            name: document.name,
            revision,
            savedAt,
            duration: document.project.totalDuration,
            schemaVersion: document.schemaVersion,
            ...(envelope.migratedFrom !== undefined ? { migratedFrom: envelope.migratedFrom } : {}),
          };
          tx.put(PROJECT_INDEX_KEY, JSON.stringify(upsertIndex(index, summary)));
        });
      } catch (error) {
        throw isPersistenceError(error)
          ? error
          : asPersistenceError(error, `Failed to save project ${document.projectId}`);
      }

      return {
        projectId: document.projectId,
        revision,
        savedAt,
        byteLength: envelope.byteLength,
        checksum: envelope.checksum,
      };
    });
  }

  async load(projectId: string): Promise<LoadDocumentResult> {
    const empty: LoadDocumentResult = {
      found: false,
      projectId,
      envelope: null,
      document: null,
      revision: 0,
      recovered: false,
      recoveredFrom: null,
      error: null,
    };

    const raw = await this.backend.get(projectKey(projectId));
    if (!raw) return empty;

    try {
      const { envelope, document } = await openEnvelopeFromJson(raw);
      return {
        found: true,
        projectId,
        envelope,
        document,
        revision: envelope.revision,
        recovered: false,
        recoveredFrom: null,
        error: null,
      };
    } catch (error) {
      const typed = asPersistenceError(error, 'Project document could not be read');

      const rollbackRaw = await this.backend.get(rollbackKey(projectId));
      if (rollbackRaw) {
        try {
          const { envelope, document } = await openEnvelopeFromJson(rollbackRaw);
          return {
            found: true,
            projectId,
            envelope,
            document,
            revision: envelope.revision,
            recovered: true,
            recoveredFrom: 'rollback',
            error: typed,
          };
        } catch {
          /* rollback is unusable too — fall through and report the primary failure */
        }
      }

      return { ...empty, error: typed };
    }
  }

  /** Finds a project by its human-facing name (the "open by name" UX). */
  async loadByName(name: string): Promise<LoadDocumentResult> {
    const index = await this.list();
    const match = index
      .filter((entry) => entry.name === name)
      .sort((a, b) => b.revision - a.revision || b.savedAt - a.savedAt)[0];
    if (!match) {
      return {
        found: false,
        projectId: '',
        envelope: null,
        document: null,
        revision: 0,
        recovered: false,
        recoveredFrom: null,
        error: null,
      };
    }
    return this.load(match.projectId);
  }

  async list(): Promise<ProjectSummary[]> {
    const raw = await this.backend.get(PROJECT_INDEX_KEY);
    return readIndex(raw);
  }

  /** Removes a project document, its rollback slot and its index entry. */
  async remove(projectId: string): Promise<void> {
    await this.enqueue(async () => {
      await this.backend.transaction(async (tx) => {
        tx.delete(projectKey(projectId));
        tx.delete(rollbackKey(projectId));
        const indexRaw = await tx.get(PROJECT_INDEX_KEY);
        const index = readIndex(indexRaw).filter((entry) => entry.projectId !== projectId);
        tx.put(PROJECT_INDEX_KEY, JSON.stringify(index));
      });
    });
  }

  /**
   * Seeds the rollback slot with a raw payload (used by SHIM-001 to preserve the
   * legacy localStorage JSON inside the durable store before that key is removed).
   */
  async seedRollback(projectId: string, rawPayload: string): Promise<void> {
    await this.enqueue(async () => {
      await this.backend.transaction(async (tx) => {
        tx.put(rollbackKey(projectId), rawPayload);
      });
    });
  }

  /** Promotes the rollback envelope to primary (user chose "restore previous version"). */
  async restoreRollback(projectId: string): Promise<LoadDocumentResult> {
    const rollbackRaw = await this.backend.get(rollbackKey(projectId));
    if (!rollbackRaw) {
      throw new PersistenceError('PERSISTENCE_CORRUPT', `No previous version is stored for project ${projectId}.`, {
        projectId,
      });
    }
    const { envelope } = await openEnvelopeFromJson(rollbackRaw);

    await this.enqueue(async () => {
      await this.backend.transaction(async (tx) => {
        const currentRaw = await tx.get(projectKey(projectId));
        if (currentRaw) tx.put(rollbackKey(projectId), currentRaw);
        tx.put(projectKey(projectId), rollbackRaw);
        const indexRaw = await tx.get(PROJECT_INDEX_KEY);
        const index = readIndex(indexRaw);
        tx.put(
          PROJECT_INDEX_KEY,
          JSON.stringify(
            upsertIndex(index, {
              projectId,
              name: envelope.name,
              revision: envelope.revision,
              savedAt: envelope.savedAt,
              duration: envelope.duration,
              schemaVersion: envelope.schemaVersion,
            }),
          ),
        );
      });
    });

    return this.load(projectId);
  }
}

function readIndex(raw: string | null): ProjectSummary[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (entry): entry is ProjectSummary =>
        !!entry && typeof entry === 'object' && typeof (entry as ProjectSummary).projectId === 'string',
    );
  } catch {
    return [];
  }
}

function upsertIndex(index: readonly ProjectSummary[], summary: ProjectSummary): ProjectSummary[] {
  const next = index.filter((entry) => entry.projectId !== summary.projectId);
  next.push(summary);
  return next;
}
