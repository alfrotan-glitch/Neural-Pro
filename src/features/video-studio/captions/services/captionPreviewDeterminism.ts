export function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function seededUnit(seed: number): number {
  let x = seed | 0;
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
  x ^= x >>> 16;
  return (x >>> 0) / 0x100000000;
}

export function confettiAngle(seedKey: string, index: number, count: number): number {
  const base = count > 0 ? (index / count) * Math.PI * 2 : 0;
  const jitter = (seededUnit(hashString(`${seedKey}:${index}:angle`)) - 0.5) * 0.4;
  return base + jitter;
}
