/**
 * Workflow runtime lifecycle — docs/contracts/workflows.md, INV-007.
 *
 * Executable, headless, deterministic: backoff delays are injected as tiny
 * values, so no test sleeps on wall-clock backoff.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { WorkflowRuntime, delay } from '../../../src/app/workflows/runtime.ts';
import { createMemoryCheckpointStore } from '../../../src/app/workflows/checkpoints.ts';
import { DEFAULT_RETRY_POLICY, NO_RETRY_POLICY } from '../../../src/app/workflows/policies.ts';
import { allowedTransitions, canTransition, isTerminal } from '../../../src/app/workflows/transitions.ts';
import { createAppError } from '../../../src/domain/errors/appError.ts';
import type { AppError, ErrorCode } from '../../../src/domain/errors/appError.ts';
import type {
  WorkflowDefinition,
  WorkflowEvent,
  WorkflowRun,
  WorkflowStepContext,
} from '../../../src/app/workflows/types.ts';

const ok = (extra: Record<string, unknown> = {}) => Promise.resolve(extra);
const typedError = (code: ErrorCode, retryable: boolean): AppError =>
  createAppError({ code, message: 'test error', retryable });

function definition(overrides: Partial<WorkflowDefinition> = {}): WorkflowDefinition {
  return {
    id: 'podcast',
    version: 1,
    validateInput: () => null,
    retryPolicy: NO_RETRY_POLICY,
    timeoutPolicy: { runTimeoutMs: 60_000, graceMs: 25, stepTimeoutMs: 5_000 },
    recoveryPolicy: { strategy: 'resume-from-checkpoint', retainCheckpointsMs: 60_000, maxResumeAgeMs: 60_000 },
    steps: [{ id: 'work', name: 'Work', run: () => ok({ done: true }) }],
    ...overrides,
  };
}

function makeRuntime() {
  const events: WorkflowEvent[] = [];
  const runtime = new WorkflowRuntime({ onEvent: (event) => events.push(event) });
  const names = () => events.map((event) => event.event);
  return { runtime, events, names };
}

/** Yields to the microtask queue + one macrotask tick. */
const settle = (ms = 10) => new Promise((resolve) => setTimeout(resolve, ms));

/* ------------------------------------------------------------- transitions */

test('T-01 the transition table rejects illegal moves and terminal escape', () => {
  assert.equal(canTransition('idle', 'queued'), true);
  assert.equal(canTransition('queued', 'validating'), true);
  assert.equal(canTransition('running', 'succeeded'), true);
  assert.equal(canTransition('running', 'retrying'), true);
  assert.equal(canTransition('idle', 'running'), false, 'a run cannot skip the queue');
  assert.equal(canTransition('queued', 'succeeded'), false);
  assert.equal(canTransition('running', 'running'), false, 'a self-transition is not a transition');
  assert.deepEqual(allowedTransitions('succeeded'), []);
  for (const terminal of ['succeeded', 'failed', 'cancelled', 'expired'] as const) {
    assert.equal(isTerminal(terminal), true);
    assert.equal(canTransition(terminal, 'running'), false, `${terminal} is terminal`);
  }
});

/* ------------------------------------------------------------- idempotency */

test('T-02 #9 submitting the same input twice creates exactly one run', async () => {
  const { runtime } = makeRuntime();
  let executions = 0;
  runtime.register(
    definition({
      steps: [
        {
          id: 'work',
          name: 'Work',
          run: async () => {
            executions += 1;
            await delay(20);
            return ok({ done: true });
          },
        },
      ],
    }),
  );

  const first = runtime.start('podcast', { topic: 'croissants' });
  const second = runtime.start('podcast', { topic: 'croissants' });
  const different = runtime.start('podcast', { topic: 'sourdough' });

  assert.equal(first.id, second.id, 'the same intent must return the same run');
  assert.equal(first.idempotencyKey, second.idempotencyKey);
  assert.notEqual(first.id, different.id);
  await settle(60);
  assert.equal(executions, 2, 'one execution per distinct intent');
});

test('T-02b key ordering does not change the idempotency key', async () => {
  const { runtime } = makeRuntime();
  runtime.register(definition({ steps: [{ id: 'work', name: 'Work', run: async () => { await delay(30); return ok(); } }] }));
  const a = runtime.start('podcast', { topic: 'x', channel: 'y' });
  const b = runtime.start('podcast', { channel: 'y', topic: 'x' });
  assert.equal(a.id, b.id);
  await settle(60);
});

