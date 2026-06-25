/**
 * The operation to retry. Receives the 1-indexed attempt number and a per-attempt
 * `AbortSignal` that aborts when `attemptTimeout` fires or the outer `signal` aborts
 * (provided where `AbortController` is available).
 */
export type OperationFn<T> = (attempt: number, signal?: AbortSignal) => Promise<T>;
export type OnRetry = (error: unknown, options: ResolvedOptions) => void;
export type ShouldRetry = (error: unknown) => boolean;

/**
 * Derives the wait before the next retry from the error. Return a number of
 * milliseconds to override the computed backoff, or `null`/`undefined` to keep it.
 */
export type GetDelay = (
  error: unknown,
  context: { attempt: number; computedDelay: number },
) => number | null | undefined;

/** Predicate over a resolved value; return `false` to keep retrying (polling). */
export type Until = (result: unknown) => boolean;

/**
 * Jitter strategy applied to each delay:
 * - `false` — no jitter (the capped delay).
 * - `true` / `'equal'` — equal jitter, randomised within `[delay/2, delay]`.
 * - `'full'` — full jitter, randomised within `[0, delay]`.
 */
export type Jitter = boolean | 'equal' | 'full';

/** The library's canonical options. */
interface CoreOptions {
  /** Number of retries after the first failure. Default: 1 */
  times?: number;
  /** Initial delay in ms before the first retry. Default: 100 */
  initialDelayTime?: number;
  /** Multiplier applied to the delay on each retry. Default: 2 (doubles) */
  backoffFactor?: number;
  /** Cap on the delay between attempts, in ms. Default: Infinity (no cap) */
  maxDelayTime?: number;
  /** Randomises the delay to avoid a thundering herd. Default: false */
  jitter?: Jitter;
  /** Retry indefinitely until success or abort, ignoring `times`. Default: false */
  forever?: boolean;
  /** Abort and retry a single attempt that runs longer than this, in ms. Default: Infinity */
  attemptTimeout?: number;
  /** Stop retrying once this much wall-clock time has elapsed in total, in ms. Default: Infinity */
  maxElapsedTime?: number;
  /** Derive the next wait from the error (e.g. a `Retry-After` header). Default: null */
  getDelay?: GetDelay | null;
  /** Retry while the resolved value fails this predicate (polling). Default: null */
  until?: Until | null;
  /** AbortSignal to cancel the retries. Default: undefined */
  signal?: AbortSignal;
  /** Called on each retry. Handy for metrics/logs. Default: null */
  onRetry?: OnRetry | null;
  /** Decides whether to retry given the error. Default: null (always retries) */
  shouldRetry?: ShouldRetry | null;
}

/**
 * Alternative option-name aliases. Each maps onto a canonical option at resolve
 * time; the canonical name wins when both are given.
 */
interface AliasOptions {
  /** Alias for {@link CoreOptions.times}. */
  retries?: number;
  /** Alias for {@link CoreOptions.backoffFactor}. */
  factor?: number;
  /** Alias for {@link CoreOptions.initialDelayTime}. */
  minTimeout?: number;
  /** Alias for {@link CoreOptions.maxDelayTime}. */
  maxTimeout?: number;
  /** Alias for `jitter: 'full'`. */
  randomize?: boolean;
}

export interface Options extends CoreOptions, AliasOptions {}

/**
 * Canonical options merged with their defaults plus the internal recursion state.
 * This is the shape passed to {@link OnRetry}; alias names are resolved away.
 */
export type ResolvedOptions = Required<Omit<CoreOptions, 'signal'>> &
  Pick<CoreOptions, 'signal'> & {
    /** How many retries have been performed so far. */
    retained: number;
    /** The base (uncapped) delay of the previous retry, or null before the first. */
    currentDelay: number | null;
    /** Timestamp (ms) when the top-level retry began; used for `maxElapsedTime`. */
    startedAt: number;
  };
