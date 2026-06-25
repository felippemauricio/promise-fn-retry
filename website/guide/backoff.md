# Backoff & jitter

## The problem

Retrying immediately hammers a service that's already struggling, and a fleet of
clients retrying on the same schedule arrives in synchronised waves — a
_thundering herd_.

## The solution

Wait longer after each failure (**exponential backoff**), put a ceiling on the
wait (**a cap**), and scatter each delay randomly (**jitter**) so clients spread
out.

```ts
await retry(callApi, {
  times: 6,
  initialDelayTime: 200, // first retry waits 200ms
  backoffFactor: 2, // then 400, 800, 1600…
  maxDelayTime: 5_000, // never wait longer than 5s
  jitter: 'full', // randomise within [0, delay]
});
```

- **`backoffFactor`** — `1` keeps the delay constant, `2` doubles it, `3` is steeper.
- **`maxDelayTime`** — clamps the growth, e.g. `100 → 200 → 400 → 500 → 500…`.
- **`jitter`** — `'equal'` (or `true`) randomises within `[delay / 2, delay]`;
  `'full'` within `[0, delay]`. `false` keeps the exact delay.

## Try it

Switch `jitter` between `off`, `equal` and `full`, and watch the spacing change.

<RetryDemo
  :controls="['times', 'initialDelayTime', 'backoffFactor', 'maxDelayTime', 'jitter', 'failUntil']"
  :preset="{ times: 6, initialDelayTime: 200, maxDelayTime: 0, failUntil: 5, jitter: 'equal' }"
  caption="Each marker sits at its real elapsed time — backoff pushes them apart, the cap reins them in, jitter scatters them." />
