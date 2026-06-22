# promise-fn-retry

> Retry a flaky promise the right way — exponential backoff, jitter, a delay cap and cancellation. Tiny, typed, and runs anywhere.

[![npm version](https://img.shields.io/npm/v/promise-fn-retry.svg)](https://www.npmjs.com/package/promise-fn-retry)
[![CI](https://github.com/felippemauricio/promise-fn-retry/actions/workflows/ci.yml/badge.svg)](https://github.com/felippemauricio/promise-fn-retry/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/felippemauricio/promise-fn-retry/branch/main/graph/badge.svg)](https://codecov.io/gh/felippemauricio/promise-fn-retry)
[![types: included](https://img.shields.io/badge/types-included-3178c6.svg)](https://github.com/felippemauricio/promise-fn-retry/blob/main/src/index.ts)
[![zero dependencies](https://img.shields.io/badge/dependencies-0-brightgreen.svg)](https://github.com/felippemauricio/promise-fn-retry/blob/main/package.json)
[![live demo](https://img.shields.io/badge/demo-live-35e0c8.svg)](https://felippemauricio.github.io/promise-fn-retry/)
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

**See it in action:** [interactive playground →](https://felippemauricio.github.io/promise-fn-retry/)

## Why

- **Just a function.** One call, `retry(fn, options)`. No classes, no builders.
- **Smart waiting.** Exponential backoff with a configurable factor, an optional
  delay cap, and optional jitter.
- **Cancellable.** Pass an `AbortSignal` to stop pending retries.
- **Selective.** Decide per error whether to retry at all (`shouldRetry`).
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
retry<T>(fn: () => Promise<T>, options?: Options): Promise<T>;
```

Calls `fn`. If the returned promise resolves, `retry` resolves with that value.
If it rejects, `retry` waits and calls `fn` again, up to `times` retries. When
the retries are exhausted (or `shouldRetry` returns `false`, or the `signal`
aborts), the promise rejects with the last error.

Only `fn` is required. Every option has a default that reproduces v1 behaviour.

### Options

| Option             | Type                                                 | Default     | Description                                                                                  |
| ------------------ | ---------------------------------------------------- | ----------- | -------------------------------------------------------------------------------------------- |
| `times`            | `number`                                             | `1`         | Number of retries after the first failure.                                                   |
| `initialDelayTime` | `number`                                             | `100`       | Delay in milliseconds before the first retry.                                                |
| `backoffFactor`    | `number`                                             | `2`         | Multiplier applied to the delay on each retry. `1` = constant, `2` = doubles, `3` = steeper. |
| `maxDelayTime`     | `number`                                             | `Infinity`  | Upper bound on the delay between attempts, in milliseconds.                                  |
| `jitter`           | `boolean`                                            | `false`     | Randomise each delay within `[delay / 2, delay]` to avoid a thundering herd.                 |
| `signal`           | `AbortSignal`                                        | `undefined` | Cancel pending retries. Works in the browser and in Node.                                    |
| `onRetry`          | `(error: unknown, options: ResolvedOptions) => void` | `null`      | Called on each retry. Useful for logging and metrics.                                        |
| `shouldRetry`      | `(error: unknown) => boolean`                        | `null`      | Called before each retry. Return `false` to stop retrying immediately.                       |

### Returns

`Promise<T>` — resolves with whatever `fn` resolves to, or rejects with the last
error thrown by `fn` (or with the abort reason if a `signal` aborts).

### Exported types

```ts
import retry, {
  retry, // named export, same function as the default
  type Options,
  type ResolvedOptions,
  type OnRetry,
  type ShouldRetry,
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
- **`jitter`** spreads each delay across `[delay / 2, delay]`, so the `400 ms`
  step becomes a value somewhere between `200 ms` and `400 ms`.

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
- New optional options are available: `backoffFactor`, `maxDelayTime`, `jitter`
  and `signal`. You only adopt them if you want them.

## Demo

- **Browser:** the [live playground](https://felippemauricio.github.io/promise-fn-retry/)
  visualises backoff, jitter, the delay cap and cancellation.
- **Local:** `npm run demo:browser` (serves the playground) and
  `npm run demo:backend` (a flaky HTTP server with a retrying client).

See [`demo/`](https://github.com/felippemauricio/promise-fn-retry/tree/main/demo).

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
