# Circuit Breaker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an opt-in, key-registered circuit breaker to `retry()` per the
approved design in `docs/2026-07-03-circuit-breaker-design.md`.

**Architecture:** A new `src/circuit-breaker.ts` module owns the state machine
(closed/open/half-open), the module-level registry keyed by
`circuitBreaker.key`, `CircuitOpenError`, `defaultShouldOpen` and
`resetCircuitBreakers()`. `src/retry.ts` acquires a `CircuitHandle` at
`resolveOptions` time, consults it before every attempt and records each
outcome. Everything is additive and opt-in.

**Tech Stack:** TypeScript (ES2015 target), Vitest (fake timers), tsup,
ESLint 9 + Prettier, VitePress docs.

## Global Constraints

- Zero runtime dependencies; universal APIs only (`Promise`, `setTimeout`, `Date.now`, optional `AbortSignal`) — no Node-only API.
- `engines.node >= 12`; source may use modern syntax (tsup transpiles to ES2015).
- TypeScript ESM: relative imports carry no extension in this repo (see `src/retry.ts`: `from './types'`).
- All prose (docs, comments, commit messages) in **Australian English** (en-AU).
- Commits authored solely as the user, **no AI attribution of any kind**; the PR ends up as a **single commit** (task commits are local checkpoints, squashed in Task 4).
- Defaults fixed by the spec: `failureThreshold: 5`, `resetTimeout: 30_000`, `shouldOpen: defaultShouldOpen`, `onStateChange: null`.
- Work happens in the worktree `~/Workspace/Personal/promise-fn-retry-circuit-breaker`, branch `feat/circuit-breaker`.

## File Structure

| File                                                                                                                                          | Responsibility                                                                                                                                                                                                      |
| --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/circuit-breaker.ts` (create)                                                                                                             | State machine, registry, `CircuitOpenError`, `defaultShouldOpen`, `acquireCircuit`, `resetCircuitBreakers`                                                                                                          |
| `src/types.ts` (modify)                                                                                                                       | `CircuitState`, `OpenVerdict`, `ShouldOpen`, `CircuitStateChangeEvent`, `OnCircuitStateChange`, `CircuitBreakerOptions`, `CircuitHandle`; `circuitBreaker` added to `Options`; `circuit` added to `ResolvedOptions` |
| `src/retry.ts` (modify)                                                                                                                       | Consult the circuit before each attempt; record success/failure/abort outcomes                                                                                                                                      |
| `src/index.ts` (modify)                                                                                                                       | Re-export the new public names                                                                                                                                                                                      |
| `tests/circuit-breaker.test.ts` (create)                                                                                                      | Unit tests of the state machine + `defaultShouldOpen`                                                                                                                                                               |
| `tests/retry-circuit.test.ts` (create)                                                                                                        | Integration tests through `retry()`                                                                                                                                                                                 |
| `website/guide/circuit-breaker.md` (create), `website/.vitepress/config.ts`, `website/reference/api.md`, `README.md`, `package.json` (modify) | Docs and version bump                                                                                                                                                                                               |

---

### Task 1: Types and the circuit-breaker module

**Files:**

- Modify: `src/types.ts`
- Create: `src/circuit-breaker.ts`
- Test: `tests/circuit-breaker.test.ts`

**Interfaces:**

- Consumes: nothing new.
- Produces (used by Task 2):
  - `acquireCircuit(options: CircuitBreakerOptions): CircuitHandle` — first call with a key creates the circuit and fixes its config; later calls reuse it and their config is ignored.
  - `CircuitHandle` — `admit(): void` (throws `CircuitOpenError` when blocked), `recordSuccess(): void`, `recordFailure(error: unknown): void`, `release(): void` (frees a half-open probe slot without recording an outcome).
  - `CircuitOpenError` — `key: string`, `remainingMs: number`, `cause: unknown`, `name === 'CircuitOpenError'`.
  - `defaultShouldOpen: ShouldOpen`, `resetCircuitBreakers(): void`.

- [ ] **Step 1: Add the new types to `src/types.ts`**

Append after the `Jitter` type (keep the existing types untouched for now — `Options`/`ResolvedOptions` change in Step 2):

```ts
/** The circuit's lifecycle state. */
export type CircuitState = 'closed' | 'open' | 'half-open';

/**
 * What an error means for the circuit:
 * - `false` — not the service's fault; does not count.
 * - `true` — counts as one failure towards `failureThreshold`.
 * - `'open'` / `{ open: true, forMs? }` — opens the circuit immediately,
 *   optionally for a caller-derived duration in ms (e.g. a `Retry-After`).
 */
export type OpenVerdict = boolean | 'open' | { open: true; forMs?: number };

/** Classifies an error for the circuit. The library's default is `defaultShouldOpen`. */
export type ShouldOpen = (error: unknown) => OpenVerdict;

/** Payload passed to {@link OnCircuitStateChange} on every transition. */
export interface CircuitStateChangeEvent {
  key: string;
  from: CircuitState;
  to: CircuitState;
  /** The triggering error, when the transition has one. */
  error?: unknown;
  /** Consecutive counted failures at transition time. */
  failures: number;
}

export type OnCircuitStateChange = (event: CircuitStateChangeEvent) => void;

