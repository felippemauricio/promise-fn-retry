import { describe, expect, it, vi } from 'vitest';
import retry from '../src';
import { alwaysFails, fail, rejected, settle } from './helpers';

describe('maxElapsedTime', () => {
  it('trims the final wait to the budget, then rejects with the last error', async () => {
    const { fn, startedAt } = alwaysFails();
    const outcome = await settle(
      retry(fn, { maxElapsedTime: 1_000, initialDelayTime: 400, times: 10 }),
    );
    expect(outcome).toEqual(rejected(fail));
    // Waits of 400 then 800, the second trimmed to the 600 ms left in the budget.
    expect(startedAt).toEqual([0, 400, 1_000]);
  });

  it('makes no retry once the budget is already spent', async () => {
    const { fn } = alwaysFails();
    const onRetry = vi.fn();
    const slow = vi.fn(async (attempt: number) => {
      vi.setSystemTime(Date.now() + 200); // the attempt itself outlasts the budget
      return fn(attempt);
    });
    expect(await settle(retry(slow, { maxElapsedTime: 100, times: 5, onRetry }))).toEqual(
      rejected(fail),
    );
    expect(slow).toHaveBeenCalledTimes(1);
    expect(onRetry).not.toHaveBeenCalled();
  });

  it('applies to the wait chosen by getDelay as well', async () => {
    const { fn, startedAt } = alwaysFails();
    await settle(retry(fn, { maxElapsedTime: 50, times: 1, getDelay: () => 10_000 }));
    expect(startedAt).toEqual([0, 50]);
  });
});
