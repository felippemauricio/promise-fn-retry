import retry from './promise-fn-retry.js';

const $ = (id) => document.getElementById(id);

const els = {
  times: $('times'),
  initialDelayTime: $('initialDelayTime'),
  backoffFactor: $('backoffFactor'),
  maxDelayTime: $('maxDelayTime'),
  jitter: $('jitter'),
  failUntil: $('failUntil'),
  run: $('run'),
  abort: $('abort'),
  copy: $('copy'),
  log: $('log'),
  markers: $('markers'),
  ticks: $('ticks'),
  track: $('track'),
  readout: $('readout'),
  snippet: $('snippet'),
};

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Reads the current option values from the form. */
function readOptions() {
  const maxDelayTime = Number(els.maxDelayTime.value);
  return {
    times: Number(els.times.value),
    initialDelayTime: Number(els.initialDelayTime.value),
    backoffFactor: Number(els.backoffFactor.value),
    maxDelayTime: maxDelayTime > 0 ? maxDelayTime : Infinity,
    jitter: els.jitter.checked,
    failUntil: Number(els.failUntil.value),
  };
}

/** Builds the equivalent retry() call for the current options. */
function renderSnippet() {
  const o = readOptions();
  const lines = [
    `  times: ${o.times},`,
    `  initialDelayTime: ${o.initialDelayTime},`,
    `  backoffFactor: ${o.backoffFactor},`,
  ];
  if (o.maxDelayTime !== Infinity) lines.push(`  maxDelayTime: ${o.maxDelayTime},`);
  if (o.jitter) lines.push(`  jitter: true,`);
  lines.push(`  // signal: controller.signal,`);

  els.snippet.textContent = [
    `import retry from 'promise-fn-retry';`,
    ``,
    `await retry(fetchData, {`,
    ...lines,
    `});`,
  ].join('\n');
}

let attempts = [];

/** Positions every attempt marker to scale by its elapsed time. */
function drawTimeline() {
  const span = Math.max(attempts.length ? attempts[attempts.length - 1].t : 0, 1);
  const left = (t) => 4 + (t / span) * 92;

  els.markers.innerHTML = '';
  els.ticks.innerHTML = '';

  attempts.forEach((a, i) => {
    const m = document.createElement('div');
    m.className = `marker is-${a.state}${a.fresh && !reduceMotion ? ' enter' : ''}`;
    m.style.left = `${left(a.t)}%`;
    m.dataset.n = `#${a.n}`;
    els.markers.appendChild(m);
    a.fresh = false;

    const tick = document.createElement('span');
    tick.className = 'tick';
    tick.style.left = `${left(a.t)}%`;
    tick.textContent = i === 0 ? '0 ms' : `+${Math.round(a.t)} ms`;
    els.ticks.appendChild(tick);
  });
}

function addLog(n, state, detail) {
  const li = document.createElement('li');
  li.className = `log-line ${state}`;
  const label = { fail: 'failed', ok: 'succeeded', abort: 'aborted' }[state];
  li.innerHTML = `<span class="n">#${n}</span><span class="state">${label}</span><span class="delay">${detail}</span>`;
  els.log.appendChild(li);
  els.log.scrollTop = els.log.scrollHeight;
}

function setReadout(text, tone) {
  els.readout.textContent = text;
  els.readout.style.color = tone ? `var(--${tone})` : 'var(--muted)';
}

let controller = null;

async function run() {
  const o = readOptions();
  attempts = [];
  els.log.innerHTML = '';
  els.markers.innerHTML = '';
  els.ticks.innerHTML = '';
  controller = new AbortController();

  els.run.disabled = true;
  els.abort.disabled = false;
  setReadout('running…', 'wait');

  const start = performance.now();
  let calls = 0;

  // A simulated flaky request: fails `failUntil` times, then succeeds.
  const fetchData = () => {
    calls += 1;
    const n = calls;
    const elapsed = performance.now() - start;
    const willFail = n <= o.failUntil;
    attempts.push({ n, t: elapsed, state: willFail ? 'fail' : 'ok', fresh: true });
    drawTimeline();
    if (willFail) {
      addLog(n, 'fail', n === 1 ? 'first try' : 'retry');
      return Promise.reject(new Error('Simulated 503'));
    }
    addLog(n, 'ok', `after ${Math.round(elapsed)} ms`);
    return Promise.resolve('OK');
  };

  const onRetry = () => setReadout('waiting for next attempt…', 'wait');

  try {
    await retry(fetchData, {
      times: o.times,
      initialDelayTime: o.initialDelayTime,
      backoffFactor: o.backoffFactor,
      maxDelayTime: o.maxDelayTime,
      jitter: o.jitter,
      signal: controller.signal,
      onRetry,
    });
    setReadout(`resolved in ${calls} attempt${calls > 1 ? 's' : ''}`, 'ok');
  } catch {
    if (controller.signal.aborted) {
      addLog(calls, 'abort', 'signal aborted');
      setReadout('aborted', 'wait');
    } else {
      setReadout(`gave up after ${calls} attempt${calls > 1 ? 's' : ''}`, 'fail');
    }
  } finally {
    els.run.disabled = false;
    els.abort.disabled = true;
    controller = null;
  }
}

els.run.addEventListener('click', run);
els.abort.addEventListener('click', () => controller?.abort());
els.copy.addEventListener('click', async () => {
  await navigator.clipboard?.writeText(els.snippet.textContent);
  els.copy.textContent = 'Copied';
  setTimeout(() => (els.copy.textContent = 'Copy'), 1400);
});

[
  els.times,
  els.initialDelayTime,
  els.backoffFactor,
  els.maxDelayTime,
  els.jitter,
  els.failUntil,
].forEach((el) => el.addEventListener('input', renderSnippet));

renderSnippet();
