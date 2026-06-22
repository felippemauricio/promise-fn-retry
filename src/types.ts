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

/**
 * Options merged with their defaults plus the internal recursion state.
 * This is the shape passed to {@link OnRetry}.
 */
export type ResolvedOptions = Required<Omit<Options, 'signal'>> &
  Pick<Options, 'signal'> & {
    /** How many retries have been performed so far. */
    retained: number;
    /** The base (uncapped) delay of the previous retry, or null before the first. */
    currentDelay: number | null;
  };
