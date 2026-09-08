/**
 * Minimal deterministic test harness for the canonical core.
 *
 * No framework, no globals, no random ordering: every suite is a pure function
 * that returns its results, and the runner reports them in declaration order.
 */

export interface CheckResult {
  readonly suite: string;
  readonly name: string;
  readonly ok: boolean;
  readonly error?: string;
}

export class CheckFailure extends Error {}

export function check(condition: boolean, message: string): void {
  if (!condition) throw new CheckFailure(message);
}

export function equal(actual: unknown, expected: unknown, message: string): void {
  if (!Object.is(actual, expected)) {
    throw new CheckFailure(`${message}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

export function deepEqual(actual: unknown, expected: unknown, message: string): void {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) throw new CheckFailure(`${message}: expected ${b}, received ${a}`);
}

export function close(actual: number, expected: number, message: string, epsilon = 1e-9): void {
  if (!Number.isFinite(actual) || Math.abs(actual - expected) > epsilon) {
    throw new CheckFailure(`${message}: expected ~${expected}, received ${actual}`);
  }
}

export function throws(fn: () => unknown, message: string): void {
  let threw = false;
  try {
    fn();
  } catch {
    threw = true;
  }
  if (!threw) throw new CheckFailure(`${message}: expected a throw, none occurred`);
}

export interface Suite {
  readonly name: string;
  readonly run: () => void;
}

export function suite(name: string, run: () => void): Suite {
  return { name, run };
}

export function runSuites(suites: readonly Suite[]): CheckResult[] {
  const results: CheckResult[] = [];
  for (const s of suites) {
    try {
      s.run();
      results.push({ suite: s.name, name: 'suite', ok: true });
    } catch (error) {
      results.push({
        suite: s.name,
        name: 'suite',
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return results;
}
