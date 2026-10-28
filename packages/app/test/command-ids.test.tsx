import { describe, expect, it } from 'vitest';
import {
  bindingOf,
  CANVAS_KEYS,
  commandIdsWithKeys,
  PRESENTING_KEYS,
  type KeyBinding,
} from '../src/key-bindings';
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

describe('command ids', () => {
  /** `?` is the sheet's own key, answered by the sheet rather than a command module. */
  it('names each command once, and every command with a key is one of them or `?`', () => {
    const ids = commands.map(({ id }) => id);

    expect(new Set(ids).size).toBe(ids.length);
    expect(commandIdsWithKeys()).toEqual(expect.arrayContaining(ids));
    expect(commandIdsWithKeys().filter((id) => !new Set<string>(ids).has(id))).toEqual([
      'help.showShortcuts',
    ]);
  });

  /** One binding per id; a key may still serve ids in different contexts, as Space does. */
  it('gives each command its own binding', () => {
    const bindings = commands.map(({ id }) => bindingOf(id));

    expect(new Set(bindings).size).toBe(bindings.length);
  });

  /**
   * React Flow performs Shift+arrow's nudge and Escape's unselect, and the
   * canvas walks the Active Graph on the arrows from its own element: bindings
   * listed for the `?` sheet that no command answers yet.
   */
  it('leaves only the keys React Flow and the canvas walk perform without a command', () => {
    const commanded = new Set<KeyBinding>(commands.map(({ id }) => bindingOf(id)));
    const uncommanded = (table: Readonly<Record<string, KeyBinding>>) =>
      Object.entries(table)
        .filter(([, binding]) => !commanded.has(binding))
        .map(([name]) => name);

    expect(uncommanded(CANVAS_KEYS)).toEqual([
      'navigateLeft',
      'navigateRight',
      'navigateUp',
      'navigateDown',
      'nudge',
      'unselectResource',
    ]);
    expect(uncommanded(PRESENTING_KEYS)).toEqual([]);
  });
});
