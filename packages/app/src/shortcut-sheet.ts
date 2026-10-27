import type { KeyboardShortcutSection, KeyShortcut } from '@project/ui';
import {
  CANVAS_KEYS,
  FULL_VIEW_KEYS,
  HELP_KEYS,
  PRESENTING_KEYS,
  type KeyBinding,
} from './key-bindings';

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

const sectionOf = (
  title: string,
  bindings: Readonly<Record<string, KeyBinding>>,
): KeyboardShortcutSection => ({
  title,
  shortcuts: Object.values(bindings).map((binding) => ({
    description: binding.description,
    shortcut: shortcutOf(binding),
  })),
});

/** What the sheet says it lists, in each mode. */
export const SHORTCUT_SHEET_DESCRIPTIONS = {
  authoring: 'The keys the canvas and Full View answer.',
  presenting: 'The keys answered while presenting.',
} as const;

/**
 * The sheet's sections for the mode the reader is in, every one read from the
 * binding table, so the sheet cannot list a key the application does not answer.
 */
export function shortcutSections(
  mode: 'authoring' | 'presenting',
): readonly KeyboardShortcutSection[] {
  return mode === 'presenting'
    ? [sectionOf('While presenting', { ...PRESENTING_KEYS, ...HELP_KEYS })]
    : [
        sectionOf('On the canvas', { ...CANVAS_KEYS, ...HELP_KEYS }),
        sectionOf('In Full View', FULL_VIEW_KEYS),
      ];
}