/* ----------------------------------------------------------- cancellation */

test('T-03 #18 cancelling a queued run means it never executes', async () => {
  const { runtime, events, names } = makeRuntime();
  let started = 0;
  runtime.register(
    definition({
      maxConcurrent: 1,
      steps: [
        {
          id: 'work',
          name: 'Work',
          run: async () => {
            started += 1;
            await delay(30);
            return ok();
          },
        },
      ],
    }),
  );

  const first = runtime.start('podcast', { index: 1 });
  const second = runtime.start('podcast', { index: 2 });
  await settle();
  assert.equal(runtime.get(second.id)?.status, 'queued');

  assert.equal(runtime.cancel(second.id), true);
  assert.equal(runtime.get(second.id)?.status, 'cancelled');
  assert.equal(runtime.cancel(second.id), false, 'cancelling a terminal run is a no-op');

  await settle(80);
  assert.equal(started, 1, 'the cancelled queued run never reached its step');
  assert.equal(runtime.get(first.id)?.status, 'succeeded');
  assert.equal(runtime.get(second.id)?.status, 'cancelled');
  assert.equal(runtime.get(second.id)?.error?.code, 'CANCELLED');
  assert.ok(names().includes('workflow.cancelled'));
  assert.ok(
    !events.some((event) => event.runId === second.id && event.event === 'workflow.step_started'),
    'no step ever started for the cancelled run',
  );
});

test('T-04 #6 cancelling a running run reaches `cancelled` within graceMs', async () => {
  const { runtime } = makeRuntime();
  let observedAbort = false;
  runtime.register(
    definition({
      steps: [
        {
          id: 'work',
          name: 'Work',
          run: async (ctx: WorkflowStepContext) => {
            try {
              await delay(5_000, ctx.signal);
            } catch (error) {
              observedAbort = true;
              throw error;
            }
            return ok();
          },
        },
      ],
    }),
  );

  const run = runtime.start('podcast', {});
  await settle();
  const startedAt = Date.now();
  runtime.cancel(run.id, 'user cancel');
  await settle(40);

  const state = runtime.get(run.id);
  assert.equal(state?.status, 'cancelled');
  assert.equal(observedAbort, true, 'the step observed the abort signal');
  assert.ok(Date.now() - startedAt < 1_000, 'terminal state well inside the grace window');
  assert.ok((state?.endedAt ?? 0) > 0, 'the run recorded an end time');
  assert.equal(state?.currentStepId, null, 'a terminal run owns no current step');
});

test('T-05 INV-007b a step that ignores its signal is still terminalised after graceMs', async () => {
  const { runtime } = makeRuntime();
  runtime.register(
    definition({
      timeoutPolicy: { runTimeoutMs: 60_000, graceMs: 20, stepTimeoutMs: 5_000 },
      steps: [
        {
          id: 'stubborn',
          name: 'Ignores cancellation',
          run: async () => {
            await delay(500); // never looks at ctx.signal
            return ok();
          },
        },
      ],
    }),
  );

  const run = runtime.start('podcast', {});
  await settle();
  runtime.cancel(run.id);
  await settle(60);
  assert.equal(runtime.get(run.id)?.status, 'cancelled');
  // The stubborn step keeps running but the run is already terminal.
  await settle(500);
  assert.equal(runtime.get(run.id)?.status, 'cancelled', 'a late success cannot resurrect a cancelled run');
});

test('T-06 #16 cancelling at every step releases the resources the run owns', async () => {
  const released: string[] = [];
  const stepIds = ['prepare', 'render', 'deliver'];

  for (const cancelAt of stepIds) {
    const { runtime } = makeRuntime();
    runtime.register(
      definition({
        steps: stepIds.map((id) => ({
          id,
          name: id,
          run: async (ctx: WorkflowStepContext) => {
            ctx.scope.add(() => {
              released.push(id);
            });
            await delay(15, ctx.signal);
            return ok({ [id]: true });
          },
        })),
      }),
    );

    const run = runtime.start('podcast', {});
    for (let i = 0; i < 500; i += 1) {
      if (runtime.get(run.id)?.currentStepId === cancelAt) break;
      await delay(2);
    }
    assert.equal(runtime.get(run.id)?.currentStepId, cancelAt, `reached ${cancelAt}`);
    runtime.cancel(run.id);
    await settle(60);
    assert.equal(runtime.get(run.id)?.status, 'cancelled', `cancelled during ${cancelAt}`);
  }

  // Disposers run newest-first, so each cancelled run releases its own chain.
  assert.deepEqual(released, ['prepare', 'render', 'prepare', 'deliver', 'render', 'prepare']);
  assert.equal(new Set(released).size, 3);
});