/** The `circuitBreaker` option on `retry()`. */
export interface CircuitBreakerOptions {
  /** Names the shared circuit. The first call with a key fixes its config. */
  key: string;
  /** Consecutive counted failures that open the circuit. Default: 5 */
  failureThreshold?: number;
  /** How long the circuit stays open before half-opening, in ms. Default: 30000 */
  resetTimeout?: number;
  /** Classifies each error for the circuit. Default: `defaultShouldOpen` */
  shouldOpen?: ShouldOpen;
  /** Called on every state transition. Handy for logs/metrics. Default: null */
  onStateChange?: OnCircuitStateChange | null;
}

/**
 * How `retry()` talks to a circuit. Internal wiring — exposed only because it
 * appears on {@link ResolvedOptions}.
 */
export interface CircuitHandle {
  /** Throws `CircuitOpenError` when the circuit does not admit an attempt. */
  admit(): void;
  recordSuccess(): void;
  recordFailure(error: unknown): void;
  /** Frees a half-open probe slot without recording an outcome (caller abort). */
  release(): void;
}
```

- [ ] **Step 2: Extend `Options` and `ResolvedOptions` in `src/types.ts`**

Add to `CoreOptions` (after the `shouldRetry` entry):

```ts
  /** Shares a named circuit breaker across calls. Default: undefined (no circuit) */
  circuitBreaker?: CircuitBreakerOptions;
```

Replace the `ResolvedOptions` type with (only the `Omit`/`Pick` lists and the
`circuit` field change):

```ts
export type ResolvedOptions = Required<Omit<CoreOptions, 'signal' | 'circuitBreaker'>> &
  Pick<CoreOptions, 'signal' | 'circuitBreaker'> & {
    /** How many retries have been performed so far. */
    retained: number;
    /** The base (uncapped) delay of the previous retry, or null before the first. */
    currentDelay: number | null;
    /** Timestamp (ms) when the top-level retry began; used for `maxElapsedTime`. */
    startedAt: number;
    /** Internal handle to the shared circuit, when `circuitBreaker` was given. */
    circuit: CircuitHandle | null;
  };
```

- [ ] **Step 3: Write the failing tests**

Create `tests/circuit-breaker.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  acquireCircuit,
  CircuitOpenError,
  defaultShouldOpen,
  resetCircuitBreakers,
} from '../src/circuit-breaker';

describe('defaultShouldOpen', () => {
  it('counts errors without HTTP semantics', () => {
    expect(defaultShouldOpen(new Error('network'))).toBe(true);
    expect(defaultShouldOpen(undefined)).toBe(true);
  });

  it('counts server errors', () => {
    expect(defaultShouldOpen({ status: 500 })).toBe(true);
    expect(defaultShouldOpen({ response: { status: 503 } })).toBe(true);
  });

  it('opens immediately on 429', () => {
    expect(defaultShouldOpen({ status: 429 })).toBe('open');
  });

  it('does not count remaining 4xx', () => {
    expect(defaultShouldOpen({ status: 400 })).toBe(false);
    expect(defaultShouldOpen({ status: 404 })).toBe(false);
  });
});

