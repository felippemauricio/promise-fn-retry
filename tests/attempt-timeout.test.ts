import { describe, expect, it, vi } from 'vitest';
import retry, { AttemptTimeoutError } from '../src';
import { fulfilled, hang, outcomeOf, rejected, settle, success } from './helpers';

describe('attemptTimeout', () => {
  it('times out a hung attempt, retries it, then rejects with AttemptTimeoutError', async () => {
    const fn = vi.fn(hang);
    const outcome = await settle(retry(fn, { attemptTimeout: 5, initialDelayTime: 1 }));
    expect((outcome as { reason: unknown }).reason).toBeInstanceOf(AttemptTimeoutError);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('aborts the per-attempt signal when the attempt times out', async () => {
    const signals: (AbortSignal | undefined)[] = [];
    const fn = (attempt: number, signal?: AbortSignal) => {
      signals.push(signal);
      return attempt === 1 ? hang() : Promise.resolve(success);
    };
    expect(await settle(retry(fn, { attemptTimeout: 5 }))).toEqual(fulfilled(success));
    expect(signals[0]?.aborted).toBe(true);
    expect(signals[0]?.reason).toBeInstanceOf(AttemptTimeoutError);
    expect(signals[1]?.aborted).toBe(false);
  });

  it('still times out where AbortController is unavailable, without a per-attempt signal', async () => {
    vi.stubGlobal('AbortController', undefined);
    const signals: (AbortSignal | undefined)[] = [];
    const fn = vi.fn((_attempt: number, signal?: AbortSignal) => {
      signals.push(signal);
      return hang();
    });
    const outcome = await settle(retry(fn, { attemptTimeout: 5 }));
    expect((outcome as { reason: unknown }).reason).toBeInstanceOf(AttemptTimeoutError);
    expect(fn).toHaveBeenCalledTimes(2);
    expect(signals).toEqual([undefined, undefined]);
  });

  it.each([0, -1])('treats an attemptTimeout of %s as no timeout', async (attemptTimeout) => {
    const fn = (): Promise<string> =>
      new Promise((resolve) => setTimeout(() => resolve(success), 60_000));
    expect(await settle(retry(fn, { attemptTimeout }))).toEqual(fulfilled(success));
  });

  it('does not fire early when longer than the setTimeout limit', async () => {
    const tenDays = 864_000_000;
    const fn = vi.fn(
      (): Promise<string> => new Promise((resolve) => setTimeout(() => resolve(success), tenDays)),
    );
    const outcome = await settle(retry(fn, { attemptTimeout: 3_024_000_000 }));
    expect(outcome).toEqual(fulfilled(success));
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('leaves no timer or abort listener behind when an attempt succeeds', async () => {
    const controller = new AbortController();
    const add = vi.spyOn(controller.signal, 'addEventListener');
    const remove = vi.spyOn(controller.signal, 'removeEventListener');
    await expect(
      retry(() => Promise.resolve(success), { attemptTimeout: 50, signal: controller.signal }),
    ).resolves.toBe(success);
    expect(vi.getTimerCount()).toBe(0);
    expect(add).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledWith('abort', add.mock.calls[0]![1]);
  });

  it('lets the outer signal abort an in-flight attempt that honours its signal', async () => {
    const controller = new AbortController();
    const reason = new Error('user abort');
    const fn = (_attempt: number, signal?: AbortSignal) =>
      new Promise<never>((_, reject) => {
        signal?.addEventListener('abort', () => reject(signal.reason), { once: true });
      });
    const outcome = outcomeOf(retry(fn, { attemptTimeout: 10_000, signal: controller.signal }));
    await vi.advanceTimersByTimeAsync(10);
    controller.abort(reason);
    expect(await outcome).toEqual(rejected(reason));
  });
});
