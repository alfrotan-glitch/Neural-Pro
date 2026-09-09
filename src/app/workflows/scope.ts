/**
 * RunScope — resource ownership (contracts/workflows.md §8).
 *
 * A run owns every resource it creates. `disposeAll()` runs on **every**
 * terminal transition, including cancellation and expiry, and a failing disposer
 * never prevents the others from running.
 */
import type { RunScope } from './types';

export interface ScopeOptions {
  readonly onError?: (error: unknown, index: number) => void;
}

export function createRunScope(options: ScopeOptions = {}): RunScope & { readonly size: number } {
  const disposers: (() => void | Promise<void>)[] = [];
  let disposed = false;

  return {
    get size() {
      return disposers.length;
    },
    add(disposer) {
      if (disposed) {
        // Resources acquired after teardown would leak: release immediately.
        void Promise.resolve()
          .then(disposer)
          .catch((error) => options.onError?.(error, -1));
        return;
      }
      disposers.push(disposer);
    },
    async disposeAll() {
      if (disposed) return;
      disposed = true;
      const pending = disposers.splice(0, disposers.length);
      // Release newest-first so dependent resources go before their owners.
      for (let index = pending.length - 1; index >= 0; index -= 1) {
        const disposer = pending[index];
        if (!disposer) continue;
        try {
          await disposer();
        } catch (error) {
          options.onError?.(error, index);
        }
      }
    },
  };
}
