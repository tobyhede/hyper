/**
 * Every keyboard shortcut the application answers, declared once.
 *
 * A binding is the key, the press it accepts, what `aria-keyshortcuts` announces
 * for it and the sentence a reader is shown. The handlers match presses against
 * these entries and the controls that perform a command announce its entry, so a
 * key cannot be answered under one name and advertised under another.
 *
 * The Open Markdown Resource's Save and Cancel stay with the editor in
 * `@project/ui` (`MarkdownResourceBody`), which this package's bindings cannot
 * reach into: `ui` depends on `core` alone.
 */

/**
 * Which presses a binding accepts.
 *
 * `'plain'` is one unmodified press: Ctrl, Meta, Alt and Shift make the key a
 * browser or system shortcut, and a held key repeating is still one press. Shift
 * is excluded although a letter is matched in either case, because Caps Lock
 * changes the character and never sets `shiftKey`, so the flag is the only way
 * to tell an announced `C` from Shift+C.
 *
 * `'any'` also takes a repeated or shifted press. It is for a key whose command
 * means the same thing however it arrives, such as moving through a
 * presentation by holding an arrow. Ctrl, Meta and Alt still leave it alone:
 * with them the key is the browser's or the system's — Alt+Left is Back, and
 * Ctrl+Arrow and Cmd+Arrow move by word or line.
 */
export type KeyPress = 'plain' | 'any';

export interface KeyBinding {
  /** The `KeyboardEvent.key` values that press it. A letter matches either case. */
  readonly keys: readonly string[];
  readonly press: KeyPress;
  /** The `aria-keyshortcuts` value of the control performing it. */
  readonly ariaKeyShortcuts: string;
  /** What it does, as a sentence a reader is shown. */
  readonly description: string;
}

/** The canvas's authoring keys, answered while the canvas may be authored. */
export const CANVAS_KEYS = {
  addResource: {
    keys: ['c'],
    press: 'plain',
    ariaKeyShortcuts: 'C',
    description: 'Add a Resource',
  },
  openResource: {
    keys: ['Enter', ' '],
    press: 'plain',
    ariaKeyShortcuts: 'Enter Space',
    description: 'Open the focused Resource',
  },
  renameResource: {
    keys: ['F2'],
    press: 'plain',
    ariaKeyShortcuts: 'F2',
    description: 'Rename the selected Resource',
  },
  removeSelection: {
    keys: ['Delete', 'Backspace'],
    press: 'plain',
    ariaKeyShortcuts: 'Delete Backspace',
    description: 'Remove the selected Resource from this Map, or delete the selected Edge',
  },
} as const satisfies Record<string, KeyBinding>;

/** The Traversal keys, answered while presenting. */
export const PRESENTING_KEYS = {
  advance: {
    keys: ['ArrowRight', ' '],
    press: 'any',
    // Space is the focused move's own activation, so the move announces only
    // the key that is a shortcut of ours.
    ariaKeyShortcuts: 'ArrowRight',
    description: 'Go to the chosen next Resource',
  },
  retreat: {
    keys: ['ArrowLeft'],
    press: 'any',
    ariaKeyShortcuts: 'ArrowLeft',
    description: 'Go back',
  },
  previousBranch: {
    keys: ['ArrowUp'],
    press: 'any',
    ariaKeyShortcuts: 'ArrowUp',
    description: 'Choose the previous way on',
  },
  nextBranch: {
    keys: ['ArrowDown'],
    press: 'any',
    ariaKeyShortcuts: 'ArrowDown',
    description: 'Choose the next way on',
  },
  exitPresenting: {
    keys: ['Escape'],
    press: 'any',
    ariaKeyShortcuts: 'Escape',
    description: 'Stop presenting',
  },
  openNotes: {
    keys: ['s'],
    press: 'plain',
    ariaKeyShortcuts: 'S',
    description: 'Open the Notes window',
  },
  toggleNotes: {
    keys: ['n'],
    press: 'plain',
    ariaKeyShortcuts: 'N',
    description: 'Show or hide the notes under the Stage',
  },
} as const satisfies Record<string, KeyBinding>;

function sameKey(bound: string, pressed: string): boolean {
  return bound.length === 1 ? bound.toLowerCase() === pressed.toLowerCase() : bound === pressed;
}

