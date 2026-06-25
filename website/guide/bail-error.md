# Give up early (BailError)

## The problem

Some failures aren't worth a single retry — a `404`, a `400`, an auth error. And
sometimes the decision depends on the **response**, not just an exception:
you read the body, see it's hopeless, and want to stop _now_, no waiting.

`shouldRetry` only sees the error, which isn't always enough.

## The solution

Throw a `BailError` from inside `fn`. It stops immediately and rejects with the
wrapped cause — skipping the wait, `shouldRetry`, every remaining attempt and even
`forever`.

```ts
import retry, { BailError } from 'promise-fn-retry';

const data = await retry(
  async (attempt) => {
    const res = await fetch('/api/things');
    if (res.status === 404) throw new BailError(new Error('Not found')); // give up now
    if (!res.ok) throw new Error('Transient failure'); // retried
    return res.json();
  },
  { times: 5 },
);
```

The outer promise rejects with whatever you passed to `new BailError(cause)` — the
`BailError` itself never leaks out.

## Try it

Set `bailAt` to an attempt number and watch it stop dead there, regardless of how
many retries remain.

<RetryDemo
  :controls="['bailAt', 'times', 'failUntil', 'initialDelayTime']"
  :preset="{ bailAt: 2, times: 6, failUntil: 6, initialDelayTime: 150 }"
  caption="The purple marker is the bail — no wait, no further attempts." />
