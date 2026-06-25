# What & why

`promise-fn-retry` wraps a function that returns a promise and retries it when it
rejects. You decide how many times, how long to wait between attempts, and whether
a given failure is even worth retrying.

The interesting part is the **waiting**: the delay grows exponentially, can be
capped, and can be randomised so many clients don't retry in lockstep. On top of
that it can bound a single hung attempt, cap the total time spent, honour a
server's `Retry-After`, poll on a resolved value, and cancel cleanly.

```ts
import retry from 'promise-fn-retry';

// Retry up to 5 times, doubling the wait each time, with jitter.
const user = await retry(() => fetch('/api/user').then((r) => r.json()), {
  times: 5,
  backoffFactor: 2,
  jitter: 'equal',
});
```

Every option has a default that reproduces the simplest behaviour, so you only
reach for what you need.

## See it move

This timeline plots each attempt to scale, as it happens. Tune the options and
press **Run** — the gap between attempts grows, scatters, and levels off.

<RetryDemo
  :controls="['times', 'initialDelayTime', 'backoffFactor', 'jitter', 'failUntil']"
  :preset="{ times: 5, initialDelayTime: 200, failUntil: 3 }"
  caption="A simulated request that fails a few times, then succeeds." />

## Why a dedicated library

- **Just a function.** No classes or builders — `retry(fn, options)`.
- **Isomorphic.** Universal APIs only; runs in browsers and Node ≥ 12, shipped as
  ESM and CommonJS.
- **Typed, zero-dependency.** Declarations are bundled; nothing else comes along.
- **Additive.** Every capability is opt-in and defaults to current behaviour.

Head to [Installation](./installation) next, or jump straight to a guide in the
sidebar.
