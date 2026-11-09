// Rewrites dist/index.d.cts so the CommonJS types match the CommonJS runtime:
// `require('promise-fn-retry')` returns the callable `retry` (see the footer in
// tsup.config.ts), so its declaration must be `export =` a callable, not an ES
// module namespace. tsup's generated declaration moves to dist/core.d.cts and the
// new index.d.cts re-exposes it.
import { readFileSync, writeFileSync } from 'node:fs';
import { URL } from 'node:url';

const dist = new URL('../dist/', import.meta.url);
const current = readFileSync(new URL('index.d.cts', dist), 'utf8');
// Run again on an already rewritten dist (without a fresh tsup build), start from
// the generated declaration it set aside.
const generated = current.includes('export = retry;')
  ? readFileSync(new URL('core.d.cts', dist), 'utf8')
  : current;

// Every public type, with its type parameters. Keep in sync with src/index.ts:
// the build fails below if the two drift apart.
const types = {
  Options: '',
  ResolvedOptions: '',
  OnRetry: '',
  ShouldRetry: '',
  Jitter: '',
  OperationFn: '<T>',
  GetDelay: '',
  Until: '',
};

const exported = generated
  .match(/export type \{([^}]+)\}/)?.[1]
  .split(',')
  .map((name) => name.trim())
  .filter(Boolean)
  .sort();
const expected = Object.keys(types).sort();
if (JSON.stringify(exported) !== JSON.stringify(expected)) {
  throw new Error(
    `scripts/cjs-types.mjs is out of sync with the public types.\n` +
      `  generated: ${exported?.join(', ')}\n  listed:    ${expected.join(', ')}`,
  );
}

const aliases = Object.entries(types)
  .map(([name, params]) => `  type ${name}${params} = core.${name}${params};`)
  .join('\n');

writeFileSync(new URL('core.d.cts', dist), generated);
writeFileSync(
  new URL('index.d.cts', dist),
  `import type * as core from './core.cjs';

declare const retry: typeof core.retry & {
  retry: typeof core.retry;
  default: typeof core.retry;
  BailError: typeof core.BailError;
  AttemptTimeoutError: typeof core.AttemptTimeoutError;
};

declare namespace retry {
${aliases}
  type BailError = core.BailError;
  type AttemptTimeoutError = core.AttemptTimeoutError;
}

export = retry;
`,
);
