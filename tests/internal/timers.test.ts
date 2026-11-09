import { describe, expect, it, vi } from 'vitest';
import { MAX_TIMER_DELAY, schedule } from '../../src/internal/timers';

describe('schedule', () => {
  it('fires once after the delay', async () => {
    const callback = vi.fn();
    schedule(callback, 100);
    await vi.advanceTimersByTimeAsync(99);
    expect(callback).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('chains timers past the setTimeout limit instead of firing early', async () => {
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');
    const callback = vi.fn();
    const delay = 2 * MAX_TIMER_DELAY + 5;
    schedule(callback, delay);
    await vi.advanceTimersByTimeAsync(delay - 1);
    expect(callback).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(callback).toHaveBeenCalledTimes(1);
    expect(setTimeoutSpy.mock.calls.map(([, ms]) => ms)).toEqual([
      MAX_TIMER_DELAY,
      MAX_TIMER_DELAY,
      5,
    ]);
  });

  it('cancels whichever timer in the chain is pending', async () => {
    const callback = vi.fn();
    const cancel = schedule(callback, MAX_TIMER_DELAY + 10);
    await vi.advanceTimersByTimeAsync(MAX_TIMER_DELAY + 1);
    cancel();
    await vi.advanceTimersByTimeAsync(100);
    expect(callback).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});
