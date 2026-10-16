import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import type { NotesWindow as NotesWindowModel } from '../notes-window';
import { usePresentingKeys } from '../presenting-keys';
import { NotesWindow } from './NotesWindow';

/** How often the elapsed time is redrawn. */
const TICK_MS = 1000;

export interface NotesWindowApplicationProps {
  readonly notes: NotesWindowModel;
  /** The time now, in milliseconds since the Unix epoch, on the clock the presentation's start was read from. */
  readonly now: () => number;
}

/**
 * A Notes window following its Space's presentation: the model's state, the
 * Stage's own keys sent to the presenting window, and a timer that counts from
 * the presentation's start until it is reset here.
 */
export function NotesWindowApplication({ notes, now }: NotesWindowApplicationProps) {
  useEffect(() => notes.connect(), [notes]);
  const state = useSyncExternalStore(notes.subscribe, notes.getState);
  const presenting = state.kind === 'presenting';
  const startedAt = presenting ? state.view.startedAt : null;

  // A reset is this window's alone. A new presentation starts the count again.
  const [resetAt, setResetAt] = useState<number | null>(null);
  useEffect(() => setResetAt(null), [startedAt]);
  const [time, setTime] = useState(now);
  useEffect(() => {
    if (!presenting) return;
    setTime(now());
    const timer = setInterval(() => setTime(now()), TICK_MS);
    return () => clearInterval(timer);
  }, [presenting, now]);
  const from = resetAt ?? startedAt ?? time;

  // Leaving presenting belongs to the presenting window, and this is already
  // a Notes window: Escape and S do nothing here.
  const nothing = useCallback(() => undefined, []);
  usePresentingKeys(presenting, {
    advance: notes.advance,
    retreat: notes.retreat,
    selectBranch: notes.selectBranch,
    exitPresenting: nothing,
    openNotes: nothing,
  });

  return (
    <NotesWindow
      state={state}
      elapsed={time - from}
      onResetTimer={() => setResetAt(now())}
      onAdvance={notes.advance}
      onRetreat={notes.retreat}
      onSelectBranch={notes.selectBranch}
    />
  );
}