describe('circuit state machine', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetCircuitBreakers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  const countAll = () => true;
  const options = (key: string, overrides: object = {}) => ({
    key,
    failureThreshold: 3,
    resetTimeout: 1_000,
    shouldOpen: countAll,
    ...overrides,
  });

  it('stays closed below the threshold and opens when it is reached', () => {
    const circuit = acquireCircuit(options('a'));
    circuit.admit();
    circuit.recordFailure('boom-1');
    circuit.admit();
    circuit.recordFailure('boom-2');
    circuit.admit(); // still closed after 2 of 3
    circuit.recordFailure('boom-3');
    expect(() => circuit.admit()).toThrow(CircuitOpenError);
  });

  it('exposes key, remainingMs and the last error on CircuitOpenError', () => {
    const circuit = acquireCircuit(options('b', { failureThreshold: 1 }));
    circuit.admit();
    circuit.recordFailure('boom');
    try {
      circuit.admit();
      expect.unreachable('admit should have thrown');
    } catch (error) {
      const open = error as CircuitOpenError;
      expect(open).toBeInstanceOf(CircuitOpenError);
      expect(open.name).toBe('CircuitOpenError');
      expect(open.key).toBe('b');
      expect(open.remainingMs).toBeGreaterThan(0);
      expect(open.remainingMs).toBeLessThanOrEqual(1_000);
      expect(open.cause).toBe('boom');
    }
  });

  it('a successful attempt resets the consecutive counter', () => {
    const circuit = acquireCircuit(options('c', { failureThreshold: 2 }));
    circuit.recordFailure('boom');
    circuit.recordSuccess();
    circuit.recordFailure('boom');
    circuit.admit(); // would have thrown if the counter had not reset
  });

  it('non-counted failures do not count', () => {
    const circuit = acquireCircuit(options('d', { failureThreshold: 1, shouldOpen: () => false }));
    circuit.recordFailure({ status: 404 });
    circuit.admit();
  });

  it('half-opens after resetTimeout and allows exactly one probe', () => {
    const circuit = acquireCircuit(options('e', { failureThreshold: 1 }));
    circuit.recordFailure('boom');
    vi.advanceTimersByTime(999);
    expect(() => circuit.admit()).toThrow(CircuitOpenError);
    vi.advanceTimersByTime(1);
    circuit.admit(); // the probe
    expect(() => circuit.admit()).toThrow(CircuitOpenError); // concurrent call blocked
  });

  it('a successful probe closes the circuit', () => {
    const circuit = acquireCircuit(options('f', { failureThreshold: 1 }));
    circuit.recordFailure('boom');
    vi.advanceTimersByTime(1_000);
    circuit.admit();
    circuit.recordSuccess();
    circuit.admit();
    circuit.admit(); // closed: no probe limit
  });

  it('a counted probe failure re-opens the circuit and restarts the cooldown', () => {
    const circuit = acquireCircuit(options('g', { failureThreshold: 1 }));
    circuit.recordFailure('boom-1');
    vi.advanceTimersByTime(1_000);
    circuit.admit();
    circuit.recordFailure('boom-2');
    expect(() => circuit.admit()).toThrow(CircuitOpenError);
    vi.advanceTimersByTime(999);
    expect(() => circuit.admit()).toThrow(CircuitOpenError);
    vi.advanceTimersByTime(1);
    circuit.admit();
  });

  it('a non-counted probe failure closes the circuit (the service answered)', () => {
    const shouldOpen = (error: unknown) => error !== 'not-my-fault';
    const circuit = acquireCircuit(options('h', { failureThreshold: 1, shouldOpen }));
    circuit.recordFailure('boom');
    vi.advanceTimersByTime(1_000);
    circuit.admit();
    circuit.recordFailure('not-my-fault');
    circuit.admit();
    circuit.admit(); // closed: no probe limit
  });

  it('release() frees the probe slot without changing state', () => {
    const circuit = acquireCircuit(options('i', { failureThreshold: 1 }));
    circuit.recordFailure('boom');
    vi.advanceTimersByTime(1_000);
    circuit.admit();
    circuit.release();
    circuit.admit(); // the next call may probe
  });

  it('an `open` verdict opens the circuit immediately', () => {
    const circuit = acquireCircuit(options('j', { shouldOpen: () => 'open' as const }));
    circuit.recordFailure('rate limited');
    expect(() => circuit.admit()).toThrow(CircuitOpenError);
  });

  it('honours forMs from an object verdict over resetTimeout', () => {
    const circuit = acquireCircuit(
      options('k', {
        resetTimeout: 60_000,
        shouldOpen: () => ({ open: true as const, forMs: 500 }),
      }),
    );
    circuit.recordFailure('rate limited');
    vi.advanceTimersByTime(499);
    expect(() => circuit.admit()).toThrow(CircuitOpenError);
    vi.advanceTimersByTime(1);
    circuit.admit();
  });

  it('fires onStateChange on every transition with the triggering error', () => {
    const onStateChange = vi.fn();
    const circuit = acquireCircuit(options('l', { failureThreshold: 1, onStateChange }));
    circuit.recordFailure('boom');
    vi.advanceTimersByTime(1_000);
    circuit.admit();
    circuit.recordSuccess();
    expect(onStateChange.mock.calls.map(([event]) => [event.from, event.to])).toEqual([
      ['closed', 'open'],
      ['open', 'half-open'],
      ['half-open', 'closed'],
    ]);
    expect(onStateChange.mock.calls[0][0]).toMatchObject({ key: 'l', error: 'boom', failures: 1 });
  });

  it('isolates circuits per key', () => {
    const first = acquireCircuit(options('m', { failureThreshold: 1 }));
    const second = acquireCircuit(options('n', { failureThreshold: 1 }));
    first.recordFailure('boom');
    expect(() => first.admit()).toThrow(CircuitOpenError);
    second.admit();
  });

  it('the first call with a key fixes the config; later configs are ignored', () => {
    const first = acquireCircuit(options('o', { failureThreshold: 1 }));
    const second = acquireCircuit(options('o', { failureThreshold: 99 }));
    second.recordFailure('boom');
    expect(() => first.admit()).toThrow(CircuitOpenError);
    expect(() => second.admit()).toThrow(CircuitOpenError);
  });

  it('resetCircuitBreakers() clears every circuit', () => {
    const circuit = acquireCircuit(options('p', { failureThreshold: 1 }));
    circuit.recordFailure('boom');
    resetCircuitBreakers();
    const fresh = acquireCircuit(options('p', { failureThreshold: 1 }));
    fresh.admit();
  });
});
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `cd ~/Workspace/Personal/promise-fn-retry-circuit-breaker && npx vitest run tests/circuit-breaker.test.ts`
Expected: FAIL — `Cannot find module '../src/circuit-breaker'` (or equivalent resolution error).

- [ ] **Step 5: Implement `src/circuit-breaker.ts`**

