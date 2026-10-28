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
 * `'shift'` is the same single press with Shift held and nothing else, for a
 * second command on a plain binding's key, as Shift and an arrow moves the
 * Resource the plain arrow walks from.
 *
 * `'any'` also takes a repeated or shifted press. It is for a key whose command
 * means the same thing however it arrives, such as moving through a
 * presentation by holding an arrow. Ctrl, Meta and Alt still leave it alone:
 * with them the key is the browser's or the system's — Alt+Left is Back, and
 * Ctrl+Arrow and Cmd+Arrow move by word or line.
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
  openAndExpand: {
    keys: ['Enter'],
    press: 'shift',
    ariaKeyShortcuts: 'Shift+Enter',
    description: 'Open the focused Resource and expand it to fit its content',
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
  // Performed by React Flow's own node handler, which unselects a focused,
  // selected Resource on Escape; declared here so the binding is listed with
  // the rest, as the way the arrow keys stop going along the Active Graph.
  unselectResource: {
    keys: ['Escape'],
    press: 'plain',
    ariaKeyShortcuts: 'Escape',
    description:
      'Unselect the focused Resource, so the arrow keys stop going along the Active Graph',
  },
  removeSelection: {
    keys: ['Delete', 'Backspace'],
    press: 'plain',
    ariaKeyShortcuts: 'Delete Backspace',
    description: 'Remove the selected Resource from this Map, or delete the selected Edge',
  },
} as const satisfies Record<string, KeyBinding>;

/**
 * The Full View's own keys. The arrows go along the Active Graph inside it
 * with the canvas's bindings for the same walk; Tab stays the browser's.
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
  // further to scroll (`presenting-commands.ts`).
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
    description: 'Go back to where the presentation began',
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

/**
 * The keys answered everywhere the application takes keys, authoring and
 * presenting alike. `?` is Shift+/ on many layouts and a key of its own on
 * others, so it takes any press.
 */
export const HELP_KEYS = {
  showShortcuts: {
    keys: ['?'],
    press: 'any',
    ariaKeyShortcuts: '?',
    description: 'Show the keyboard shortcuts',
  },
} as const satisfies Record<string, KeyBinding>;

/**
 * Every command a key performs, by its id, and the keys that perform it until a
 * reader's overrides exist (ADR 0138). The ids are written out rather than read
 * from the tables' property names, so a table can be renamed or reorganised
 * without renaming a command or orphaning a reader's override of it. A binding
 * absent here is one no command performs: React Flow's nudge and unselect, and
 * the arrow walks the canvas and Full View answer on their own elements.
 */
const DEFAULT_KEYMAP = {
  'canvas.addResource': CANVAS_KEYS.addResource,
  'canvas.openResource': CANVAS_KEYS.openResource,
  'canvas.openAndExpand': CANVAS_KEYS.openAndExpand,
  'canvas.showFullView': CANVAS_KEYS.showFullView,
  'canvas.renameResource': CANVAS_KEYS.renameResource,
  'canvas.presentFromHere': CANVAS_KEYS.presentFromHere,
  'canvas.removeSelection': CANVAS_KEYS.removeSelection,
  'presenting.advance': PRESENTING_KEYS.advance,
  'presenting.retreat': PRESENTING_KEYS.retreat,
  'presenting.returnToStart': PRESENTING_KEYS.returnToStart,
  'presenting.previousBranch': PRESENTING_KEYS.previousBranch,
  'presenting.nextBranch': PRESENTING_KEYS.nextBranch,
  'presenting.exitPresenting': PRESENTING_KEYS.exitPresenting,
  'presenting.openNotes': PRESENTING_KEYS.openNotes,
  'presenting.toggleNotes': PRESENTING_KEYS.toggleNotes,
  'help.showShortcuts': HELP_KEYS.showShortcuts,
} satisfies Readonly<Record<string, KeyBinding>>;

/** The stable name of a command a key performs (ADR 0138). */
export type CommandId = keyof typeof DEFAULT_KEYMAP;

/** Every command id with a key, in the order the keymap lists them. */
export const commandIdsWithKeys = (): readonly string[] => Object.keys(DEFAULT_KEYMAP);

/**
 * The keys that perform `id`. Everything that matches, announces or lists a
 * command's key reads it here, so a remap changes them all at once.
 */
export const bindingOf = (id: CommandId): KeyBinding => DEFAULT_KEYMAP[id];

function sameKey(bound: string, pressed: string): boolean {
  return bound.length === 1 ? bound.toLowerCase() === pressed.toLowerCase() : bound === pressed;
}

/** Whether this press is one the binding answers. */
export function pressesBinding(binding: KeyBinding, event: KeyboardEvent): boolean {
  if (!binding.keys.some((key) => sameKey(key, event.key))) return false;
  // AltGr types a character, as Shift does, and a browser reports it as Ctrl
  // and Alt held together: `?` is AltGr and a key on some layouts.
  const altGraph = event.getModifierState('AltGraph');
  if (event.metaKey || (!altGraph && (event.ctrlKey || event.altKey))) return false;
  if (binding.press === 'any') return true;
  return !event.repeat && event.shiftKey === (binding.press === 'shift');
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