/** Whether this press is one the binding answers. */
export function pressesBinding(binding: KeyBinding, event: KeyboardEvent): boolean {
  if (!binding.keys.some((key) => sameKey(key, event.key))) return false;
  if (event.ctrlKey || event.metaKey || event.altKey) return false;
  return binding.press === 'any' || (!event.repeat && !event.shiftKey);
}

/** The keys a focused control acts on by itself, with no listener's help. */
const NATIVE_ACTIVATION_KEYS: readonly string[] = [' ', 'Enter'];

/** An element whose text is edited in place. `contenteditable=""` is `true`. */
const EDITABLE = '[contenteditable]:not([contenteditable="false"])';

/**
 * An input that owns its keys: every type but the ones that are pressed as a
 * button is. A browser treats an empty or unrecognised `type` as text, so the
 * types are named by exclusion rather than inclusion. A checkbox, radio, button
 * or file input answers only the Space or Enter {@link keyBelongsElsewhere}
 * already leaves to it, and a range only that and its {@link MOVES_ON_KEYS}, so
 * a letter pressed while one has focus is still the application's.
 */
const OWN_KEYS_INPUT = `input:not(${[
  'button',
  'checkbox',
  'color',
  'file',
  'hidden',
  'radio',
  'range',
  'reset',
  'submit',
]
  .map((type) => `[type="${type}" i]`)
  .join(',')})`;

/** The keys a slider or spin button moves its own value with. */
const VALUE_KEYS: readonly string[] = [
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
  'Home',
  'End',
  'PageUp',
  'PageDown',
];

/** A control that moves its value on {@link VALUE_KEYS} and owns no letter. */
const MOVES_ON_KEYS = 'input[type="range" i], [role="slider"], [role="spinbutton"]';

/** What counts as a control that will act on Space or Enter. */
const INTERACTIVE = [
  'a[href]',
  'button',
  'input',
  'select',
  'summary',
  'textarea',
  EDITABLE,
  '[role="button"]',
  '[role="link"]',
  '[role="menuitem"]',
  '[role="option"]',
].join(',');

/**
 * The surfaces that own every key pressed inside them.
 *
 * Text entry is where a letter is being typed. A menu, a listbox and a
 * combobox — a Select trigger is one — answer letters with typeahead and arrows
 * with their own movement. A dialog is modal: a listener that went on acting behind it would run
 * a command behind a surface the person is looking at, one Escape both
 * dismissing the dialog and leaving presentation.
 *
 * A button is not here, nor a checkbox or a slider. A button answers Space and
 * Enter and a slider its value keys, which {@link keyBelongsElsewhere} leaves
 * to them, so a letter pressed after clicking the Dock or the zoom slider is
 * still the application's.
 *
 * Nor is `.nokey`, although React Flow's own key subscriptions read it. The
 * whole Command Dock and the presenting chrome carry it, so honouring it here
 * would stop `C` after a click on the Dock and the arrows from a focused move.
 * The portalled surfaces that carry it are covered by what they are: a popover
 * is a dialog, a swatch panel is in a menu, and a combobox keeps focus in its
 * text field.
 */
export const OWNS_ITS_KEYS = [
  OWN_KEYS_INPUT,
  'textarea',
  'select',
  EDITABLE,
  '[role="menu"]',
  '[role="listbox"]',
  '[role="combobox"]',
  '[role="dialog"]',
  '[role="alertdialog"]',
].join(',');

/**
 * Whether the element the press landed on keeps it, so no shortcut answers.
 *
 * The one guard every shortcut listener shares: a surface that owns its keys
 * keeps them all, a focused control keeps the Space or Enter the browser is
 * already going to activate it with, and a focused slider keeps the keys that
 * move it. A `keydown` listener sees that press before
 * the activation; preventing it stops the activation, and not preventing it but
 * acting anyway runs two commands for one press. `closest` rather than a tag
 * test, because the focused control may be a composition — a Button rendering a
 * span, a menu item, an editable region.
 */
export function keyBelongsElsewhere(event: KeyboardEvent): boolean {
  const target = event.target;
  if (!(target instanceof Element)) return false;
  if (target.closest(OWNS_ITS_KEYS) !== null) return true;
  if (VALUE_KEYS.includes(event.key) && target.closest(MOVES_ON_KEYS) !== null) return true;
  return NATIVE_ACTIVATION_KEYS.includes(event.key) && target.closest(INTERACTIVE) !== null;
}