```ts
import type {
  CircuitBreakerOptions,
  CircuitHandle,
  CircuitState,
  OnCircuitStateChange,
  ShouldOpen,
} from './types';

const now = (): number => Date.now();

/**
 * The error a call rejects with when the circuit blocks it. Carries the last
 * real error that contributed to opening via {@link CircuitOpenError.cause} —
 * nothing is swallowed, even on a call that ran zero attempts.
 */
export class CircuitOpenError extends Error {
  readonly key: string;
  /** Time until the circuit half-opens, in ms (0 when already half-open). */
  readonly remainingMs: number;
  /** The last real error that contributed to opening the circuit. */
  readonly cause: unknown;

  constructor(key: string, remainingMs: number, cause: unknown) {
    super(`The circuit "${key}" is open`);
    this.name = 'CircuitOpenError';
    this.key = key;
    this.remainingMs = remainingMs;
    this.cause = cause;
  }
}

/**
 * The library's default classifier, duck-typed over fetch-like and axios-like
 * errors. Exported so callers can replace it or compose with it.
 */
export const defaultShouldOpen: ShouldOpen = (error) => {
  const err = error as { status?: unknown; response?: { status?: unknown } } | null | undefined;
  const raw = err?.status ?? err?.response?.status;
  if (typeof raw !== 'number') return true; // no HTTP semantics (network, timeout) — counts
  if (raw === 429) return 'open'; // rate limited — open straight away
  if (raw >= 500) return true; // server error — counts
  return false; // remaining 4xx — the request's fault, not the service's
};

interface ResolvedBreakerOptions {
  key: string;
  failureThreshold: number;
  resetTimeout: number;
  shouldOpen: ShouldOpen;
  onStateChange: OnCircuitStateChange | null;
}

interface Circuit {
  options: ResolvedBreakerOptions;
  state: CircuitState;
  /** Consecutive counted failures; any successful attempt resets it. */
  failures: number;
  /** Timestamp (ms) when an open circuit may half-open. */
  openedUntil: number;
  /** Whether the single half-open probe is in flight. */
  probing: boolean;
  /** The last counted error — surfaced as `CircuitOpenError.cause`. */
  lastError: unknown;
}

const registry = new Map<string, Circuit>();

/** Clears every circuit. Intended for tests. */
export const resetCircuitBreakers = (): void => {
  registry.clear();
};

/** Moves the circuit to a new state and notifies `onStateChange`. */
const transition = (circuit: Circuit, to: CircuitState, error?: unknown): void => {
  const from = circuit.state;
  if (from === to) return;
  circuit.state = to;
  circuit.options.onStateChange?.({
    key: circuit.options.key,
    from,
    to,
    error,
    failures: circuit.failures,
  });
};

const open = (circuit: Circuit, error: unknown, forMs?: number): void => {
  circuit.lastError = error;
  circuit.openedUntil = now() + (forMs ?? circuit.options.resetTimeout);
  circuit.probing = false;
  transition(circuit, 'open', error);
};

const close = (circuit: Circuit, error?: unknown): void => {
  circuit.failures = 0;
  circuit.probing = false;
  transition(circuit, 'closed', error);
};

/**
 * Returns the handle `retry()` uses to talk to the circuit named by
 * `options.key`. The first call with a key creates the circuit and fixes its
 * config; later calls reuse it and their config is ignored.
 */
export const acquireCircuit = (options: CircuitBreakerOptions): CircuitHandle => {
  const existing = registry.get(options.key);
  const circuit: Circuit = existing ?? {
    options: {
      key: options.key,
      failureThreshold: options.failureThreshold ?? 5,
      resetTimeout: options.resetTimeout ?? 30_000,
      shouldOpen: options.shouldOpen ?? defaultShouldOpen,
      onStateChange: options.onStateChange ?? null,
    },
    state: 'closed',
    failures: 0,
    openedUntil: 0,
    probing: false,
    lastError: undefined,
  };
  if (!existing) registry.set(options.key, circuit);

  return {
    admit(): void {
      if (circuit.state === 'open') {
        const remaining = circuit.openedUntil - now();
        if (remaining > 0) {
          throw new CircuitOpenError(circuit.options.key, remaining, circuit.lastError);
        }
        transition(circuit, 'half-open');
      }
      if (circuit.state === 'half-open') {
        if (circuit.probing) {
          throw new CircuitOpenError(circuit.options.key, 0, circuit.lastError);
        }
        circuit.probing = true; // this call is the probe
      }
    },

    recordSuccess(): void {
      if (circuit.state === 'half-open') close(circuit);
      else circuit.failures = 0;
      circuit.probing = false;
    },

    recordFailure(error: unknown): void {
      const wasHalfOpen = circuit.state === 'half-open';
      circuit.probing = false;
      const verdict = circuit.options.shouldOpen(error);
      if (verdict === false) {
        // The service answered; the error is the caller's problem, not ill health.
        if (wasHalfOpen) close(circuit, error);
        return;
      }
      circuit.failures += 1;
      circuit.lastError = error;
      if (verdict === true) {
        if (wasHalfOpen || circuit.failures >= circuit.options.failureThreshold) {
          open(circuit, error);
        }
        return;
      }
      open(circuit, error, typeof verdict === 'object' ? verdict.forMs : undefined);
    },

    release(): void {
      circuit.probing = false;
    },
  };
};
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run tests/circuit-breaker.test.ts`
Expected: PASS (18 tests).

- [ ] **Step 7: Typecheck and commit**

Run: `npm run typecheck` — expected: clean.

```bash
git add src/types.ts src/circuit-breaker.ts tests/circuit-breaker.test.ts
git commit -m "feat: circuit breaker state machine and registry"
```

---

### Task 2: Wire the circuit into `retry()`

**Files:**

- Modify: `src/retry.ts`
- Modify: `src/index.ts`
- Test: `tests/retry-circuit.test.ts`

**Interfaces:**

- Consumes (from Task 1): `acquireCircuit(options): CircuitHandle` and the handle's `admit()/recordSuccess()/recordFailure(error)/release()`; `CircuitOpenError`.
- Produces: the public API — `retry(fn, { circuitBreaker })`; `CircuitOpenError`, `defaultShouldOpen`, `resetCircuitBreakers` and the Task 1 types re-exported from the package root.

