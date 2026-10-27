import { useEffect } from 'react';
import {
  keyBelongsElsewhere,
  pressesBinding,
  PRESENTING_KEYS,
  type KeyBinding,
} from './key-bindings';

/** The Traversal operations the global Presenting keys perform, all Navigation's own. */
export interface TraversalCommands {
  readonly advance: () => void;
  readonly retreat: () => void;
  /** Present the Graph again from its start Resource, with nothing to go back to. */
  readonly returnToStart: () => void;
  readonly selectBranch: (delta: number) => void;
  readonly exitPresenting: () => void;
  /** Open a Notes window following this presentation (ADR 0129). */
  readonly openNotes: () => void;
  /** Show or hide the notes under the Stage, for rehearsing on one screen (ADR 0129). */
  readonly toggleNotes: () => void;
}

/**
 * Whether Page Down or Page Up pressed here would still scroll the content the
 * press landed in, which it then keeps: a presenter reading a long Resource
 * pages through it first, and a clicker, whose focus is on the chrome after a
 * move, goes straight on. The nearest scrolling ancestor of the press decides,
 * so a Resource that fits, or one already paged to its end, lets the press move
 * through the talk.
 */
function pageScrollsContent(event: KeyboardEvent): boolean {
  const down = event.key === 'PageDown';
  if (!down && event.key !== 'PageUp') return false;
  for (
    let element = event.target instanceof Element ? event.target : null;
    element !== null;
    element = element.parentElement
  ) {
    const { overflowY } = getComputedStyle(element);
    if (overflowY !== 'auto' && overflowY !== 'scroll') continue;
    if (element.scrollHeight <= element.clientHeight) continue;
    return down
      ? element.scrollTop + element.clientHeight < element.scrollHeight - 1
      : element.scrollTop > 0;
  }
  return false;
}

/**
 * The global Traversal commands, bound while a traversal is on.
 *
 * Right and Page Down commit the selected Edge, Left and Page Up traverse
 * back, Home starts the Graph again, Up and Down move the
 * selection among a fork's outgoing Edges without traversing — the move a
 * deck framework's per-key redirect cannot express, and the reason there is no
 * framework here. Escape leaves.
 *
 * A hook rather than an effect written out in `App`, because it is the boundary
 * that owns this behaviour: a Ladle story proving that Space activates a chrome
 * control exactly once has to bind the same listener the application binds, and
 * a copy of it in a story fixture would prove the copy (ADR 0052).
 */
export function usePresentingKeys(active: boolean, commands: TraversalCommands): void {
  const { advance, retreat, returnToStart, selectBranch, exitPresenting, openNotes, toggleNotes } =
    commands;
  useEffect(() => {
    if (!active) return;
    const bound: readonly (readonly [KeyBinding, () => void])[] = [
      [PRESENTING_KEYS.advance, advance],
      [PRESENTING_KEYS.retreat, retreat],
      [PRESENTING_KEYS.returnToStart, returnToStart],
      [PRESENTING_KEYS.previousBranch, () => selectBranch(-1)],
      [PRESENTING_KEYS.nextBranch, () => selectBranch(1)],
      [PRESENTING_KEYS.exitPresenting, exitPresenting],
      [PRESENTING_KEYS.openNotes, openNotes],
      [PRESENTING_KEYS.toggleNotes, toggleNotes],
    ];
    const onKeyDown = (event: KeyboardEvent) => {
      // Space and Enter on a focused chrome control are that control's, and a
      // surface that owns its keys keeps them all: nothing reaches past a
      // dialog, a menu's arrows and Escape move and close the menu rather than
      // the Traversal, and a letter typed into a field is text. Anywhere else —
      // the Stage, a chrome button, the page — the arrows and Escape are the
      // Traversal's.
      if (keyBelongsElsewhere(event) || pageScrollsContent(event)) return;
      const command = bound.find(([binding]) => pressesBinding(binding, event))?.[1];
      if (command === undefined) return;
      event.preventDefault();
      command();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    active,
    advance,
    retreat,
    returnToStart,
    selectBranch,
    exitPresenting,
    openNotes,
    toggleNotes,
  ]);
}
