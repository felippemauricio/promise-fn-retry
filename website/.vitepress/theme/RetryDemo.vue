<script setup lang="ts">
import { reactive, ref, computed } from 'vue';
import retry, { BailError, AttemptTimeoutError } from 'promise-fn-retry';

type Sim = 'flaky' | 'hang' | 'job' | 'ratelimited';
type State = 'pending' | 'fail' | 'ok' | 'bail' | 'timeout' | 'poll';

const props = withDefaults(
  defineProps<{
    /** Which option controls to expose. */
    controls?: string[];
    /** Initial values for option and simulation fields. */
    preset?: Record<string, number | string | boolean>;
    /** How the simulated request behaves. */
    sim?: Sim;
    /** Short caption under the timeline. */
    caption?: string;
  }>(),
  { controls: () => [], sim: 'flaky', caption: '' },
);

// Every field the demo understands; pages reveal a subset via `controls`.
const opts = reactive({
  times: 4,
  initialDelayTime: 200,
  backoffFactor: 2,
  maxDelayTime: 0, // 0 = no cap
  jitter: 'off' as 'off' | 'equal' | 'full',
  forever: false,
  attemptTimeout: 0, // 0 = off
  maxElapsedTime: 0, // 0 = off
  failUntil: 2,
  bailAt: 0, // 0 = never
  pollTarget: 3, // job is done on this attempt
  retryAfter: 150, // ms hint carried by a rate-limit error
  ...props.preset,
});

const FIELDS: Record<
  string,
  {
    label: string;
    hint: string;
    type: 'number' | 'jitter' | 'toggle';
    min?: number;
    max?: number;
    step?: number;
  }
> = {
  times: {
    label: 'times',
    hint: 'retries after the first failure',
    type: 'number',
    min: 0,
    max: 12,
  },
  initialDelayTime: {
    label: 'initialDelayTime',
    hint: 'ms before the first retry',
    type: 'number',
    min: 0,
    max: 3000,
    step: 50,
  },
  backoffFactor: {
    label: 'backoffFactor',
    hint: 'delay multiplier per retry',
    type: 'number',
    min: 1,
    max: 5,
    step: 0.5,
  },
  maxDelayTime: {
    label: 'maxDelayTime',
    hint: 'cap, ms (0 = none)',
    type: 'number',
    min: 0,
    max: 10000,
    step: 100,
  },
  jitter: { label: 'jitter', hint: 'spread each delay', type: 'jitter' },
  forever: { label: 'forever', hint: 'ignore times; until success/abort', type: 'toggle' },
  attemptTimeout: {
    label: 'attemptTimeout',
    hint: 'abort an attempt after, ms (0 = off)',
    type: 'number',
    min: 0,
    max: 5000,
    step: 50,
  },
  maxElapsedTime: {
    label: 'maxElapsedTime',
    hint: 'total budget, ms (0 = off)',
    type: 'number',
    min: 0,
    max: 10000,
    step: 100,
  },
  failUntil: {
    label: 'failUntil',
    hint: 'attempts that fail before success',
    type: 'number',
    min: 0,
    max: 12,
  },
  bailAt: {
    label: 'bailAt',
    hint: 'throw BailError on this attempt (0 = never)',
    type: 'number',
    min: 0,
    max: 12,
  },
  pollTarget: {
    label: 'doneAt',
    hint: 'attempt the job reports done',
    type: 'number',
    min: 1,
    max: 12,
  },
  retryAfter: {
    label: 'retryAfterMs',
    hint: 'server-hinted wait',
    type: 'number',
    min: 0,
    max: 3000,
    step: 50,
  },
};

const shown = computed(() => props.controls.filter((c) => FIELDS[c]));

const attempts = ref<{ n: number; t: number; state: State }[]>([]);
const logs = ref<{ n: number; state: State; detail: string }[]>([]);
const readout = ref({ text: 'idle', tone: 'muted' });
const running = ref(false);
let controller: AbortController | null = null;

const span = computed(() => Math.max(attempts.value.at(-1)?.t ?? 0, 1));
const leftOf = (t: number) => `${4 + (t / span.value) * 92}%`;

const LABELS: Record<State, string> = {
  pending: 'running',
  fail: 'failed',
  ok: 'succeeded',
  bail: 'bailed',
  timeout: 'timed out',
  poll: 'pending',
};

function reset() {
  attempts.value = [];
  logs.value = [];
}

