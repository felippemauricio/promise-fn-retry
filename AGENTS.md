# AGENTS.md

Guidance for agents (Claude Code, Codex and others) working in this repository. `CLAUDE.md` only imports this file.

## What it is

`promise-fn-retry` is an **isomorphic** (browser + Node ≥ 12) single-function
library that retries a promise that fails, with exponential backoff, jitter, a
delay cap and cancellation via `AbortSignal`. Zero runtime dependencies;
bundled types.

## Commands

- `npm test` — the suite (Vitest). `npm run test:watch` for watch mode.
- `npm run test:coverage` — tests + coverage (v8); CI fails below 100 %.
- `npm run lint` — ESLint 10 (flat) + typescript-eslint.
- `npm run format` — Prettier (`format:check` to check only).
- `npm run typecheck` — `tsc --noEmit`.
- `npm run build` — tsup produces `dist/` (ESM `index.js`, CJS `index.cjs`, their
  declarations), ES2015 target; then `scripts/cjs-types.mjs` rewrites the CJS
  declaration (see below).
- `npm run check:package` — after a build: `attw` (types resolve correctly in every
  module mode), `publint`, and `scripts/smoke-dist.mjs` (loads the built package by
  name in both formats and checks its runtime shape).
- `npm run docs:dev` / `docs:build` — the VitePress site in `website/`, which
  imports the library straight from `src/`.

## Architecture

```text
src/
  index.ts            entry point: re-exports `retry` (default + named), the
                      error classes and the public types
  retry.ts            `retry()` and the `run` loop (retry, poll via `until`, stop)
  errors.ts           `BailError`, `AttemptTimeoutError` (public), plus
                      `isBailError` and `abortError`
  types.ts            public types (`Options`, `ResolvedOptions`, `OnRetry`,
                      `ShouldRetry`, `Jitter`, `OperationFn`, `GetDelay`, `Until`);
                      `Options` = `CoreOptions` (canonical) + `AliasOptions`
  internal/           helpers, not exported from the package
    options.ts        defaults, alias mapping; `undefined` counts as omitted
    backoff.ts        `nextDelay`, `computeWaitTime` (cap + jitter), `planWait`
                      (`getDelay` override + `maxElapsedTime` budget)
    attempt.ts        `attemptOnce`: one attempt, with `attemptTimeout` and the
                      per-attempt `AbortSignal`
    timers.ts         `schedule` (chains timers past the 2^31 - 1 ms `setTimeout`
                      limit) and the abortable `delay`
    clock.ts          `now()`
```

- `run` is an `async` **loop**, not recursion, so a long `forever` run keeps only
  the current state. Keep it that way.
- Every timer goes through `schedule`, never a bare `setTimeout`: longer delays
  would otherwise fire almost at once.
- Stable public API: `retry<T>(fn, options?)` where `fn` receives the 1-indexed
  attempt number (and a per-attempt signal); `default` and named exports.
  `require('promise-fn-retry')` returns the function: a footer in `tsup.config.ts`
  reassigns `module.exports = retry` and re-attaches `.retry`, `.default`,
  `.BailError` and `.AttemptTimeoutError`, preserving v1 behaviour. Its types
  match: `scripts/cjs-types.mjs` turns `dist/index.d.cts` into an `export =` of a
  callable (the generated declaration moves to `dist/core.d.cts`). A new public
  type must be added to the list in that script; the build fails until it is.
- **Compatibility:** use universal APIs only (`Promise`, `setTimeout`,
  `AbortSignal` when provided). Nothing Node-only. Write modern TS; tsup
  transpiles the **syntax** to ES2015 but adds no polyfills, so do not use
  built-ins newer than ES2015 (such as `Object.fromEntries`,
  `Array.prototype.includes` or `Promise.allSettled`).
- New options must be **additive** with a default that preserves current behaviour.

## Tests

- `tests/` holds one file per feature (`retry`, `backoff`, `abort`,
  `attempt-timeout`, `max-elapsed-time`, `until`, `bail`), and `tests/internal/`
  holds unit tests for helpers.
- Every test runs on **fake timers** with the clock at 0 (`tests/setup.ts`). Use the
  helpers in `tests/helpers.ts`: `flaky(n)` / `alwaysFails()` record when each
  attempt started, so assert the waits (`waits()`) rather than how timers were
  scheduled; `settle(promise)` runs every timer and returns how the promise
  settled; use `outcomeOf(promise)` with `vi.advanceTimersByTimeAsync` when the
  test drives the clock itself (aborts, `forever`).
- Assert the specific value or error (`rejected(reason)`), never only that a
  promise rejected.

## Conventions

- Conventional Commits.
- Strict TypeScript; keep the public types (`Options`, `ResolvedOptions`,
  `OnRetry`, `ShouldRetry`, `Jitter`, `OperationFn`, `GetDelay`, `Until`) in sync
  with behaviour.
- Changing the default behaviour is breaking — version via semver.
- All committed content (docs, comments, commit messages) is written in
  Australian English (en-AU).

## Release

- CI runs on every branch push and PR (Node 22/24 matrix: lint, format check,
  typecheck, test+coverage, build, package checks). The dev toolchain needs Node 22.18+; the
  published library still targets ES2015 / Node >= 12.
- Publishing = create a GitHub Release; the `release.yml` workflow publishes to
  npm via `NPM_TOKEN` with provenance, after running the tests and the package
  checks. Bump the version in `package.json` first.
- Repository secrets required: `NPM_TOKEN` (publish) and `CODECOV_TOKEN` (coverage).
