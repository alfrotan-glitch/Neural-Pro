/**
 * Deterministic waveform placeholder.
 *
 * Persisted state must be a pure function of its inputs (persistence contract
 * R5). The audio waveform preview used to be filled with `Math.random()`, which
 * meant every save wrote different bytes for the same clip — non-reproducible
 * documents, unstable checksums and a timeline that "changed" on reload.
 *
 * This derives the same shape from a stable seed (the clip id) instead. It is
 * still a placeholder — the real signal comes from decoding the audio — but it
 * is now reproducible, which is what persistence requires.
 */

function hashSeed(seed: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/** Small, fast, deterministic PRNG (mulberry32). */
function nextRandom(state: { value: number }): number {
  state.value = (state.value + 0x6d2b79f5) >>> 0;
  let t = state.value;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function createDeterministicWaveform(
  seed: string,
  samples: number,
  min: number = 10,
  max: number = 40,
): number[] {
  const state = { value: hashSeed(seed) };
  const span = Math.max(1, max - min);
  return Array.from({ length: Math.max(0, samples) }, () => min + Math.floor(nextRandom(state) * span));
}
