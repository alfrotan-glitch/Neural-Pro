/**
 * REPRODUCTION / REGRESSION TEST: webcodecs-export.ts back-pressure helper leaks `ondequeue` handlers.
 *
 * Verifies that waitForEncoderQueue cleans up timeout and event listeners deterministically
 * without accumulating closures or leaking memory when an encoder is stalled.
 */
class FakeEncoder {
  constructor() {
    this.encodeQueueSize = 5; // backed up
    this.ondequeue = null;
  }
}

(async () => {
  const { waitForEncoderQueue } = await import('../src/lib/webcodecs-export.js');
  const encoder = new FakeEncoder();
  const origSetTimeout = global.setTimeout;
  global.setTimeout = (fn, ms) => origSetTimeout(fn, 0);

  const captured = [];
  for (let i = 0; i < 200; i += 1) {
    encoder.encodeQueueSize = 5;
    const waitPromise = waitForEncoderQueue(encoder, 4);
    // After one timeout tick, simulate queue drain
    await new Promise((r) => origSetTimeout(() => {
      encoder.encodeQueueSize = 4;
      r();
    }, 1));
    await waitPromise;
    captured.push(encoder.ondequeue);
  }
  global.setTimeout = origSetTimeout;

  const attached = encoder.ondequeue !== null;
  const chained = captured.filter((p) => typeof p === 'function').length;

  console.log(`After 200 simulated frames with a stalled encoder:`);
  console.log(`  ondequeue handlers still attached to the encoder : ${attached ? 1 : 0}`);
  console.log(`  handlers captured in the previous closure chain   : ${chained}`);

  if (chained > 0 || attached) {
    console.log('\nRESULT: DEFECT REPRODUCED');
    process.exit(1);
  }
  console.log('\nRESULT: no defect');
  process.exit(0);
})();
