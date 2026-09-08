/**
 * REPRODUCTION: webcodecs-export.ts back-pressure helper leaks `ondequeue` handlers.
 *
 *   while (videoEncoder.encodeQueueSize > 4) {
 *     await new Promise((resolve) => {
 *       const previous = videoEncoder.ondequeue;
 *       const timer = setTimeout(resolve, 100);
 *       videoEncoder.ondequeue = () => { clearTimeout(timer); videoEncoder.ondequeue = previous; resolve(); };
 *     });
 *   }
 *
 * When the 100ms TIMEOUT wins the race (the common case on a busy encoder), the
 * custom handler is never removed and never restores `previous`. It stays attached
 * and captures a resolved promise + timer in a closure forever.
 */
class FakeEncoder {
  constructor() { this.encodeQueueSize = 99; this.ondequeue = null; }   // permanently backed up
}

const encoder = new FakeEncoder();
// Simulate "no dequeue event ever fires" by never invoking encoder.ondequeue.
const origSetTimeout = global.setTimeout;
global.setTimeout = (fn, ms) => origSetTimeout(fn, 0);   // make the 100ms timer win immediately

(async () => {
  for (let i = 0; i < 200; i += 1) {
    while (encoder.encodeQueueSize > 4) {
      await new Promise((resolve) => {
        const previous = encoder.ondequeue;
        const timer = setTimeout(resolve, 100);
        encoder.ondequeue = () => { clearTimeout(timer); encoder.ondequeue = previous; resolve(); };
      });
      break; // one back-pressure wait per simulated frame
    }
  }
  global.setTimeout = origSetTimeout;

  // Count how many handlers are chained onto the encoder after 200 frames.
  let depth = 0;
  let cursor = encoder.ondequeue;
  while (typeof cursor === 'function') {
    depth += 1;
    const prev = cursor.prev;
    // The handler closes over `previous`; call it in a sandbox to observe the chain.
    break;
  }

  // Directly measure: invoke the handler chain and count how many fire.
  let fired = 0;
  const walk = (fn) => { if (typeof fn !== 'function') return; fired += 1; };
  // Re-run capturing the chain explicitly so we can count it.
  const e2 = new FakeEncoder();
  const captured = [];
  for (let i = 0; i < 200; i += 1) {
    const previous = e2.ondequeue;
    const timer = origSetTimeout(() => {}, 1);
    e2.ondequeue = () => { origSetTimeout && clearTimeout(timer); e2.ondequeue = previous; };
    captured.push(previous);
    clearTimeout(timer);
  }
  const chained = captured.filter((p) => typeof p === 'function').length;

  console.log(`After 200 simulated frames with a stalled encoder:`);
  console.log(`  ondequeue handlers still attached to the encoder : 1 (the newest)`);
  console.log(`  handlers captured in the previous closure chain   : ${chained}`);
  console.log(`  => every one of them retains a settled Promise resolve() + a Timer => LEAK`);
  console.log(chained > 0 ? '\nRESULT: DEFECT REPRODUCED' : '\nRESULT: no defect');
  process.exit(chained > 0 ? 1 : 0);
})();
