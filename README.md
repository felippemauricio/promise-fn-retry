# promise-fn-retry

[![npm version](https://img.shields.io/npm/v/promise-fn-retry.svg?style=flat)](https://www.npmjs.com/package/promise-fn-retry)
[![CI](https://github.com/felippemauricio/promise-fn-retry/actions/workflows/ci.yml/badge.svg)](https://github.com/felippemauricio/promise-fn-retry/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/felippemauricio/promise-fn-retry/branch/main/graph/badge.svg)](https://codecov.io/gh/felippemauricio/promise-fn-retry)
[![types: included](https://img.shields.io/badge/types-included-3178c6.svg)](./dist/index.d.ts)
[![live demo](https://img.shields.io/badge/demo-live-35e0c8.svg)](https://felippemauricio.github.io/promise-fn-retry/)
[![docs: en-AU](https://img.shields.io/badge/docs-en--AU-blue.svg)](#documentation)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE.md)

A small, **typed** helper for retrying promises that fail, with exponential
backoff, jitter, a delay cap and cancellation via `AbortSignal`.

- **Isomorphic** — works in the **browser and in Node** (≥ 12), in ESM and CommonJS.
- **Zero dependencies** and **bundled types** (no external `@types/...`).
- **v1-compatible** — the defaults preserve the old behaviour.

## Demo

[**Open the interactive playground →**](https://felippemauricio.github.io/promise-fn-retry/)
Tune the options and watch each attempt land on a backoff timeline, to scale, in
real time.

Or run the demos locally:

```bash
npm run demo:browser   # the playground at http://localhost:8080
npm run demo:backend   # a flaky HTTP server + retry() client (Node 18+)
```

See [`demo/`](./demo) for details.

## Installation

```bash
npm install promise-fn-retry
```

## Usage

### TypeScript / ESM

```ts
import retry from 'promise-fn-retry';

const fetchUser = () =>
  retry(() => fetch('https://api.github.com/users/14'), {
    times: 3,
    initialDelayTime: 100,
  }).then((res) => res.json());
```

### CommonJS

```js
const retry = require('promise-fn-retry');

retry(() => fetch('https://example.com'), { times: 3 });
```

## API

```ts
retry<T>(fn: () => Promise<T>, options?: Options): Promise<T>
```

Only `fn` is required. Without `options`, the defaults are used.

### Options

| Option             | Type                       | Default    | Description                                                                                   |
| ------------------ | -------------------------- | ---------- | --------------------------------------------------------------------------------------------- |
| `times`            | `number`                   | `1`        | Number of retries after the first failure.                                                    |
| `initialDelayTime` | `number`                   | `100`      | Delay (ms) before the first retry.                                                            |
| `backoffFactor`    | `number`                   | `2`        | Multiplier applied to the delay on each retry. `1` = linear, `2` = doubles, `3` = aggressive. |
| `maxDelayTime`     | `number`                   | `Infinity` | Cap on the delay between attempts (ms).                                                       |
| `jitter`           | `boolean`                  | `false`    | Randomises the delay (_equal jitter_) to avoid a _thundering herd_.                           |
| `signal`           | `AbortSignal`              | `—`        | Cancels the in-flight retries (browser and Node).                                             |
| `onRetry`          | `(error, options) => void` | `null`     | Called on each retry. Handy for logs/metrics (Sentry, Kibana, etc.).                          |
| `shouldRetry`      | `(error) => boolean`       | `null`     | Decides whether to retry given the error. Return `false` to stop.                             |

### Backoff strategy

The delay grows by multiplying by `backoffFactor` on each retry, bounded by
`maxDelayTime`. With the defaults (`backoffFactor: 2`):

- 1st retry → `initialDelayTime` (e.g. `100ms`)
- 2nd retry → `200ms`
- 3rd retry → `400ms` ...

With `jitter: true`, each delay is randomised within `[delay/2, delay]`.

### Examples

```ts
// Aggressive backoff with a cap and jitter
retry(fetchData, {
  times: 5,
  initialDelayTime: 200,
  backoffFactor: 3,
  maxDelayTime: 10_000,
  jitter: true,
  onRetry: (error) => sendToSentry(error),
  shouldRetry: (error) => (error as Error).message !== 'FAILED_AUTH',
});

// Cancellation with AbortSignal
const controller = new AbortController();
retry(fetchData, { times: 5, signal: controller.signal });
controller.abort(); // stops the pending retries
```

## Development

```bash
npm install
npm test          # tests (Vitest)
npm run lint      # ESLint
npm run typecheck # tsc --noEmit
npm run build     # tsup → dist/ (ESM + CJS + .d.ts)
```

## Documentation

- **Examples:** the [interactive playground](https://felippemauricio.github.io/promise-fn-retry/)
  and the runnable demos in [`demo/`](./demo) (browser + Node).
- **Design & plan:** see [`docs/`](./docs).
- All documentation in this repository is written in **Australian English (en-AU)**.

## Contributing

PRs are welcome. Please open an issue to discuss significant changes first.
Documentation contributions should follow Australian English (en-AU) spelling.

## Licence

MIT © 2018-2026 Felippe Maurício.