function buildOptions() {
  const o: Record<string, unknown> = {
    times: opts.times,
    initialDelayTime: opts.initialDelayTime,
    backoffFactor: opts.backoffFactor,
    forever: opts.forever,
    jitter: opts.jitter === 'off' ? false : opts.jitter,
    signal: controller!.signal,
    onRetry: (error: unknown) => {
      // A hung attempt only leaves the loop via the timeout; finalise its marker
      // and log line (which were left 'pending' while it ran).
      const next: State = error instanceof AttemptTimeoutError ? 'timeout' : 'fail';
      const lastMarker = attempts.value.at(-1);
      if (lastMarker && lastMarker.state === 'pending') lastMarker.state = next;
      const lastLog = logs.value.at(-1);
      if (lastLog && lastLog.state === 'pending') {
        lastLog.state = next;
        if (next === 'timeout') lastLog.detail = 'attempt timed out';
      }
      readout.value = { text: 'waiting for the next attempt…', tone: 'wait' };
    },
  };
  if (opts.maxDelayTime > 0) o.maxDelayTime = opts.maxDelayTime;
  if (opts.attemptTimeout > 0) o.attemptTimeout = opts.attemptTimeout;
  if (opts.maxElapsedTime > 0) o.maxElapsedTime = opts.maxElapsedTime;
  if (props.sim === 'ratelimited') {
    o.getDelay = (err: { retryAfterMs?: number }, ctx: { computedDelay: number }) =>
      err?.retryAfterMs ?? ctx.computedDelay;
  }
  if (props.sim === 'job') o.until = (r: { status: string }) => r.status === 'done';
  return o;
}

async function run() {
  if (running.value) return;
  reset();
  running.value = true;
  controller = new AbortController();
  readout.value = { text: 'running…', tone: 'wait' };
  const start = performance.now();
  let last = 0;

  const push = (n: number, state: State, detail: string) => {
    attempts.value.push({ n, t: performance.now() - start, state });
    logs.value.push({ n, state, detail });
  };

  const fn = (attempt: number, signal?: AbortSignal) => {
    last = attempt;

    if (opts.bailAt > 0 && attempt === opts.bailAt) {
      push(attempt, 'bail', 'threw BailError');
      return Promise.reject(new BailError(new Error('Simulated 404')));
    }

    if (props.sim === 'hang' && attempt <= opts.failUntil) {
      push(attempt, 'pending', 'hung — waiting for the timeout');
      return new Promise<never>((_, reject) => {
        signal?.addEventListener('abort', () => reject(signal.reason), { once: true });
      });
    }

    if (props.sim === 'job') {
      const done = attempt >= opts.pollTarget;
      push(attempt, done ? 'ok' : 'poll', done ? 'status: done' : 'status: pending');
      return Promise.resolve({ status: done ? 'done' : 'pending' });
    }

    if (props.sim === 'ratelimited' && attempt <= opts.failUntil) {
      push(attempt, 'fail', `HTTP 429 · Retry-After ${opts.retryAfter}ms`);
      return Promise.reject(
        Object.assign(new Error('HTTP 429'), { retryAfterMs: opts.retryAfter }),
      );
    }

    const willFail = attempt <= opts.failUntil;
    push(
      attempt,
      willFail ? 'fail' : 'ok',
      willFail
        ? attempt === 1
          ? 'first try'
          : `attempt #${attempt}`
        : `after ${Math.round(performance.now() - start)} ms`,
    );
    return willFail ? Promise.reject(new Error('Simulated 503')) : Promise.resolve('OK');
  };

  try {
    const value = await retry(fn, buildOptions() as never);
    const tone =
      props.sim === 'job' && (value as { status?: string })?.status !== 'done' ? 'wait' : 'ok';
    readout.value = { text: `resolved in ${last} attempt${last > 1 ? 's' : ''}`, tone };
  } catch (err) {
    if (controller.signal.aborted) {
      logs.value.push({ n: last, state: 'fail', detail: 'aborted' });
      readout.value = { text: 'aborted', tone: 'wait' };
    } else if ((err as Error)?.message === 'Simulated 404') {
      readout.value = { text: `bailed out on attempt ${last}`, tone: 'bail' };
    } else if (opts.maxElapsedTime > 0) {
      readout.value = { text: `gave up — time budget spent (${last} attempts)`, tone: 'fail' };
    } else {
      readout.value = { text: `gave up after ${last} attempt${last > 1 ? 's' : ''}`, tone: 'fail' };
    }
  } finally {
    running.value = false;
    controller = null;
  }
}
</script>

