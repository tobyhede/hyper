import { describe, expect, it, vi } from 'vitest';
import { CANVAS_KEYS, HELP_KEYS } from '../src/key-bindings';
import { createKeyDispatcher } from '../src/key-dispatcher';

const press = (key: string): KeyboardEvent =>
  new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });

describe('the key dispatcher', () => {
  it('prevents the default of a press only when an answer takes it', () => {
    const target = new EventTarget();
    const dispatcher = createKeyDispatcher(target);
    let takes = false;
    const answer = vi.fn(() => takes);
    dispatcher.register(() => [{ binding: CANVAS_KEYS.presentFromHere, answer }]);

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
    dispatcher.register(() => [{ binding: CANVAS_KEYS.presentFromHere, answer: first }]);
    dispatcher.register(() => [{ binding: CANVAS_KEYS.presentFromHere, answer: second }]);

    target.dispatchEvent(press('p'));

    expect(first).toHaveBeenCalledOnce();
    expect(second).not.toHaveBeenCalled();
  });

  it('listens in a phase only while something is registered in it', () => {
    const target = new EventTarget();
    const add = vi.spyOn(target, 'addEventListener');
    const remove = vi.spyOn(target, 'removeEventListener');
    const dispatcher = createKeyDispatcher(target);

    const unregisterBubble = dispatcher.register(() => []);
    const unregisterAgain = dispatcher.register(() => []);
    const unregisterCapture = dispatcher.register(
      () => [{ binding: HELP_KEYS.showShortcuts, answer: () => true }],
      'capture',
    );
    expect(add.mock.calls.map(([, , capture]) => capture)).toEqual([false, true]);

    unregisterBubble();
    expect(remove).not.toHaveBeenCalled();
    unregisterAgain();
    unregisterCapture();
    expect(remove.mock.calls.map(([, , capture]) => capture)).toEqual([false, true]);
  });
});