- [ ] **Step 1: Write the failing tests**

Create `tests/retry-circuit.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import retry, {
  AttemptTimeoutError,
  BailError,
  CircuitOpenError,
  resetCircuitBreakers,
} from '../src';

describe('retry with a circuit breaker', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetCircuitBreakers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  const failWith = (error: unknown) => () => Promise.reject(error);
  const ok = () => Promise.resolve('ok');

  it('fails fast without calling fn once the circuit is open', async () => {
    const circuitBreaker = { key: 'a', failureThreshold: 2, resetTimeout: 1_000 };
    await expect(retry(failWith('boom'), { times: 0, circuitBreaker })).rejects.toBe('boom');
    await expect(retry(failWith('boom'), { times: 0, circuitBreaker })).rejects.toBe('boom');
    const fn = vi.fn(ok);
    await expect(retry(fn, { times: 0, circuitBreaker })).rejects.toBeInstanceOf(CircuitOpenError);
    expect(fn).not.toHaveBeenCalled();
  });

  it('exposes the last real error via cause on a blocked call', async () => {
    const circuitBreaker = { key: 'b', failureThreshold: 1, resetTimeout: 1_000 };
    await expect(retry(failWith('boom'), { times: 0, circuitBreaker })).rejects.toBe('boom');
    const error = await retry(ok, { times: 0, circuitBreaker }).catch((err: unknown) => err);
    const open = error as CircuitOpenError;
    expect(open).toBeInstanceOf(CircuitOpenError);
    expect(open.key).toBe('b');
    expect(open.cause).toBe('boom');
    expect(open.remainingMs).toBeGreaterThan(0);
  });

  it('cuts the remaining retries short when the circuit opens mid-call', async () => {
    const circuitBreaker = { key: 'c', failureThreshold: 2, resetTimeout: 1_000 };
    const fn = vi.fn(failWith('boom'));
    const promise = retry(fn, { times: 5, initialDelayTime: 10, circuitBreaker });
    const assertion = expect(promise).rejects.toBeInstanceOf(CircuitOpenError);
    await vi.advanceTimersByTimeAsync(10); // wait before retry 1 (attempt 2 opens the circuit)
    await vi.advanceTimersByTimeAsync(20); // wait before retry 2 (blocked by the circuit)
    await assertion;
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('recovers through a successful half-open probe', async () => {
    const circuitBreaker = { key: 'd', failureThreshold: 1, resetTimeout: 1_000 };
    await expect(retry(failWith('boom'), { times: 0, circuitBreaker })).rejects.toBe('boom');
    await expect(retry(ok, { times: 0, circuitBreaker })).rejects.toBeInstanceOf(CircuitOpenError);
    vi.advanceTimersByTime(1_000);
    await expect(retry(ok, { times: 0, circuitBreaker })).resolves.toBe('ok');
    await expect(retry(ok, { times: 0, circuitBreaker })).resolves.toBe('ok'); // closed again
  });

  it('blocks concurrent calls while the half-open probe is in flight', async () => {
    const circuitBreaker = { key: 'e', failureThreshold: 1, resetTimeout: 1_000 };
    await expect(retry(failWith('boom'), { times: 0, circuitBreaker })).rejects.toBe('boom');
    vi.advanceTimersByTime(1_000);
    let releaseProbe!: (value: string) => void;
    const gate = new Promise<string>((resolve) => {
      releaseProbe = resolve;
    });
    const probe = retry(() => gate, { times: 0, circuitBreaker });
    await expect(retry(ok, { times: 0, circuitBreaker })).rejects.toBeInstanceOf(CircuitOpenError);
    releaseProbe('ok');
    await expect(probe).resolves.toBe('ok');
  });

  it('opens immediately on 429 via the default classifier', async () => {
    const circuitBreaker = { key: 'f', failureThreshold: 5, resetTimeout: 1_000 };
    await expect(retry(failWith({ status: 429 }), { times: 0, circuitBreaker })).rejects.toEqual({
      status: 429,
    });
    const fn = vi.fn(ok);
    await expect(retry(fn, { times: 0, circuitBreaker })).rejects.toBeInstanceOf(CircuitOpenError);
    expect(fn).not.toHaveBeenCalled();
  });

  it('a resolved value failing `until` does not count as a circuit failure', async () => {
    const circuitBreaker = { key: 'g', failureThreshold: 1, resetTimeout: 1_000 };
    const promise = retry(() => Promise.resolve('pending'), {
      times: 1,
      initialDelayTime: 1,
      until: (value) => value === 'done',
      circuitBreaker,
    });
    await vi.advanceTimersByTimeAsync(1);
    await expect(promise).resolves.toBe('pending');
    const fn = vi.fn(ok);
    await expect(retry(fn, { times: 0, circuitBreaker })).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1); // circuit stayed closed
  });

  it('a caller abort does not count as a circuit failure', async () => {
    const circuitBreaker = { key: 'h', failureThreshold: 1, resetTimeout: 1_000 };
    const controller = new AbortController();
    const promise = retry(
      () =>
        new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('late')), 50);
        }),
      { times: 0, circuitBreaker, signal: controller.signal },
    );
    const assertion = expect(promise).rejects.toBeTruthy();
    controller.abort();
    await vi.advanceTimersByTimeAsync(50);
    await assertion;
    await expect(retry(ok, { times: 0, circuitBreaker })).resolves.toBe('ok');
  });

  it('counts the BailError cause through shouldOpen', async () => {
    const circuitBreaker = { key: 'i', failureThreshold: 1, resetTimeout: 1_000 };
    await expect(
      retry(() => Promise.reject(new BailError('boom')), { times: 3, circuitBreaker }),
    ).rejects.toBe('boom');
    const fn = vi.fn(ok);
    await expect(retry(fn, { times: 0, circuitBreaker })).rejects.toBeInstanceOf(CircuitOpenError);
    expect(fn).not.toHaveBeenCalled();
  });

  it('counts an attempt timeout as a circuit failure', async () => {
    const circuitBreaker = { key: 'j', failureThreshold: 1, resetTimeout: 1_000 };
    const promise = retry(() => new Promise<never>(() => {}), {
      times: 0,
      attemptTimeout: 20,
      circuitBreaker,
    });
    const assertion = expect(promise).rejects.toBeInstanceOf(AttemptTimeoutError);
    await vi.advanceTimersByTimeAsync(20);
    await assertion;
    const fn = vi.fn(ok);
    await expect(retry(fn, { times: 0, circuitBreaker })).rejects.toBeInstanceOf(CircuitOpenError);
    expect(fn).not.toHaveBeenCalled();
  });

  it('keeps circuits isolated per key', async () => {
    await expect(
      retry(failWith('boom'), { times: 0, circuitBreaker: { key: 'k', failureThreshold: 1 } }),
    ).rejects.toBe('boom');
    await expect(
      retry(ok, { times: 0, circuitBreaker: { key: 'l', failureThreshold: 1 } }),
    ).resolves.toBe('ok');
  });

  it('runs without a circuitBreaker exactly as before', async () => {
    await expect(retry(ok)).resolves.toBe('ok');
    await expect(retry(failWith('boom'), { times: 0 })).rejects.toBe('boom');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/retry-circuit.test.ts`
