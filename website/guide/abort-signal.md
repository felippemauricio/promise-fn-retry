# Cancellation

## The problem

A retry loop can run for a while — backing off, waiting, trying again. If the work
becomes irrelevant (the user navigates away, a parent request is cancelled), you
need to stop it cleanly, including any pending wait.

## The solution

Pass an `AbortSignal`. If it's already aborted, `fn` is never called. If it aborts
during a wait, the pending timer is cleared and the promise rejects with the
abort reason. Where `AbortController` is available, the signal is also handed to
`fn` (and to `attemptTimeout`'s per-attempt signal) so in-flight work can cancel.

```ts
const controller = new AbortController();

const promise = retry((attempt, signal) => fetch('/api/slow', { signal }), {
  times: 5,
  signal: controller.signal,
});

// Later — e.g. the user navigates away:
controller.abort();
```

The promise rejects with the signal's `reason`, so you can tell cancellation apart
from a genuine failure.

## Try it

Press **Run**, then **Abort** mid-flight — the sequence stops and the pending wait
is cleared.

<RetryDemo
  :controls="['times', 'failUntil', 'initialDelayTime']"
  :preset="{ times: 8, failUntil: 8, initialDelayTime: 600 }"
  caption="Hit Abort during a wait to cancel the loop straight away." />
