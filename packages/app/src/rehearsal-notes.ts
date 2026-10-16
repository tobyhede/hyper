import { useCallback, useState } from 'react';

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
 * Off at the start of every presentation, however it starts, and never stored:
 * a presenter who rehearsed with the notes showing does not then present them
 * to an audience. The reset happens while rendering the change, as React
 * adjusts state to a changed input, so no frame of a new presentation draws the
 * notes from the last one.
 */
export function useRehearsalNotes(presenting: boolean): RehearsalNotes {
  const [shown, setShown] = useState(false);
  const [during, setDuring] = useState(presenting);
  if (during !== presenting) {
    setDuring(presenting);
    setShown(false);
  }
  const toggle = useCallback(() => setShown((was) => !was), []);
  return { shown: presenting && shown, toggle };
}
