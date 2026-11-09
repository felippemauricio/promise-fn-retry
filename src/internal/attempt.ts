import { AttemptTimeoutError } from '../errors';
import type { OperationFn, ResolvedOptions } from '../types';
import { schedule } from './timers';

/**
 * Runs a single attempt. When `attemptTimeout` is set, races the operation against
 * a timer; where `AbortController` exists, the operation receives a signal that
 * aborts on timeout or when the outer `signal` aborts.
 */
export const attemptOnce = <T>(
  requestFn: OperationFn<T>,
  resolved: ResolvedOptions,
): Promise<T> => {
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

  let cancelTimer!: () => void;
  const work = Promise.resolve().then(() => requestFn(attempt, attemptSignal));
  const timeout = new Promise<never>((_, reject) => {
    cancelTimer = schedule(() => {
      const err = new AttemptTimeoutError();
      controller?.abort(err);
      reject(err);
    }, attemptTimeout);
  });
  const cleanup = (): void => {
    cancelTimer();
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