test('T-07 a failing disposer never blocks the other disposers', async () => {
  const seen: string[] = [];
  const errors: unknown[] = [];
  const runtime = new WorkflowRuntime({ onError: (error) => errors.push(error) });
  runtime.register(
    definition({
      steps: [
        {
          id: 'work',
          name: 'Work',
          run: async (ctx) => {
            ctx.scope.add(() => {
              seen.push('first');
            });
            ctx.scope.add(() => {
              throw new Error('disposer exploded');
            });
            ctx.scope.add(() => {
              seen.push('third');
            });
            return ok();
          },
        },
      ],
    }),
  );
  const run = runtime.start('podcast', {});
  await settle(30);
  assert.equal(runtime.get(run.id)?.status, 'succeeded');
  assert.deepEqual(seen, ['third', 'first'], 'released newest-first, past the failure');
  assert.equal(errors.length, 1, 'the disposer failure was reported, not swallowed silently');
});

/* ------------------------------------------------------------------ retry */

test('T-08 retry is bounded: three transient failures then success', async () => {
  const { runtime, events } = makeRuntime();
  let attempts = 0;
  runtime.register(
    definition({
      retryPolicy: { ...DEFAULT_RETRY_POLICY, maxAttempts: 4, baseDelayMs: 2, maxDelayMs: 4, jitter: false },
      steps: [
        {
          id: 'flaky',
          name: 'Flaky',
          run: async () => {
            attempts += 1;
            if (attempts < 4) throw typedError('AI_RATE_LIMITED', true);
            return ok({ attempts });
          },
        },
      ],
    }),
  );

  const run = runtime.start('podcast', {});
  await settle(80);
  assert.equal(runtime.get(run.id)?.status, 'succeeded');
  assert.equal(attempts, 4);
  const retries = events.filter((event) => event.event === 'workflow.step_retry');
  assert.equal(retries.length, 3);
  assert.ok(retries.every((event) => event.errorCode === 'AI_RATE_LIMITED'));
});

test('T-09 retry is bounded: exhausting attempts fails the run with the real code', async () => {
  const { runtime } = makeRuntime();
  let attempts = 0;
  runtime.register(
    definition({
      retryPolicy: { ...DEFAULT_RETRY_POLICY, maxAttempts: 3, baseDelayMs: 1, maxDelayMs: 2, jitter: false },
      steps: [
        {
          id: 'always',
          name: 'Always fails',
          run: async () => {
            attempts += 1;
            throw typedError('AI_RATE_LIMITED', true);
          },
        },
      ],
    }),
  );

  const run = runtime.start('podcast', {});
  await settle(60);
  const state = runtime.get(run.id);
  assert.equal(state?.status, 'failed');
  assert.equal(attempts, 3, 'exactly maxAttempts attempts');
  assert.equal(state?.error?.code, 'AI_RATE_LIMITED', 'the failure is the dependency error, not INTERNAL');
});

test('T-10 a non-retryable error fails immediately', async () => {
  const { runtime } = makeRuntime();
  let attempts = 0;
  runtime.register(
    definition({
      retryPolicy: DEFAULT_RETRY_POLICY,
      steps: [
        {
          id: 'invalid',
          name: 'Invalid input',
          run: async () => {
            attempts += 1;
            throw typedError('VALIDATION_FAILED', false);
          },
        },
      ],
    }),
  );

  const run = runtime.start('podcast', {});
  await settle(30);
  assert.equal(runtime.get(run.id)?.status, 'failed');
  assert.equal(attempts, 1, 'validation errors are never retried');
});

test('T-11 backoff actually waits between attempts', async () => {
  const { runtime } = makeRuntime();
  const stamps: number[] = [];
  runtime.register(
    definition({
      retryPolicy: { ...DEFAULT_RETRY_POLICY, maxAttempts: 3, backoff: 'fixed', baseDelayMs: 40, maxDelayMs: 40, jitter: false },
      steps: [
        {
          id: 'flaky',
          name: 'Flaky',
          run: async () => {
            stamps.push(Date.now());
            if (stamps.length < 3) throw typedError('AI_TIMEOUT', true);
            return ok();
          },
        },
      ],
    }),
  );
  const run = runtime.start('podcast', {});
  await settle(200);
  assert.equal(runtime.get(run.id)?.status, 'succeeded');
  assert.equal(stamps.length, 3);
  const gap = (stamps[2] ?? 0) - (stamps[0] ?? 0);
  assert.ok(gap >= 75, `expected two 40ms waits, measured ${gap}ms`);
});

