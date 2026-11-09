# Total time budget

## The problem

Bounding retries by _count_ gives you an unpredictable total time: with
exponential backoff, six retries might take half a second or half a minute. When
you have a request budget or an SLA, what you actually care about is the
**wall-clock time**.

## The solution

`maxElapsedTime` stops retrying once that much time has elapsed in total. The
final wait is trimmed so it never overshoots the budget.

```ts
await retry(callApi, {
  forever: true,
  initialDelayTime: 200,
  maxElapsedTime: 30_000, // keep trying for at most 30s, then reject
});
```

It composes with everything: combine it with `forever` for "try as hard as you
can within 30s", or with `times` as a belt-and-braces upper bound.

## What the budget covers

The budget decides whether another attempt **starts**; it does not cut short an
attempt that is already running. If the final attempt hangs past the deadline,
`retry` waits for it. To bound that too, set an
[`attemptTimeout`](./attempt-timeout):

```ts
await retry(callApi, {
  forever: true,
  maxElapsedTime: 30_000, // no new attempt after 30s…
  attemptTimeout: 5_000, // …and none runs longer than 5s, so it settles by ~35s
});
```

When polling with [`until`](./until), running out of budget resolves with the last
value instead of rejecting.

## Try it

The request never recovers here, so the **budget** is what stops it — note how it
gives up partway through, not after a fixed number of attempts.

<RetryDemo
  :controls="['maxElapsedTime', 'forever', 'initialDelayTime', 'failUntil']"
  :preset="{ maxElapsedTime: 1500, forever: true, initialDelayTime: 200, failUntil: 12 }"
  caption="Retries stop the moment the elapsed time crosses the budget." />