<template>
  <div class="rd">
    <div class="rd-scope">
      <div class="rd-head">
        <span class="rd-title">attempt timeline</span>
        <span class="rd-readout" :style="{ color: `var(--rd-${readout.tone})` }">{{
          readout.text
        }}</span>
      </div>
      <div class="rd-track">
        <div class="rd-baseline" />
        <div
          v-for="(a, i) in attempts"
          :key="i"
          class="rd-marker"
          :class="`is-${a.state}`"
          :style="{ left: leftOf(a.t) }"
          :data-n="`#${a.n}`"
        />
        <span
          v-for="(a, i) in attempts"
          :key="`t${i}`"
          class="rd-tick"
          :style="{ left: leftOf(a.t) }"
          >{{ i === 0 ? '0 ms' : `+${Math.round(a.t)} ms` }}</span
        >
      </div>
      <ul class="rd-legend">
        <li><span class="rd-dot is-fail" /> failed</li>
        <li><span class="rd-dot is-timeout" /> timed out</li>
        <li><span class="rd-dot is-bail" /> bailed</li>
        <li><span class="rd-dot is-poll" /> pending</li>
        <li><span class="rd-dot is-ok" /> succeeded</li>
      </ul>
      <p v-if="caption" class="rd-caption">{{ caption }}</p>
    </div>

    <div class="rd-body">
      <div class="rd-controls">
        <label
          v-for="key in shown"
          :key="key"
          class="rd-field"
          :class="{ 'rd-row': FIELDS[key].type === 'toggle' }"
        >
          <span class="rd-label"
            >{{ FIELDS[key].label }}<small>{{ FIELDS[key].hint }}</small></span
          >
          <select v-if="FIELDS[key].type === 'jitter'" v-model="opts.jitter" class="rd-input">
            <option value="off">off</option>
            <option value="equal">equal</option>
            <option value="full">full</option>
          </select>
          <input
            v-else-if="FIELDS[key].type === 'toggle'"
            type="checkbox"
            class="rd-switch"
            v-model="(opts as any)[key]"
          />
          <input
            v-else
            type="number"
            class="rd-input"
            v-model.number="(opts as any)[key]"
            :min="FIELDS[key].min"
            :max="FIELDS[key].max"
            :step="FIELDS[key].step ?? 1"
          />
        </label>

        <div class="rd-actions">
          <button class="rd-btn rd-primary" :disabled="running" @click="run">Run</button>
          <button class="rd-btn rd-ghost" :disabled="!running" @click="controller?.abort()">
            Abort
          </button>
        </div>
      </div>

      <ol class="rd-log">
        <li v-if="!logs.length" class="rd-empty">Press Run to start.</li>
        <li v-for="(l, i) in logs" :key="i" class="rd-line" :class="l.state">
          <span class="rd-n">#{{ l.n }}</span
          ><span class="rd-state">{{ LABELS[l.state] }}</span
          ><span class="rd-detail">{{ l.detail }}</span>
        </li>
      </ol>
    </div>
  </div>
</template>

<style scoped>
.rd {
  --rd-bg: #0b1220;
  --rd-panel: #131d33;
  --rd-panel2: #0f1830;
  --rd-line: #22304f;
  --rd-ink: #e8eef9;
  --rd-muted: #8595b4;
  --rd-ok: #35e0c8;
  --rd-wait: #f4b83e;
  --rd-fail: #ff6e6e;
  --rd-bail: #b79cff;
  --rd-timeout: #ff9f43;
  --rd-poll: #6ad0ff;
  --rd-mono: var(--vp-font-family-mono, ui-monospace, Menlo, monospace);
  margin: 1.25rem 0;
  border: 1px solid var(--rd-line);
  border-radius: 14px;
  overflow: hidden;
  background: var(--rd-bg);
  color: var(--rd-ink);
}

.rd-scope {
  padding: 1rem 1.1rem 1.2rem;
  background:
    linear-gradient(var(--rd-line) 1px, transparent 1px) 0 0 / 100% 28px,
    var(--rd-panel2);
  background-blend-mode: soft-light, normal;
  border-bottom: 1px solid var(--rd-line);
}

.rd-head {
  display: flex;
  justify-content: space-between;
  font-family: var(--rd-mono);
  font-size: 0.68rem;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}
.rd-title {
  color: var(--rd-muted);
}

.rd-track {
  position: relative;
  height: 86px;
  margin-top: 1.3rem;
}
.rd-baseline {
  position: absolute;
  left: 0;
  right: 0;
  top: 34px;
  height: 2px;
  background: linear-gradient(90deg, var(--rd-line), rgba(34, 48, 79, 0.2));
}
.rd-marker {
  position: absolute;
  top: 35px;
  width: 15px;
  height: 15px;
  border-radius: 50%;
  transform: translate(-50%, -50%);
  border: 2px solid var(--rd-bg);
  background: var(--rd-wait);
  transition: left 0.45s cubic-bezier(0.22, 1, 0.36, 1);
}
.rd-marker::after {
  content: attr(data-n);
  position: absolute;
  top: -1.5rem;
  left: 50%;
  transform: translateX(-50%);
  font-family: var(--rd-mono);
  font-size: 0.66rem;
  color: var(--rd-muted);
}
.rd-marker.is-fail {
  background: var(--rd-fail);
}
.rd-marker.is-bail {
  background: var(--rd-bail);
}
.rd-marker.is-timeout {
  background: var(--rd-timeout);
}
.rd-marker.is-poll {
  background: var(--rd-poll);
}
.rd-marker.is-ok {
  background: var(--rd-ok);
  box-shadow: 0 0 14px rgba(53, 224, 200, 0.5);
}

