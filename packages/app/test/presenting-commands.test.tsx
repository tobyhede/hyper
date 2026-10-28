import { describe, expect, it, vi } from 'vitest';
import { PRESENTING_KEYS } from '../src/key-bindings';
import { ABSENT, AVAILABLE } from '../src/canvas-commands';
import { presentingCommands, presentingKeyAnswer } from '../src/presenting-commands';

const traversal = () => ({
  advance: vi.fn(),
  retreat: vi.fn(),
  returnToStart: vi.fn(),
  selectBranch: vi.fn(),
  exitPresenting: vi.fn(),
  openNotes: vi.fn(),
  toggleNotes: vi.fn(),
});

/** A press whose target is `target`, as the window sees it. */
const pressOn = (target: Element, key: string): KeyboardEvent => {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  Object.defineProperty(event, 'target', { value: target });
  return event;
};

/** An element that still scrolls down, with the heights jsdom does not lay out. */
function scrollsDown(): HTMLDivElement {
  const element = document.createElement('div');
  element.style.overflowY = 'auto';
  Object.defineProperty(element, 'scrollHeight', { value: 400 });
  Object.defineProperty(element, 'clientHeight', { value: 100 });
  return element;
}

describe('the Presenting commands', () => {
  it('names each by its binding under the presenting context', () => {
    const commands = presentingCommands(traversal());

    expect(commands.map(({ id }) => id)).toEqual(
      Object.keys(PRESENTING_KEYS).map((name) => `presenting.${name}`),
    );
    expect(commands.map(({ binding }) => binding)).toEqual(Object.values(PRESENTING_KEYS));
  });

  it('runs each Traversal operation, a branch move by its direction', () => {
    const operations = traversal();
    for (const command of presentingCommands(operations)) command.run();

    expect(operations.advance).toHaveBeenCalledOnce();
    expect(operations.retreat).toHaveBeenCalledOnce();
    expect(operations.returnToStart).toHaveBeenCalledOnce();
    expect(operations.selectBranch.mock.calls).toEqual([[-1], [1]]);
    expect(operations.exitPresenting).toHaveBeenCalledOnce();
    expect(operations.openNotes).toHaveBeenCalledOnce();
    expect(operations.toggleNotes).toHaveBeenCalledOnce();
  });

  /** The scroll rule is the moves' availability for the press, not a guard of the listener. */
  it('withholds advance for a Page Down the content it lands in still scrolls, and not for Right', () => {
    const [advance] = presentingCommands(traversal());
    const content = scrollsDown();

    expect(advance?.availability(pressOn(content, 'PageDown'))).toEqual(ABSENT);
    expect(advance?.availability(pressOn(content, 'ArrowRight'))).toEqual(AVAILABLE);
    expect(advance?.availability(pressOn(document.body, 'PageDown'))).toEqual(AVAILABLE);
  });

  it('answers a key only past the shared guard and while available, and says so', () => {
    const operations = traversal();
    const [advance] = presentingCommands(operations);
    if (advance === undefined) throw new Error('advance is the first Presenting command');
    const answer = presentingKeyAnswer(advance);
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');

    expect(answer.answer(pressOn(dialog, 'ArrowRight'))).toBe(false);
    expect(answer.answer(pressOn(scrollsDown(), 'PageDown'))).toBe(false);
    expect(operations.advance).not.toHaveBeenCalled();
    expect(answer.answer(pressOn(document.body, 'ArrowRight'))).toBe(true);
    expect(operations.advance).toHaveBeenCalledOnce();
  });
});
