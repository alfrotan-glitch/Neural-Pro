/**
 * React boundary — contracts/workflows.md §9.
 *
 * React subscribes; it never assigns status. `useWorkflowRun` is a read-only view
 * of a run plus intent helpers (`cancel`, `retry`).
 */
import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { getWorkflowRuntime } from '../runtime';
import type { WorkflowRuntime } from '../runtime';
import type { WorkflowEvent, WorkflowRun, WorkflowRunId } from '../types';

export interface WorkflowRunView {
  readonly run: WorkflowRun | null;
  cancel(reason?: string): boolean;
  retry(): WorkflowRun | null;
}

export function useWorkflowRun(runId: WorkflowRunId | null, runtime: WorkflowRuntime = getWorkflowRuntime()): WorkflowRunView {
  const subscribe = useCallback(
    (onStoreChange: () => void) => runtime.subscribe(onStoreChange),
    [runtime],
  );
  const getSnapshot = useCallback(() => runtime.get(runId ?? '') ?? null, [runtime, runId]);

  const run = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const cancel = useCallback(
    (reason?: string) => (runId ? runtime.cancel(runId, reason) : false),
    [runtime, runId],
  );
  const retry = useCallback(() => (runId ? runtime.retry(runId) : null), [runtime, runId]);

  return useMemo(() => ({ run, cancel, retry }), [run, cancel, retry]);
}

/**
 * Subscribe to the structured event stream (diagnostics panels, telemetry).
 * Subscription only — the handler never drives run state.
 */
export function useWorkflowEvents(
  onEvent: (event: WorkflowEvent) => void,
  runtime: WorkflowRuntime = getWorkflowRuntime(),
): void {
  const handlerRef = useRef(onEvent);
  handlerRef.current = onEvent;

  useEffect(
    () => runtime.eventBus.subscribe((event) => handlerRef.current(event)),
    [runtime],
  );
}