/* ---------------------------------------------------------------- timeouts */

test('T-12 #22 a run exceeding runTimeoutMs expires and aborts the in-flight step', async () => {
  const { runtime, names } = makeRuntime();
  let observedAbort = false;
  runtime.register(
    definition({
      timeoutPolicy: { runTimeoutMs: 30, graceMs: 10, stepTimeoutMs: 5_000 },
      steps: [
        {
          id: 'slow',
          name: 'Slow',
          run: async (ctx) => {
            try {
              await delay(2_000, ctx.signal);
            } catch (error) {
              observedAbort = true;
              throw error;
            }
            return ok();
          },
        },
      ],
    }),
  );

  const run = runtime.start('podcast', {});
  await settle(90);
  const state = runtime.get(run.id);
  assert.equal(state?.status, 'expired');
  assert.equal(state?.error?.code, 'EXPIRED');
  assert.equal(observedAbort, true, 'expiry aborts the step, it does not just relabel the run');
  assert.ok(names().includes('workflow.timed_out'));
});

test('T-13 a step timeout keeps its TIMEOUT code and is retried when allowed', async () => {
  const { runtime, events } = makeRuntime();
  let attempts = 0;
  runtime.register(
    definition({
      retryPolicy: { ...DEFAULT_RETRY_POLICY, maxAttempts: 3, baseDelayMs: 1, maxDelayMs: 2, jitter: false },
      timeoutPolicy: { runTimeoutMs: 5_000, graceMs: 10, stepTimeoutMs: 20 },
      steps: [
        {
          id: 'slow',
          name: 'Slow first time',
          run: async (ctx) => {
            attempts += 1;
            await delay(attempts === 1 ? 200 : 1, ctx.signal);
            return ok();
          },
        },
      ],
    }),
  );

  const run = runtime.start('podcast', {});
  await settle(200);
  assert.equal(runtime.get(run.id)?.status, 'succeeded');
  assert.equal(attempts, 2);
  const retry = events.find((event) => event.event === 'workflow.step_retry');
  assert.equal(retry?.errorCode, 'TIMEOUT', 'a step timeout is TIMEOUT, never INTERNAL');
});

test('T-14 an exhausted step timeout expires the step, not an untyped internal error', async () => {
  const { runtime } = makeRuntime();
  runtime.register(
    definition({
      retryPolicy: NO_RETRY_POLICY,
      timeoutPolicy: { runTimeoutMs: 5_000, graceMs: 10, stepTimeoutMs: 15 },
      steps: [
        {
          id: 'slow',
          name: 'Always slow',
          run: async (ctx) => {
            await delay(500, ctx.signal);
            return ok();
          },
        },
      ],
    }),
  );
  const run = runtime.start('podcast', {});
  await settle(80);
  const state = runtime.get(run.id);
  assert.equal(state?.status, 'expired');
  assert.equal(state?.error?.code, 'EXPIRED', 'a step timeout is typed EXPIRED, never INTERNAL');
});

test('T-15 expiry during backoff stops the retry loop: the transition is rejected and logged', async () => {
  const { runtime, events } = makeRuntime();
  let attempts = 0;
  runtime.register(
    definition({
      retryPolicy: { ...DEFAULT_RETRY_POLICY, maxAttempts: 5, baseDelayMs: 400, maxDelayMs: 400, jitter: false },
      timeoutPolicy: { runTimeoutMs: 40, graceMs: 10, stepTimeoutMs: 5_000 },
      steps: [
        {
          id: 'flaky',
          name: 'Flaky',
          run: async () => {
            attempts += 1;
            throw typedError('AI_RATE_LIMITED', true);
          },
        },
      ],
    }),
  );

  const run = runtime.start('podcast', {});
  await settle(120);
  const state = runtime.get(run.id);
  assert.equal(state?.status, 'expired', 'the run deadline wins over a pending retry');
  assert.equal(attempts, 1, 'no attempt may start after the run expired');
  const illegal = events.filter((event) => event.event === 'workflow.illegal_transition');
  assert.equal(illegal.length, 1, 'the rejected transition is logged exactly once');
  assert.equal(illegal[0]?.message, 'expired -> running');
});

