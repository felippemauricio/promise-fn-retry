import type { Jitter, OperationFn, Options, ResolvedOptions } from './types';

const now = (): number => Date.now();

const defaultOptions: Omit<ResolvedOptions, 'retained' | 'currentDelay' | 'startedAt' | 'signal'> =
  {
    times: 1,
    initialDelayTime: 100,
    backoffFactor: 2,
    maxDelayTime: Infinity,
    jitter: false,
    forever: false,
    attemptTimeout: Infinity,
    maxElapsedTime: Infinity,
    getDelay: null,
    until: null,
    onRetry: null,
    shouldRetry: null,
  };

/**
 * Throw this from the operation to stop retrying immediately: the retry rejects
 * with the wrapped {@link BailError.cause}, skipping the delay, `shouldRetry`,
 * any remaining attempts and `forever`.
 */
export class BailError extends Error {
  readonly cause: unknown;
  constructor(cause: unknown) {
    super('The retry was bailed');
    this.name = 'BailError';
    this.cause = cause;
  }
}

/** The error a single attempt rejects with when it exceeds `attemptTimeout`. */
export class AttemptTimeoutError extends Error {
  constructor(message = 'The attempt timed out') {
    super(message);
    this.name = 'AttemptTimeoutError';
  }
}

/** Brand check that survives across bundles/realms where `instanceof` may not. */
const isBailError = (err: unknown): err is BailError =>
  err instanceof BailError || (err as { name?: string } | null)?.name === 'BailError';

/** Merges caller options with the defaults, resolves aliases, and seeds recursion state. */
const resolveOptions = (options: Options): ResolvedOptions => {
  const { retries, factor, minTimeout, maxTimeout, randomize, ...core } = options;
  const resolved: ResolvedOptions = {
    ...defaultOptions,
    retained: 0,
    currentDelay: null,
    startedAt: now(),
    ...core,
  };
  // Aliases only fill a canonical option that was left unset; the canonical wins.
  if (core.times === undefined && retries !== undefined) resolved.times = retries;
  if (core.backoffFactor === undefined && factor !== undefined) resolved.backoffFactor = factor;
  if (core.initialDelayTime === undefined && minTimeout !== undefined)
    resolved.initialDelayTime = minTimeout;
  if (core.maxDelayTime === undefined && maxTimeout !== undefined)
    resolved.maxDelayTime = maxTimeout;
  if (core.jitter === undefined && randomize !== undefined)
    resolved.jitter = randomize ? 'full' : false;
  return resolved;
};

/** Base (uncapped) delay for the upcoming retry. */
const nextDelay = ({ currentDelay, initialDelayTime, backoffFactor }: ResolvedOptions): number =>
  currentDelay === null ? initialDelayTime : currentDelay * backoffFactor;

/** Applies the cap and, when enabled, the chosen jitter strategy on top of the base delay. */
const computeWaitTime = (baseDelay: number, maxDelayTime: number, jitter: Jitter): number => {
  const capped = Math.min(baseDelay, maxDelayTime);
  if (jitter === 'full') return Math.random() * capped;
  if (jitter === true || jitter === 'equal') return capped / 2 + Math.random() * (capped / 2);
  return capped;
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

/**
 * Runs a single attempt. When `attemptTimeout` is set, races the operation against
 * a timer; where `AbortController` exists, the operation receives a signal that
 * aborts on timeout or when the outer `signal` aborts.
 */
const attemptOnce = <T>(requestFn: OperationFn<T>, resolved: ResolvedOptions): Promise<T> => {
  const { attemptTimeout, signal } = resolved;
  const attempt = resolved.retained + 1;

  if (attemptTimeout === Infinity || attemptTimeout <= 0) {
    return Promise.resolve().then(() => requestFn(attempt, signal));
  }

  let controller: AbortController | undefined;
  let attemptSignal = signal;
  let detachOuter: (() => void) | undefined;

  if (typeof AbortController !== 'undefined') {
    controller = new AbortController();
    attemptSignal = controller.signal;
    if (signal) {
      const onAbort = (): void => controller!.abort(signal.reason);
      signal.addEventListener('abort', onAbort, { once: true });
      detachOuter = (): void => signal.removeEventListener('abort', onAbort);
    }
  }

  let timer: ReturnType<typeof setTimeout>;
  const work = Promise.resolve().then(() => requestFn(attempt, attemptSignal));
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      const err = new AttemptTimeoutError();
      controller?.abort(err);
      reject(err);
    }, attemptTimeout);
  });
  const cleanup = (): void => {
    clearTimeout(timer);
    detachOuter?.();
  };
  return Promise.race([work, timeout]).then(
    (value) => {
      cleanup();
      return value;
    },
    (err) => {
      cleanup();
      throw err;
    },
  );
};

/**
 * Plans the wait before the next retry: the backoff (with cap and jitter), an
 * optional `getDelay` override, and the `maxElapsedTime` budget. Returns the base
 * delay (to advance the curve) and the actual wait, or `null` to stop retrying.
 */
const planWait = (
  resolved: ResolvedOptions,
  error: unknown,
): { base: number; wait: number } | null => {
  const base = nextDelay(resolved);
  let wait = computeWaitTime(base, resolved.maxDelayTime, resolved.jitter);

  if (resolved.getDelay) {
    const override = resolved.getDelay(error, {
      attempt: resolved.retained + 1,
      computedDelay: wait,
    });
    if (typeof override === 'number' && override >= 0) wait = override;
  }

  if (resolved.maxElapsedTime !== Infinity) {
    const remaining = resolved.maxElapsedTime - (now() - resolved.startedAt);
    if (remaining <= 0) return null;
    if (wait > remaining) wait = remaining;
  }

  return { base, wait };
};

/** Waits the planned delay, fires `onRetry`, then recurses for the next attempt. */
const proceed = <T>(
  requestFn: OperationFn<T>,
  resolved: ResolvedOptions,
  error: unknown,
  plan: { base: number; wait: number },
): Promise<T> =>
  delay(plan.wait, resolved.signal).then(() => {
    if (resolved.onRetry) resolved.onRetry(error, resolved);
    return run(requestFn, {
      ...resolved,
      retained: resolved.retained + 1,
      currentDelay: plan.base,
    });
  });

/** The recursive retry loop, working on already-resolved options. */
const run = <T>(requestFn: OperationFn<T>, resolved: ResolvedOptions): Promise<T> => {
  const { signal, shouldRetry, until, times, retained, forever } = resolved;

  if (signal?.aborted) return Promise.reject(abortError(signal));

  const canRetry = forever || retained < times;

  return attemptOnce(requestFn, resolved).then(
    (value) => {
      // Poll: a resolved value that fails `until` is treated as worth retrying.
      if (until && !until(value)) {
        if (!canRetry) return value;
        const plan = planWait(resolved, undefined);
        if (!plan) return value;
        return proceed(requestFn, resolved, undefined, plan);
      }
      return value;
    },
    (error: unknown) => {
      if (isBailError(error)) throw error.cause;
      if (signal?.aborted) throw abortError(signal);
      if (!canRetry || (shouldRetry && !shouldRetry(error))) throw error;
      const plan = planWait(resolved, error);
      if (!plan) throw error;
      return proceed(requestFn, resolved, error, plan);
    },
  );
};

export function retry<T>(requestFn: OperationFn<T>, options: Options = {}): Promise<T> {
  return run(requestFn, resolveOptions(options));
}

export default retry;
