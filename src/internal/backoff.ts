import type { Jitter, ResolvedOptions } from '../types';
import { now } from './clock';

/** The wait before the next retry, and the base delay that advances the backoff curve. */
export interface WaitPlan {
  base: number;
  wait: number;
}

/** Base (uncapped) delay for the upcoming retry. */
export const nextDelay = ({
  currentDelay,
  initialDelayTime,
  backoffFactor,
}: ResolvedOptions): number =>
  currentDelay === null ? initialDelayTime : currentDelay * backoffFactor;

/** Applies the cap and, when enabled, the chosen jitter strategy on top of the base delay. */
export const computeWaitTime = (
  baseDelay: number,
  maxDelayTime: number,
  jitter: Jitter,
): number => {
  const capped = Math.min(baseDelay, maxDelayTime);
  if (jitter === 'full') return Math.random() * capped;
  if (jitter === true || jitter === 'equal') return capped / 2 + Math.random() * (capped / 2);
  return capped;
};

/**
 * Plans the wait before the next retry: the backoff (with cap and jitter), an
 * optional `getDelay` override, and the `maxElapsedTime` budget. Returns `null`
 * once the budget is spent, which stops retrying.
 */
export const planWait = (resolved: ResolvedOptions, error: unknown): WaitPlan | null => {
  const base = nextDelay(resolved);
  let wait = computeWaitTime(base, resolved.maxDelayTime, resolved.jitter);

  if (resolved.getDelay) {
    const override = resolved.getDelay(error, {
      attempt: resolved.retained + 1,
      computedDelay: wait,
    });
    if (typeof override === 'number' && override >= 0) wait = override;
  }

  if (resolved.maxElapsedTime !== Infinity) {
    const remaining = resolved.maxElapsedTime - (now() - resolved.startedAt);
    if (remaining <= 0) return null;
    if (wait > remaining) wait = remaining;
  }

  return { base, wait };
};
