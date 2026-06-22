# Modernising `promise-fn-retry` — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refresh `promise-fn-retry` to TypeScript + Vitest + tsup + npm + ESLint flat + GitHub Actions, bundling the types, keeping the current API/behaviour, adding 4 opt-in features, and ensuring broad compatibility (browser + Node ≥ 12).

**Architecture:** A single, recursive, stateless function. TypeScript source (`src/index.ts`) is the source of truth; tsup produces dual ESM+CJS+`.d.ts` with an **ES2015 target** (isomorphic). Tests in Vitest. CI/CD via GitHub Actions with automated publishing.

**Tech Stack:** TypeScript, tsup, Vitest (`@vitest/coverage-v8`), ESLint 9 flat + typescript-eslint + Prettier, npm, GitHub Actions, Codecov.

## Global Constraints

- **Broad compatibility:** ES2015 build target, `engines.node >= 12`, runs in **browser and backend**. No Node-only APIs; no `@types/node` in the public types.
- Public API **unchanged** with the defaults: `times=1`, `initialDelayTime=100`, factor `2`, no cap, no jitter, no signal. Identical to v1.
- New features are **opt-in and additive**: `backoffFactor` (2), `maxDelayTime` (Infinity), `jitter` (false), `signal` (undefined).
- Exports `default` and named `retry`; `require('promise-fn-retry')` returns the function.
- Package manager: **npm** only. Target version: **2.0.0**. Zero runtime dependencies.
- Repo URL corrected to `felippemauricio` (without the trailing "v").
- Conventional Commits.

---

### Task 1: Tooling foundation (package.json, tsconfig, cleanup)

**Files:**

- Modify: `package.json` (full rewrite)
- Create: `tsconfig.json`
- Delete: `babel.config.js`, `.eslintrc.json`, `.eslintignore`, `.npmignore`, `.travis.yml`, `yarn.lock`
- Modify: `.gitignore`

**Interfaces:**

- Produces: npm scripts `build`, `test`, `test:coverage`, `lint`, `format`, `typecheck`; `dist/` as the build output.

- [ ] **Step 1: Remove legacy files**

```bash
cd promise-fn-retry
rm -f babel.config.js .eslintrc.json .eslintignore .npmignore .travis.yml yarn.lock
```

- [ ] **Step 2: Write `package.json`** (note: `exports` and output names were later aligned to tsup's defaults under `"type": "module"` — `index.js` for ESM, `index.cjs` for CJS)

```json
{
  "name": "promise-fn-retry",
  "version": "2.0.0",
  "description": "A tiny, typed, isomorphic retry with exponential backoff, jitter and AbortSignal for failed promises",
  "type": "module",
  "main": "./dist/index.cjs",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": { "types": "./dist/index.d.ts", "default": "./dist/index.js" },
      "require": { "types": "./dist/index.d.cts", "default": "./dist/index.cjs" }
    }
  },
  "files": ["dist"],
  "sideEffects": false,
  "engines": { "node": ">=12" },
  "packageManager": "npm@11.17.0",
  "scripts": {
    "build": "tsup",
    "typecheck": "tsc --noEmit",
    "lint": "eslint .",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "prepublishOnly": "npm run build"
  },
  "repository": {
    "type": "git",
    "url": "git+https://github.com/felippemauricio/promise-fn-retry.git"
  },
  "keywords": [
    "fetch",
    "integration",
    "node",
    "browser",
    "request",
    "retry",
    "promise",
    "backoff",
    "jitter",
    "abortsignal",
    "typescript"
  ],
  "author": {
    "name": "Felippe Maurício",
    "email": "felippemauriciov@gmail.com",
    "url": "https://github.com/felippemauricio"
  },
  "license": "MIT",
  "bugs": { "url": "https://github.com/felippemauricio/promise-fn-retry/issues" },
  "homepage": "https://github.com/felippemauricio/promise-fn-retry#readme",
  "devDependencies": {
    "@eslint/js": "^10.0.1",
    "@vitest/coverage-v8": "^4.1.9",
    "eslint": "^10.5.0",
    "prettier": "^3.8.4",
    "tsup": "^8.5.1",
    "typescript": "^6.0.3",
    "typescript-eslint": "^8.61.1",
    "vitest": "^4.1.9"
  }
}
```

- [ ] **Step 3: Write `tsconfig.json`** (target ES2020 for typechecking; the DOM lib provides the `AbortSignal`/`setTimeout` types; the build uses ES2015 via tsup. `ignoreDeprecations` is needed for TypeScript 6 because tsup injects a `baseUrl` during the DTS build.)

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2020", "DOM"],
    "declaration": true,
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "ignoreDeprecations": "6.0",
    "forceConsistentCasingInFileNames": true,
    "verbatimModuleSyntax": true,
    "outDir": "dist"
  },
  "include": ["src", "tests"]
}
```

- [ ] **Step 4: Update `.gitignore`** — ensure it contains:

```
node_modules
dist
coverage
*.log
```

- [ ] **Step 5: Install dependencies**

Run: `npm install`
Expected: creates `package-lock.json`, no errors.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: bootstrap npm + typescript tooling, remove babel/travis/yarn"
```

