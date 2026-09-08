/**
 * REPRODUCTION: RenderPipeline queue / cancellation defects.
 * Exercises the real class with the real zustand export store.
 */
import { RenderPipeline } from '../src/core/engine/RenderPipeline';
import { useExportStore } from '../src/store/useExportStore';
import type { ExportJob } from '../src/store/useExportStore';

const pipeline = RenderPipeline.getInstance();
const store = () => useExportStore.getState();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const snapshot = {
  projectId: 'p', metadata: { title: 't', resolution: { width: 1920, height: 1080 }, fps: 30 },
  currentTime: 0, totalDuration: 10, tracks: [], selectedNodeIds: [], isPlaying: false,
} as any;
const settings = {
  resolution: '1080p', fps: 30, codec: 'H.264', quality: 'Balanced',
  audioBitrate: '192k', videoBitrate: 8_000_000, format: 'mp4',
} as ExportJob['settings'];

let started: string[] = [];
const pending = new Map<string, { resolve: (b: Blob) => void; reject: (e: Error) => void }>();

const unregister = pipeline.registerRenderer(async (job) => {
  started.push(job.projectName);
  return new Promise<Blob>((resolve, reject) => { pending.set(job.projectName, { resolve, reject }); });
});

const newJob = (name: string) => store().addJob(name, settings, snapshot);
const statusOf = (id: string) => store().jobs.find((j) => j.id === id)!.status;
const idFor = (name: string) => store().jobs.find((j) => j.projectName === name)!.id;

let defects = 0;
const check = (ok: boolean, msg: string) => { console.log(`   => ${ok ? 'ok: ' : 'DEFECT: '}${msg}`); if (!ok) defects += 1; };

(async () => {
  // =========================================================================
  // CASE 1: cancel a QUEUED (not yet executing) job.
  // cancelJob() finds no AbortController, so it only deletes the run token;
  // executeJob() immediately re-creates it with bumpRunToken() -> job runs anyway.
  // =========================================================================
  console.log('--- CASE 1: cancel a job that is QUEUED but not yet executing ---');
  const idA = newJob('A');
  const idB = newJob('B');
  void pipeline.renderJob(idA);
  await sleep(30);                 // A is executing, B is queued
  void pipeline.renderJob(idB);
  await sleep(5);
  pipeline.cancelJob(idB);
  console.log(`   B status right after cancel = ${statusOf(idB)}`);
  pending.get('A')!.resolve(new Blob([]));   // let A finish so B's turn arrives
  await sleep(60);
  const bRan = started.includes('B');
  console.log(`   jobs that actually reached the renderer: [${started.join(', ')}]`);
  check(!bRan, `cancelled queued job B should NOT have executed (it did: ${bRan})`);

  // =========================================================================
  // CASE 2: cancel a RUNNING job. Pipeline bumps the run token BEFORE aborting,
  // so the catch block's `if (!isCurrentRun(...)) return false` short-circuits and
  // the job status is never written -> job is stuck in "rendering" forever.
  // =========================================================================
  // Drain the still-executing cancelled job B so the queue tail is free again.
  if (pending.has('B')) pending.get('B')!.resolve(new Blob([]));
  await sleep(60);

  console.log('\n--- CASE 2: cancel a job that is RUNNING ---');
  const idC = newJob('C');
  void pipeline.renderJob(idC);
  await sleep(40);
  console.log(`   C status before cancel = ${statusOf(idC)}`);
  pipeline.cancelJob(idC);
  pending.get('C')!.reject(new Error('cancelled'));
  await sleep(60);
  console.log(`   C status after cancel  = ${statusOf(idC)}`);
  check(statusOf(idC) !== 'rendering', `cancelled job should not stay "rendering" (status=${statusOf(idC)})`);

  // =========================================================================
  // CASE 3: two jobs started back-to-back. The component-side renderer is driven by
  // a React `[isExporting]` effect and only ONE resolver is matched per signal, but
  // the pipeline serialises, so re-verify the pipeline can drain more than one job.
  // =========================================================================
  console.log('\n--- CASE 3: sequential drain of the queue ---');
  started = [];
  const idD = newJob('D');
  const idE = newJob('E');
  const d = pipeline.renderJob(idD);
  const e = pipeline.renderJob(idE);
  await sleep(30);
  pending.get('D')!.resolve(new Blob([]));
  await Promise.race([d, sleep(200)]);
  console.log(`   after D resolved, renderer saw: [${started.join(', ')}]`);
  if (pending.has('E')) pending.get('E')!.resolve(new Blob([]));
  await Promise.race([e, sleep(300)]);
  console.log(`   final statuses: D=${statusOf(idD)} E=${statusOf(idE)}`);
  check(statusOf(idD) === 'completed' && statusOf(idE) === 'completed', 'both queued jobs should complete');

  unregister();
  console.log(`\nDefects reproduced: ${defects}`);
  if (defects > 0) { console.log('RESULT: DEFECT REPRODUCED'); process.exit(1); }
  console.log('RESULT: no defect');
})();
