import { describe, expect, it, vi } from 'vitest';
import retry from '../src';
import { alwaysFails, fail, rejected, settle } from './helpers';

describe('backoff', () => {
  it('starts at 100 ms and doubles by default', async () => {
    const { fn, waits } = alwaysFails();
    await settle(retry(fn, { times: 3 }));
    expect(waits()).toEqual([100, 200, 400]);
  });

  it('honours initialDelayTime and backoffFactor', async () => {
    const { fn, waits } = alwaysFails();
    await settle(retry(fn, { times: 3, initialDelayTime: 1, backoffFactor: 3 }));
    expect(waits()).toEqual([1, 3, 9]);
  });

  it('caps each wait at maxDelayTime', async () => {
    const { fn, waits } = alwaysFails();
    await settle(retry(fn, { times: 3, initialDelayTime: 4, maxDelayTime: 6 }));
    expect(waits()).toEqual([4, 6, 6]);
  });

  it('waits the full delay when it exceeds the setTimeout limit (about 24.8 days)', async () => {
    const { fn, waits } = alwaysFails();
    const thirtyFiveDays = 3_024_000_000;
    await settle(retry(fn, { initialDelayTime: thirtyFiveDays }));
    expect(waits()).toEqual([thirtyFiveDays]);
  });

  describe('jitter', () => {
    it("randomises equal jitter within [delay/2, delay] for true and 'equal'", async () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.5);
      for (const jitter of [true, 'equal'] as const) {
        const { fn, waits } = alwaysFails();
        await settle(retry(fn, { initialDelayTime: 100, jitter }));
        expect(waits()).toEqual([75]);
      }
    });

    it("randomises full jitter within [0, delay] for 'full'", async () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.25);
      const { fn, waits } = alwaysFails();
      await settle(retry(fn, { initialDelayTime: 100, jitter: 'full' }));
      expect(waits()).toEqual([25]);
    });

    it('jitters the capped delay, not the uncapped one', async () => {
      vi.spyOn(Math, 'random').mockReturnValue(0);
      const { fn, waits } = alwaysFails();
      await settle(retry(fn, { times: 2, initialDelayTime: 100, maxDelayTime: 100, jitter: true }));
      expect(waits()).toEqual([50, 50]);
    });
  });

  describe('getDelay', () => {
    it('overrides the wait and receives the error, attempt and computed delay', async () => {
      const { fn, waits } = alwaysFails();
      const getDelay = vi.fn(() => 7);
      await settle(retry(fn, { times: 2, initialDelayTime: 100, getDelay }));
      expect(waits()).toEqual([7, 7]);
      expect(getDelay.mock.calls).toEqual([
        [fail, { attempt: 1, computedDelay: 100 }],
        [fail, { attempt: 2, computedDelay: 200 }], // the curve keeps advancing underneath
      ]);
    });

    it.each([null, undefined, -1, Number.NaN])(
      'keeps the computed wait when it returns %s',
      async (value) => {
        const { fn, waits } = alwaysFails();
        await settle(retry(fn, { initialDelayTime: 4, getDelay: () => value }));
        expect(waits()).toEqual([4]);
      },
    );

    it('waits indefinitely when it returns Infinity, until the signal aborts', async () => {
      const { fn } = alwaysFails();
      const controller = new AbortController();
      const promise = retry(fn, { signal: controller.signal, getDelay: () => Infinity });
      const outcome = promise.catch((reason: unknown) => reason);
      await vi.advanceTimersByTimeAsync(10 * 2_147_483_647);
      expect(fn).toHaveBeenCalledTimes(1);
      controller.abort(fail);
      expect(await outcome).toBe(fail);
    });
  });

  describe('option aliases', () => {
    it('map retries, minTimeout, factor and maxTimeout onto the canonical options', async () => {
      const { fn, waits } = alwaysFails();
      await settle(retry(fn, { retries: 3, minTimeout: 1, factor: 3, maxTimeout: 5 }));
      expect(waits()).toEqual([1, 3, 5]);
    });

    it('lose to the canonical option when both are given', async () => {
      const { fn } = alwaysFails();
      expect(await settle(retry(fn, { times: 2, retries: 5 }))).toEqual(rejected(fail));
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it("map randomize onto 'full' jitter or no jitter", async () => {
      vi.spyOn(Math, 'random').mockReturnValue(0);
      const on = alwaysFails();
      await settle(retry(on.fn, { initialDelayTime: 100, randomize: true }));
      expect(on.waits()).toEqual([0]);
      const off = alwaysFails();
      await settle(retry(off.fn, { initialDelayTime: 100, randomize: false }));
      expect(off.waits()).toEqual([100]);
    });
  });
});