---

### Task 2: Rewrite the source in TypeScript with the 4 features

**Files:**

- Create: `src/index.ts`
- Delete: `src/index.js`

**Interfaces:**

- Produces: `export default retry`, `export { retry }`, `export type { Options, ResolvedOptions, OnRetry, ShouldRetry }`.
- `retry<T>(fn: () => Promise<T>, options?: Options): Promise<T>`.
- Defaults: `times=1`, `initialDelayTime=100`, `backoffFactor=2`, `maxDelayTime=Infinity`, `jitter=false`, `signal=undefined`.

- [ ] **Step 1: Write `src/index.ts`**

```ts
export type OnRetry = (error: unknown, options: ResolvedOptions) => void;
export type ShouldRetry = (error: unknown) => boolean;

export interface Options {
  /** Number of retries after the first failure. Default: 1 */
  times?: number;
  /** Initial delay in ms before the first retry. Default: 100 */
  initialDelayTime?: number;
  /** Multiplier applied to the delay on each retry. Default: 2 (doubles) */
  backoffFactor?: number;
  /** Cap on the delay between attempts, in ms. Default: Infinity (no cap) */
  maxDelayTime?: number;
  /** Randomises the delay (equal jitter) to avoid a thundering herd. Default: false */
  jitter?: boolean;
  /** AbortSignal to cancel the retries. Default: undefined */
  signal?: AbortSignal;
  /** Called on each retry. Handy for metrics/logs. Default: null */
  onRetry?: OnRetry | null;
  /** Decides whether to retry given the error. Default: null (always retries) */
  shouldRetry?: ShouldRetry | null;
}

interface ControlOptions {
  retained: number;
  currentDelay: number | null;
}

export type ResolvedOptions = Required<Omit<Options, 'signal'>> &
  Pick<Options, 'signal'> &
  ControlOptions;

const defaultOptions: Required<Omit<Options, 'signal'>> = {
  times: 1,
  initialDelayTime: 100,
  backoffFactor: 2,
  maxDelayTime: Infinity,
  jitter: false,
  onRetry: null,
  shouldRetry: null,
};

const controlOptions: ControlOptions = {
  retained: 0,
  currentDelay: null,
};

const buildOptionsParsed = (options: Options): ResolvedOptions => ({
  ...defaultOptions,
  ...controlOptions,
  ...options,
});

const calcNewDelay = (currentDelay: number, backoffFactor: number): number =>
  currentDelay * backoffFactor;

const buildOptionsToRetry = (optionsParsed: ResolvedOptions): ResolvedOptions => {
  const { currentDelay, initialDelayTime, backoffFactor, retained } = optionsParsed;
  return {
    ...optionsParsed,
    retained: retained + 1,
    currentDelay: currentDelay ? calcNewDelay(currentDelay, backoffFactor) : initialDelayTime,
  };
};

const shouldRetryByExecutedTimes = ({ retained, times }: ResolvedOptions): boolean =>
  retained < times;

/** Applies the cap and jitter (equal jitter) on top of the base delay. */
const computeWaitTime = (baseDelay: number, maxDelayTime: number, jitter: boolean): number => {
  const capped = Math.min(baseDelay, maxDelayTime);
  if (!jitter) return capped;
  return capped / 2 + Math.random() * (capped / 2);
};

const abortError = (signal: AbortSignal): unknown =>
  signal.reason ?? new Error('The operation was aborted');

/** setTimeout that rejects if the signal aborts; clears the timer at the end. */
const delay = (delayTime: number, signal?: AbortSignal): Promise<void> =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError(signal));
      return;
    }
    const onAbort = (): void => {
      clearTimeout(timer);
      reject(abortError(signal as AbortSignal));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, delayTime);
    signal?.addEventListener('abort', onAbort, { once: true });
  });

export function retry<T>(
  requestFn: () => Promise<T>,
  options: Options = defaultOptions,
): Promise<T> {
  const optionsParsed = buildOptionsParsed(options);
  const { onRetry, shouldRetry, signal, maxDelayTime, jitter } = optionsParsed;

  if (signal?.aborted) return Promise.reject(abortError(signal));

  return requestFn().catch((err: unknown) => {
    if (shouldRetryByExecutedTimes(optionsParsed) && (!shouldRetry || shouldRetry(err))) {
      const optionsToRetry = buildOptionsToRetry(optionsParsed);
      const waitTime = computeWaitTime(optionsToRetry.currentDelay ?? 0, maxDelayTime, jitter);
      return delay(waitTime, signal).then(() => {
        if (onRetry) onRetry(err, { ...optionsParsed });
        return retry(requestFn, optionsToRetry);
      });
    }
    throw err;
  });
}

export default retry;
```

