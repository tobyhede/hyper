import { useKeyAnswers } from './key-dispatcher';
import {
  presentingCommands,
  presentingKeyAnswer,
  type TraversalCommands,
} from './presenting-commands';

export type { TraversalCommands } from './presenting-commands';

/**
 * The Presenting commands' keys, answered by the Space's dispatcher while
 * `active`: while the Space on screen is presenting, and never for one that is
 * open but not on screen.
 *
 * A hook rather than a registration written out in `App`, because it is the
 * boundary that owns this behaviour: a Ladle story proving that Space activates
 * a chrome control exactly once has to answer the keys the application
 * answers, and a copy of it in a story fixture would prove the copy (ADR 0052).
 */
export function usePresentingKeys(active: boolean, traversal: TraversalCommands): void {
  useKeyAnswers(active ? presentingCommands(traversal).map(presentingKeyAnswer) : []);
}
