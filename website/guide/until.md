# Poll until done

## The problem

Some calls _succeed_ but aren't _finished_: you kick off a job and it returns
`200 { status: 'pending' }`, and you have to keep checking until it's `done`.
Plain retry only reacts to rejections, so you'd have to throw a fake error to keep
going.

## The solution

`until` is a predicate over the **resolved value**. While it returns `false`, the
result is treated as worth retrying — turning `retry` into a clean poll-until
primitive. It reuses the same backoff, `maxElapsedTime` and cancellation you
already have.

```ts
const job = await retry(() => fetch(`/jobs/${id}`).then((r) => r.json()), {
  forever: true,
  initialDelayTime: 1_000,
  maxElapsedTime: 60_000, // stop polling after a minute
  until: (result) => (result as { status: string }).status === 'done',
});
```

If the retries (or the budget) run out before `until` is satisfied, `retry`
resolves with the **last value** rather than throwing — you inspect it and decide.

## Try it

The job reports `pending` until it flips to `done`. Each poll is a blue marker;
the green one is the satisfying result.

<RetryDemo
  sim="job"
  :controls="['pollTarget', 'forever', 'initialDelayTime']"
  :preset="{ pollTarget: 4, forever: true, initialDelayTime: 120 }"
  caption="until keeps polling on a successful-but-unfinished response, then resolves once the condition holds." />
