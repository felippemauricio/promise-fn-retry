# API & options

## Signature

```ts
retry<T>(fn: (attempt: number, signal?: AbortSignal) => Promise<T>, options?: Options): Promise<T>;
```

Calls `fn` with the current **1-indexed attempt number** (`1` on the first try,
`2` on the first retry, …) and, where `AbortController` is available, a per-attempt
`AbortSignal`. If the returned promise resolves, `retry` resolves with that value
(unless [`until`](#until) keeps polling). If it rejects, `retry` waits and calls
`fn` again, up to `times` retries.

It stops when the retries are exhausted, `shouldRetry` returns `false`, the budget
(`maxElapsedTime`) is spent, the `signal` aborts, or `fn` throws a `BailError`.

## Options

| Option             | Type                             | Default     | Description                                                                               |
| ------------------ | -------------------------------- | ----------- | ----------------------------------------------------------------------------------------- |
| `times`            | `number`                         | `1`         | Retries after the first failure.                                                          |
| `initialDelayTime` | `number`                         | `100`       | Delay before the first retry, in ms.                                                      |
| `backoffFactor`    | `number`                         | `2`         | Multiplier applied to the delay each retry.                                               |
| `maxDelayTime`     | `number`                         | `Infinity`  | Upper bound on the delay between attempts, in ms.                                         |
| `jitter`           | `boolean \| 'equal' \| 'full'`   | `false`     | Randomise each delay. `'equal'`/`true` → `[delay/2, delay]`; `'full'` → `[0, delay]`.     |
| `forever`          | `boolean`                        | `false`     | Retry indefinitely until success or abort, ignoring `times`.                              |
| `attemptTimeout`   | `number`                         | `Infinity`  | Abort and retry a single attempt that runs longer than this, in ms.                       |
| `maxElapsedTime`   | `number`                         | `Infinity`  | Stop retrying once this much wall-clock time has elapsed, in ms.                          |
| `getDelay`         | `(error, ctx) => number \| null` | `null`      | Derive the next wait from the error; return ms to override or `null` to keep the backoff. |
| `until`            | `(result) => boolean`            | `null`      | Retry while the resolved value fails this predicate (polling).                            |
| `signal`           | `AbortSignal`                    | `undefined` | Cancel pending retries.                                                                   |
| `onRetry`          | `(error, options) => void`       | `null`      | Called on each retry — for logging and metrics.                                           |
| `shouldRetry`      | `(error) => boolean`             | `null`      | Return `false` to stop retrying immediately.                                              |

`getDelay`'s context is `{ attempt: number; computedDelay: number }`.

## Returns

`Promise<T>` — resolves with whatever `fn` resolves to (or the last value when
`until` runs out), and rejects with the last error (or the abort reason, or a
`BailError`'s cause).

## Errors & values

```ts
import retry, { BailError, AttemptTimeoutError } from 'promise-fn-retry';
```

- **`BailError`** — throw `new BailError(cause)` from `fn` to give up immediately;
  the retry rejects with `cause`.
- **`AttemptTimeoutError`** — the error a timed-out attempt rejects with (it flows
  through `shouldRetry`/`onRetry`).

## Exported types

```ts
import type {
  Options,
  ResolvedOptions,
  OnRetry,
  ShouldRetry,
  Jitter,
  OperationFn,
  GetDelay,
  Until,
} from 'promise-fn-retry';
```

## How the delay is calculated

Each retry multiplies the previous delay by `backoffFactor`, starting from
`initialDelayTime`; the result is clamped to `maxDelayTime`, randomised by
`jitter`, and finally overridden by `getDelay` (if any) and trimmed to fit
`maxElapsedTime`.

| Retry | Delay (defaults) |
| ----- | ---------------- |
| 1st   | 100 ms           |
| 2nd   | 200 ms           |
| 3rd   | 400 ms           |
| 4th   | 800 ms           |

See it on the [Playground](/playground).
