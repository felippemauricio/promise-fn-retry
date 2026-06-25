# Installation

```bash
npm install promise-fn-retry
```

## ESM

```ts
import retry from 'promise-fn-retry';

const data = await retry(() => fetch('https://api.example.com/data'));
```

The named export is the same function as the default:

```ts
import { retry } from 'promise-fn-retry';
```

## CommonJS

`require` returns the function directly, exactly like v1:

```js
const retry = require('promise-fn-retry');

retry(() => fetch('https://api.example.com/data'), { times: 3 });
```

The value exports `BailError` and `AttemptTimeoutError` are attached, too:

```js
const { BailError, AttemptTimeoutError } = require('promise-fn-retry');
```

## Compatibility

- **Runtimes:** modern browsers and Node `>= 12`.
- **Modules:** ESM (`import`) and CommonJS (`require`).
- **Types:** bundled — TypeScript users need nothing extra.
- **Dependencies:** none.

> Some capabilities use platform features when present: cancellation and
> `attemptTimeout`'s abort rely on `AbortController`/`AbortSignal` (Node ≥ 15 or a
> browser). Where they're absent, `attemptTimeout` still times out an attempt; it
> just can't abort the in-flight work.