/* ---------------------------------------------------------- input & state */

test('T-16 an invalid input fails in `validating` and never runs a step', async () => {
  const { runtime, events } = makeRuntime();
  let executed = false;
  runtime.register(
    definition({
      validateInput: (input) =>
        typeof (input as { topic?: unknown }).topic === 'string'
          ? null
          : typedError('EMPTY_INPUT', false),
      steps: [
        {
          id: 'work',
          name: 'Work',
          run: async () => {
            executed = true;
            return ok();
          },
        },
      ],
    }),
  );

  const run = runtime.start('podcast', {});
  await settle(20);
  const state = runtime.get(run.id);
  assert.equal(state?.status, 'failed');
  assert.equal(state?.error?.code, 'EMPTY_INPUT');
  assert.equal(executed, false);
  assert.ok(
    !events.some((event) => event.runId === run.id && event.event === 'workflow.step_started'),
    'no step started for an invalid input',
  );
});

test('T-17 progress is monotonic within a run and clamped to 0..100', async () => {
  const { runtime } = makeRuntime();
  const seen: number[] = [];
  runtime.register(
    definition({
      steps: [
        {
          id: 'work',
          name: 'Work',
          run: async (ctx) => {
            ctx.report(50, 'halfway');
            ctx.report(10, 'a late lower value must be ignored');
            ctx.report(180);
            ctx.report(Number.NaN);
            await delay(5);
            return ok();
          },
        },
      ],
    }),
  );

  const unsubscribe = runtime.subscribe((run) => seen.push(run.progress));
  const run = runtime.start('podcast', {});
  await settle(40);
  unsubscribe();

  assert.equal(runtime.get(run.id)?.status, 'succeeded');
  assert.equal(runtime.get(run.id)?.progress, 100);
  for (let i = 1; i < seen.length; i += 1) {
    assert.ok((seen[i] ?? 0) >= (seen[i - 1] ?? 0), `progress went backwards: ${JSON.stringify(seen)}`);
  }
  assert.ok(seen.every((value) => value >= 0 && value <= 100));
});

test('T-18 step outputs merge into the next step input without leaking into the key', async () => {
  const { runtime } = makeRuntime();
  const observed: Record<string, unknown>[] = [];
  const deps = { gateway: { name: 'fake' } };
  runtime.register(
    definition({
      steps: [
        { id: 'first', name: 'First', run: async () => ok({ script: ['a', 'b'] }) },
        {
          id: 'second',
          name: 'Second',
          run: async (ctx) => {
            observed.push({ ...ctx.input, deps: ctx.deps });
            return ok({ audioBytes: 2 });
          },
        },
      ],
    }),
  );

  const run = runtime.start('podcast', { topic: 'x' }, { deps });
  await settle(30);
  const state = runtime.get(run.id) as WorkflowRun;
  assert.equal(state.status, 'succeeded');
  assert.deepEqual(observed[0]?.script, ['a', 'b']);
  assert.equal(observed[0]?.topic, 'x');
  const injectedDeps = observed[0]?.deps as { gateway: { name: string } };
  assert.equal(injectedDeps.gateway.name, 'fake', 'injected collaborators reach the step');
  assert.deepEqual(state.result, { audioBytes: 2 }, 'the run result is the last step output');
  assert.notEqual(state.idempotencyKey.includes('fake'), true, 'injected deps never enter the idempotency key');
});

/* ----------------------------------------------------------- concurrency */

test('T-19 maxConcurrent is honoured: serial by default, two when configured', async () => {
  for (const [maxConcurrent, expectedPeak] of [
    [1, 1],
    [2, 2],
  ] as const) {
    const { runtime } = makeRuntime();
    let active = 0;
    let peak = 0;
    runtime.register(
      definition({
        maxConcurrent,
        steps: [
          {
            id: 'work',
            name: 'Work',
            run: async (ctx) => {
              active += 1;
              peak = Math.max(peak, active);
              await delay(20, ctx.signal);
              active -= 1;
              return ok();
            },
          },
        ],
      }),
    );

    for (let i = 0; i < 4; i += 1) runtime.start('podcast', { index: i });
    await settle(250);

    assert.equal(peak, expectedPeak, `peak concurrency with maxConcurrent=${maxConcurrent}`);
    assert.equal(
      runtime.list('podcast').filter((run) => run.status === 'succeeded').length,
      4,
      'the queue drained without polling',
    );
  }
});

