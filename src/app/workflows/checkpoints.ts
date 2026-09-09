/**
 * Checkpoint store.
 *
 * The default implementation is in-memory: the AI Studio Web App runtime offers
 * no durable server storage (ARCHITECTURE FREEZE → Persistence), so checkpoints
 * accelerate recovery within a session. A durable adapter (IndexedDB, WP-05)
 * implements the same interface without changing the runtime.
 */
import type { Checkpoint, CheckpointStore } from './types';

export function createMemoryCheckpointStore(): CheckpointStore {
  const byKey = new Map<string, Checkpoint[]>();

  return {
    put(checkpoint) {
      const list = byKey.get(checkpoint.idempotencyKey) ?? [];
      list.push(checkpoint);
      byKey.set(checkpoint.idempotencyKey, list);
    },
    list(idempotencyKey) {
      return [...(byKey.get(idempotencyKey) ?? [])].sort((a, b) => b.createdAt - a.createdAt);
    },
    latest(idempotencyKey, stepId) {
      const matches = (byKey.get(idempotencyKey) ?? []).filter((entry) => entry.stepId === stepId);
      if (matches.length === 0) return undefined;
      return matches.reduce((newest, entry) => (entry.createdAt > newest.createdAt ? entry : newest));
    },
    prune(now, retainMs) {
      for (const [key, list] of [...byKey.entries()]) {
        const kept = list.filter((entry) => now - entry.createdAt <= retainMs);
        if (kept.length === 0) byKey.delete(key);
        else byKey.set(key, kept);
      }
    },
  };
}

/**
 * Stable, deterministic idempotency key (contracts/workflows.md §7):
 * `hash(workflowId + version + canonicalInput)`. FNV-1a over a canonical JSON
 * serialisation — no `Math.random`, no wall-clock, so the same intent always
 * produces the same key (this is what makes double-click safe).
 */
export function canonicalise(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map(canonicalise).join(',')}]`;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalise(record[key])}`).join(',')}}`;
}

export function stableHash(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

export function idempotencyKeyFor(workflowId: string, version: number, input: unknown): string {
  return `idem_${stableHash(`${workflowId}|v${version}|${canonicalise(input)}`)}`;
}
