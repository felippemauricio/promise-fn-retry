import { describe, it, expect, vi, afterEach } from 'vitest';
import retry from '../src';

describe('retry', () => {
  const success = 'ok';
  const fail = 'fail';
  const promiseFnSuccess = () => Promise.resolve(success);
  const promiseFnFail = () => Promise.reject(fail);

  afterEach(() => {
    vi.restoreAllMocks();
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
});
