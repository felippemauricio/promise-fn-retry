# Retry forever

## The problem

Sometimes there's no sensible retry count — you just need the operation to keep
trying until it works: reconnecting to a broker, waiting for a dependency to come
up at boot.

## The solution

`forever: true` ignores `times` and retries until the operation succeeds or the
`signal` aborts. Pair it with `maxDelayTime` so the backoff levels off, and
ideally an [`AbortSignal`](./abort-signal) or [`maxElapsedTime`](./max-elapsed-time)
as a way out.

```ts
const controller = new AbortController();

const data = await retry(connectToBroker, {
  forever: true,
  initialDelayTime: 500,
  maxDelayTime: 10_000, // cap the backoff so it doesn't blow up
  signal: controller.signal, // the only way out besides success
});
```

## Try it

Set `failUntil` higher than any retry count — without `forever` it would give up,
but with `forever` on it keeps going until the request finally succeeds.

<RetryDemo
  :controls="['forever', 'failUntil', 'initialDelayTime', 'maxDelayTime']"
  :preset="{ forever: true, failUntil: 6, initialDelayTime: 150, maxDelayTime: 1000 }"
  caption="forever keeps retrying past any fixed count — success or an abort is what stops it." />
