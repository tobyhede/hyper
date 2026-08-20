import { describe, expect, it } from 'vitest';
import { captureError } from '../support/capture-error';

describe('captureError', () => {
  it('resolves to undefined when the operation succeeds', async () => {
    const result = await captureError(() => Promise.resolve('ok'));

    expect(result).toBeUndefined();
  });

  it('resolves to the thrown Error when the operation rejects with one', async () => {
    const thrown = new Error('boom');

    const result = await captureError(() => Promise.reject(thrown));

    expect(result).toBe(thrown);
  });

  it('rethrows when the operation rejects with a non-Error value', async () => {
    const reject = (): Promise<never> =>
      // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- deliberately non-Error, to exercise captureError's rethrow-as-is branch
      Promise.reject('not an error');

    await expect(captureError(reject)).rejects.toBe('not an error');
  });
});
