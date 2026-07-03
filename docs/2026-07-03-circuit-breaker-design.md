# Design — Circuit breaker for `promise-fn-retry`

**Date:** 2026-07-03
**Status:** Approved

## Goal

Add an opt-in **circuit breaker** to `retry()`: when an operation keeps
failing, stop hammering it — fail fast with a dedicated error until a cooldown
passes, then probe once and recover. Fully additive; existing users notice no
difference.

## Why in this library

A circuit breaker needs **state shared across calls** (a failure counter and
an open/half-open/closed state machine), which a stateless `retry(fn, options)`
call cannot hold on its own. Rather than forcing users to create and thread a
breaker object around, the library keeps an internal registry and callers name
the circuit with a `key`. One option, zero setup:

```ts
import retry from 'promise-fn-retry';

const user = await retry(() => fetchUser(), {
  times: 3,
  circuitBreaker: {
    key: 'user-api', // identifies the shared circuit
    failureThreshold: 5, // opens after 5 consecutive counted failures
    resetTimeout: 30_000, // half-opens after 30 s
  },
});
```

## Foundational decisions

| Area           | Decision                                                                                                           |
| -------------- | ------------------------------------------------------------------------------------------------------------------ |
| API shape      | A single `circuitBreaker` option on `retry()`; no classes, no prior setup                                          |
| State          | Module-level registry keyed by `circuitBreaker.key`; first call with a key fixes its config, later configs ignored |
| Counting       | **Per attempt** — every counted failure increments the circuit, and the circuit is consulted before every attempt  |
| Open behaviour | Reject immediately with `CircuitOpenError` (carrying `key`, `remainingMs` and `cause`)                             |
| Classification | `shouldOpen(error)` hook; the library ships and exports `defaultShouldOpen` as the default                         |
| Observability  | `onStateChange` hook on every transition, always carrying the triggering error when there is one                   |
| Test hygiene   | Exported `resetCircuitBreakers()` clears the registry                                                              |
| Compatibility  | Additive, zero new dependencies, universal APIs only → **minor** version bump                                      |

## The state machine

Classic three states, evaluated against `Date.now()` (the same clock
`maxElapsedTime` already uses in `src/retry.ts`):

- **closed** — traffic flows. Each counted failure increments a consecutive
  counter; any successful attempt resets it to zero. Reaching
  `failureThreshold` (or an `'open'` verdict from `shouldOpen`) transitions to
  **open**.
- **open** — every attempt is blocked: the call rejects with
  `CircuitOpenError` without invoking `fn`. After `resetTimeout` (or the
  `forMs` a verdict supplied), the next attempt transitions to **half-open**.
- **half-open** — exactly **one** probe attempt is allowed through
  (concurrent calls keep receiving `CircuitOpenError` while the probe is in
  flight). Probe success closes the circuit and resets the counter; a counted
  probe failure re-opens it and restarts the cooldown. A probe failure that
  `shouldOpen` classifies as `false` (e.g. a plain 4xx) also **closes** the
  circuit — the service answered, so it is healthy; the error itself is the
  caller's problem.

Because the circuit is consulted **before every attempt** — not just at the
start of `retry()` — a circuit that opens mid-retry cuts the remaining
attempts of that call short immediately.

### Interplay between `times` and `failureThreshold`

The two bound different axes: `times` caps attempts within one call;
`failureThreshold` counts consecutive failures across all calls sharing the
key. With `times: 3` and `failureThreshold: 5`, one all-failing call
contributes 4 failures and the next call's first failure opens the circuit —
its remaining attempts are then blocked. No combination is invalid; the ratio
only tunes sensitivity.

## Error classification — `shouldOpen`

`shouldOpen(error)` decides what an error means for the circuit:

| Verdict                  | Meaning                                                     |
| ------------------------ | ----------------------------------------------------------- |
| `false`                  | Not the service's fault (e.g. plain 4xx) — does not count   |
| `true`                   | Counts as one failure towards `failureThreshold`            |
| `'open'`                 | Opens the circuit immediately for `resetTimeout`            |
| `{ open: true, forMs? }` | Opens immediately, optionally for a caller-derived duration |

The library ships its own default classifier, exported so users can replace
it **or compose with it**:

```ts
export const defaultShouldOpen: ShouldOpen = (err) => {
  const status = (err as any)?.status ?? (err as any)?.response?.status;
  if (typeof status !== 'number') return true; // no HTTP semantics (network, timeout) → counts
  if (status === 429) return 'open'; // rate limited → open straight away
  if (status >= 500) return true; // server error → counts
  return false; // remaining 4xx → the request's fault, not the service's
};
```

Usage levels:

```ts
// 1. Nothing passed → defaultShouldOpen applies
circuitBreaker: { key: 'user-api' }

// 2. Fully custom
circuitBreaker: { key: 'user-api', shouldOpen: (err) => err.code === 'ECONNREFUSED' }

// 3. Composed — handle your cases, delegate the rest
import { defaultShouldOpen } from 'promise-fn-retry';
circuitBreaker: {
  key: 'user-api',
  shouldOpen: (err) => (err.status === 404 ? true : defaultShouldOpen(err)),
}
```

