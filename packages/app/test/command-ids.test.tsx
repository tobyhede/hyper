import { describe, expect, it } from 'vitest';
import { CANVAS_KEYS, PRESENTING_KEYS, type KeyBinding } from '../src/key-bindings';
import {
  ADD_RESOURCE,
  OPEN_AND_EXPAND,
  OPEN_RESOURCE,
  presentFromHereCommand,
  REMOVE_SELECTION,
  RENAME_RESOURCE,
  showFullViewCommand,
} from '../src/canvas-commands';
import { presentingCommands } from '../src/presenting-commands';

const nothing = () => undefined;

/** Every command the keys answer, as a press finds them. */
const commands = [
  presentFromHereCommand({ presentFrom: undefined, mayPresent: false }),
  REMOVE_SELECTION,
  ADD_RESOURCE,
  RENAME_RESOURCE,
  OPEN_RESOURCE,
  OPEN_AND_EXPAND,
  showFullViewCommand({ show: undefined, selectNodes: false }),
  ...presentingCommands({
    advance: nothing,
    retreat: nothing,
    returnToStart: nothing,
    selectBranch: nothing,
    exitPresenting: nothing,
    openNotes: nothing,
    toggleNotes: nothing,
  }),
];

/** A binding by its command id: the context, then the binding's name in it (ADR 0138). */
const bindingNamed = (id: string): KeyBinding | undefined => {
  const [context, name = ''] = id.split('.');
  const bindings: Readonly<Record<string, KeyBinding>> =
    context === 'canvas' ? CANVAS_KEYS : context === 'presenting' ? PRESENTING_KEYS : {};
  return bindings[name];
};

describe('command ids', () => {
  it('names each command once, by the one binding it answers', () => {
    const ids = commands.map(({ id }) => id);

    expect(new Set(ids).size).toBe(ids.length);
    for (const { id, binding } of commands) expect(bindingNamed(id)).toBe(binding);
  });

  /**
   * React Flow performs Shift+arrow's nudge and Escape's unselect, and the
   * canvas walks the Active Graph on the arrows from its own element: bindings
   * listed for the `?` sheet that no command answers yet.
   */
  it('leaves only the keys React Flow and the canvas walk perform without a command', () => {
    const commanded = new Set<string>(commands.map(({ id }) => id));

    expect(Object.keys(CANVAS_KEYS).filter((name) => !commanded.has(`canvas.${name}`))).toEqual([
      'navigateLeft',
      'navigateRight',
      'navigateUp',
      'navigateDown',
      'nudge',
      'unselectResource',
    ]);
    expect(
      Object.keys(PRESENTING_KEYS).filter((name) => !commanded.has(`presenting.${name}`)),
    ).toEqual([]);
  });
});
