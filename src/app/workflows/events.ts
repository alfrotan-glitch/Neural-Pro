/**
 * Structured workflow events (contracts/workflows.md §10,
 * docs/operations/logging.md). Every event carries run identity, timing and —
 * when relevant — a typed error code. Nothing here touches the console by
 * default; sinks are injected.
 */
import type { WorkflowEvent, WorkflowEventName } from './types';

export type WorkflowEventListener = (event: WorkflowEvent) => void;

export interface WorkflowEventBus {
  emit(event: WorkflowEvent): void;
  subscribe(listener: WorkflowEventListener): () => void;
  subscribeTo(runId: string, listener: WorkflowEventListener): () => void;
}

export function createEventBus(): WorkflowEventBus {
  const listeners = new Set<WorkflowEventListener>();
  const perRun = new Map<string, Set<WorkflowEventListener>>();

  const dispatch = (event: WorkflowEvent) => {
    for (const listener of [...listeners]) listener(event);
    const runListeners = perRun.get(event.runId);
    if (runListeners) for (const listener of [...runListeners]) listener(event);
  };

  return {
    emit: dispatch,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    subscribeTo(runId, listener) {
      let set = perRun.get(runId);
      if (!set) {
        set = new Set();
        perRun.set(runId, set);
      }
      set.add(listener);
      return () => {
        const current = perRun.get(runId);
        if (!current) return;
        current.delete(listener);
        if (current.size === 0) perRun.delete(runId);
      };
    },
  };
}

/** Sink that keeps the last N events in memory for diagnostics/tests. */
export function createRecordingSink(capacity = 500): WorkflowEventListener & { readonly events: readonly WorkflowEvent[] } {
  const events: WorkflowEvent[] = [];
  const listener = (event: WorkflowEvent) => {
    events.push(event);
    if (events.length > capacity) events.shift();
  };
  return Object.assign(listener, { events });
}

export function eventName(name: WorkflowEventName): WorkflowEventName {
  return name;
}
