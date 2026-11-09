// Loads the built package by its own name, through the `exports` map, the way a
// consumer would, and checks the runtime shape of both module formats.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { URL } from 'node:url';

const require = createRequire(import.meta.url);
const cjs = require('promise-fn-retry');
const esm = await import('promise-fn-retry');

// CommonJS: `require` returns the function itself (v1 behaviour), with the
// named exports attached.
assert.equal(typeof cjs, 'function');
assert.equal(cjs.retry, cjs);
assert.equal(cjs.default, cjs);
assert.equal(typeof cjs.BailError, 'function');
assert.equal(typeof cjs.AttemptTimeoutError, 'function');

// ESM: default and named exports.
assert.equal(typeof esm.default, 'function');
assert.equal(esm.retry, esm.default);
assert.equal(typeof esm.BailError, 'function');
assert.equal(typeof esm.AttemptTimeoutError, 'function');

// Both actually retry.
for (const retry of [cjs, esm.default]) {
  let attempts = 0;
  const value = await retry(() => (++attempts < 2 ? Promise.reject('x') : Promise.resolve('ok')), {
    initialDelayTime: 1,
  });
  assert.equal(value, 'ok');
  assert.equal(attempts, 2);
}

// tsup lowers syntax to ES2015 but adds no polyfills, so the bundle must not
// reach for built-ins added later (object spread, for one, compiles to a helper
// that needs Object.getOwnPropertyDescriptors from ES2017).
const newerBuiltIns =
  /\b(getOwnPropertyDescriptors|fromEntries|allSettled|padStart|padEnd|Object\.(values|entries))\b|\.(includes|flat|flatMap|at)\(/;
for (const file of ['index.js', 'index.cjs']) {
  const source = readFileSync(new URL(`../dist/${file}`, import.meta.url), 'utf8');
  assert.doesNotMatch(source, newerBuiltIns, `dist/${file} uses a built-in newer than ES2015`);
}

console.log('dist smoke test passed');
