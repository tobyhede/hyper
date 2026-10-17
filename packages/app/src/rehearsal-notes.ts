import { useCallback, useState } from 'react';
import { samePresentation, type PresentationScope } from './navigation';

export interface RehearsalNotes {
  /** Whether the notes are shown under the Stage. */
  readonly shown: boolean;
  /** Show them if they are hidden, and hide them if they are shown: the N key's command. */
  readonly toggle: () => void;
}

/**
 * Whether the presenter has asked for the notes under the Stage, to rehearse
 * on one screen (ADR 0129).
 *
 * Off at the start of every presentation and never stored: a presenter who
 * rehearsed with the notes showing does not then present them to an audience.
 * When a presentation starts is `presentationScope`'s rule, so browser Back
 * mid-talk keeps the notes as they were, and a reopening on another Graph turns
 * them off. The reset happens while rendering the change, as React adjusts
 * state to a changed input, so no frame of a new presentation draws the notes
 * from the last one.
 */
export function useRehearsalNotes(scope: PresentationScope | null): RehearsalNotes {
  const [shown, setShown] = useState(false);
  const [during, setDuring] = useState(scope);
  if (!samePresentation(during, scope)) {
    setDuring(scope);
    setShown(false);
  }
  const toggle = useCallback(() => setShown((was) => !was), []);
  return { shown: scope !== null && shown, toggle };
}