`defaultShouldOpen` duck-types `status` / `response.status` (fetch-like and
axios-like errors). A non-HTTP error that happens to carry a numeric `status`
would be misread — documented, and the escape hatch is passing your own
`shouldOpen`. Honouring `Retry-After` on 429 is deliberately left to user
composition (`{ open: true, forMs }`); the default uses `resetTimeout`.

## Failing fast — `CircuitOpenError`

When the circuit blocks a call (or an in-flight retry):

```ts
export class CircuitOpenError extends Error {
  readonly name = 'CircuitOpenError';
  readonly key: string; // which circuit
  readonly remainingMs: number; // time until half-open
  readonly cause: unknown; // the last real error that contributed to opening
}
```

Nothing is swallowed: even a blocked call that ran zero attempts exposes the
service's last real error via `err.cause`. `CircuitOpenError` is never retried
within the same call (`shouldRetry` is not consulted for it) and is never fed
back into `shouldOpen`.

## Observability — `onStateChange`

```ts
onStateChange?: (event: {
  key: string;
  from: 'closed' | 'open' | 'half-open';
  to: 'closed' | 'open' | 'half-open';
  error?: unknown; // the triggering error, when the transition has one
  failures: number; // consecutive counted failures at transition time
}) => void;
```

Fires on every transition (`closed→open`, `open→half-open`,
`half-open→closed`, `half-open→open`). Like the existing `onRetry`, the hook
is not guarded — an exception it throws propagates. The existing `onRetry`
keeps firing for every retry that actually runs.

## Interaction with existing options

| Existing option  | Behaviour with a circuit breaker                                                                                  |
| ---------------- | ----------------------------------------------------------------------------------------------------------------- |
| `shouldRetry`    | Independent axes: whether to retry ≠ whether to count. A failure counted by the circuit may still not be retried. |
| `until` (poll)   | A resolved value failing `until` does **not** count — the circuit measures service health, not poll progress.     |
| `attemptTimeout` | `AttemptTimeoutError` goes through `shouldOpen` like any error (the default counts it — no `status`).             |
| `signal` (abort) | A caller abort does **not** count; it is the caller's decision, not the service's health.                         |
| `BailError`      | The unwrapped `cause` goes through `shouldOpen` (it is a real service error) even though the call stops retrying. |
| `forever`        | Works; an open circuit still rejects the call — `forever` governs retries, not circuit admission.                 |
| `getDelay`       | Unchanged; applies to retry waits, which are orthogonal to the circuit's cooldown.                                |

Each failed attempt is counted **exactly once**, at rejection time, before the
retry decision.

## Options and defaults

| Option             | Type                           | Default             |
| ------------------ | ------------------------------ | ------------------- |
| `key`              | `string`                       | — (required)        |
| `failureThreshold` | `number`                       | `5`                 |
| `resetTimeout`     | `number` (ms)                  | `30_000`            |
| `shouldOpen`       | `ShouldOpen`                   | `defaultShouldOpen` |
| `onStateChange`    | `OnCircuitStateChange \| null` | `null`              |

## Code layout

- `src/circuit-breaker.ts` — registry, state machine, `CircuitOpenError`,
  `defaultShouldOpen`, `resetCircuitBreakers`.
- `src/types.ts` — `CircuitBreakerOptions`, `ShouldOpen`, `OpenVerdict`,
  `OnCircuitStateChange`; `circuitBreaker?` added to `Options`.
- `src/retry.ts` — `run()` consults the circuit before `attemptOnce` and
  records the outcome when the attempt settles.
- `src/index.ts` — re-exports the new public names.

## Non-goals

- No standalone breaker object / `createCircuitBreaker()` public API.
- No automatic `Retry-After` reading in `defaultShouldOpen`.
- No playground (`RetryDemo.vue`) integration in this change.
- No persistence or cross-process sharing of circuit state.

## Testing

Vitest with fake timers, covering: threshold opens the circuit; open rejects
without calling `fn`; half-open single-probe (success closes, failure
re-opens, concurrent calls stay blocked); mid-retry open cuts remaining
attempts; `'open'` verdict (429) opens immediately, `forMs` honoured;
`defaultShouldOpen` classification table; success resets the counter;
`CircuitOpenError.cause`/`remainingMs`; `onStateChange` events;
`resetCircuitBreakers()`; per-key isolation; and the interplay rows above
(`until`, abort, `BailError`, `attemptTimeout`).

## Documentation

- `website/guide/circuit-breaker.md` — concepts, the HTTP recipe, composition
  with `defaultShouldOpen`.
- `website/reference/api.md` — new option and exports.
- `README.md` — a bullet in "Why" and a short example.
