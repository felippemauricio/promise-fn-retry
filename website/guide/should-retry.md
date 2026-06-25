# Selective retries

## The problem

Not every failure deserves a retry. Network blips and `5xx`s are transient; a
`400` or `401` will fail the same way every time, so retrying just wastes time.

## The solution

`shouldRetry` is called before each retry with the error. Return `false` to stop
immediately. (When you need to decide based on the _result_ rather than the error,
reach for a [`BailError`](./bail-error) instead.)

```ts
await retry(
  async () => {
    const res = await fetch('/api/things');
    if (!res.ok) throw Object.assign(new Error('Request failed'), { status: res.status });
    return res.json();
  },
  {
    times: 4,
    shouldRetry: (error) => {
      const status = (error as { status?: number }).status;
      return status === undefined || status >= 500; // retry network + 5xx only
    },
  },
);
```

## Observe every retry

`onRetry` fires on each retry with the error and the resolved options (including
`retained`, the count so far) — perfect for logs and metrics:

```ts
await retry(callApi, {
  times: 3,
  onRetry: (error, { retained, times }) => {
    logger.warn(`Retry ${retained}/${times}`, { error });
    metrics.increment('api.retry');
  },
});
```

## Try it

Every retry is logged below with its attempt number — the same information
`onRetry` gives you.

<RetryDemo
  :controls="['times', 'failUntil', 'initialDelayTime']"
  :preset="{ times: 4, failUntil: 2, initialDelayTime: 150 }"
  caption="onRetry runs once per amber marker; shouldRetry can cut the sequence short." />
