# Per-attempt timeout

## The problem

A request that _hangs_ — the server accepts the connection but never responds —
is the worst kind of failure. It neither resolves nor rejects, so retries never
even start. The whole operation is stuck on one bad attempt.

## The solution

`attemptTimeout` gives each attempt a deadline. If it runs over, the attempt is
abandoned and retried like any other failure. Where `AbortController` is
available, `fn` receives a per-attempt `AbortSignal` that aborts on timeout (or
when your outer `signal` aborts) — wire it into `fetch` so the hung request is
actually cancelled:

```ts
const data = await retry(
  (attempt, signal) => fetch('/api/slow', { signal }).then((r) => r.json()),
  {
    times: 3,
    attemptTimeout: 2_000, // give up on an attempt after 2s and try again
  },
);
```

A timed-out attempt rejects with an `AttemptTimeoutError`, which flows through
`shouldRetry` and `onRetry` like any other error.

## Try it

Here the first attempt hangs. With `attemptTimeout` set, it's cut off and retried
instead of blocking forever.

<RetryDemo
  sim="hang"
  :controls="['attemptTimeout', 'times', 'initialDelayTime', 'failUntil']"
  :preset="{ attemptTimeout: 600, times: 3, initialDelayTime: 100, failUntil: 1 }"
  caption="Orange markers are attempts cut off by the timeout; the next one gets through." />
