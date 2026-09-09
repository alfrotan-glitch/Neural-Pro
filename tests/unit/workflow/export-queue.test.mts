/**
 * Export queue — D-010 acceptance + WP-04 (ADR-011, R-014).
 *
 * Runs against the real `useExportStore` and the real `WorkflowRuntime`; only the
 * renderer and `createObjectUrl` are fakes. Node 22 provides Blob/URL/structuredClone.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { beforeEach } from 'node:test';

import { ExportQueueScheduler } from '../../../src/app/workflows/export/exportQueue.ts';
import { createExportWorkflow } from '../../../src/app/workflows/definitions/export.ts';
import { WorkflowRuntime } from '../../../src/app/workflows/runtime.ts';
import { useExportStore } from '../../../src/store/useExportStore.ts';
import type { ExportJob, ExportJobStatus, ExportProjectSnapshot } from '../../../src/features/video-studio/export/types/settings.ts';
import type { ExportRenderFunction } from '../../../src/app/workflows/definitions/export.ts';

const blobOf = (bytes = 8) => new Blob([new Uint8Array(bytes).fill(7)], { type: 'video/mp4' });
const settle = (ms = 10) => new Promise((resolve) => setTimeout(resolve, ms));

const snapshot = {
  projectId: 'p1',
  metadata: { name: 'demo', createdAt: 0, updatedAt: 0 },
  currentTime: 0,
  totalDuration: 0,
  tracks: [],
  selectedNodeIds: [],
  isPlaying: false,
  animations: [],
} as unknown as ExportProjectSnapshot;

function makeScheduler(options: { graceMs?: number; deps?: Record<string, unknown> } = {}) {
  const runtime = new WorkflowRuntime();
  if (options.graceMs !== undefined) {
    runtime.register({
      ...createExportWorkflow(),
      timeoutPolicy: { runTimeoutMs: 60_000, graceMs: options.graceMs },
    });
  }
  const queue = new ExportQueueScheduler({ runtime, deps: options.deps });
  return { runtime, queue };
}

function addJob(name: string): string {
  return useExportStore.getState().addJob(
    name,
    {
      resolution: '1080p',
      fps: 30,
      codec: 'H.264',
      quality: 'Balanced',
      audioBitrate: '192k',
      videoBitrate: 8_000_000,
      format: 'mp4',
    } as ExportJob['settings'],
    snapshot,
  );
}

const jobOf = (id: string): ExportJob => {
  const job = useExportStore.getState().jobs.find((candidate) => candidate.id === id);
  assert.ok(job, `job ${id} missing from the store`);
  return job;
};

const statuses = (): ExportJobStatus[] => useExportStore.getState().jobs.map((job) => job.status);

/** A renderer that reports progress, honours its signal and can be made to fail. */
function fakeRenderer(options: {
  failWith?: Error;
  ignoreSignal?: boolean;
  durationMs?: number;
  blob?: Blob;
  onStart?: () => void;
} = {}): ExportRenderFunction & { readonly calls: number; readonly observed: number[] } {
  const fn = Object.assign(
    async (job: ExportJob, signal: AbortSignal, onProgress: (progress: { percentage: number }) => void) => {
      fn.calls += 1;
      options.onStart?.();
      if (options.ignoreSignal) {
        await settle(options.durationMs ?? 300);
        if (options.failWith) throw options.failWith;
        return options.blob ?? blobOf();
      }
      const steps = options.durationMs ?? 30;
      for (let percent = 10; percent <= 100; percent += 10) {
        if (signal.aborted) break;
        await settle(steps / 10).catch(() => undefined);
        if (signal.aborted) break;
        fn.observed.push(percent);
        onProgress({ percentage: percent });
      }
      if (signal.aborted) throw Object.assign(new Error('aborted'), { name: 'AbortError' });
      if (options.failWith) throw options.failWith;
      return options.blob ?? blobOf();
    },
    { calls: 0, observed: [] as number[] },
  );
  return fn;
}

beforeEach(() => {
  useExportStore.getState().clearQueue();
});

/* ---------------------------------------------------------------- happy path */