test('T-20 cancelling the running run lets the queued run take its slot', async () => {
  const { runtime } = makeRuntime();
  const finished: string[] = [];
  runtime.register(
    definition({
      maxConcurrent: 1,
      steps: [
        {
          id: 'work',
          name: 'Work',
          run: async (ctx) => {
            await delay((ctx.input.index as number) === 1 ? 400 : 10, ctx.signal);
            finished.push(String(ctx.input.index));
            return ok();
          },
        },
      ],
    }),
  );

  const first = runtime.start('podcast', { index: 1 });
  const second = runtime.start('podcast', { index: 2 });
  await settle();
  runtime.cancel(first.id);
  await settle(60);

  assert.equal(runtime.get(first.id)?.status, 'cancelled');
  assert.equal(runtime.get(second.id)?.status, 'succeeded');
  assert.deepEqual(finished, ['2']);
});

/* -------------------------------------------------- checkpoints & resume */

test('T-21 a checkpointed step is replayed on resume instead of re-executed', async () => {
  const checkpoints = createMemoryCheckpointStore();
  let executions = 0;

  const build = () =>
    definition({
      steps: [
        {
          id: 'expensive',
          name: 'Expensive',
          checkpoint: true,
          run: async () => {
            executions += 1;
            return ok({ script: ['line'] });
          },
        },
        { id: 'finishing', name: 'Finishing', run: async () => ok({ finished: true }) },
      ],
    });

  const first = new WorkflowRuntime({ checkpoints });
  first.register(build());
  const run = first.start('podcast', { topic: 'a' });
  await settle(30);
  assert.equal(first.get(run.id)?.status, 'succeeded');
  assert.equal(executions, 1);

  executions = 0;
  const second = new WorkflowRuntime({ checkpoints });
  second.register(build());
  const resumed = second.start('podcast', { topic: 'a' }, { idempotencyKey: run.idempotencyKey, resume: true });
  await settle(30);

  const state = second.get(resumed.id) as WorkflowRun;
  assert.equal(state.status, 'succeeded');
  assert.equal(executions, 0, 'the checkpointed step was replayed, not re-executed');
  assert.deepEqual(state.stepOutputs.expensive, { script: ['line'] });
  assert.deepEqual(state.result, { finished: true }, 'the non-checkpointed step still ran');
});

test('T-22 an untrusted or too-old checkpoint is re-executed', async () => {
  const checkpoints = createMemoryCheckpointStore();
  let executions = 0;
  const base = definition({
    steps: [
      {
        id: 'expensive',
        name: 'Expensive',
        checkpoint: true,
        run: async () => {
          executions += 1;
          return ok({ value: executions });
        },
      },
    ],
  });

  const first = new WorkflowRuntime({ checkpoints });
  first.register(base);
  const run = first.start('podcast', { topic: 'b' });
  await settle(20);

  // Validator rejects the stored output.
  const second = new WorkflowRuntime({ checkpoints });
  second.register({ ...base, validateCheckpoint: () => false });
  const rejected = second.start('podcast', { topic: 'b' }, { idempotencyKey: run.idempotencyKey, resume: true });
  await settle(20);
  assert.equal(second.get(rejected.id)?.status, 'succeeded');
  assert.equal(executions, 2, 'an untrusted checkpoint forces re-execution');

  // Checkpoint older than maxResumeAgeMs.
  const third = new WorkflowRuntime({ checkpoints });
  third.register({ ...base, recoveryPolicy: { ...base.recoveryPolicy, maxResumeAgeMs: -1 } });
  const stale = third.start('podcast', { topic: 'b' }, { idempotencyKey: run.idempotencyKey, resume: true });
  await settle(20);
  assert.equal(third.get(stale.id)?.status, 'succeeded');
  assert.equal(executions, 3, 'a stale checkpoint is never replayed');
});

