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

describe('signal', () => {
  it('rejects with the abort reason without calling fn when already aborted', async () => {
    const controller = new AbortController();
    const reason = new Error('cancelled');
    controller.abort(reason);
    const { fn } = alwaysFails();
    expect(await settle(retry(fn, { signal: controller.signal }))).toEqual(rejected(reason));
    expect(fn).not.toHaveBeenCalled();
  });

  it("rejects with the runtime's AbortError when aborted without a reason", async () => {
    const controller = new AbortController();
    controller.abort();
    const outcome = await settle(retry(alwaysFails().fn, { signal: controller.signal }));
    expect(outcome.status).toBe('rejected');
    expect((outcome as { reason: Error }).reason.name).toBe('AbortError');
  });

  it('falls back to a generic error for a signal that aborted with no reason at all', async () => {
    const signal = { aborted: true, reason: undefined } as unknown as AbortSignal;
    const outcome = await settle(retry(alwaysFails().fn, { signal }));
    expect((outcome as { reason: Error }).reason.message).toBe('The operation was aborted');
  });

  it('stops waiting and rejects when aborted during the delay', async () => {
    const controller = new AbortController();
    const { fn } = alwaysFails();
    const outcome = outcomeOf(
      retry(fn, { signal: controller.signal, times: 5, initialDelayTime: 50 }),
    );
    await vi.advanceTimersByTimeAsync(10);
    controller.abort(fail);
    expect(await outcome).toEqual(rejected(fail));
    expect(fn).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  // `times: 0` and `shouldRetry: false` reach the abort check after the attempt
  // directly; `times: 3` reaches it through the delay that would follow.
  it.each([{ times: 0 }, { times: 3, shouldRetry: () => false }, { times: 3 }])(
    'rejects with the abort reason, not the error, when aborted during an attempt (%o)',
    async (options) => {
      const controller = new AbortController();
      const reason = new Error('cancelled');
      const fn = vi.fn(() => {
        controller.abort(reason);
        return Promise.reject(fail);
      });
      expect(await settle(retry(fn, { ...options, signal: controller.signal }))).toEqual(
        rejected(reason),
      );
      expect(fn).toHaveBeenCalledTimes(1);
    },
  );

  it('rejects with the error when the signal aborts only after the attempt failed', async () => {
    const controller = new AbortController();
    const fn = (): Promise<string> => {
      // Lands two microtasks after the failure, while the loop is resuming.
      void Promise.resolve()
        .then(() => {})
        .then(() => controller.abort('abort'));
      throw fail;
    };
    expect(await settle(retry(fn, { signal: controller.signal, times: 0 }))).toEqual(
      rejected(fail),
    );
  });

  it('ends a forever loop', async () => {
    const controller = new AbortController();
    const { fn } = alwaysFails();
    const outcome = outcomeOf(retry(fn, { forever: true, signal: controller.signal }));
    await vi.advanceTimersByTimeAsync(1_000);
    controller.abort(fail);
    expect(await outcome).toEqual(rejected(fail));
    expect(fn.mock.calls.length).toBeGreaterThan(1);
  });

  it('removes every abort listener it added once the retry settles', async () => {
    const controller = new AbortController();
    const add = vi.spyOn(controller.signal, 'addEventListener');
    const remove = vi.spyOn(controller.signal, 'removeEventListener');
    const { fn } = flaky(2);
    expect(await settle(retry(fn, { signal: controller.signal, times: 3 }))).toEqual(
      fulfilled(success),
    );
    expect(add).toHaveBeenCalledTimes(2);
    expect(remove.mock.calls.map(([, listener]) => listener)).toEqual(
      add.mock.calls.map(([, listener]) => listener),
    );
  });
});