test('E-01 a job runs to completion: status, progress and download URL', async () => {
  const { queue } = makeScheduler();
  const renderer = fakeRenderer({ durationMs: 20 });
  queue.registerRenderer(renderer);
  const id = addJob('Neural Pro Demo');

  const seen: ExportJobStatus[] = [];
  const off = useExportStore.subscribe((state) => {
    const status = state.jobs.find((job) => job.id === id)?.status;
    if (status && seen[seen.length - 1] !== status) seen.push(status);
  });

  const completed = await queue.enqueue(id);
  off();

  assert.equal(completed, true);
  assert.equal(renderer.calls, 1);
  const job = jobOf(id);
  assert.equal(job.status, 'completed');
  assert.equal(job.progress, 100);
  assert.ok(job.downloadUrl?.startsWith('blob:'), `expected a blob URL, got ${job.downloadUrl}`);
  assert.ok(job.endTime, 'a finished job records an end time');
  assert.equal(job.error, undefined);
  assert.ok(seen.includes('preparing'), `statuses: ${JSON.stringify(seen)}`);
  assert.ok(seen.includes('rendering'), `statuses: ${JSON.stringify(seen)}`);
  assert.equal(seen[seen.length - 1], 'completed');
  queue.dispose();
});

test('E-02 enqueue is idempotent: one run, one render, both callers settle', async () => {
  const { queue, runtime } = makeScheduler();
  const renderer = fakeRenderer({ durationMs: 40 });
  queue.registerRenderer(renderer);
  const id = addJob('Double click');

  const [first, second] = await Promise.all([queue.enqueue(id), queue.enqueue(id)]);
  assert.equal(first, true);
  assert.equal(second, true, 'the second caller settles too - no orphaned promise');
  assert.equal(renderer.calls, 1, 'exactly one render for one job');
  assert.equal(runtime.list('export').length, 1);
  queue.dispose();
});

/* ------------------------------------------------------------- cancellation */

test('E-03 D-010 case 1: cancelling a queued job means the renderer never runs', async () => {
  const { queue } = makeScheduler();
  let started = 0;
  const blocker = fakeRenderer({ durationMs: 60, onStart: () => { started += 1; } });
  queue.registerRenderer(blocker);

  const first = addJob('Running');
  const second = addJob('Queued');

  const firstPromise = queue.enqueue(first);
  await settle();
  assert.equal(started, 1);

  assert.equal(queue.cancel(second), true);
  assert.equal(jobOf(second).status, 'cancelled', 'the queued job is terminal immediately');

  const secondPromise = queue.enqueue(second);
  assert.equal(await secondPromise, false, 'a cancelled job cannot be dispatched');
  assert.equal(started, 1, 'the renderer was never called for the cancelled job');

  assert.equal(await firstPromise, true);
  assert.equal(jobOf(first).status, 'completed');
  assert.equal(jobOf(second).status, 'cancelled', 'the completed neighbour did not resurrect it');
  queue.dispose();
});

test('E-04 D-010 case 2: cancelling a running job aborts the render and leaves a terminal status', async () => {
  const { queue } = makeScheduler();
  let observedAbort = false;
  const renderer: ExportRenderFunction = async (_job, signal) => {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(resolve, 5_000);
      signal.addEventListener('abort', () => {
        observedAbort = true;
        clearTimeout(timer);
        reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
      });
    });
    return blobOf();
  };
  queue.registerRenderer(renderer);
  const id = addJob('Cancelled mid-render');

  const promise = queue.enqueue(id);
  await settle();
  assert.equal(jobOf(id).status, 'rendering');

  assert.equal(queue.cancel(id), true);
  const completed = await promise;
  await settle(20);

  assert.equal(completed, false, 'a cancelled export does not report success');
  assert.equal(observedAbort, true, 'the renderer received the abort');
  assert.equal(jobOf(id).status, 'cancelled', 'the store never keeps a cancelled job in `rendering`');
  assert.notEqual(jobOf(id).status, 'rendering');
  assert.equal(queue.cancel(id), false, 'cancelling twice is a no-op');
  queue.dispose();
});

test('E-05 a renderer that ignores its signal is still terminalised by the grace timer', async () => {
  const { queue } = makeScheduler({ graceMs: 20 });
  const renderer = fakeRenderer({ ignoreSignal: true, durationMs: 400 });
  queue.registerRenderer(renderer);
  const id = addJob('Stubborn renderer');

  const promise = queue.enqueue(id);
  await settle();
  queue.cancel(id);
  await settle(60);

  assert.equal(jobOf(id).status, 'cancelled');
  assert.equal(await promise, false);
  queue.dispose();
});

test('E-06 a renderer failure is a real failure and the queue keeps draining', async () => {
  const { queue } = makeScheduler();
  let calls = 0;
  const renderer: ExportRenderFunction = async (_job, signal, onProgress) => {
    calls += 1;
    await settle(20);
    if (signal.aborted) throw new Error('aborted');
    if (calls === 1) throw new Error('GPU context lost');
    onProgress({ percentage: 100 });
    return blobOf();
  };
  queue.registerRenderer(renderer);

  const broken = addJob('Broken');
  const healthy = addJob('Healthy');

  const firstPromise = queue.enqueue(broken);
  await settle(40);
  const secondPromise = queue.enqueue(healthy);

  assert.equal(await firstPromise, false);
  assert.equal(await secondPromise, true);
  assert.equal(jobOf(broken).status, 'failed');
  assert.equal(jobOf(broken).error, 'GPU context lost', 'the real error reaches the user');
  assert.equal(jobOf(healthy).status, 'completed', 'the queue drains after a failure');
  queue.dispose();
});

