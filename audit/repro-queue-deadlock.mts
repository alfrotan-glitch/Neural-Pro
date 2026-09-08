/**
 * REPRODUCTION: export queue authority conflicts.
 *
 * Three authorities dispatch RenderPipeline.renderJob():
 *   A1  VideoStudioPro.beginExport()          -> void renderPipeline.renderJob(id)
 *   A2  RenderPipeline.executionTail          -> internal serialisation
 *   A3  ExportQueueManager setInterval(1500)  -> re-dispatches every 'waiting' job
 *
 * HYPOTHESIS 1 (NOT CONFIRMED): a simple duplicate dispatch deadlocks the queue.
 *   -> Disproved: `executeJob` guards with `job.status !== 'waiting'`, so a duplicate
 *      arriving after the status flip is absorbed.
 *
 * HYPOTHESIS 2 (TESTED HERE): a duplicate dispatch that lands INSIDE the window between
 *   status='waiting' and the renderer actually starting causes `bumpRunToken()` on the
 *   second dispatch to invalidate the first run's token. The first run then returns false
 *   from `isCurrentRun` and never writes a terminal status, and because the job is no
 *   longer 'waiting' the poller will never re-dispatch it -> PERMANENT STALL.
 *
 * HYPOTHESIS 3 (TESTED HERE): "parallel" process mode dispatches N jobs at once, but
 *   VideoStudioPro can only execute one (single isExporting flag / single signal ref),
 *   so N-1 jobs hang forever.
 */
import { RenderPipeline } from '../src/core/engine/RenderPipeline';
import { useExportStore } from '../src/store/useExportStore';
import type { ExportJob } from '../src/store/useExportStore';

const store = () => useExportStore.getState();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const snapshot = {
  projectId: 'p', metadata: { title: 't', resolution: { width: 1920, height: 1080 }, fps: 30 },
  currentTime: 0, totalDuration: 10, tracks: [], selectedNodeIds: [], isPlaying: false,
} as any;
const settings = { resolution: '1080p', fps: 30, codec: 'H.264', quality: 'Balanced',
  audioBitrate: '192k', videoBitrate: 8_000_000, format: 'mp4' } as ExportJob['settings'];

const statusOf = (name: string) => store().jobs.find((j) => j.projectName === name)!.status;

let defects = 0;
const check = (ok: boolean, msg: string) => { console.log(`   => ${ok ? 'ok: ' : 'DEFECT: '}${msg}`); if (!ok) defects += 1; };

(async () => {
  // -------------------------------------------------------------------------
  // H2: duplicate dispatch inside the waiting->rendering window
  // -------------------------------------------------------------------------
  console.log('--- H2: duplicate dispatch inside the waiting -> rendering window ---');
  {
    const pipeline = RenderPipeline.getInstance();
    let started = 0;
    const pending = new Map<string, (b: Blob) => void>();
    const un = pipeline.registerRenderer(async (job) => {
      started += 1;
      return new Promise<Blob>((resolve) => pending.set(job.projectName, resolve));
    });

    const idA = store().addJob('H2', settings, snapshot);
    void pipeline.renderJob(idA);
    // Poller tick lands before the renderer's status write is observable:
    await sleep(0);
    void pipeline.renderJob(idA);
    await sleep(40);
    console.log(`   renderer invocations: ${started}   status: ${statusOf('H2')}`);
    pending.get('H2')?.(new Blob([]));
    await sleep(60);
    console.log(`   after resolve        status: ${statusOf('H2')}`);
    check(statusOf('H2') === 'completed',
      `job should reach a terminal state (status=${statusOf('H2')}); a stalled job is never re-dispatched because it is no longer 'waiting'`);
    un();
  }

  // -------------------------------------------------------------------------
  // H3: parallel process mode — N jobs dispatched at once, only one can run
  // -------------------------------------------------------------------------
  console.log('\n--- H3: "parallel" mode — N jobs dispatched, one execution slot ---');
  {
    const pipeline = RenderPipeline.getInstance();
    let isExporting = false;
    let activeSignal: AbortSignal | null = null;
    const resolvers = new Map<string, { resolve: (b: Blob) => void; signal: AbortSignal }>();
    const un = pipeline.registerRenderer(async (job, signal) => {
      activeSignal = signal;
      const was = isExporting;
      isExporting = true;
      return new Promise<Blob>((resolve) => {
        resolvers.set(job.projectName, { resolve, signal });
        if (!was) void (async () => {                 // useEffect([isExporting]) body
          await sleep(30);
          for (const [n, e] of [...resolvers]) {
            if (e.signal === activeSignal) { e.resolve(new Blob([])); resolvers.delete(n); }
          }
          isExporting = false;                        // effect does NOT re-run
        })();
      });
    });

    const idP = store().addJob('P1', settings, snapshot);
    const idQ = store().addJob('P2', settings, snapshot);
    // ExportQueueManager "parallel" branch: Promise.all(waiting.map(renderJob))
    await Promise.all([pipeline.renderJob(idP), pipeline.renderJob(idQ)]).catch(() => {});
    await sleep(500);
    console.log(`   P1 status: ${statusOf('P1')}   P2 status: ${statusOf('P2')}`);
    console.log(`   unresolved renderer promises: [${[...resolvers.keys()].join(', ')}]`);
    check(statusOf('P1') === 'completed' && statusOf('P2') === 'completed',
      'both parallel-dispatched jobs should complete; a single execution slot cannot service them');
    un();
  }

  console.log(`\nDefects reproduced: ${defects}`);
  if (defects > 0) { console.log('RESULT: DEFECT REPRODUCED'); process.exit(1); }
  console.log('RESULT: no defect');
})();
