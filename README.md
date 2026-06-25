# promise-fn-retry

> Retry a flaky promise the right way — exponential backoff, jitter, a delay cap and cancellation. Tiny, typed, and runs anywhere.

[![npm version](https://img.shields.io/npm/v/promise-fn-retry.svg)](https://www.npmjs.com/package/promise-fn-retry)
[![CI](https://github.com/felippemauricio/promise-fn-retry/actions/workflows/ci.yml/badge.svg)](https://github.com/felippemauricio/promise-fn-retry/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/felippemauricio/promise-fn-retry/branch/main/graph/badge.svg)](https://codecov.io/gh/felippemauricio/promise-fn-retry)
[![types: included](https://img.shields.io/badge/types-included-3178c6.svg)](https://github.com/felippemauricio/promise-fn-retry/blob/main/src/index.ts)
[![zero dependencies](https://img.shields.io/badge/dependencies-0-brightgreen.svg)](https://github.com/felippemauricio/promise-fn-retry/blob/main/package.json)
[![docs](https://img.shields.io/badge/docs-live-35e0c8.svg)](https://felippemauricio.github.io/promise-fn-retry/)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](https://github.com/felippemauricio/promise-fn-retry/blob/main/LICENSE.md)

`promise-fn-retry` wraps a function that returns a promise and retries it when it
rejects. You control how many times, how long to wait between attempts, and
whether a given error is even worth retrying. The waiting is the interesting part:
the delay grows exponentially, can be capped, and can be randomised to stop many
clients from retrying in lockstep.

```ts
import retry from 'promise-fn-retry';

// Retry up to 5 times, doubling the wait each time, with jitter.
const user = await retry(() => fetch('/api/user').then((r) => r.json()), {
  times: 5,
  backoffFactor: 2,
  jitter: true,
});
```

> ### ▶ [Try the live playground →](https://felippemauricio.github.io/promise-fn-retry/)
>
> Tune `times`, `backoffFactor`, `maxDelayTime`, equal/full `jitter`, `forever`,
> an `AbortSignal` and a `BailError` give-up, then watch every attempt land on a
> **backoff timeline — to scale, in real time**. The clearest way to feel how the
> options shape the waiting.

## Why

- **Just a function.** One call, `retry(fn, options)`. No classes, no builders.
- **Smart waiting.** Exponential backoff with a configurable factor, an optional
  delay cap, equal or full jitter, a `forever` mode, and a `getDelay` hook to honour
  server hints like `Retry-After`.
- **Bounded.** Time out a single hung attempt (`attemptTimeout`) and cap the total
  time spent retrying (`maxElapsedTime`) — not just the attempt count.
- **Cancellable.** Pass an `AbortSignal` to stop pending retries.
- **Selective.** Decide per error whether to retry (`shouldRetry`), or throw a
  `BailError` from `fn` to give up immediately on the result.
- **Polls, too.** Retry on the resolved value with `until` to wait for a condition.
- **Observable.** Hook every retry for logging or metrics (`onRetry`).
- **Runs anywhere.** Browser and Node (≥ 12), shipped as both ESM and CommonJS.
- **Typed, zero-dependency.** Type declarations are bundled — no `@types/...` needed.

## Installation

```bash
npm install promise-fn-retry
```

## Quick start

Wrap any function that returns a promise. With no options, it retries once after
`100ms`:

```ts
import retry from 'promise-fn-retry';

const data = await retry(() => fetch('https://api.example.com/data'));
```

Pass options to shape the retry behaviour:

```ts
const data = await retry(() => fetch('https://api.example.com/data'), {
  times: 3,
  initialDelayTime: 200,
});
```

### CommonJS

`require` returns the function directly, exactly like v1:

```js
const retry = require('promise-fn-retry');

retry(() => fetch('https://api.example.com/data'), { times: 3 });
```

## API

```ts
retry<T>(fn: (attempt: number) => Promise<T>, options?: Options): Promise<T>;
```

Calls `fn` with the current **1-indexed attempt number** (`1` on the first try,
`2` on the first retry, and so on). If the returned promise resolves, `retry`
resolves with that value. If it rejects, `retry` waits and calls `fn` again, up
to `times` retries. When the retries are exhausted (or `shouldRetry` returns
`false`, or the `signal` aborts, or `fn` throws a [`BailError`](#bail-out-early)),
the promise rejects with the last error.

Only `fn` is required. Every option has a default that reproduces v1 behaviour.

### Options

| Option             | Type                                                 | Default     | Description                                                                                                       |
| ------------------ | ---------------------------------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------- |
| `times`            | `number`                                             | `1`         | Number of retries after the first failure.                                                                        |
| `initialDelayTime` | `number`                                             | `100`       | Delay in milliseconds before the first retry.                                                                     |
| `backoffFactor`    | `number`                                             | `2`         | Multiplier applied to the delay on each retry. `1` = constant, `2` = doubles, `3` = steeper.                      |
| `maxDelayTime`     | `number`                                             | `Infinity`  | Upper bound on the delay between attempts, in milliseconds.                                                       |
| `jitter`           | `boolean \| 'equal' \| 'full'`                       | `false`     | Randomise each delay. `'equal'` (or `true`) spreads it across `[delay / 2, delay]`; `'full'` across `[0, delay]`. |
| `forever`          | `boolean`                                            | `false`     | Retry indefinitely until success or abort, ignoring `times`.                                                      |
| `attemptTimeout`   | `number`                                             | `Infinity`  | Abort and retry a single attempt that runs longer than this, in ms (see below).                                   |
| `maxElapsedTime`   | `number`                                             | `Infinity`  | Stop retrying once this much wall-clock time has elapsed in total, in ms.                                         |
| `getDelay`         | `(error, ctx) => number \| null`                     | `null`      | Derive the next wait from the error (e.g. a `Retry-After` header); return ms to override, or `null` to keep it.   |
| `until`            | `(result) => boolean`                                | `null`      | Retry while the resolved value fails this predicate — turns `retry` into a poll-until.                            |
| `signal`           | `AbortSignal`                                        | `undefined` | Cancel pending retries. Works in the browser and in Node.                                                         |
| `onRetry`          | `(error: unknown, options: ResolvedOptions) => void` | `null`      | Called on each retry. Useful for logging and metrics.                                                             |
| `shouldRetry`      | `(error: unknown) => boolean`                        | `null`      | Called before each retry. Return `false` to stop retrying immediately.                                            |

#### Alternative option names

A few alternative option names are accepted as aliases and mapped onto the
canonical options above. If you pass both a canonical option and its alias, the
canonical one wins.

| Alias        | Maps to            |
| ------------ | ------------------ |
| `retries`    | `times`            |
| `factor`     | `backoffFactor`    |
| `minTimeout` | `initialDelayTime` |
| `maxTimeout` | `maxDelayTime`     |
| `randomize`  | `jitter: 'full'`   |

### Returns

`Promise<T>` — resolves with whatever `fn` resolves to, or rejects with the last
error thrown by `fn` (or with the abort reason if a `signal` aborts).

### Exported types

```ts
import retry, {
  retry, // named export, same function as the default
  BailError, // value export — throw it from fn to give up (see below)
  type Options,
  type ResolvedOptions,
  type OnRetry,
  AttemptTimeoutError, // value export — the error a timed-out attempt rejects with
  type ShouldRetry,
  type Jitter,
  type OperationFn,
  type GetDelay,
  type Until,
} from 'promise-fn-retry';
```

## How the delay is calculated

Each retry multiplies the previous delay by `backoffFactor`, starting from
`initialDelayTime`. The result is then clamped to `maxDelayTime`, and finally —
if `jitter` is on — randomised.

With the defaults (`initialDelayTime: 100`, `backoffFactor: 2`):

| Retry | Delay  |
| ----- | ------ |
| 1st   | 100 ms |
| 2nd   | 200 ms |
| 3rd   | 400 ms |
| 4th   | 800 ms |

- **`maxDelayTime`** caps the growth, e.g. `maxDelayTime: 500` turns the sequence
  above into `100 → 200 → 400 → 500 → 500 …`.
- **`jitter`** spreads each delay randomly. `'equal'` (or `true`) keeps it within
  `[delay / 2, delay]`, so the `400 ms` step lands between `200 ms` and `400 ms`;
  `'full'` widens that to `[0, delay]` — anywhere up to `400 ms`.

You can feel this directly in the [playground](https://felippemauricio.github.io/promise-fn-retry/),
which plots every attempt on a timeline to scale.

## Recipes

### Retry only on the errors worth retrying

Retry transient failures (network errors, `5xx`) but give up immediately on a
`4xx` you can't recover from:

```ts
const data = await retry(
  async () => {
    const res = await fetch('/api/things');
    if (!res.ok) throw Object.assign(new Error('Request failed'), { status: res.status });
    return res.json();
  },
  {
    times: 4,
    shouldRetry: (error) => {
      const status = (error as { status?: number }).status;
      return status === undefined || status >= 500;
    },
  },
);
```

### Bail out early

`shouldRetry` only sees the error. When the decision depends on the _result_ —
say an HTTP `404` body you can read but should never retry — throw a `BailError`
from inside `fn`. It stops immediately and rejects with the wrapped cause,
skipping the wait, `shouldRetry` and any remaining attempts (even with `forever`):

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

### Retry forever until it works (or you abort)

```ts
const controller = new AbortController();

const data = await retry(connectToBroker, {
  forever: true,
  initialDelayTime: 500,
  maxDelayTime: 10_000,
  signal: controller.signal, // the only way out besides success
});
```

### Cancel with an AbortSignal

```ts
const controller = new AbortController();

const promise = retry(loadDashboard, { times: 5, signal: controller.signal });

// Later — e.g. the user navigates away:
controller.abort();
```

If the signal is already aborted, `fn` is never called. If it aborts during a
wait, the pending timer is cleared and the promise rejects.

### Tune the backoff for many clients

A delay cap plus jitter keeps a fleet of clients from hammering a recovering
service all at once:

```ts
await retry(callApi, {
  times: 6,
  initialDelayTime: 200,
  backoffFactor: 2,
  maxDelayTime: 5_000,
  jitter: true,
});
```

### Observe every retry

```ts
await retry(callApi, {
  times: 3,
  onRetry: (error) => {
    logger.warn('Retrying after failure', { error });
    metrics.increment('api.retry');
  },
});
```

### Act on the attempt number

`fn` receives the 1-indexed attempt number, handy for logging or for changing
behaviour as attempts climb:

```ts
await retry(
  (attempt) => {
    console.log(`Attempt ${attempt}`);
    return fetch(`/api/things?attempt=${attempt}`);
  },
  { times: 3 },
);
```

### Bound a single attempt with `attemptTimeout`

A request that hangs forever never rejects, so retries never even start. Give each
attempt a deadline: if it runs over, the attempt is aborted and retried. Where
`AbortController` is available, `fn` receives a per-attempt `AbortSignal` that
aborts on timeout (or when your outer `signal` aborts) — wire it into `fetch`:

```ts
const data = await retry(
  (attempt, signal) => fetch('/api/slow', { signal }).then((r) => r.json()),
  {
    times: 3,
    attemptTimeout: 2_000, // give up on an attempt after 2s and try again
  },
);
```

### Cap the total time spent retrying

Bound the whole operation by wall-clock time, not just attempt count — useful for
a request budget or an SLA. The final wait is trimmed so it never overshoots:

```ts
await retry(callApi, {
  forever: true,
  initialDelayTime: 200,
  maxElapsedTime: 30_000, // keep trying for at most 30s, then reject
});
```

### Honour a server's `Retry-After`

When the failure carries a hint about how long to wait, use it instead of the
computed backoff:

```ts
await retry(callApi, {
  times: 5,
  getDelay: (error, { computedDelay }) => {
    const retryAfter = (error as { retryAfterMs?: number }).retryAfterMs;
    return retryAfter ?? computedDelay; // fall back to the backoff curve
  },
});
```

### Poll until a condition holds

Some calls succeed but aren't _done_ — a job that reports `status: 'pending'`.
Retry on the resolved value, not just on errors:

```ts
const job = await retry(() => fetch(`/jobs/${id}`).then((r) => r.json()), {
  forever: true,
  initialDelayTime: 1_000,
  maxElapsedTime: 60_000, // stop polling after a minute
  until: (result) => (result as { status: string }).status === 'done',
});
```

## Compatibility

- **Runtimes:** modern browsers and Node `>= 12`.
- **Modules:** ships ESM (`import`) and CommonJS (`require`); `require('promise-fn-retry')`
  returns the function directly.
- **Types:** bundled — TypeScript users need nothing extra.
- **Dependencies:** none.

## Migrating from v1

The call signature and default behaviour are unchanged, so existing code keeps
working without edits. When upgrading:

- **Remove `@types/promise-fn-retry`** — types are now bundled with the package.
- You can now `import` it as ESM as well as `require` it.
- New optional options are available: `backoffFactor`, `maxDelayTime`, `jitter`,
  `forever`, `attemptTimeout`, `maxElapsedTime`, `getDelay`, `until` and `signal`,
  plus a `BailError` to give up early and an `attempt` number passed to `fn`. You
  only adopt them if you want them.

## Documentation

Full guides, the API reference and an **interactive playground** — with a live
backoff-timeline visualisation embedded on every feature page — live on the docs
site:

**<https://felippemauricio.github.io/promise-fn-retry/>**

Run the docs locally with `npm run docs:dev`.

## Development

```bash
npm install
npm test          # run the tests (Vitest)
npm run lint      # ESLint
npm run typecheck # tsc --noEmit
npm run build     # tsup → dist/ (ESM + CJS + .d.ts)
```

## Working with Claude Code

This repository is set up to be edited with [Claude Code](https://claude.com/claude-code)
(or any coding agent). A [`CLAUDE.md`](https://github.com/felippemauricio/promise-fn-retry/blob/main/CLAUDE.md)
at the root tells the agent what the library does, where the code lives
(`src/types.ts`, `src/retry.ts`, `src/index.ts`), the commands to run, and the
conventions to follow.

To make a change:

```bash
git clone https://github.com/felippemauricio/promise-fn-retry.git
cd promise-fn-retry
npm install
claude   # start Claude Code in the repo, then describe what you want
```

Some prompts that work well here:

- _"Add a `maxRetries`-reached callback that fires when the retries are exhausted."_
- _"Change the jitter strategy to full jitter and update the tests and README."_
- _"Add a `timeout` option that rejects an individual attempt after N ms."_

The agent has everything it needs to keep the bar high: `npm test` (100%
coverage is enforced), `npm run lint`, `npm run typecheck` and `npm run build`.
Conventions it should follow are in `CLAUDE.md` — strict TypeScript, additive
options that preserve the defaults, Conventional Commits, and documentation in
Australian English. Run the full check before opening a PR:

```bash
npm run lint && npm run format:check && npm run typecheck && npm run test:coverage && npm run build
```

## Contributing

Issues and pull requests are welcome — please open an issue to discuss
significant changes first. Documentation is written in Australian English (en-AU).

## License

MIT © 2018-present Felippe Maurício. See [LICENSE.md](https://github.com/felippemauricio/promise-fn-retry/blob/main/LICENSE.md).

Built and maintained by Felippe Maurício — [LinkedIn](https://www.linkedin.com/in/felippemauricio/) · [GitHub](https://github.com/felippemauricio).