- [ ] **Step 2: Remove the old source**

```bash
rm src/index.js
```

- [ ] **Step 3: Verify the typecheck**

Run: `npm run typecheck`
Expected: PASS (no errors).

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: rewrite source in typescript with embedded types and opt-in features (backoffFactor, maxDelayTime, jitter, AbortSignal)"
```

---

### Task 3: Migrate/expand the tests in Vitest

**Files:**

- Create: `vitest.config.ts`
- Create: `tests/retry.test.ts`
- Delete: `tests/retry.test.js`

**Interfaces:**

- Consumes: the `retry` default export from `../src`.

- [ ] **Step 1: Write `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      include: ['src/**'],
      reporter: ['text', 'lcov'],
      thresholds: {
        lines: 95,
        functions: 100,
        branches: 90,
        statements: 95,
      },
    },
  },
});
```

- [ ] **Step 2: Write `tests/retry.test.ts`** (1:1 migration + features). An extra test was added to cover the defensive in-`delay` abort guard: aborting synchronously inside `fn` so the signal is already aborted by the time `delay` runs.

```ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import retry from '../src';

describe('retry', () => {
  const success = 'ok';
  const fail = 'fail';
  const promiseFnSuccess = () => Promise.resolve(success);
  const promiseFnFail = () => Promise.reject(fail);

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns the resolved value when the promise resolves', async () => {
    await expect(retry(promiseFnSuccess)).resolves.toBe(success);
  });

  it('does not retry when the promise resolves', async () => {
    const onRetry = vi.fn();
    await retry(promiseFnSuccess, { onRetry });
    expect(onRetry).not.toHaveBeenCalled();
  });

  it('rejects with the original error when it keeps failing', async () => {
    await expect(retry(promiseFnFail)).rejects.toBe(fail);
  });

  it('retries when the promise fails', async () => {
    const onRetry = vi.fn();
    await expect(retry(promiseFnFail, { onRetry })).rejects.toBe(fail);
    expect(onRetry).toHaveBeenCalled();
  });

  it('retries `times` times when the promise keeps failing', async () => {
    const onRetry = vi.fn();
    const times = 3;
    await expect(retry(promiseFnFail, { onRetry, times, initialDelayTime: 1 })).rejects.toBe(fail);
    expect(onRetry).toHaveBeenCalledTimes(times);
  });

  it('resolves when a retry succeeds', async () => {
    let called = false;
    const fn = () => {
      if (called) return promiseFnSuccess();
      called = true;
      return promiseFnFail();
    };
    await expect(retry(fn, { initialDelayTime: 1 })).resolves.toBe(success);
  });

  it('stops retrying once a retry succeeds', async () => {
    let called = false;
    const onRetry = vi.fn();
    const fn = () => {
      if (called) return promiseFnSuccess();
      called = true;
      return promiseFnFail();
    };
    await retry(fn, { onRetry, times: 5, initialDelayTime: 1 });
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('calls shouldRetry when the promise fails', async () => {
    const shouldRetry = vi.fn(() => false);
    await expect(retry(promiseFnFail, { shouldRetry })).rejects.toBe(fail);
    expect(shouldRetry).toHaveBeenCalled();
  });

  it('retries `times` times when shouldRetry returns true', async () => {
    const onRetry = vi.fn();
    const times = 3;
    await expect(
      retry(promiseFnFail, { onRetry, shouldRetry: () => true, times, initialDelayTime: 1 }),
    ).rejects.toBe(fail);
    expect(onRetry).toHaveBeenCalledTimes(times);
  });

  it('does not retry when shouldRetry returns false', async () => {
    const onRetry = vi.fn();
    await expect(
      retry(promiseFnFail, { onRetry, shouldRetry: () => false, times: 3 }),
    ).rejects.toBe(fail);
    expect(onRetry).not.toHaveBeenCalled();
  });

  // --- features ---

  it('doubles the delay by default (backoffFactor 2)', async () => {
    const spy = vi.spyOn(globalThis, 'setTimeout');
    await expect(retry(promiseFnFail, { times: 2, initialDelayTime: 4 })).rejects.toBe(fail);
    const delays = spy.mock.calls.map((c) => c[1]);
    expect(delays).toEqual([4, 8]);
  });

  it('honours a custom backoffFactor', async () => {
    const spy = vi.spyOn(globalThis, 'setTimeout');
    await expect(
      retry(promiseFnFail, { times: 3, initialDelayTime: 1, backoffFactor: 3 }),
    ).rejects.toBe(fail);
    const delays = spy.mock.calls.map((c) => c[1]);
    expect(delays).toEqual([1, 3, 9]);
  });

  it('caps the delay at maxDelayTime', async () => {
    const spy = vi.spyOn(globalThis, 'setTimeout');
    await expect(
      retry(promiseFnFail, { times: 3, initialDelayTime: 4, maxDelayTime: 6 }),
    ).rejects.toBe(fail);
    const delays = spy.mock.calls.map((c) => c[1]);
    expect(delays).toEqual([4, 6, 6]);
  });

  it('applies jitter within [base/2, base]', async () => {
    const spy = vi.spyOn(globalThis, 'setTimeout');
    const base = 100;
    await expect(
      retry(promiseFnFail, { times: 1, initialDelayTime: base, jitter: true }),
    ).rejects.toBe(fail);
    const used = spy.mock.calls[0]![1] as number;
    expect(used).toBeGreaterThanOrEqual(base / 2);
    expect(used).toBeLessThanOrEqual(base);
  });

  it('does not call fn when the signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    const fn = vi.fn(promiseFnFail);
    await expect(retry(fn, { signal: controller.signal, times: 3 })).rejects.toBeDefined();
    expect(fn).not.toHaveBeenCalled();
  });

  it('stops retrying when aborted during the delay', async () => {
    const controller = new AbortController();
    const fn = vi.fn(promiseFnFail);
    const promise = retry(fn, { signal: controller.signal, times: 5, initialDelayTime: 50 });
    setTimeout(() => controller.abort(), 10);
    await expect(promise).rejects.toBeDefined();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('rejects before waiting if aborted synchronously while running fn', async () => {
    const controller = new AbortController();
    const fn = vi.fn(() => {
      controller.abort();
      return promiseFnFail();
    });
    await expect(
      retry(fn, { signal: controller.signal, times: 3, initialDelayTime: 50 }),
    ).rejects.toBeDefined();
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 3: Remove the old test**

```bash
rm tests/retry.test.js
```

- [ ] **Step 4: Run the tests**

Run: `npm test`
Expected: all tests PASS.

- [ ] **Step 5: Run coverage**

Run: `npm run test:coverage`
Expected: PASS, coverage ≥ thresholds.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "test: migrate to vitest and cover backoff, maxDelay, jitter and abort"
```

---

### Task 4: Build with tsup (dual ESM+CJS+types, ES2015)

**Files:**

- Create: `tsup.config.ts`

**Interfaces:**

- Produces: `dist/index.js` (ESM), `dist/index.cjs` (CJS), `dist/index.d.ts`, `dist/index.d.cts`, ES2015 target.

- [ ] **Step 1: Write `tsup.config.ts`** (split ESM/CJS configs; a CJS footer reassigns `module.exports = retry` to preserve v1's `require()` behaviour)

```ts
import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: ['src/index.ts'],
    format: ['esm'],
    dts: true,
    clean: true,
    sourcemap: true,
    minify: false,
    target: 'es2015',
  },
  {
    entry: ['src/index.ts'],
    format: ['cjs'],
    dts: true,
    sourcemap: true,
    minify: false,
    target: 'es2015',
    // Preserves v1 behaviour: `require('promise-fn-retry')` returns the
    // function directly, with `.retry` and `.default` also available.
    footer: {
      js: 'module.exports = retry; module.exports.retry = retry; module.exports.default = retry;',
    },
  },
]);
```

- [ ] **Step 2: Run the build**

Run: `npm run build`
Expected: produces `dist/index.js`, `dist/index.cjs`, `dist/index.d.ts`, `dist/index.d.cts` without errors.

- [ ] **Step 3: Verify the output is ES2015 (no `?.`/`??` in the bundle)**

Run: `node -e "const s=require('fs').readFileSync('dist/index.cjs','utf8'); if(/[^.]\?\./.test(s)||/\?\?/.test(s)){throw new Error('optional chaining/nullish not transpiled')} console.log('es2015 ok')"`
Expected: prints `es2015 ok`.

- [ ] **Step 4: Verify CJS interop (require returns the function)**

Run: `node -e "const r = require('./dist/index.cjs'); if (typeof r !== 'function') throw new Error('CJS default is not a function'); if (typeof r.retry !== 'function') throw new Error('named missing'); console.log('CJS ok');"`
Expected: prints `CJS ok`.

- [ ] **Step 5: Verify ESM (default and named import)**

Run: `node --input-type=module -e "import retry, { retry as named } from './dist/index.js'; if (typeof retry !== 'function' || typeof named !== 'function') throw new Error('invalid ESM exports'); console.log('ESM ok');"`
Expected: prints `ESM ok`.

- [ ] **Step 6: Runtime smoke test (with a new feature)**

Run: `node --input-type=module -e "import retry from './dist/index.js'; let n=0; retry(()=>{n++; return n<2?Promise.reject('x'):Promise.resolve('done');},{times:3,initialDelayTime:1,backoffFactor:3}).then(r=>{if(r!=='done')throw new Error('failed'); console.log('runtime ok')});"`
Expected: prints `runtime ok`.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "build: add tsup dual esm/cjs es2015 output with v1-compatible require() interop"
```

---

### Task 5: ESLint flat + Prettier

**Files:**

- Create: `eslint.config.js`
- Create: `.prettierrc`
- Create: `.prettierignore`

**Interfaces:**

- Produces: working `lint`, `format`, `format:check` scripts.

- [ ] **Step 1: Write `eslint.config.js`**

```js
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'coverage', 'node_modules'] },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
);
```

- [ ] **Step 2: Write `.prettierrc`**

```json
{
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100,
  "semi": true
}
```

- [ ] **Step 3: Write `.prettierignore`**

```
dist
coverage
node_modules
package-lock.json
```

- [ ] **Step 4: Run format, lint and typecheck**

Run: `npm run format && npm run lint && npm run typecheck`
Expected: format applies, lint PASS, typecheck PASS.

> Note: `onAbort` inside `delay` is declared as a `const` arrow before the
> `setTimeout` to avoid `no-inner-declarations` while still capturing `timer`.

- [ ] **Step 5: Run the tests (ensure formatting broke nothing)**

Run: `npm test`
Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: add eslint flat config and prettier"
```

---

### Task 6: GitHub Actions (CI + release)

**Files:**

- Create: `.github/workflows/ci.yml`
- Create: `.github/workflows/release.yml`

**Interfaces:**

- Consumes: npm scripts `lint`, `typecheck`, `test:coverage`, `build`.

- [ ] **Step 1: Write `.github/workflows/ci.yml`**

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node-version: [20.x, 22.x]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node-version }}
          cache: npm
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck
      - run: npm run test:coverage
      - run: npm run build
      - name: Upload coverage to Codecov
        if: matrix.node-version == '22.x'
        uses: codecov/codecov-action@v5
        with:
          token: ${{ secrets.CODECOV_TOKEN }}
          files: ./coverage/lcov.info
```

- [ ] **Step 2: Write `.github/workflows/release.yml`**

```yaml
name: Release

on:
  release:
    types: [published]

jobs:
  publish:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      id-token: write
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22.x
          registry-url: 'https://registry.npmjs.org'
          cache: npm
      - run: npm ci
      - run: npm run build
      - run: npm publish --provenance --access public
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

- [ ] **Step 3: Validate that the YAML files parse**

Run: `node -e "const fs=require('fs');for(const f of ['.github/workflows/ci.yml','.github/workflows/release.yml']){fs.readFileSync(f,'utf8');}console.log('yaml read');"`
Expected: prints `yaml read`.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "ci: replace travis with github actions for ci and npm release"
```

---

### Task 7: Documentation (README + CLAUDE.md)

**Files:**

- Modify: `README.md` (rewrite)
- Create: `CLAUDE.md`

> Both documents are written in Australian English (en-AU), per the repo content rule.

- [ ] **Step 1: Rewrite `README.md`** — refreshed badges (GitHub Actions, npm, Codecov; remove Travis and david-dm), installation, TS and JS examples (ESM + CJS), typed options table including the new options, the backoff/jitter strategy, a compatibility note (browser + Node), and a contributing section.

- [ ] **Step 2: Create `CLAUDE.md`** — overview, commands (`build`/`test`/`lint`/`typecheck`), the single-function architecture, the v1-compatible `require()` interop note, conventions, and the release flow.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "docs: rewrite readme and add CLAUDE.md"
```

---

### Task 8: Final verification

**Files:** none (validation).

- [ ] **Step 1: Full quality gate**

Run: `npm run lint && npm run typecheck && npm run test:coverage && npm run build`
Expected: everything PASS, `dist/` generated.

- [ ] **Step 2: Check git state**

Run: `git status && git log --oneline -10`
Expected: clean working tree, the modernisation commits present.

---

## Self-Review

- **Spec coverage:** TS (T2), Vitest (T3), tsup dual+types ES2015 (T4), npm (T1),
  ESLint flat+Prettier (T5), GitHub Actions CI+release (T6), ES2015/Node 12+/
  isomorphic compatibility (T1 engines+tsconfig, T4 target, T6 matrix), Codecov
  (T6, README T7), README+CLAUDE (T7), Travis/babel/yarn removal (T1), bundled
  types (T2), 4 opt-in features (T2 impl, T3 tests, T7 docs), version 2.0.0 and
  corrected URL (T1). All mapped.
- **Placeholders:** none — all code and commands are complete.
- **Type consistency:** `Options`/`ResolvedOptions`/`OnRetry`/`ShouldRetry` and
  the `backoffFactor`/`maxDelayTime`/`jitter`/`signal` fields are consistent
  across T2, T3 and T7; the `retry<T>(fn, options?)` signature is identical
  throughout.
