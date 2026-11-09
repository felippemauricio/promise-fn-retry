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
export const isBailError = (err: unknown): err is BailError =>
  err instanceof BailError || (err as { name?: string } | null)?.name === 'BailError';

/** The error to reject with once `signal` has aborted: its reason, or a generic one. */
export const abortError = (signal: AbortSignal): unknown =>
  signal.reason ?? new Error('The operation was aborted');
