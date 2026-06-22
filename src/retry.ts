import type { Options, ResolvedOptions } from './types';

const defaultOptions: Required<Omit<Options, 'signal'>> = {
  times: 1,
  initialDelayTime: 100,
  backoffFactor: 2,
  maxDelayTime: Infinity,
  jitter: false,
  onRetry: null,
  shouldRetry: null,
};

/** Merges caller options with the defaults and the initial recursion state. */
const resolveOptions = (options: Options): ResolvedOptions => ({
  ...defaultOptions,
  retained: 0,
  currentDelay: null,
  ...options,
});

/** Base (uncapped) delay for the upcoming retry. */
const nextDelay = ({ currentDelay, initialDelayTime, backoffFactor }: ResolvedOptions): number =>
  currentDelay === null ? initialDelayTime : currentDelay * backoffFactor;

/** Applies the cap and, when enabled, equal jitter on top of the base delay. */
const computeWaitTime = (baseDelay: number, maxDelayTime: number, jitter: boolean): number => {
  const capped = Math.min(baseDelay, maxDelayTime);
  return jitter ? capped / 2 + Math.random() * (capped / 2) : capped;
};

const abortError = (signal: AbortSignal): unknown =>
  signal.reason ?? new Error('The operation was aborted');

/** setTimeout that rejects if the signal aborts; clears the timer at the end. */
const delay = (delayTime: number, signal?: AbortSignal): Promise<void> =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError(signal));
      return;
    }
    const onAbort = (): void => {
      clearTimeout(timer);
      reject(abortError(signal as AbortSignal));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, delayTime);
    signal?.addEventListener('abort', onAbort, { once: true });
  });

/** The recursive retry loop, working on already-resolved options. */
const run = <T>(requestFn: () => Promise<T>, resolved: ResolvedOptions): Promise<T> => {
  const { onRetry, shouldRetry, signal, times, retained, maxDelayTime, jitter } = resolved;

  if (signal?.aborted) return Promise.reject(abortError(signal));

  return requestFn().catch((err: unknown) => {
    if (retained < times && (!shouldRetry || shouldRetry(err))) {
      const base = nextDelay(resolved);
      return delay(computeWaitTime(base, maxDelayTime, jitter), signal).then(() => {
        if (onRetry) onRetry(err, resolved);
        return run(requestFn, { ...resolved, retained: retained + 1, currentDelay: base });
      });
    }
    throw err;
  });
};

export function retry<T>(requestFn: () => Promise<T>, options: Options = {}): Promise<T> {
  return run(requestFn, resolveOptions(options));
}

export default retry;