Expected: FAIL — the package root does not export `CircuitOpenError`/`resetCircuitBreakers`, and `circuitBreaker` is ignored by `retry()`.

- [ ] **Step 3: Wire the circuit into `src/retry.ts`**

Add the import at the top (after the existing type import):

```ts
import { acquireCircuit } from './circuit-breaker';
```

Update `defaultOptions`'s type annotation (values unchanged):

```ts
const defaultOptions: Omit<
  ResolvedOptions,
  'retained' | 'currentDelay' | 'startedAt' | 'signal' | 'circuitBreaker' | 'circuit'
> = {
```

In `resolveOptions`, seed the handle (the object literal gains `circuit`, and a
line after it resolves the option):

```ts
const resolveOptions = (options: Options): ResolvedOptions => {
  const { retries, factor, minTimeout, maxTimeout, randomize, ...core } = options;
  const resolved: ResolvedOptions = {
    ...defaultOptions,
    retained: 0,
    currentDelay: null,
    startedAt: now(),
    circuit: null,
    ...core,
  };
  resolved.circuit = core.circuitBreaker ? acquireCircuit(core.circuitBreaker) : null;
  // Aliases only fill a canonical option that was left unset; the canonical wins.
  ...(existing alias lines unchanged)...
  return resolved;
};
```

Replace `run` with:

```ts
/** The recursive retry loop, working on already-resolved options. */
const run = <T>(requestFn: OperationFn<T>, resolved: ResolvedOptions): Promise<T> => {
  const { signal, shouldRetry, until, times, retained, forever, circuit } = resolved;

  if (signal?.aborted) return Promise.reject(abortError(signal));

  if (circuit) {
    try {
      circuit.admit();
    } catch (error) {
      return Promise.reject(error);
    }
  }

  const canRetry = forever || retained < times;

  return attemptOnce(requestFn, resolved).then(
    (value) => {
      // The circuit measures service health: any response is a success, even
      // one that fails `until` below.
      circuit?.recordSuccess();
      // Poll: a resolved value that fails `until` is treated as worth retrying.
      if (until && !until(value)) {
        if (!canRetry) return value;
        const plan = planWait(resolved, undefined);
        if (!plan) return value;
        return proceed(requestFn, resolved, undefined, plan);
      }
      return value;
    },
    (error: unknown) => {
      if (isBailError(error)) {
        // The bail's cause is a real service error — the circuit still sees it.
        circuit?.recordFailure(error.cause);
        throw error.cause;
      }
      if (signal?.aborted) {
        // A caller abort is not the service's fault; free any probe slot.
        circuit?.release();
        throw abortError(signal);
      }
      circuit?.recordFailure(error);
      if (!canRetry || (shouldRetry && !shouldRetry(error))) throw error;
      const plan = planWait(resolved, error);
      if (!plan) throw error;
      return proceed(requestFn, resolved, error, plan);
    },
  );
};
```

- [ ] **Step 4: Re-export the new names from `src/index.ts`**

Replace the file with:

```ts
export { default, retry, BailError, AttemptTimeoutError } from './retry';
export { CircuitOpenError, defaultShouldOpen, resetCircuitBreakers } from './circuit-breaker';
export type {
  Options,
  ResolvedOptions,
  OnRetry,
  ShouldRetry,
  Jitter,
  OperationFn,
  GetDelay,
  Until,
  CircuitBreakerOptions,
  CircuitHandle,
  CircuitState,
  CircuitStateChangeEvent,
  OnCircuitStateChange,
  OpenVerdict,
  ShouldOpen,
} from './types';
```

