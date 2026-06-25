import { describe, it, expect, vi, afterEach } from 'vitest';
import retry, { BailError, AttemptTimeoutError } from '../src';

describe('retry', () => {
  const success = 'ok';
  const fail = 'fail';
  const promiseFnSuccess = () => Promise.resolve(success);
  const promiseFnFail = () => Promise.reject(fail);
  const hang = () => new Promise<never>(() => {});

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('returns the resolved value when the promise resolves', async () => {
    await expect(retry(promiseFnSuccess)).resolves.toBe(success);
  });

  it('does not retry when the promise resolves', async () => {
    const onRetry = vi.fn();
    await retry(promiseFnSuccess, { onRetry });
    expect(onRetry).not.toHaveBeenCalled();
  });

  it('rejects with the original error when it keeps failing', async () => {
    await expect(retry(promiseFnFail)).rejects.toBe(fail);
  });

  it('retries when the promise fails', async () => {
    const onRetry = vi.fn();
    await expect(retry(promiseFnFail, { onRetry })).rejects.toBe(fail);
    expect(onRetry).toHaveBeenCalled();
  });

  it('retries `times` times when the promise keeps failing', async () => {
    const onRetry = vi.fn();
    const times = 3;
    await expect(retry(promiseFnFail, { onRetry, times, initialDelayTime: 1 })).rejects.toBe(fail);
    expect(onRetry).toHaveBeenCalledTimes(times);
  });

  it('resolves when a retry succeeds', async () => {
    let called = false;
    const fn = () => {
      if (called) return promiseFnSuccess();
      called = true;
      return promiseFnFail();
    };
    await expect(retry(fn, { initialDelayTime: 1 })).resolves.toBe(success);
  });

  it('stops retrying once a retry succeeds', async () => {
    let called = false;
    const onRetry = vi.fn();
    const fn = () => {
      if (called) return promiseFnSuccess();
      called = true;
      return promiseFnFail();
    };
    await retry(fn, { onRetry, times: 5, initialDelayTime: 1 });
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('calls shouldRetry when the promise fails', async () => {
    const shouldRetry = vi.fn(() => false);
    await expect(retry(promiseFnFail, { shouldRetry })).rejects.toBe(fail);
    expect(shouldRetry).toHaveBeenCalled();
  });

  it('retries `times` times when shouldRetry returns true', async () => {
    const onRetry = vi.fn();
    const times = 3;
    await expect(
      retry(promiseFnFail, { onRetry, shouldRetry: () => true, times, initialDelayTime: 1 }),
    ).rejects.toBe(fail);
    expect(onRetry).toHaveBeenCalledTimes(times);
  });

  it('does not retry when shouldRetry returns false', async () => {
    const onRetry = vi.fn();
    await expect(
      retry(promiseFnFail, { onRetry, shouldRetry: () => false, times: 3 }),
    ).rejects.toBe(fail);
    expect(onRetry).not.toHaveBeenCalled();
  });

  // --- features ---

  it('doubles the delay by default (backoffFactor 2)', async () => {
    const spy = vi.spyOn(globalThis, 'setTimeout');
    await expect(retry(promiseFnFail, { times: 2, initialDelayTime: 4 })).rejects.toBe(fail);
    const delays = spy.mock.calls.map((c) => c[1]);
    expect(delays).toEqual([4, 8]);
  });

  it('honors a custom backoffFactor', async () => {
    const spy = vi.spyOn(globalThis, 'setTimeout');
    await expect(
      retry(promiseFnFail, { times: 3, initialDelayTime: 1, backoffFactor: 3 }),
    ).rejects.toBe(fail);
    const delays = spy.mock.calls.map((c) => c[1]);
    expect(delays).toEqual([1, 3, 9]);
  });

  it('caps the delay at maxDelayTime', async () => {
    const spy = vi.spyOn(globalThis, 'setTimeout');
    await expect(
      retry(promiseFnFail, { times: 3, initialDelayTime: 4, maxDelayTime: 6 }),
    ).rejects.toBe(fail);
    const delays = spy.mock.calls.map((c) => c[1]);
    expect(delays).toEqual([4, 6, 6]);
  });

  it('applies jitter within [base/2, base]', async () => {
    const spy = vi.spyOn(globalThis, 'setTimeout');
    const base = 100;
    await expect(
      retry(promiseFnFail, { times: 1, initialDelayTime: base, jitter: true }),
    ).rejects.toBe(fail);
    const used = spy.mock.calls[0]![1] as number;
    expect(used).toBeGreaterThanOrEqual(base / 2);
    expect(used).toBeLessThanOrEqual(base);
  });

  it('does not call fn when the signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    const fn = vi.fn(promiseFnFail);
    await expect(retry(fn, { signal: controller.signal, times: 3 })).rejects.toBeDefined();
    expect(fn).not.toHaveBeenCalled();
  });

  it('stops retrying when aborted during the delay', async () => {
    const controller = new AbortController();
    const fn = vi.fn(promiseFnFail);
    const promise = retry(fn, { signal: controller.signal, times: 5, initialDelayTime: 50 });
    setTimeout(() => controller.abort(), 10);
    await expect(promise).rejects.toBeDefined();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('rejects before waiting if aborted synchronously while running fn', async () => {
    const controller = new AbortController();
    const fn = vi.fn(() => {
      controller.abort();
      return promiseFnFail();
    });
    await expect(
      retry(fn, { signal: controller.signal, times: 3, initialDelayTime: 50 }),
    ).rejects.toBeDefined();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('falls back to a default error when an aborted signal has no reason', async () => {
    // AbortController always sets a reason, so use a minimal aborted signal.
    const signal = { aborted: true, reason: undefined } as unknown as AbortSignal;
    const fn = vi.fn(promiseFnFail);
    await expect(retry(fn, { signal })).rejects.toThrow('The operation was aborted');
    expect(fn).not.toHaveBeenCalled();
  });

  it('clears the abort listener when a retry succeeds with a signal', async () => {
    const controller = new AbortController();
    let called = false;
    const fn = () => {
      if (called) return promiseFnSuccess();
      called = true;
      return promiseFnFail();
    };
    await expect(retry(fn, { signal: controller.signal, initialDelayTime: 1 })).resolves.toBe(
      success,
    );
  });

  // --- attempt number ---

  it('passes the 1-indexed attempt number to fn', async () => {
    const attempts: number[] = [];
    const fn = (attempt: number) => {
      attempts.push(attempt);
      return promiseFnFail();
    };
    await expect(retry(fn, { times: 2, initialDelayTime: 1 })).rejects.toBe(fail);
    expect(attempts).toEqual([1, 2, 3]);
  });

  // --- forever ---

  it('retries forever until success, ignoring times', async () => {
    let calls = 0;
    const fn = () => {
      calls += 1;
      return calls < 5 ? promiseFnFail() : promiseFnSuccess();
    };
    await expect(retry(fn, { forever: true, times: 0, initialDelayTime: 1 })).resolves.toBe(
      success,
    );
    expect(calls).toBe(5);
  });

  it('stops a forever loop when aborted', async () => {
    const controller = new AbortController();
    const fn = vi.fn(promiseFnFail);
    const promise = retry(fn, { forever: true, signal: controller.signal, initialDelayTime: 50 });
    setTimeout(() => controller.abort(), 10);
    await expect(promise).rejects.toBeDefined();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  // --- jitter strategies ---

  it("applies full jitter within [0, base] when jitter is 'full'", async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const spy = vi.spyOn(globalThis, 'setTimeout');
    const base = 100;
    await expect(
      retry(promiseFnFail, { times: 1, initialDelayTime: base, jitter: 'full' }),
    ).rejects.toBe(fail);
    expect(spy.mock.calls[0]![1]).toBe(0);
  });

  it("treats jitter 'equal' like equal jitter", async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const spy = vi.spyOn(globalThis, 'setTimeout');
    const base = 100;
    await expect(
      retry(promiseFnFail, { times: 1, initialDelayTime: base, jitter: 'equal' }),
    ).rejects.toBe(fail);
    expect(spy.mock.calls[0]![1]).toBe(base / 2);
  });

  // --- BailError ---

  it('bails immediately when fn throws BailError, rejecting with the cause', async () => {
    const cause = new Error('give up');
    const onRetry = vi.fn();
    const fn = vi.fn(() => Promise.reject(new BailError(cause)));
    await expect(retry(fn, { times: 5, initialDelayTime: 1, onRetry })).rejects.toBe(cause);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(onRetry).not.toHaveBeenCalled();
  });

  it('does not consult shouldRetry when bailing', async () => {
    const shouldRetry = vi.fn(() => true);
    await expect(
      retry(() => Promise.reject(new BailError(fail)), { times: 5, shouldRetry }),
    ).rejects.toBe(fail);
    expect(shouldRetry).not.toHaveBeenCalled();
  });

  it('recognises a BailError by brand when instanceof fails (cross-realm)', async () => {
    const cause = new Error('cross-realm');
    const fake = { name: 'BailError', cause };
    await expect(retry(() => Promise.reject(fake), { times: 3, initialDelayTime: 1 })).rejects.toBe(
      cause,
    );
  });

  it('treats a nullish rejection as a normal failure, not a bail', async () => {
    await expect(retry(() => Promise.reject(null), { times: 0 })).rejects.toBeNull();
  });

  // --- option-name aliases ---

  it('maps alias option names onto the canonical options', async () => {
    const spy = vi.spyOn(globalThis, 'setTimeout');
    await expect(
      retry(promiseFnFail, { retries: 3, minTimeout: 1, factor: 3, maxTimeout: 5 }),
    ).rejects.toBe(fail);
    const delays = spy.mock.calls.map((c) => c[1]);
    expect(delays).toEqual([1, 3, 5]); // 1, 1*3, capped at 5
  });

  it('lets the canonical option win when both it and its alias are given', async () => {
    const onRetry = vi.fn();
    await expect(
      retry(promiseFnFail, { times: 2, retries: 5, initialDelayTime: 1, onRetry }),
    ).rejects.toBe(fail);
    expect(onRetry).toHaveBeenCalledTimes(2);
  });

  it('maps randomize:true onto full jitter', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const spy = vi.spyOn(globalThis, 'setTimeout');
    await expect(
      retry(promiseFnFail, { times: 1, initialDelayTime: 100, randomize: true }),
    ).rejects.toBe(fail);
    expect(spy.mock.calls[0]![1]).toBe(0);
  });

  it('maps randomize:false onto no jitter', async () => {
    const spy = vi.spyOn(globalThis, 'setTimeout');
    await expect(
      retry(promiseFnFail, { times: 1, initialDelayTime: 100, randomize: false }),
    ).rejects.toBe(fail);
    expect(spy.mock.calls[0]![1]).toBe(100);
  });

  // --- attemptTimeout ---

  it('times out a hung attempt and retries, rejecting with AttemptTimeoutError', async () => {
    const fn = vi.fn(hang);
    await expect(
      retry(fn, { attemptTimeout: 5, times: 1, initialDelayTime: 1 }),
    ).rejects.toBeInstanceOf(AttemptTimeoutError);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('aborts the per-attempt signal when the attempt times out', async () => {
    const signals: (AbortSignal | undefined)[] = [];
    const fn = (attempt: number, signal?: AbortSignal) => {
      signals.push(signal);
      return attempt === 1 ? hang() : promiseFnSuccess();
    };
    await expect(retry(fn, { attemptTimeout: 5, times: 1, initialDelayTime: 1 })).resolves.toBe(
      success,
    );
    expect(signals[0]?.aborted).toBe(true);
  });

  it('still times out when AbortController is unavailable, without a per-attempt signal', async () => {
    vi.stubGlobal('AbortController', undefined);
    const signals: (AbortSignal | undefined)[] = [];
    const fn = (attempt: number, signal?: AbortSignal) => {
      signals.push(signal);
      return attempt === 1 ? promiseFnFail() : promiseFnSuccess();
    };
    await expect(retry(fn, { attemptTimeout: 50, times: 1, initialDelayTime: 1 })).resolves.toBe(
      success,
    );
    expect(signals[0]).toBeUndefined();
  });

  it('treats attemptTimeout of 0 as no timeout', async () => {
    await expect(retry(promiseFnSuccess, { attemptTimeout: 0 })).resolves.toBe(success);
  });

  it('cleans up the timer and listener when an attempt succeeds with a signal', async () => {
    const controller = new AbortController();
    await expect(
      retry(promiseFnSuccess, { attemptTimeout: 50, signal: controller.signal }),
    ).resolves.toBe(success);
  });

  it('lets the outer signal abort an in-flight attempt that honours it', async () => {
    const controller = new AbortController();
    const fn = (_attempt: number, signal?: AbortSignal) =>
      new Promise<never>((_, reject) => {
        signal?.addEventListener('abort', () => reject(signal.reason), { once: true });
      });
    const promise = retry(fn, { attemptTimeout: 10_000, signal: controller.signal, times: 3 });
    setTimeout(() => controller.abort(new Error('user abort')), 10);
    await expect(promise).rejects.toThrow('user abort');
  });

  // --- maxElapsedTime ---

  it('gives up once the total time budget is exhausted', async () => {
    vi.spyOn(Date, 'now').mockReturnValueOnce(0).mockReturnValue(1000);
    const onRetry = vi.fn();
    await expect(retry(promiseFnFail, { maxElapsedTime: 100, times: 5, onRetry })).rejects.toBe(
      fail,
    );
    expect(onRetry).not.toHaveBeenCalled();
  });

  it('keeps the computed wait when it already fits the budget', async () => {
    vi.spyOn(Date, 'now').mockReturnValueOnce(0).mockReturnValue(10);
    const spy = vi.spyOn(globalThis, 'setTimeout');
    await expect(
      retry(promiseFnFail, { maxElapsedTime: 10_000, times: 1, initialDelayTime: 4 }),
    ).rejects.toBe(fail);
    expect(spy.mock.calls.map((c) => c[1])).toEqual([4]);
  });

  it('clamps the final wait so it fits within the remaining budget', async () => {
    vi.spyOn(Date, 'now').mockReturnValueOnce(0).mockReturnValueOnce(995);
    const spy = vi.spyOn(globalThis, 'setTimeout');
    let n = 0;
    const fn = () => (++n === 1 ? promiseFnFail() : promiseFnSuccess());
    await expect(retry(fn, { maxElapsedTime: 1000, initialDelayTime: 50, times: 3 })).resolves.toBe(
      success,
    );
    expect(spy.mock.calls.map((c) => c[1])).toContain(5);
  });

  // --- getDelay ---

  it('uses getDelay to override the computed backoff', async () => {
    const spy = vi.spyOn(globalThis, 'setTimeout');
    const seen: { attempt: number; computedDelay: number }[] = [];
    await expect(
      retry(promiseFnFail, {
        times: 2,
        initialDelayTime: 100,
        getDelay: (_err, ctx) => {
          seen.push(ctx);
          return 7;
        },
      }),
    ).rejects.toBe(fail);
    expect(spy.mock.calls.map((c) => c[1])).toEqual([7, 7]);
    expect(seen[0]).toEqual({ attempt: 1, computedDelay: 100 });
  });

  it('falls back to the computed backoff when getDelay returns null', async () => {
    const spy = vi.spyOn(globalThis, 'setTimeout');
    await expect(
      retry(promiseFnFail, { times: 1, initialDelayTime: 4, getDelay: () => null }),
    ).rejects.toBe(fail);
    expect(spy.mock.calls.map((c) => c[1])).toEqual([4]);
  });

  it('ignores a negative getDelay value', async () => {
    const spy = vi.spyOn(globalThis, 'setTimeout');
    await expect(
      retry(promiseFnFail, { times: 1, initialDelayTime: 4, getDelay: () => -1 }),
    ).rejects.toBe(fail);
    expect(spy.mock.calls.map((c) => c[1])).toEqual([4]);
  });

  // --- until (polling) ---

  it('keeps retrying while the resolved value fails until()', async () => {
    let n = 0;
    const onRetry = vi.fn();
    const fn = () => Promise.resolve(++n);
    await expect(
      retry(fn, { until: (v) => (v as number) >= 3, times: 5, initialDelayTime: 1, onRetry }),
    ).resolves.toBe(3);
    expect(onRetry).toHaveBeenCalledTimes(2);
  });

  it('resolves with the last value when until() is never satisfied and retries run out', async () => {
    let n = 0;
    const fn = () => Promise.resolve(++n);
    await expect(retry(fn, { until: () => false, times: 2, initialDelayTime: 1 })).resolves.toBe(3);
  });

  it('resolves with the last value when the budget runs out mid-poll', async () => {
    vi.spyOn(Date, 'now').mockReturnValueOnce(0).mockReturnValue(1000);
    const fn = () => Promise.resolve('pending');
    await expect(retry(fn, { until: () => false, maxElapsedTime: 100, times: 5 })).resolves.toBe(
      'pending',
    );
  });

  it('aborts before the poll delay when the signal was aborted during the attempt', async () => {
    const controller = new AbortController();
    let n = 0;
    const fn = () => {
      if (++n === 1) controller.abort(new Error('stop polling'));
      return Promise.resolve('pending');
    };
    await expect(
      retry(fn, { until: () => false, signal: controller.signal, times: 5, initialDelayTime: 1 }),
    ).rejects.toThrow('stop polling');
  });
});
