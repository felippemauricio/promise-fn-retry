import { abortError, isBailError } from './errors';
import { attemptOnce } from './internal/attempt';
import { planWait } from './internal/backoff';
import { resolveOptions } from './internal/options';
import { delay } from './internal/timers';
import type { OperationFn, Options, ResolvedOptions } from './types';

type Outcome<T> = { ok: true; value: T } | { ok: false; error: unknown; aborted: boolean };

/**
 * Runs one attempt and captures how it settled, so the loop can branch on it.
 * Whether the signal had aborted is read the moment the attempt fails, so an
 * abort that lands while the loop resumes cannot take the error's place.
 */
const settle = <T>(requestFn: OperationFn<T>, resolved: ResolvedOptions): Promise<Outcome<T>> =>
  attemptOnce(requestFn, resolved).then(
    (value): Outcome<T> => ({ ok: true, value }),
    (error: unknown): Outcome<T> => ({
      ok: false,
      error,
      aborted: resolved.signal?.aborted === true,
    }),
  );

/**
 * The retry loop, working on already-resolved options. It is a loop rather than
 * recursion so a long `forever` run holds only the current state, not every
 * attempt before it.
 */
const run = async <T>(requestFn: OperationFn<T>, options: ResolvedOptions): Promise<T> => {
  let resolved = options;
  for (;;) {
    const { signal, shouldRetry, until, times, retained, forever } = resolved;
    if (signal?.aborted) throw abortError(signal);
    const canRetry = forever || retained < times;
    const outcome = await settle(requestFn, resolved);

    if (outcome.ok) {
      // Poll: a resolved value that fails `until` is treated as worth retrying.
      if (!until || until(outcome.value) || !canRetry) return outcome.value;
    } else {
      const { error, aborted } = outcome;
      if (isBailError(error)) throw error.cause;
      if (aborted) throw abortError(signal as AbortSignal);
      if (!canRetry || (shouldRetry && !shouldRetry(error))) throw error;
    }

    const error = outcome.ok ? undefined : outcome.error;
    const plan = planWait(resolved, error);
    if (!plan) {
      if (outcome.ok) return outcome.value;
      throw error;
    }

    await delay(plan.wait, signal);
    if (resolved.onRetry) resolved.onRetry(error, resolved);
    // Object.assign, not spread: spread compiles to an ES2017 helper.
    resolved = Object.assign({}, resolved, { retained: retained + 1, currentDelay: plan.base });
  }
};

/**
 * Calls `requestFn` and retries it while it fails, with exponential backoff. Resolves
 * with the first value it produces, or rejects with the last error once the retries,
 * the time budget or the `signal` run out.
 */
export function retry<T>(requestFn: OperationFn<T>, options: Options = {}): Promise<T> {
  return run(requestFn, resolveOptions(options));
}

export default retry;
