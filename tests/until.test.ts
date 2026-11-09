import { describe, expect, it, vi } from 'vitest';
import retry from '../src';
import { fulfilled, rejected, settle } from './helpers';

/** An operation that resolves with 1, 2, 3, … on successive attempts. */
const counter = () => {
  let n = 0;
  return vi.fn(() => Promise.resolve(++n));
};

describe('until (polling)', () => {
  it('keeps retrying while the resolved value fails the predicate', async () => {
    const fn = counter();
    const onRetry = vi.fn();
    const until = (value: unknown) => (value as number) >= 3;
    expect(await settle(retry(fn, { until, times: 5, onRetry }))).toEqual(fulfilled(3));
    expect(onRetry).toHaveBeenCalledTimes(2);
    expect(onRetry.mock.calls[0]![0]).toBeUndefined(); // there was no error
  });

  it('resolves with the last value once the retries run out', async () => {
    expect(await settle(retry(counter(), { until: () => false, times: 2 }))).toEqual(fulfilled(3));
  });

  it('resolves with the last value once the time budget runs out', async () => {
    const fn = counter();
    const outcome = await settle(
      retry(fn, { until: () => false, maxElapsedTime: 250, forever: true }),
    );
    expect(outcome).toEqual(fulfilled(3)); // attempts at 0, 100 and 250 ms
  });

  it('rejects with the abort reason when aborted during an attempt', async () => {
    const controller = new AbortController();
    const reason = new Error('stop polling');
    const fn = vi.fn(() => {
      controller.abort(reason);
      return Promise.resolve('pending');
    });
    const outcome = await settle(
      retry(fn, { until: () => false, signal: controller.signal, times: 5 }),
    );
    expect(outcome).toEqual(rejected(reason));
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('rejects with the error the predicate throws', async () => {
    const boom = new Error('until failed');
    const until = (): boolean => {
      throw boom;
    };
    expect(await settle(retry(counter(), { until }))).toEqual(rejected(boom));
  });
});
