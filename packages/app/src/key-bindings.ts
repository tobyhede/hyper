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
 * `'shift'` is the same single press with Shift held and nothing else, for the
 * reverse of a plain binding on the same key, as Shift+Tab is of Tab.
 *
 * `'any'` takes every press, modified or repeated. It is for a key whose command
 * means the same thing however it arrives, such as moving through a
 * presentation by holding an arrow.
 */
export type KeyPress = 'plain' | 'shift' | 'any';

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
    keys: ['Enter'],
    press: 'plain',
    ariaKeyShortcuts: 'Enter',
    description: 'Open the focused Resource',
  },
  showFullView: {
    keys: [' '],
    press: 'plain',
    ariaKeyShortcuts: 'Space',
    description: 'Read the focused Resource in Full View',
  },
  renameResource: {
    keys: ['F2'],
    press: 'plain',
    ariaKeyShortcuts: 'F2',
    description: 'Rename the selected Resource',
  },
  navigateForward: {
    keys: ['Tab'],
    press: 'plain',
    ariaKeyShortcuts: 'Tab',
    description: 'Go to the next Resource along the Active Graph',
  },
  navigateBack: {
    keys: ['Tab'],
    press: 'shift',
    ariaKeyShortcuts: 'Shift+Tab',
    description: 'Go to the previous Resource along the Active Graph',
  },
  navigateLeft: {
    keys: ['ArrowLeft'],
    press: 'plain',
    ariaKeyShortcuts: 'ArrowLeft',
    description: 'Go to the Resource to the left along the Active Graph',
  },
  navigateRight: {
    keys: ['ArrowRight'],
    press: 'plain',
    ariaKeyShortcuts: 'ArrowRight',
    description: 'Go to the Resource to the right along the Active Graph',
  },
  navigateUp: {
    keys: ['ArrowUp'],
    press: 'plain',
    ariaKeyShortcuts: 'ArrowUp',
    description: 'Go to the Resource above along the Active Graph',
  },
  navigateDown: {
    keys: ['ArrowDown'],
    press: 'plain',
    ariaKeyShortcuts: 'ArrowDown',
    description: 'Go to the Resource below along the Active Graph',
  },
  // Performed by React Flow's own node handler, which moves a Shift+arrow four
  // steps at a time; declared here so the binding is listed with the rest.
  nudge: {
    keys: ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'],
    press: 'shift',
    ariaKeyShortcuts: 'Shift+ArrowLeft Shift+ArrowRight Shift+ArrowUp Shift+ArrowDown',
    description: 'Move the selected Resource',
  },
  presentFromHere: {
    keys: ['p'],
    press: 'plain',
    ariaKeyShortcuts: 'P',
    description: 'Present the Active Graph from the selected Resource',
  },
  removeSelection: {
    keys: ['Delete', 'Backspace'],
    press: 'plain',
    ariaKeyShortcuts: 'Delete Backspace',
    description: 'Remove the selected Resource from this Map, or delete the selected Edge',
  },
} as const satisfies Record<string, KeyBinding>;

/**
 * The Full View's own keys. Tab, Shift+Tab and the arrows go along the Active
 * Graph inside it with the canvas's bindings for the same walk.
 */
export const FULL_VIEW_KEYS = {
  leave: {
    keys: [' ', 'Escape'],
    press: 'plain',
    ariaKeyShortcuts: 'Space Escape',
    description: 'Leave Full View',
  },
  openOnCanvas: {
    keys: ['Enter'],
    press: 'plain',
    ariaKeyShortcuts: 'Enter',
    description: 'Leave Full View and Open the Resource on the canvas',
  },
} as const satisfies Record<string, KeyBinding>;

/** The Traversal keys, answered while presenting. */
export const PRESENTING_KEYS = {
  // A presentation clicker sends Page Down and Page Up, so they move through
  // the talk as Right and Left do, once the content they land in has no
  // further to scroll (`presenting-keys.ts`).
  advance: {
    keys: ['ArrowRight', 'PageDown', ' '],
    press: 'any',
    // Space is the focused move's own activation, so the move announces only
    // the keys that are shortcuts of ours.
    ariaKeyShortcuts: 'ArrowRight PageDown',
    description: 'Go to the chosen next Resource',
  },
  retreat: {
    keys: ['ArrowLeft', 'PageUp'],
    press: 'any',
    ariaKeyShortcuts: 'ArrowLeft PageUp',
    description: 'Go back',
  },
  returnToStart: {
    keys: ['Home'],
    press: 'any',
    ariaKeyShortcuts: 'Home',
    description: 'Go back to the start of the Graph',
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
  if (binding.press === 'any') return true;
  const shift = binding.press === 'shift';
  return (
    !event.repeat && !event.ctrlKey && !event.metaKey && !event.altKey && event.shiftKey === shift
  );
}

/** The keys a focused control acts on by itself, with no listener's help. */
const NATIVE_ACTIVATION_KEYS: readonly string[] = [' ', 'Enter'];

/** What counts as a control that will act on Space or Enter. */
const INTERACTIVE = [
  'a[href]',
  'button',
  'input',
  'select',
  'summary',
  'textarea',
  '[contenteditable="true"]',
  '[role="button"]',
  '[role="link"]',
  '[role="menuitem"]',
  '[role="option"]',
].join(',');

/**
 * The surfaces that own every key pressed inside them.
 *
 * Text entry is where a letter is being typed. A menu and a listbox answer
 * letters with typeahead and arrows with their own movement. A dialog is modal:
 * a listener that went on acting behind it would run a command behind a surface
 * the person is looking at, one Escape both dismissing the dialog and leaving
 * presentation.
 *
 * A button is not here. It answers Space and Enter, which
 * {@link keyBelongsElsewhere} leaves to it, and no other key, so a letter
 * pressed after clicking the Dock is still the application's.
 */
const OWNS_ITS_KEYS = [
  'input',
  'textarea',
  'select',
  '[contenteditable="true"]',
  '[role="menu"]',
  '[role="listbox"]',
  '[role="dialog"]',
  '[role="alertdialog"]',
].join(',');

/**
 * Whether the element the press landed on keeps it, so no shortcut answers.
 *
 * The one guard every shortcut listener shares: a surface that owns its keys
 * keeps them all, and a focused control keeps the Space or Enter the browser is
 * already going to activate it with. A `keydown` listener sees that press before
 * the activation; preventing it stops the activation, and not preventing it but
 * acting anyway runs two commands for one press. `closest` rather than a tag
 * test, because the focused control may be a composition — a Button rendering a
 * span, a menu item, an editable region.
 */
export function keyBelongsElsewhere(event: KeyboardEvent): boolean {
  const target = event.target;
  if (!(target instanceof Element)) return false;
  if (target.closest(OWNS_ITS_KEYS) !== null) return true;
  return NATIVE_ACTIVATION_KEYS.includes(event.key) && target.closest(INTERACTIVE) !== null;
}
