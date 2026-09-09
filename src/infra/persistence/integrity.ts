/**
 * Integrity primitives for persisted documents.
 *
 * Two things live here:
 *
 * 1. `canonicalJson` — a deterministic serialisation (recursive key sort,
 *    `undefined` dropped). Without it a checksum is not reproducible, because
 *    `JSON.stringify` order depends on insertion order.
 *
 * 2. `sha256Hex` — the document checksum. This is a CORRUPTION DETECTOR, not an
 *    authenticity signature: it proves the bytes we read back are the bytes we
 *    wrote (torn write, truncated value, tampered storage, half-migrated
 *    document). It does not prove who wrote them.
 */

/** Deterministic JSON: object keys sorted at every level, `undefined` dropped. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value instanceof Date) return value.toISOString();
  if (value && typeof value === 'object') {
    const source = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(source).sort()) {
      const entry = source[key];
      if (entry === undefined) continue;
      out[key] = sortValue(entry);
    }
    return out;
  }
  if (typeof value === 'number' && !Number.isFinite(value)) {
    // JSON.stringify already maps these to null; keep the checksum stable and explicit.
    return null;
  }
  return value;
}

/**
 * FNV-1a 64-bit — synchronous, dependency-free.
 * Fallback only, for runtimes without `crypto.subtle`; the document checksum is
 * SHA-256 wherever the WebCrypto API exists.
 */
export function fnv1a64(input: string): string {
  // 64-bit FNV offset basis / prime, computed with BigInt for exactness.
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const mask = 0xffffffffffffffffn;
  const bytes = new TextEncoder().encode(input);
  for (const byte of bytes) {
    hash ^= BigInt(byte);
    hash = (hash * prime) & mask;
  }
  return toHex(Number((hash >> 32n) & 0xffffffffn), 8) + toHex(Number(hash & 0xffffffffn), 8);
}

function toHex(value: number, length: number): string {
  const raw = (value >>> 0).toString(16);
  return raw.padStart(length, '0').slice(-length);
}

export type ChecksumAlgorithm = 'sha-256' | 'fnv1a-64';

export async function checksumOf(value: unknown): Promise<{ algorithm: ChecksumAlgorithm; checksum: string }> {
  const json = canonicalJson(value);
  const subtle = globalThis.crypto?.subtle;
  if (subtle && typeof subtle.digest === 'function') {
    const bytes = new TextEncoder().encode(json);
    const digest = await subtle.digest('SHA-256', bytes);
    return { algorithm: 'sha-256', checksum: bytesToHex(new Uint8Array(digest)) };
  }
  return { algorithm: 'fnv1a-64', checksum: fnv1a64(json) };
}

export async function verifyChecksum(
  value: unknown,
  expected: { algorithm: ChecksumAlgorithm; checksum: string },
): Promise<boolean> {
  const actual = await checksumOf(value);
  if (actual.algorithm !== expected.algorithm) return false;
  return timingSafeEqualHex(actual.checksum, expected.checksum);
}

function bytesToHex(bytes: Uint8Array): string {
  let out = '';
  for (const byte of bytes) out += (byte >>> 4).toString(16) + (byte & 0x0f).toString(16);
  return out;
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
