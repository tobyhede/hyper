import { describe, expect, it, vi } from 'vitest';
import { createKeyDispatcher, type AnswersIn, type CoveringContext } from '../src/key-dispatcher';

const press = (key: string): KeyboardEvent =>
  new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });

describe('the key dispatcher', () => {
  it('prevents the default of a press only when an answer takes it', () => {
    const target = new EventTarget();
    const dispatcher = createKeyDispatcher(target);
    let takes = false;
    const answer = vi.fn(() => takes);
    dispatcher.register(() => [{ id: 'canvas.presentFromHere', answer }], 'canvas');

    const declined = press('p');
    target.dispatchEvent(declined);
    takes = true;
    const taken = press('p');
    target.dispatchEvent(taken);
    target.dispatchEvent(press('q'));

    expect(declined.defaultPrevented).toBe(false);
    expect(taken.defaultPrevented).toBe(true);
    expect(answer).toHaveBeenCalledTimes(2);
  });

  it('offers a press to the registrations in order and stops at the first that takes it', () => {
    const target = new EventTarget();
    const dispatcher = createKeyDispatcher(target);
    const first = vi.fn(() => true);
    const second = vi.fn(() => true);
    dispatcher.register(() => [{ id: 'canvas.presentFromHere', answer: first }], 'canvas');
    dispatcher.register(() => [{ id: 'canvas.presentFromHere', answer: second }], 'canvas');

    target.dispatchEvent(press('p'));

    expect(first).toHaveBeenCalledOnce();
    expect(second).not.toHaveBeenCalled();
  });

  it('listens in a phase only while something is registered in it', () => {
    const target = new EventTarget();
    const add = vi.spyOn(target, 'addEventListener');
    const remove = vi.spyOn(target, 'removeEventListener');
    const dispatcher = createKeyDispatcher(target);

    const unregisterBubble = dispatcher.register(() => [], 'canvas');
    const unregisterAgain = dispatcher.register(() => [], 'canvas');
    const unregisterCapture = dispatcher.register(
      () => [{ id: 'help.showShortcuts', answer: () => true }],
      'on-screen',
      'capture',
    );
    expect(add.mock.calls.map(([, , capture]) => capture)).toEqual([false, true]);

    unregisterBubble();
    expect(remove).not.toHaveBeenCalled();
    unregisterAgain();
    unregisterCapture();
    expect(remove.mock.calls.map(([, , capture]) => capture)).toEqual([false, true]);
  });

  /**
   * Where a registration is answered is the dispatcher's to decide, before any
   * answer runs: a command needs no check of its own for a Space off screen,
   * presenting or under Full View.
   */
  it.each<[CoveringContext | null, readonly AnswersIn[]]>([
    [null, ['canvas', 'on-screen']],
    ['full-view', ['on-screen']],
    ['presenting', ['presenting', 'on-screen']],
    ['off-screen', []],
  ])('answers, while covered by %s, only the registrations in %j', (covering, answering) => {
    const target = new EventTarget();
    const dispatcher = createKeyDispatcher(target);
    const answered: AnswersIn[] = [];
    for (const answersIn of ['canvas', 'presenting', 'on-screen'] as const)
      dispatcher.register(
        () => [
          {
            id: 'help.showShortcuts',
            answer: () => {
              answered.push(answersIn);
              return false;
            },
          },
        ],
        answersIn,
      );
    if (covering !== null) dispatcher.cover(covering);

    target.dispatchEvent(press('?'));

    expect(answered).toEqual(answering);
  });

  it('takes the most covering context, and returns to the canvas when the last cover lifts', () => {
    const target = new EventTarget();
    const dispatcher = createKeyDispatcher(target);
    const answer = vi.fn(() => true);
    dispatcher.register(() => [{ id: 'canvas.addResource', answer }], 'canvas');

    const uncoverFullView = dispatcher.cover('full-view');
    const uncoverPresenting = dispatcher.cover('presenting');
    const uncoverAgain = dispatcher.cover('presenting');
    uncoverPresenting();
    uncoverPresenting();
    target.dispatchEvent(press('c'));
    uncoverAgain();
    target.dispatchEvent(press('c'));
    expect(answer).not.toHaveBeenCalled();

    uncoverFullView();
    target.dispatchEvent(press('c'));
    expect(answer).toHaveBeenCalledOnce();
  });
});