.rd-tick {
  position: absolute;
  top: 52px;
  transform: translateX(-50%);
  font-family: var(--rd-mono);
  font-size: 0.64rem;
  color: var(--rd-muted);
  white-space: nowrap;
}

.rd-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 0.9rem;
  margin: 0.4rem 0 0;
  padding: 0;
  list-style: none;
  font-family: var(--rd-mono);
  font-size: 0.7rem;
  color: var(--rd-muted);
}
.rd-legend li {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
}
.rd-dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
}
.rd-dot.is-fail {
  background: var(--rd-fail);
}
.rd-dot.is-timeout {
  background: var(--rd-timeout);
}
.rd-dot.is-bail {
  background: var(--rd-bail);
}
.rd-dot.is-poll {
  background: var(--rd-poll);
}
.rd-dot.is-ok {
  background: var(--rd-ok);
}
.rd-caption {
  margin: 0.7rem 0 0;
  font-size: 0.82rem;
  color: var(--rd-muted);
}

.rd-body {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1px;
  background: var(--rd-line);
}
@media (max-width: 640px) {
  .rd-body {
    grid-template-columns: 1fr;
  }
}

.rd-controls {
  padding: 1rem 1.1rem;
  background: var(--rd-panel);
}
.rd-field {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  margin-bottom: 0.85rem;
}
.rd-row {
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
}
.rd-label {
  font-family: var(--rd-mono);
  font-size: 0.82rem;
  color: var(--rd-ink);
}
.rd-label small {
  display: block;
  font-family: var(--vp-font-family-base);
  font-size: 0.72rem;
  color: var(--rd-muted);
}

.rd-input {
  width: 100%;
  padding: 0.5rem 0.6rem;
  border: 1px solid var(--rd-line);
  border-radius: 8px;
  background: var(--rd-panel2);
  color: var(--rd-ink);
  font-family: var(--rd-mono);
  font-size: 0.9rem;
}
.rd-switch {
  appearance: none;
  width: 42px;
  height: 23px;
  border-radius: 999px;
  background: var(--rd-panel2);
  border: 1px solid var(--rd-line);
  position: relative;
  cursor: pointer;
  flex: none;
}
.rd-switch::after {
  content: '';
  position: absolute;
  top: 2px;
  left: 2px;
  width: 17px;
  height: 17px;
  border-radius: 50%;
  background: var(--rd-muted);
  transition: transform 0.2s ease;
}
.rd-switch:checked {
  background: rgba(53, 224, 200, 0.18);
  border-color: var(--rd-ok);
}
.rd-switch:checked::after {
  transform: translateX(19px);
  background: var(--rd-ok);
}

.rd-actions {
  display: flex;
  gap: 0.6rem;
  margin-top: 0.3rem;
}
.rd-btn {
  font-family: var(--rd-mono);
  font-size: 0.85rem;
  padding: 0.5rem 1.1rem;
  border-radius: 8px;
  border: 1px solid transparent;
  cursor: pointer;
}
.rd-primary {
  background: var(--rd-ok);
  color: #062019;
  font-weight: 700;
}
.rd-ghost {
  background: transparent;
  border-color: var(--rd-line);
  color: var(--rd-ink);
}
.rd-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.rd-log {
  margin: 0;
  padding: 1rem 1.1rem;
  list-style: none;
  font-family: var(--rd-mono);
  font-size: 0.8rem;
  background: var(--rd-panel);
  max-height: 260px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}
.rd-empty {
  color: var(--rd-muted);
}
.rd-line {
  display: grid;
  grid-template-columns: 2.2rem 5.5rem auto;
  gap: 0.5rem;
  align-items: baseline;
  padding: 0.3rem 0.45rem;
  border-left: 2px solid var(--rd-line);
  background: var(--rd-panel2);
  border-radius: 0 6px 6px 0;
}
.rd-line.fail {
  border-left-color: var(--rd-fail);
}
.rd-line.ok {
  border-left-color: var(--rd-ok);
}
.rd-line.bail {
  border-left-color: var(--rd-bail);
}
.rd-line.timeout {
  border-left-color: var(--rd-timeout);
}
.rd-line.poll {
  border-left-color: var(--rd-poll);
}
.rd-line.pending {
  border-left-color: var(--rd-wait);
}
.rd-n {
  color: var(--rd-muted);
}
.rd-detail {
  color: var(--rd-muted);
}
</style>
