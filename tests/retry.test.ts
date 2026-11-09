import { describe, expect, it, vi } from 'vitest';
import retry from '../src';
import {
  alwaysFails,
  fail,
  flaky,
  fulfilled,
  outcomeOf,
  rejected,
  settle,
  success,
} from './helpers';

describe('retry', () => {
  it('resolves with the value and does not retry when the first attempt succeeds', async () => {
    const { fn } = flaky(0);
    const onRetry = vi.fn();
    expect(await settle(retry(fn, { onRetry }))).toEqual(fulfilled(success));
    expect(fn).toHaveBeenCalledTimes(1);
    expect(onRetry).not.toHaveBeenCalled();
  });

  it('retries once by default, then rejects with the last error', async () => {
    const { fn } = alwaysFails();
    expect(await settle(retry(fn))).toEqual(rejected(fail));
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('makes `times` retries after the first attempt', async () => {
    const { fn } = alwaysFails();
    expect(await settle(retry(fn, { times: 3 }))).toEqual(rejected(fail));
    expect(fn).toHaveBeenCalledTimes(4);
  });

  it('makes no retry when `times` is 0', async () => {
    const { fn } = alwaysFails();
    expect(await settle(retry(fn, { times: 0 }))).toEqual(rejected(fail));
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('stops as soon as a retry succeeds', async () => {
    const { fn } = flaky(1);
    expect(await settle(retry(fn, { times: 5 }))).toEqual(fulfilled(success));
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('passes the 1-indexed attempt number to fn', async () => {
    const { fn } = alwaysFails();
    await settle(retry(fn, { times: 2 }));
    expect(fn.mock.calls.map(([attempt]) => attempt)).toEqual([1, 2, 3]);
  });

  it('retries an operation that throws synchronously', async () => {
    const fn = vi.fn((): Promise<string> => {
      throw fail;
    });
    expect(await settle(retry(fn))).toEqual(rejected(fail));
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('calls onRetry after each wait with the error and the options so far', async () => {
    const { fn } = alwaysFails();
    const onRetry = vi.fn();
    const outcome = outcomeOf(retry(fn, { times: 2, onRetry }));
    await vi.advanceTimersByTimeAsync(99);
    expect(onRetry).not.toHaveBeenCalled(); // still waiting the first 100 ms
    await vi.advanceTimersByTimeAsync(1);
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledTimes(2); // and the retry follows straight after
    await vi.runAllTimersAsync();
    expect(await outcome).toEqual(rejected(fail));
    expect(onRetry).toHaveBeenCalledTimes(2);
    expect(onRetry.mock.calls.map(([error, options]) => [error, options.retained])).toEqual([
      [fail, 0],
      [fail, 1],
    ]);
  });

  describe('shouldRetry', () => {
    it('receives the error and stops retrying when it returns false', async () => {
      const { fn } = alwaysFails();
      const shouldRetry = vi.fn(() => false);
      expect(await settle(retry(fn, { times: 3, shouldRetry }))).toEqual(rejected(fail));
      expect(shouldRetry).toHaveBeenCalledWith(fail);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('keeps retrying up to `times` while it returns true', async () => {
      const { fn } = alwaysFails();
      await settle(retry(fn, { times: 3, shouldRetry: () => true }));
      expect(fn).toHaveBeenCalledTimes(4);
    });

    it('rejects with the error it throws', async () => {
      const { fn } = alwaysFails();
      const boom = new Error('shouldRetry failed');
      const shouldRetry = (): boolean => {
        throw boom;
      };
      expect(await settle(retry(fn, { shouldRetry }))).toEqual(rejected(boom));
    });
  });

  describe('forever', () => {
    it('retries past `times` until the operation succeeds', async () => {
      const { fn } = flaky(4);
      expect(await settle(retry(fn, { forever: true, times: 0 }))).toEqual(fulfilled(success));
      expect(fn).toHaveBeenCalledTimes(5);
    });
  });

  describe('options set to undefined', () => {
    it('keep their defaults, as if they were omitted', async () => {
      const { fn, waits } = alwaysFails();
      const options = {
        times: undefined,
        initialDelayTime: undefined,
        maxDelayTime: undefined,
        attemptTimeout: undefined,
        jitter: undefined,
      };
      expect(await settle(retry(fn, options))).toEqual(rejected(fail));
      expect(waits()).toEqual([100]); // one retry, after the default 100 ms
    });

    it('do not hide an alias that is set', async () => {
      const { fn } = alwaysFails();
      await settle(retry(fn, { times: undefined, retries: 2 }));
      expect(fn).toHaveBeenCalledTimes(3);
    });
  });
});
