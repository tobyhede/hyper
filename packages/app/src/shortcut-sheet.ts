import type { KeyboardShortcutSection, KeyShortcut } from '@project/ui';
import { bindingOf, CANVAS_KEYS, FULL_VIEW_KEYS, type KeyBinding } from './key-bindings';

/** How a reader is shown each key `aria-keyshortcuts` names that is not shown as itself. */
const KEY_NAMES: ReadonlyMap<string, string> = new Map([
  ['ArrowLeft', '←'],
  ['ArrowRight', '→'],
  ['ArrowUp', '↑'],
  ['ArrowDown', '↓'],
  ['PageDown', 'PgDn'],
  ['PageUp', 'PgUp'],
  ['Escape', 'Esc'],
]);

/**
 * Presses that hold the same modifiers, shown once with their keys together:
 * Shift and the four arrows, rather than Shift four times.
 */
const withSharedModifiers = (
  presses: readonly (readonly string[])[],
): readonly (readonly string[])[] => {
  const [first, ...rest] = presses;
  if (first === undefined || rest.length === 0 || first.length < 2) return presses;
  const modifiers = first.slice(0, -1);
  const shared = (press: readonly string[]) =>
    press.length === first.length && modifiers.every((key, index) => press[index] === key);
  if (!rest.every(shared)) return presses;
  return [[...modifiers, presses.map((press) => press.at(-1) ?? '').join(' ')]];
};

/** A binding as its control announces it and a reader is shown it. */
export function shortcutOf(binding: KeyBinding): KeyShortcut {
  return {
    aria: binding.ariaKeyShortcuts,
    presses: withSharedModifiers(
      binding.ariaKeyShortcuts
        .split(' ')
        .map((press) => press.split('+').map((key) => KEY_NAMES.get(key) ?? key)),
    ),
  };
}

const sectionOf = (title: string, bindings: readonly KeyBinding[]): KeyboardShortcutSection => ({
  title,
  shortcuts: bindings.map((binding) => ({
    description: binding.description,
    shortcut: shortcutOf(binding),
  })),
});

// A command's key is read by its id, as the dispatcher and the rail read it;
// a key no command answers has only its binding.
const CANVAS_ROWS: readonly KeyBinding[] = [
  bindingOf('canvas.addResource'),
  bindingOf('canvas.openResource'),
  bindingOf('canvas.openAndExpand'),
  bindingOf('canvas.showFullView'),
  bindingOf('canvas.renameResource'),
  CANVAS_KEYS.navigateLeft,
  CANVAS_KEYS.navigateRight,
  CANVAS_KEYS.navigateUp,
  CANVAS_KEYS.navigateDown,
  CANVAS_KEYS.nudge,
  bindingOf('canvas.presentFromHere'),
  CANVAS_KEYS.unselectResource,
  bindingOf('canvas.removeSelection'),
  bindingOf('help.showShortcuts'),
];

const PRESENTING_ROWS: readonly KeyBinding[] = [
  bindingOf('presenting.advance'),
  bindingOf('presenting.retreat'),
  bindingOf('presenting.returnToStart'),
  bindingOf('presenting.previousBranch'),
  bindingOf('presenting.nextBranch'),
  bindingOf('presenting.exitPresenting'),
  bindingOf('presenting.openNotes'),
  bindingOf('presenting.toggleNotes'),
  bindingOf('help.showShortcuts'),
];

/** What the sheet says it lists, in each mode. */
export const SHORTCUT_SHEET_DESCRIPTIONS = {
  authoring: 'The keys the canvas and Full View answer.',
  presenting: 'The keys answered while presenting.',
} as const;

/**
 * The sheet's sections for the mode the reader is in. A command's key is read
 * by its id, so the sheet shows the key the dispatcher answers; the tests hold
 * each section to every binding of its tables, in their order.
 */
export function shortcutSections(
  mode: 'authoring' | 'presenting',
): readonly KeyboardShortcutSection[] {
  return mode === 'presenting'
    ? [sectionOf('While presenting', PRESENTING_ROWS)]
    : [
        sectionOf('On the canvas', CANVAS_ROWS),
        sectionOf('In Full View', Object.values(FULL_VIEW_KEYS)),
      ];
}
