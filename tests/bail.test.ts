import { describe, expect, it, vi } from 'vitest';
import retry, { AttemptTimeoutError, BailError } from '../src';
import { fail, rejected, settle } from './helpers';

describe('BailError', () => {
  it('stops at once and rejects with its cause, skipping shouldRetry and onRetry', async () => {
    const cause = new Error('give up');
    const fn = vi.fn(() => Promise.reject(new BailError(cause)));
    const shouldRetry = vi.fn(() => true);
    const onRetry = vi.fn();
    const outcome = await settle(retry(fn, { times: 5, forever: true, shouldRetry, onRetry }));
    expect(outcome).toEqual(rejected(cause));
    expect(fn).toHaveBeenCalledTimes(1);
    expect(shouldRetry).not.toHaveBeenCalled();
    expect(onRetry).not.toHaveBeenCalled();
  });

  it('is recognised by name when instanceof fails (another bundle or realm)', async () => {
    const cause = new Error('cross-realm');
    const fn = () => Promise.reject({ name: 'BailError', cause });
    expect(await settle(retry(fn, { times: 3 }))).toEqual(rejected(cause));
  });

  it('is not confused with a nullish rejection', async () => {
    const fn = vi.fn(() => Promise.reject(null));
    expect(await settle(retry(fn))).toEqual(rejected(null));
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('is an Error with a name, a message and the cause', () => {
    const error = new BailError(fail);
    expect(error).toBeInstanceOf(Error);
    expect(error).toMatchObject({
      name: 'BailError',
      message: 'The retry was bailed',
      cause: fail,
    });
  });
});

describe('AttemptTimeoutError', () => {
  it('is an Error with a name and a default or custom message', () => {
    expect(new AttemptTimeoutError()).toBeInstanceOf(Error);
    expect(new AttemptTimeoutError()).toMatchObject({
      name: 'AttemptTimeoutError',
      message: 'The attempt timed out',
    });
    expect(new AttemptTimeoutError('slow').message).toBe('slow');
  });
});