test('T-23 compensating steps run in reverse order when a later step fails', async () => {
  const { runtime } = makeRuntime();
  const order: string[] = [];
  runtime.register(
    definition({
      steps: [
        {
          id: 'first',
          name: 'First',
          run: async () => ok({ a: 1 }),
          compensating: async () => {
            order.push('compensate:first');
            return ok();
          },
        },
        {
          id: 'second',
          name: 'Second',
          run: async () => ok({ b: 2 }),
          compensating: async () => {
            order.push('compensate:second');
            return ok();
          },
        },
        {
          id: 'third',
          name: 'Third',
          run: async () => {
            throw typedError('ENCODE_FAILED', false);
          },
        },
      ],
    }),
  );

  const run = runtime.start('podcast', {});
  await settle(30);
  assert.equal(runtime.get(run.id)?.status, 'failed');
  assert.deepEqual(order, ['compensate:second', 'compensate:first']);
});

/* ------------------------------------------------------------- lifecycle */

test('T-24 retry after failure creates a new run with attempt + 1', async () => {
  const { runtime } = makeRuntime();
  let attempts = 0;
  runtime.register(
    definition({
      steps: [
        {
          id: 'work',
          name: 'Work',
          run: async () => {
            attempts += 1;
            if (attempts === 1) throw typedError('RENDER_FAILED', false);
            return ok();
          },
        },
      ],
    }),
  );

  const first = runtime.start('podcast', {});
  await settle(20);
  assert.equal(runtime.get(first.id)?.status, 'failed');

  const second = runtime.retry(first.id);
  assert.ok(second);
  assert.notEqual(second.id, first.id);
  assert.equal(second.idempotencyKey, first.idempotencyKey);
  await settle(20);
  assert.equal(runtime.get(second.id)?.status, 'succeeded');
  assert.equal(runtime.get(first.id)?.status, 'failed', 'the failed run stays terminal');
  assert.equal(runtime.retry(second.id), null, 'a succeeded run cannot be retried');
  assert.equal(runtime.retry(first.id)?.idempotencyKey, first.idempotencyKey);
});

test('T-25 dispose cancels every in-flight run, even steps that ignore their signal', async () => {
  const { runtime } = makeRuntime();
  runtime.register(
    definition({
      timeoutPolicy: { runTimeoutMs: 60_000, graceMs: 5_000, stepTimeoutMs: 5_000 },
      steps: [{ id: 'work', name: 'Work', run: async () => { await delay(400); return ok(); } }],
    }),
  );
  const run = runtime.start('podcast', {});
  await settle();
  assert.equal(runtime.get(run.id)?.status, 'running');
  runtime.dispose();
  assert.equal(runtime.get(run.id)?.status, 'cancelled', 'shutdown must not leave a run "running"');
  await settle(420);
  assert.equal(runtime.get(run.id)?.status, 'cancelled');
});

test('T-26 events carry run identity, step and typed error codes', async () => {
  const { runtime, events, names } = makeRuntime();
  runtime.register(
    definition({
      steps: [
        {
          id: 'work',
          name: 'Work',
          run: async () => {
            throw typedError('MEDIA_DECODE_FAILED', false);
          },
        },
      ],
    }),
  );
  const run = runtime.start('podcast', {});
  await settle(20);

  assert.ok(names().includes('workflow.started'));
  assert.ok(names().includes('workflow.step_started'));
  assert.ok(names().includes('workflow.step_failed'));
  const failed = events.find((event) => event.event === 'workflow.step_failed');
  assert.equal(failed?.runId, run.id);
  assert.equal(failed?.stepId, 'work');
  assert.equal(failed?.workflowId, 'podcast');
  assert.equal(failed?.errorCode, 'MEDIA_DECODE_FAILED');
  assert.ok(events.every((event) => Number.isFinite(event.ts)));
});

test('T-27 starting an unregistered workflow throws a typed NOT_FOUND', () => {
  const { runtime } = makeRuntime();
  let caught: AppError | null = null;
  try {
    runtime.start('export', {});
  } catch (error) {
    caught = error as AppError;
  }
  assert.equal(caught?.code, 'NOT_FOUND');
  assert.equal(caught?.retryable, false);
});

test('T-28 cancelAll clears the whole runtime (page unload)', async () => {
  const { runtime } = makeRuntime();
  runtime.register(
    definition({
      steps: [{ id: 'work', name: 'Work', run: async (ctx) => { await delay(300, ctx.signal); return ok(); } }],
    }),
  );
  const runs = [runtime.start('podcast', { index: 1 }), runtime.start('podcast', { index: 2 })];
  await settle();
  assert.equal(runtime.cancelAll(), 2);
  await settle(40);
  for (const run of runs) assert.equal(runtime.get(run.id)?.status, 'cancelled');
});
