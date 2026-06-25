# Migrating

## From v1

The call signature and default behaviour are unchanged, so existing v1 code keeps
working without edits. When you upgrade:

- **Remove `@types/promise-fn-retry`** — types are bundled with the package now.
- You can `import` it as ESM as well as `require` it.
- A pile of optional options is available — `backoffFactor`, `maxDelayTime`,
  `jitter`, `forever`, `attemptTimeout`, `maxElapsedTime`, `getDelay`, `until`,
  `signal` — plus `BailError`, `AttemptTimeoutError`, and an `attempt` number
  passed to `fn`. You only adopt what you want.

## Option-name aliases

A few alternative option names are accepted and mapped onto the canonical options.
If you pass both a canonical option and its alias, the **canonical one wins**.

| Alias        | Maps to            |
| ------------ | ------------------ |
| `retries`    | `times`            |
| `factor`     | `backoffFactor`    |
| `minTimeout` | `initialDelayTime` |
| `maxTimeout` | `maxDelayTime`     |
| `randomize`  | `jitter: 'full'`   |

```ts
// These two calls are equivalent:
retry(fn, { retries: 5, minTimeout: 200, factor: 2, randomize: true });
retry(fn, { times: 5, initialDelayTime: 200, backoffFactor: 2, jitter: 'full' });
```

> Only the names are translated, not the defaults — the library's own defaults
> (`times: 1`, `initialDelayTime: 100`) always apply.