test('E-07 a renderer that hands back nothing usable fails the job', async () => {
  const { queue } = makeScheduler();
  queue.registerRenderer((async () => undefined) as unknown as ExportRenderFunction);
  const id = addJob('No output');

  assert.equal(await queue.enqueue(id), false);
  assert.equal(jobOf(id).status, 'failed', 'a fabricated success is impossible');
  assert.match(jobOf(id).error ?? '', /no video data/i);
  queue.dispose();
});

test('E-07b a zero-length render is delivered but reported, never silent', async () => {
  const { queue } = makeScheduler();
  queue.registerRenderer(fakeRenderer({ blob: new Blob([]), durationMs: 20 }));
  const id = addJob('Empty output');

  assert.equal(await queue.enqueue(id), true, 'AS-INV-14 is about delivery honesty, not content policy');
  assert.equal(jobOf(id).status, 'completed');
  assert.ok(
    queue.getLogs().some((line) => line.includes('empty file')),
    `the empty output must stay observable: ${queue.getLogs().join(' | ')}`,
  );
  queue.dispose();
});

test('E-08 a delivery failure is a failure, never a silent success', async () => {
  const { queue } = makeScheduler({
    deps: {
      createObjectUrl: () => {
        throw new Error('no object URL support');
      },
    },
  });
  queue.registerRenderer(fakeRenderer({ durationMs: 20 }));
  const id = addJob('Undeliverable');

  assert.equal(await queue.enqueue(id), false);
  const job = jobOf(id);
  assert.equal(job.status, 'failed');
  assert.equal(job.downloadUrl, undefined);
  assert.match(job.error ?? '', /could not be delivered/i);
  queue.dispose();
});

test('E-09 no registered renderer fails the job instead of pretending', async () => {
  const { queue, runtime } = makeScheduler();
  const id = addJob('No renderer');

  assert.equal(await queue.enqueue(id), false);
  assert.equal(jobOf(id).status, 'failed');
  assert.match(jobOf(id).error ?? '', /No production export renderer/i);
  assert.equal(runtime.list('export').length, 0, 'no run was created');
  queue.dispose();
});

test('E-10 an unknown job id resolves false without touching the store', async () => {
  const { queue } = makeScheduler();
  queue.registerRenderer(fakeRenderer());
  assert.equal(await queue.enqueue('job_does_not_exist'), false);
  queue.dispose();
});

/* --------------------------------------------------------------- sequencing */

test('E-11 exports run serially (maxConcurrent 1) in FIFO order', async () => {
  const { queue, runtime } = makeScheduler();
  let active = 0;
  let peak = 0;
  const order: string[] = [];
  const renderer: ExportRenderFunction = async (job, signal, onProgress) => {
    active += 1;
    peak = Math.max(peak, active);
    order.push(job.projectName);
    await settle(20);
    onProgress({ percentage: 50 });
    if (signal.aborted) throw new Error('aborted');
    active -= 1;
    return blobOf();
  };
  queue.registerRenderer(renderer);

  const first = addJob('First');
  const second = addJob('Second');
  const third = addJob('Third');

  const results = await Promise.all([queue.enqueue(first), queue.enqueue(second), queue.enqueue(third)]);
  assert.deepEqual(results, [true, true, true]);
  assert.equal(peak, 1, 'never two renders at once');
  assert.deepEqual(order, ['First', 'Second', 'Third'], 'oldest job first');
  assert.deepEqual(statuses(), ['completed', 'completed', 'completed']);
  assert.equal(runtime.list('export').length, 3);
  queue.dispose();
});

test('E-12 pause stops automatic dispatch; resume starts the oldest waiting job', async () => {
  const { queue } = makeScheduler();
  const renderer = fakeRenderer({ durationMs: 20 });
  queue.registerRenderer(renderer);
  const id = addJob('Paused');

  queue.pause();
  assert.equal(queue.isPaused, true);
  queue.pumpWaiting();
  await settle(30);
  assert.equal(renderer.calls, 0, 'a paused queue does not auto-dispatch');
  assert.equal(jobOf(id).status, 'waiting');

  queue.resume();
  await settle(60);
  assert.equal(renderer.calls, 1, 'resume dispatches without polling');
  assert.equal(jobOf(id).status, 'completed');
  queue.dispose();
});

