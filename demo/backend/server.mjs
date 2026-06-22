// Backend demo: a tiny flaky HTTP server + a retry() client that calls it.
// Run with: npm run demo:backend  (needs Node 18+ for global fetch)
import { createServer } from 'node:http';
import retry from '../../dist/index.js';

const c = {
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  amber: (s) => `\x1b[33m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  cyan: (s) => `\x1b[36m${s}\x1b[0m`,
};

// --- A flaky endpoint: the first N calls return 503, then it recovers. ---
let hits = 0;
const failTimes = 3;

const server = createServer((req, res) => {
  hits += 1;
  if (hits <= failTimes) {
    res.writeHead(503, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'service unavailable' }));
    return;
  }
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ ok: true, servedOnHit: hits }));
});

/** Calls the flaky endpoint once; throws on a non-2xx response. */
const callApi = (url) => async () => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
};

function heading(title) {
  console.log(`\n${c.cyan('●')} ${title}`);
}

await new Promise((resolve) => server.listen(0, resolve));
const { port } = server.address();
const url = `http://localhost:${port}/flaky`;
console.log(c.dim(`flaky server listening on ${url} (fails ${failTimes}x, then recovers)`));

// --- Scenario 1: recover through exponential backoff with jitter ---
heading('Scenario 1 — retry through backoff (jitter on)');
const startedAt = Date.now();
try {
  const data = await retry(callApi(url), {
    times: 5,
    initialDelayTime: 150,
    backoffFactor: 2,
    maxDelayTime: 2000,
    jitter: true,
    onRetry: (err, opts) =>
      console.log(
        `  ${c.amber('retry')} ${c.dim(`#${opts.retained + 1}/${opts.times}`)} after ${c.red(String(err.message))}`,
      ),
  });
  console.log(`  ${c.green('resolved')} →`, data, c.dim(`(${Date.now() - startedAt} ms total)`));
} catch (err) {
  console.log(`  ${c.red('gave up')} → ${err.message}`);
}

// --- Scenario 2: cancel in-flight retries with an AbortSignal ---
heading('Scenario 2 — cancel with AbortSignal');
hits = 0; // reset so the endpoint keeps failing long enough to abort
const controller = new AbortController();
setTimeout(() => controller.abort(), 250);
try {
  await retry(callApi(url), {
    times: 10,
    initialDelayTime: 200,
    signal: controller.signal,
    onRetry: (err) => console.log(`  ${c.amber('retry')} after ${c.red(String(err.message))}`),
  });
} catch (err) {
  const reason = controller.signal.aborted ? 'aborted by signal' : err.message;
  console.log(`  ${c.amber('stopped')} → ${reason}`);
}

server.close();
console.log(c.dim('\ndone.\n'));