- [ ] **Step 5: Run the whole suite to verify it passes**

Run: `npm run test`
Expected: PASS — the two new files plus the existing `tests/retry.test.ts`
(no regression: without `circuitBreaker`, `resolved.circuit` is `null` and
every `circuit?.` call is a no-op).

- [ ] **Step 6: Typecheck, lint and commit**

Run: `npm run typecheck && npm run lint && npm run format:check`
Expected: all clean (run `npm run format` first if Prettier complains, then stage only the files this task touched).

```bash
git add src/retry.ts src/index.ts tests/retry-circuit.test.ts
git commit -m "feat: consult the circuit on every attempt in retry()"
```

---

### Task 3: Documentation and version bump

**Files:**

- Create: `website/guide/circuit-breaker.md`
- Modify: `website/.vitepress/config.ts` (sidebar), `website/reference/api.md`, `README.md`, `package.json`

**Interfaces:**

- Consumes: the public API from Task 2 (`circuitBreaker` option, `CircuitOpenError`, `defaultShouldOpen`, `resetCircuitBreakers`).
- Produces: user-facing docs; version `2.2.0`.

- [ ] **Step 1: Write the guide**

Create `website/guide/circuit-breaker.md`:

````markdown
# Circuit breaker

When a service is down, retrying harder makes things worse. A circuit breaker
watches consecutive failures across **all** calls that share a `key`, and once
a threshold is reached it fails fast — rejecting immediately with
`CircuitOpenError` instead of calling your function — until a cooldown passes.

```ts
import retry from 'promise-fn-retry';

const user = await retry(() => fetchUser(), {
  times: 3,
  circuitBreaker: {
    key: 'user-api', // names the shared circuit
    failureThreshold: 5, // opens after 5 consecutive counted failures
    resetTimeout: 30_000, // half-opens after 30 s
  },
});
```

There is nothing to create or hold on to: the first call with a `key` creates
the circuit inside the library and fixes its config; every later call with the
same `key` shares it (later configs are ignored).

## The three states

- **Closed** — traffic flows. Every counted failure increments a consecutive
  counter; any success resets it. Reaching `failureThreshold` opens the circuit.
- **Open** — calls reject immediately with `CircuitOpenError`, without calling
  your function. After `resetTimeout`, the circuit half-opens.
- **Half-open** — exactly one probe call is let through. Success closes the
  circuit; a counted failure re-opens it and restarts the cooldown.

The circuit is consulted before **every attempt**, not just at the start of
`retry()` — a circuit that opens mid-call cuts the remaining retries short.

## Deciding what counts — `shouldOpen`

Not every error means the service is unhealthy. `shouldOpen(error)` returns:

| Verdict                  | Meaning                                            |
| ------------------------ | -------------------------------------------------- |
| `false`                  | Not the service's fault — does not count           |
| `true`                   | Counts one failure towards `failureThreshold`      |
| `'open'`                 | Opens the circuit immediately for `resetTimeout`   |
| `{ open: true, forMs? }` | Opens immediately, optionally for a given duration |

By default the library applies `defaultShouldOpen`, which duck-types HTTP
status codes (`error.status` or `error.response.status`): **429 opens the
circuit immediately**, **5xx counts**, any other **4xx does not count**, and an
error with no status (network failure, timeout) counts. You can replace it, or
compose with it:

```ts
import retry, { defaultShouldOpen } from 'promise-fn-retry';

await retry(() => fetchUser(), {
  circuitBreaker: {
    key: 'user-api',
    // Handle your special cases; delegate the rest to the default.
    shouldOpen: (err) => (err.status === 404 ? true : defaultShouldOpen(err)),
  },
});
```

To honour a `Retry-After` hint on 429, return the duration yourself:

```ts
shouldOpen: (err) =>
  err.status === 429 ? { open: true, forMs: err.retryAfterMs } : defaultShouldOpen(err),
```

## Failing fast — `CircuitOpenError`

A blocked call rejects with a `CircuitOpenError` carrying:

- `key` — which circuit blocked it;
- `remainingMs` — time until the circuit half-opens;
- `cause` — the **last real error** that contributed to opening. Nothing is
  swallowed: even a call that ran zero attempts can show the service's error.

```ts
try {
  await retry(() => fetchUser(), { circuitBreaker: { key: 'user-api' } });
} catch (err) {
  if (err instanceof CircuitOpenError) {
    log.warn(`user-api blocked for ${err.remainingMs} ms`, err.cause);
    return cachedUser; // fallback
  }
  throw err;
}
```

## Observing transitions — `onStateChange`

```ts
circuitBreaker: {
  key: 'user-api',
  onStateChange: ({ key, from, to, error, failures }) =>
    log.warn(`circuit ${key}: ${from} → ${to}`, { failures, error }),
}
```

Fires on every transition, carrying the triggering error when there is one.
The existing `onRetry` hook keeps firing for every retry that actually runs.

## How it plays with the other options

- `times` bounds attempts within one call; `failureThreshold` counts across
  calls. With `times: 3` and `failureThreshold: 5`, one all-failing call
  contributes 4 failures and the next call's first failure opens the circuit.
- `shouldRetry` and `shouldOpen` are independent: whether to retry is a
  different question from whether the service is unhealthy.
