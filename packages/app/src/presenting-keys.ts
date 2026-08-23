import { useEffect } from 'react';

/** The Traversal operations the global Presenting keys perform, all Navigation's own. */
export interface TraversalCommands {
  readonly advance: () => void;
  readonly retreat: () => void;
  readonly selectBranch: (delta: number) => void;
  readonly exitPresenting: () => void;
}

/** The keys a focused control acts on by itself, with no listener's help. */
const NATIVE_ACTIVATION_KEYS: readonly string[] = [' ', 'Enter'];

/** A surface that is over the canvas and owns every key pressed inside it. */
const MODAL = '[role="dialog"],[role="alertdialog"]';

/**
 * Whether a modal surface owns this press.
 *
 * Deference is not only about a control that activates itself. Below the
 * Sidebar's breakpoint the whole command surface is a Base UI Sheet — a modal
 * dialog drawn *over* the canvas — and it can be reopened during a traversal,
 * because the header trigger stays. Its focus trap means every press then
 * originates inside it, and a window listener that went on traversing would run
 * a Traversal command behind a surface the presenter is looking at: one Escape
 * both dismissing the sheet and leaving presentation, Arrow keys moving a Graph
 * nobody can see.
 *
 * The same rule as the one below, spent on a whole surface rather than one
 * control: whatever the press belongs to keeps it.
 */
function insideAModalSurface(event: KeyboardEvent): boolean {
  const target = event.target;
  return target instanceof Element && target.closest(MODAL) !== null;
}

/** What counts as a control that will act on the press. */
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
 * Whether the browser is already going to activate the control this press
 * landed on.
 *
 * A `button` — the chrome's moves, Back and Overview, and the Sidebar's own
 * controls — activates on Space and Enter by itself, and a `keydown` listener on
 * `window` sees that press first. Calling `preventDefault` there is what stopped
 * the activation ever happening; not calling it, but still advancing, ran two
 * commands for one press. Either way the presenter got something they did not
 * ask for from a control they were looking at.
 *
 * So the rule is deference, and it is a rule about **interactive controls**
 * rather than about one button: whatever has focus and activates itself keeps
 * its key. Arrow and Escape are not native activations of anything here, so they
 * stay global and reach a presenter whose focus is anywhere at all.
 *
 * `closest` rather than a tag test, because the focused control may be a
 * composition — a Button rendering a span, a menu item, an editable region —
 * and it is the nearest interactive ancestor that will act on the press.
 */
function activatesFocusedControl(event: KeyboardEvent): boolean {
  if (!NATIVE_ACTIVATION_KEYS.includes(event.key)) return false;
  const target = event.target;
  return target instanceof Element && target.closest(INTERACTIVE) !== null;
}

/**
 * The global Traversal commands, bound while a traversal is on (ADR 0027).
 *
 * Right commits the selected Edge, Left traverses back, Up and Down move the
 * selection among a fork's outgoing Edges without moving the camera — the move a
 * deck framework's per-key redirect cannot express, and the reason there is no
 * framework here. Escape leaves.
 *
 * A hook rather than an effect written out in `App`, because it is the boundary
 * that owns this behaviour: a Ladle story proving that Space activates a chrome
 * control exactly once has to bind the same listener the application binds, and
 * a copy of it in a story fixture would prove the copy (ADR 0052).
 */
export function usePresentingKeys(active: boolean, commands: TraversalCommands): void {
  const { advance, retreat, selectBranch, exitPresenting } = commands;
  useEffect(() => {
    if (!active) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (activatesFocusedControl(event) || insideAModalSurface(event)) return;
      const handler = {
        ArrowRight: advance,
        ' ': advance,
        ArrowLeft: retreat,
        ArrowUp: () => selectBranch(-1),
        ArrowDown: () => selectBranch(1),
        Escape: exitPresenting,
      }[event.key];
      if (!handler) return;
      event.preventDefault();
      handler();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [active, advance, retreat, selectBranch, exitPresenting]);
}
