import { useMemo } from 'react';
import { useKeyAnswers, useKeyCover } from './key-dispatcher';
import {
  presentingCommands,
  presentingKeyAnswer,
  type TraversalCommands,
} from './presenting-commands';

export type { TraversalCommands } from './presenting-commands';

/**
 * The Presenting commands' keys. While `presenting`, the Stage covers the
 * canvas, so the Space's dispatcher answers these and no canvas key; a Space
 * that is not on screen answers neither.
 *
 * A hook rather than a registration written out in `App`, because it is the
 * boundary that owns this behaviour: a Ladle story proving that Space activates
 * a chrome control exactly once has to answer the keys the application
 * answers, and a copy of it in a story fixture would prove the copy (ADR 0052).
 */
export function usePresentingKeys(presenting: boolean, traversal: TraversalCommands): void {
  useKeyCover('presenting', presenting);
  const answers = useMemo(
    () => presentingCommands(traversal).map(presentingKeyAnswer),
    [traversal],
  );
  useKeyAnswers(answers, 'presenting');
}
