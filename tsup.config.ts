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
    // Preserves v1 behaviour: `require('promise-fn-retry')` returns the function
    // directly, with the named exports attached.
    footer: {
      js: 'module.exports = retry; module.exports.retry = retry; module.exports.default = retry; module.exports.BailError = BailError; module.exports.AttemptTimeoutError = AttemptTimeoutError;',
    },
  },
]);
