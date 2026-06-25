# Server-driven delay

## The problem

When a server rate-limits you (`429`) or is briefly unavailable (`503`), it often
tells you exactly how long to wait with a `Retry-After` header. Backing off on
_your_ own curve ignores that — you retry too early (and get rejected again) or
too late (and waste time).

## The solution

`getDelay` derives the next wait from the error. Return a number of milliseconds
to override the computed backoff, or `null`/`undefined` to keep it. The backoff
curve keeps advancing underneath, so you can fall back to it whenever the hint is
missing.

```ts
await retry(callApi, {
  times: 5,
  getDelay: (error, { attempt, computedDelay }) => {
    const retryAfter = (error as { retryAfterMs?: number }).retryAfterMs;
    return retryAfter ?? computedDelay; // honour the server, else back off
  },
});
```

The callback receives the error plus a context of `{ attempt, computedDelay }` —
the attempt that just failed and the delay the library would have used.

## Try it

The simulated server returns `429` with a `Retry-After` hint for the first couple
of attempts; `getDelay` waits exactly that long instead of using the backoff.

<RetryDemo
  sim="ratelimited"
  :controls="['retryAfter', 'times', 'failUntil', 'initialDelayTime']"
  :preset="{ retryAfter: 250, times: 5, failUntil: 2, initialDelayTime: 50 }"
  caption="The gaps match the server's Retry-After hint, not the backoff curve." />
