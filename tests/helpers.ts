import { vi } from 'vitest';

export const success = 'ok';
export const fail = 'fail';

/**
 * An operation that rejects with `fail` for its first `failures` attempts, then
 * resolves with `success`. Records the (fake) time each attempt started, so tests
 * can assert the waits between attempts rather than how they were scheduled.
 */
export const flaky = (failures: number) => {
  const startedAt: number[] = [];
  const fn = vi.fn<(attempt: number, signal?: AbortSignal) => Promise<string>>(() => {
    startedAt.push(Date.now());
    return startedAt.length <= failures ? Promise.reject(fail) : Promise.resolve(success);
  });
  /** The wait before each retry, in ms. */
  const waits = (): number[] => startedAt.slice(1).map((t, i) => t - startedAt[i]!);
  return { fn, startedAt, waits };
};

/** An operation that never succeeds. */
export const alwaysFails = () => flaky(Infinity);

/** An operation that never settles. */
export const hang = (): Promise<never> => new Promise<never>(() => {});

export type Settled<T> =
  { status: 'fulfilled'; value: T } | { status: 'rejected'; reason: unknown };

/** Reports how `promise` settles, without driving the clock (the test does that). */
export const outcomeOf = <T>(promise: Promise<T>): Promise<Settled<T>> =>
  promise.then(
    (value): Settled<T> => ({ status: 'fulfilled', value }),
    (reason: unknown): Settled<T> => ({ status: 'rejected', reason }),
  );

/** Runs every pending fake timer, then reports how `promise` settled. */
export const settle = async <T>(promise: Promise<T>): Promise<Settled<T>> => {
  const result = outcomeOf(promise);
  await vi.runAllTimersAsync();
  return result;
};

export const fulfilled = <T>(value: T): Settled<T> => ({ status: 'fulfilled', value });
export const rejected = (reason: unknown): Settled<never> => ({ status: 'rejected', reason });
