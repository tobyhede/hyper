import { keyBelongsElsewhere, type CommandId } from './key-bindings';
import type { KeyAnswer } from './key-dispatcher';
import { ABSENT, AVAILABLE, type CommandAvailability } from './canvas-commands';

/** The Traversal operations the Presenting commands perform, all Navigation's own. */
export interface TraversalCommands {
  readonly advance: () => void;
  readonly retreat: () => void;
  /** Go back to where this presentation began. */
  readonly returnToStart: () => void;
  readonly selectBranch: (delta: number) => void;
  readonly exitPresenting: () => void;
  /** Open a Notes window following this presentation (ADR 0129). */
  readonly openNotes: () => void;
  /** Show or hide the notes under the Stage, for rehearsing on one screen (ADR 0129). */
  readonly toggleNotes: () => void;
}

/** A Presenting command's name (ADR 0138). */
export type PresentingCommandId = Extract<CommandId, `presenting.${string}`>;

/**
 * A named move through the talk, answered while the Space on screen presents.
 *
 * The Canvas commands' interface without a target: a Traversal acts on the
 * presentation, not on something the press is aimed at. What a press can
 * still decide is whether the command runs for it, which is its availability.
 */
export interface PresentingCommand {
  readonly id: PresentingCommandId;
  readonly availability: (press: KeyboardEvent) => CommandAvailability;
  readonly run: () => void;
}

/**
 * Whether Page Down, Page Up or Home pressed here would still scroll the content
 * the press landed in, which it then keeps: a presenter reading a long Resource
 * with focus in it pages through it first. A clicker, whose focus is on the
 * chrome after a move, is outside the content and goes straight on. Each
 * scrolling ancestor of the press is asked in turn, nearest first, so a code
 * block paged to its end leaves the press to the Resource around it, and only
 * when none has further to scroll does the press move through the talk.
 */
function keyScrollsContent(event: KeyboardEvent): boolean {
  const down = event.key === 'PageDown';
  if (!down && event.key !== 'PageUp' && event.key !== 'Home') return false;
  for (
    let element = event.target instanceof Element ? event.target : null;
    element !== null;
    element = element.parentElement
  ) {
    if (element.scrollHeight <= element.clientHeight) continue;
    const { overflowY } = getComputedStyle(element);
    if (overflowY !== 'auto' && overflowY !== 'scroll') continue;
    if (
      down
        ? element.scrollTop + element.clientHeight < element.scrollHeight - 1
        : element.scrollTop > 0
    )
      return true;
  }
  return false;
}

const always = (): CommandAvailability => AVAILABLE;
/** A move a long Resource's scroll takes first: absent for a press that would still scroll it. */
const unlessContentScrolls = (press: KeyboardEvent): CommandAvailability =>
  keyScrollsContent(press) ? ABSENT : AVAILABLE;

/**
 * The Presenting commands over `traversal`, in the order the keys list them.
 *
 * Right and Page Down commit the selected Edge, Left and Page Up traverse
 * back, Home goes back to where the presentation began, Up and Down move the
 * selection among a fork's outgoing Edges without traversing — the move a
 * deck framework's per-key redirect cannot express, and the reason there is no
 * framework here. Escape leaves.
 */
export function presentingCommands(traversal: TraversalCommands): readonly PresentingCommand[] {
  const { advance, retreat, returnToStart, selectBranch, exitPresenting, openNotes, toggleNotes } =
    traversal;
  const command = (
    id: PresentingCommandId,
    run: () => void,
    availability: PresentingCommand['availability'] = always,
  ): PresentingCommand => ({ id, availability, run });
  return [
    command('presenting.advance', advance, unlessContentScrolls),
    command('presenting.retreat', retreat, unlessContentScrolls),
    command('presenting.returnToStart', returnToStart, unlessContentScrolls),
    command('presenting.previousBranch', () => selectBranch(-1)),
    command('presenting.nextBranch', () => selectBranch(1)),
    command('presenting.exitPresenting', exitPresenting),
    command('presenting.openNotes', openNotes),
    command('presenting.toggleNotes', toggleNotes),
  ];
}

/**
 * The key answer for a Presenting command. Space and Enter on a focused chrome
 * control are that control's, and a surface that owns its keys keeps them all:
 * nothing reaches past a dialog, a menu's arrows and Escape move and close the
 * menu rather than the Traversal, and a letter typed into a field is text.
 * Anywhere else — the Stage, a chrome button, the page — the arrows and Escape
 * are the Traversal's.
 */
export const presentingKeyAnswer = (command: PresentingCommand): KeyAnswer => ({
  id: command.id,
  answer: (event) => {
    if (keyBelongsElsewhere(event) || command.availability(event).kind !== 'available')
      return false;
    command.run();
    return true;
  },
});
