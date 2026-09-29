import { expect, it, vi } from 'vitest';
import { createImageReplacementActivity } from '../src/image-replacement-activity';

/** An activity with its operation held open, and every state its observers were told. */
function holding() {
  const activity = createImageReplacementActivity(vi.fn());
  const answer = Promise.withResolvers<string>();
  const observed: boolean[] = [];
  activity.subscribe(() => observed.push(activity.getState()));
  const pending = activity.run(() => answer.promise);
  return { activity, answer, observed, pending };
}

it('holds the activity while its operation runs, and releases it with the answer', async () => {
  const { activity, answer, observed, pending } = holding();
  expect(activity.getState()).toBe(true);

  answer.resolve('answered');

  await expect(pending).resolves.toBe('answered');
  expect(activity.getState()).toBe(false);
  expect(observed).toEqual([true, false]);
});

it('releases the activity when its operation rejects, passing the rejection on', async () => {
  const { activity, answer, observed, pending } = holding();
  const failure = new Error('failed');
  const rejected = expect(pending).rejects.toBe(failure);

  answer.reject(failure);

  await rejected;
  expect(activity.getState()).toBe(false);
  expect(observed).toEqual([true, false]);
});

it('refuses a second operation while one runs, without starting it or releasing the first', async () => {
  const { activity, answer, observed, pending } = holding();
  const second = vi.fn(() => Promise.resolve('second'));

  await expect(activity.run(second)).rejects.toThrow('An image replacement is already pending.');

  expect(second).not.toHaveBeenCalled();
  expect(activity.getState()).toBe(true);
  expect(observed).toEqual([true]);
  answer.resolve('first');
  await expect(pending).resolves.toBe('first');
});