- A resolved value that fails [`until`](/guide/until) does **not** count — the
  circuit measures health, not poll progress.
- An [`attemptTimeout`](/guide/attempt-timeout) counts (a hung service is an
  unhealthy service); a caller abort via [`signal`](/guide/abort-signal) does not.
- A [`BailError`](/guide/bail-error)'s cause is still classified by
  `shouldOpen`, even though the call stops retrying.

## Testing

Circuits live in a module-level registry, so state persists across calls — by
design. In tests, clear it between cases:

```ts
import { resetCircuitBreakers } from 'promise-fn-retry';

beforeEach(() => resetCircuitBreakers());
```
````

- [ ] **Step 2: Add the guide to the sidebar**

In `website/.vitepress/config.ts`, in the `Guides` items array, insert after
the `Selective retries` line:

```ts
          { text: 'Circuit breaker', link: '/guide/circuit-breaker' },
```

- [ ] **Step 3: Document the option in `website/reference/api.md`**

Read the file first and follow its existing table/section format exactly. Add:
a `circuitBreaker` row/section covering `key`, `failureThreshold` (default 5),
`resetTimeout` (default 30000), `shouldOpen` (default `defaultShouldOpen`) and
`onStateChange` (default `null`); and entries for the exported
`CircuitOpenError` (fields `key`, `remainingMs`, `cause`), `defaultShouldOpen`
and `resetCircuitBreakers()`. Reuse the wording from Step 1's guide — do not
invent new terminology.

- [ ] **Step 4: Update the README**

In `README.md`, add a bullet to the `## Why` list (after the "Observable."
bullet):

```markdown
- **Protective.** An opt-in circuit breaker (`circuitBreaker`) shared across
  calls by `key`: after enough consecutive failures it fails fast with
  `CircuitOpenError` instead of hammering a service that is down, then probes
  and recovers on its own.
```

And after the existing top example, extend with a short second example:

````markdown
```ts
// Stop hammering a service that is down: fail fast once 5 consecutive
// attempts (across calls) have failed, probe again after 30 s.
const user = await retry(() => fetchUser(), {
  times: 3,
  circuitBreaker: { key: 'user-api', failureThreshold: 5, resetTimeout: 30_000 },
});
```
````

````

- [ ] **Step 5: Bump the version**

In `package.json`, change `"version": "2.1.0"` to `"version": "2.2.0"`
(additive feature → minor bump, per the design doc).

- [ ] **Step 6: Build the docs to verify**

Run: `npm run docs:build`
Expected: build succeeds; no dead links reported (VitePress fails on dead links by default).

- [ ] **Step 7: Commit**

```bash
git add website/guide/circuit-breaker.md website/.vitepress/config.ts website/reference/api.md README.md package.json
git commit -m "docs: circuit breaker guide, API reference and version bump"
````

---

### Task 4: Full verification and single-commit squash

**Files:**

- No new files; runs the repo's checks and rewrites local history into the one commit the PR carries.

**Interfaces:**

- Consumes: everything above.
- Produces: branch `feat/circuit-breaker` with exactly one commit on top of `main`, all checks green.

- [ ] **Step 1: Run every check**

Run, from the worktree root:

```bash
npm run typecheck && npm run lint && npm run format:check && npm run test && npm run build && npm run docs:build
```

Expected: all six commands succeed. If `format:check` fails, run
`npm run format`, stage **only files this feature touched**, amend the last
commit and re-run.

- [ ] **Step 2: Squash into a single commit**

The PR carries one commit (per the user's git-commit convention). The design
doc commit (`docs: circuit breaker design`) is part of the branch and gets
folded in too:

```bash
git reset --soft $(git merge-base main HEAD)
git commit -F - <<'EOF'
feat: opt-in circuit breaker shared across calls by key

Adds a `circuitBreaker` option to `retry()`: a named circuit shared across
calls counts consecutive failures per attempt and, once open, fails fast with
`CircuitOpenError` (carrying `key`, `remainingMs` and the last real error as
`cause`) until a cooldown passes, then probes once and recovers. Errors are
classified by `shouldOpen` — the exported `defaultShouldOpen` counts 5xx and
no-status errors, opens immediately on 429 and ignores other 4xx. Includes
`onStateChange` observability, `resetCircuitBreakers()` for tests, a docs
guide and the design doc.
EOF
```

- [ ] **Step 3: Verify the squashed state**

```bash
git log --oneline main..HEAD   # expected: exactly 1 commit
npm run test                   # expected: PASS — nothing lost in the squash
```

---

## Self-review notes

- Spec coverage: state machine + registry + defaults (Task 1), per-attempt
  consult/record and every interplay row — `until`, abort, `BailError`,
  `attemptTimeout`, `forever` untouched, `getDelay` untouched (Task 2 tests),
  classification verdicts incl. 429/`forMs` (Tasks 1–2), observability and
  `cause` (Tasks 1–2), docs + README + API reference (Task 3), minor version
  bump (Task 3), non-goals honoured (no `createCircuitBreaker` export, no
  automatic `Retry-After`, no playground changes).
- `ResolvedOptions.circuit` is internal state on a public type, consistent
  with the existing `retained`/`currentDelay`/`startedAt` fields.
- The `open→half-open` transition happens lazily inside `admit()` when the
  cooldown has expired, so no timers are held by the library.
