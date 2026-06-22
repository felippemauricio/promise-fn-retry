export type OnRetry = (error: unknown, options: ResolvedOptions) => void;
export type ShouldRetry = (error: unknown) => boolean;

export interface Options {
  /** Number of retries after the first failure. Default: 1 */
  times?: number;
  /** Initial delay in ms before the first retry. Default: 100 */
  initialDelayTime?: number;
  /** Multiplier applied to the delay on each retry. Default: 2 (doubles) */
  backoffFactor?: number;
  /** Cap on the delay between attempts, in ms. Default: Infinity (no cap) */
  maxDelayTime?: number;
  /** Randomises the delay (equal jitter) to avoid a thundering herd. Default: false */
  jitter?: boolean;
  /** AbortSignal to cancel the retries. Default: undefined */
  signal?: AbortSignal;
  /** Called on each retry. Handy for metrics/logs. Default: null */
  onRetry?: OnRetry | null;
  /** Decides whether to retry given the error. Default: null (always retries) */
  shouldRetry?: ShouldRetry | null;
}

interface ControlOptions {
  retained: number;
  currentDelay: number | null;
}

export type ResolvedOptions = Required<Omit<Options, 'signal'>> &
  Pick<Options, 'signal'> &
  ControlOptions;

const defaultOptions: Required<Omit<Options, 'signal'>> = {
  times: 1,
  initialDelayTime: 100,
  backoffFactor: 2,
  maxDelayTime: Infinity,
  jitter: false,
  onRetry: null,
  shouldRetry: null,
};

const controlOptions: ControlOptions = {
  retained: 0,
  currentDelay: null,
};

const buildOptionsParsed = (options: Options): ResolvedOptions => ({
  ...defaultOptions,
  ...controlOptions,
  ...options,
});

const calcNewDelay = (currentDelay: number, backoffFactor: number): number =>
  currentDelay * backoffFactor;

const buildOptionsToRetry = (optionsParsed: ResolvedOptions): ResolvedOptions => {
  const { currentDelay, initialDelayTime, backoffFactor, retained } = optionsParsed;
  return {
    ...optionsParsed,
    retained: retained + 1,
    currentDelay: currentDelay ? calcNewDelay(currentDelay, backoffFactor) : initialDelayTime,
  };
};

const shouldRetryByExecutedTimes = ({ retained, times }: ResolvedOptions): boolean =>
  retained < times;

/** Applies the cap and jitter (equal jitter) on top of the base delay. */
const computeWaitTime = (baseDelay: number, maxDelayTime: number, jitter: boolean): number => {
  const capped = Math.min(baseDelay, maxDelayTime);
  if (!jitter) return capped;
  return capped / 2 + Math.random() * (capped / 2);
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

export function retry<T>(
  requestFn: () => Promise<T>,
  options: Options = defaultOptions,
): Promise<T> {
  const optionsParsed = buildOptionsParsed(options);
  const { onRetry, shouldRetry, signal, maxDelayTime, jitter } = optionsParsed;

  if (signal?.aborted) return Promise.reject(abortError(signal));

  return requestFn().catch((err: unknown) => {
    if (shouldRetryByExecutedTimes(optionsParsed) && (!shouldRetry || shouldRetry(err))) {
      const optionsToRetry = buildOptionsToRetry(optionsParsed);
      const waitTime = computeWaitTime(optionsToRetry.currentDelay ?? 0, maxDelayTime, jitter);
      return delay(waitTime, signal).then(() => {
        if (onRetry) onRetry(err, { ...optionsParsed });
        return retry(requestFn, optionsToRetry);
      });
    }
    throw err;
  });
}

export default retry;
