# CLAUDE.md

Guidance for agents working in this repository.

## What it is

`promise-fn-retry` is an **isomorphic** (browser + Node ≥ 12) single-function
library that retries a promise that fails, with exponential backoff, jitter, a
delay cap and cancellation via `AbortSignal`. Zero runtime dependencies;
bundled types.

## Commands

- `npm test` — the suite (Vitest). `npm run test:watch` for watch mode.
- `npm run test:coverage` — tests + coverage (v8).
- `npm run lint` — ESLint 9 (flat) + typescript-eslint.
- `npm run format` — Prettier (`format:check` to check only).
- `npm run typecheck` — `tsc --noEmit`.
- `npm run build` — tsup produces `dist/` (ESM `index.js`, CJS `index.cjs`, `.d.ts`), ES2015 target.

## Architecture

- Source is split into three files:
  - `src/types.ts` — public types (`Options`, `ResolvedOptions`, `OnRetry`, `ShouldRetry`).
  - `src/retry.ts` — the `retry` function plus pure helpers (`resolveOptions`,
    `nextDelay`, `computeWaitTime`, `delay`, `abortError`) and the recursive `run` loop.
  - `src/index.ts` — the entry point; re-exports `retry` (default + named) and the types.
- Stable public API: `retry<T>(fn, options?)` with `default` and named exports;
  `require('promise-fn-retry')` returns the function (a footer in
  `tsup.config.ts` reassigns `module.exports = retry`, preserving v1 behaviour).
- **Compatibility:** use universal APIs only (`Promise`, `setTimeout`,
  `AbortSignal` when provided). Nothing Node-only. Write modern TS; tsup
  transpiles to ES2015.
- New options must be **additive** with a default that preserves current behaviour.

## Conventions

- Conventional Commits.
- Strict TypeScript; keep the public types (`Options`, `ResolvedOptions`,
  `OnRetry`, `ShouldRetry`) in sync with behaviour.
- Changing the default behaviour is breaking — version via semver.
- All committed content (docs, comments, commit messages) is written in
  Australian English (en-AU).

## Release

- CI runs on every branch push and PR (Node 20/22 matrix: lint, format check,
  typecheck, test+coverage, build). The dev toolchain needs Node 20+; the
  published library still targets ES2015 / Node >= 12.
- Publishing = create a GitHub Release; the `release.yml` workflow publishes to
  npm via `NPM_TOKEN` with provenance. Bump the version in `package.json` first.
- Repository secrets required: `NPM_TOKEN` (publish) and `CODECOV_TOKEN` (coverage).
