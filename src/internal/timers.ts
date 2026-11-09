import { abortError } from '../errors';

/**
 * The longest delay `setTimeout` honours (2^31 - 1 ms, about 24.8 days). Past it,
 * browsers and Node fire the timer almost at once, so longer waits are chained.
 */
export const MAX_TIMER_DELAY = 2_147_483_647;

/**
 * `setTimeout` for a delay of any length: past {@link MAX_TIMER_DELAY} it chains
 * timers instead of firing early (`Infinity` never fires). Returns a cancel function.
 */
export const schedule = (callback: () => void, ms: number): (() => void) => {
  let timer: ReturnType<typeof setTimeout>;
  const arm = (remaining: number): void => {
    const step = Math.min(remaining, MAX_TIMER_DELAY);
    timer = setTimeout(() => (remaining > step ? arm(remaining - step) : callback()), step);
  };
  arm(ms);
  return () => clearTimeout(timer);
};

/** Waits `ms`, rejecting early if the signal aborts; leaves no timer or listener behind. */
export const delay = (ms: number, signal?: AbortSignal): Promise<void> =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError(signal));
      return;
    }
    const onAbort = (): void => {
      cancel();
      reject(abortError(signal as AbortSignal));
    };
    const cancel = schedule(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
