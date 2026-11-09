import type { Options, ResolvedOptions } from '../types';
import { now } from './clock';

const defaultOptions: Omit<ResolvedOptions, 'retained' | 'currentDelay' | 'startedAt' | 'signal'> =
  {
    times: 1,
    initialDelayTime: 100,
    backoffFactor: 2,
    maxDelayTime: Infinity,
    jitter: false,
    forever: false,
    attemptTimeout: Infinity,
    maxElapsedTime: Infinity,
    getDelay: null,
    until: null,
    onRetry: null,
    shouldRetry: null,
  };

/**
 * Merges caller options with the defaults, resolves aliases, and seeds the loop
 * state. An option set to `undefined` counts as omitted, so it keeps its default.
 */
export const resolveOptions = (options: Options): ResolvedOptions => {
  const { retries, factor, minTimeout, maxTimeout, randomize, ...core } = options;
  // Object.assign, not spread: spread compiles to an ES2017 helper.
  const resolved: ResolvedOptions = Object.assign({}, defaultOptions, {
    retained: 0,
    currentDelay: null,
    startedAt: now(),
  });
  for (const key of Object.keys(core) as (keyof typeof core)[]) {
    if (core[key] !== undefined) (resolved as Record<string, unknown>)[key] = core[key];
  }
  // Aliases only fill a canonical option that was left unset; the canonical wins.
  if (core.times === undefined && retries !== undefined) resolved.times = retries;
  if (core.backoffFactor === undefined && factor !== undefined) resolved.backoffFactor = factor;
  if (core.initialDelayTime === undefined && minTimeout !== undefined)
    resolved.initialDelayTime = minTimeout;
  if (core.maxDelayTime === undefined && maxTimeout !== undefined)
    resolved.maxDelayTime = maxTimeout;
  if (core.jitter === undefined && randomize !== undefined)
    resolved.jitter = randomize ? 'full' : false;
  return resolved;
};
