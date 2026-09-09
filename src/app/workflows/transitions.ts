/**
 * Run status transition table — normative (contracts/workflows.md §2).
 * Anything not listed is rejected and logged as `workflow.illegal_transition`,
 * never silently applied.
 */
import type { RunStatus } from './types';

const TERMINAL: ReadonlySet<RunStatus> = new Set<RunStatus>(['succeeded', 'failed', 'cancelled', 'expired']);

const TRANSITIONS: Readonly<Record<RunStatus, readonly RunStatus[]>> = {
  idle: ['queued'],
  queued: ['validating', 'cancelled', 'expired'],
  validating: ['running', 'failed', 'cancelled'],
  running: ['retrying', 'succeeded', 'failed', 'cancelled', 'expired'],
  retrying: ['running', 'failed', 'cancelled', 'expired'],
  succeeded: [],
  failed: [],
  cancelled: [],
  expired: [],
};

export function isTerminal(status: RunStatus): boolean {
  return TERMINAL.has(status);
}

export function canTransition(from: RunStatus, to: RunStatus): boolean {
  if (from === to) return false;
  return TRANSITIONS[from].includes(to);
}

export function allowedTransitions(from: RunStatus): readonly RunStatus[] {
  return TRANSITIONS[from];
}