test('E-13 retry starts a new attempt and completes', async () => {
  const { queue, runtime } = makeScheduler();
  let attempts = 0;
  const renderer: ExportRenderFunction = async (_job, signal, onProgress) => {
    attempts += 1;
    await settle(20);
    if (signal.aborted) throw new Error('aborted');
    if (attempts === 1) throw new Error('first attempt fails');
    onProgress({ percentage: 100 });
    return blobOf();
  };
  queue.registerRenderer(renderer);
  const id = addJob('Retried');

  assert.equal(await queue.enqueue(id), false);
  assert.equal(jobOf(id).status, 'failed');

  const retried = queue.retry(id);
  assert.ok(retried, 'a failed job can be retried');
  assert.equal(await retried, true);
  assert.equal(attempts, 2);
  assert.equal(jobOf(id).status, 'completed');
  assert.equal(runtime.list('export').length, 2, 'retry is a NEW run, not a resurrected one');
  assert.deepEqual(
    runtime.list('export').map((run) => run.attempt),
    [1, 2],
  );
  assert.equal(queue.retry(id), null, 'a completed job cannot be retried');
  queue.dispose();
});

test('E-14 remove cancels the run and drops the job; clearQueue does both for all jobs', async () => {
  const { queue } = makeScheduler();
  queue.registerRenderer(fakeRenderer({ durationMs: 60 }));
  const running = addJob('Running');
  const waiting = addJob('Waiting');

  const promise = queue.enqueue(running);
  queue.enqueue(waiting);
  await settle();

  queue.remove(running);
  assert.equal(await promise, false);
  assert.equal(useExportStore.getState().jobs.some((job) => job.id === running), false);
  await settle(40);
  // The queue advances on the terminal transition: the waiting job took the slot.
  assert.notEqual(jobOf(waiting).status, 'waiting', 'cancelling the head lets the next job start');

  queue.clearQueue();
  await settle(40);
  assert.deepEqual(useExportStore.getState().jobs, []);
  queue.dispose();
});

/* ------------------------------------------------------------ single writer */

test('E-15 the export store exposes no status-writing intents of its own', () => {
  const store = useExportStore.getState() as Record<string, unknown>;
  // ADR-011: the scheduler is the only component that writes run-derived status.
  for (const forbidden of ['cancelJob', 'startExport', 'runExport', 'processQueue']) {
    assert.equal(typeof store[forbidden], 'undefined', `${forbidden} must not exist on the store`);
  }
  assert.equal(typeof store.updateJob, 'function');
  assert.equal(typeof store.retryJob, 'function');
});

test('E-16 progress mirroring is monotonic and capped below 100 until delivery', async () => {
  const { queue } = makeScheduler();
  const renderer = fakeRenderer({ durationMs: 40 });
  queue.registerRenderer(renderer);
  const id = addJob('Progress');

  const seen: { status: ExportJobStatus; progress: number }[] = [];
  const off = useExportStore.subscribe((state) => {
    const job = state.jobs.find((candidate) => candidate.id === id);
    if (job) seen.push({ status: job.status, progress: job.progress });
  });

  assert.equal(await queue.enqueue(id), true);
  off();

  const values = seen.map((entry) => entry.progress);
  for (let i = 1; i < values.length; i += 1) {
    assert.ok((values[i] ?? 0) >= (values[i - 1] ?? 0), `progress went backwards: ${JSON.stringify(values)}`);
  }
  assert.equal(seen[seen.length - 1]?.progress, 100);
  // The invariant that matters: 100% only ever appears on a completed job, so the
  // UI can never show a finished-looking export that has not finished.
  for (const entry of seen) {
    if (entry.progress === 100) {
      assert.equal(entry.status, 'completed', `100% with status ${entry.status}: ${JSON.stringify(seen)}`);
    }
  }
  assert.ok(values.some((value) => value > 0 && value < 100), `expected intermediate progress: ${JSON.stringify(values)}`);
  queue.dispose();
});

test('E-17 export logs are observable and bounded', async () => {
  const { queue } = makeScheduler();
  queue.registerRenderer(fakeRenderer({ durationMs: 20 }));
  const received: string[][] = [];
  const off = queue.subscribeLogs((logs) => received.push(logs));
  const id = addJob('Logged');
  await queue.enqueue(id);
  off();

  const logs = queue.getLogs();
  assert.ok(logs.length > 0);
  assert.ok(logs.some((line) => line.includes('[PIPELINE]')));
  assert.ok(logs.some((line) => line.includes('completed successfully')));
  assert.ok(received.length > 1, 'log subscribers are notified');
  queue.clearLogs();
  assert.deepEqual(queue.getLogs(), []);
  queue.dispose();
});
