import { afterEach, beforeEach, vi } from 'vitest';

// Every test runs on fake timers (and a fake clock starting at 0), so waits are
// exact and no test depends on how fast the machine is.
beforeEach(() => {
  vi.useFakeTimers({ now: 0 });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
