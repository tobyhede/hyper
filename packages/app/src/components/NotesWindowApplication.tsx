import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import type { NotesWindow as NotesWindowModel } from '../notes-window';
import { usePresentingKeys } from '../presenting-keys';
import { NotesWindow } from './NotesWindow';

/** How often the elapsed time is redrawn. */
const TICK_MS = 1000;

/** The clock's ticks, as a store React reads the time from. */
const everySecond = (tick: () => void) => {
  const timer = setInterval(tick, TICK_MS);
  return () => clearInterval(timer);
};

/** When the timer was last reset, and in which presentation. */
interface TimerReset {
  readonly startedAt: number;
  readonly at: number;
}

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

  // A reset is this window's alone, and belongs to the presentation it was
  // pressed in: a new presentation starts the count again.
  const [reset, setReset] = useState<TimerReset | null>(null);
  const second = useSyncExternalStore(everySecond, () => Math.floor(now() / TICK_MS));
  const time = second * TICK_MS;
  const from = reset !== null && reset.startedAt === startedAt ? reset.at : (startedAt ?? time);

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
      elapsed={Math.max(0, time - from)}
      onResetTimer={() => {
        if (startedAt !== null) setReset({ startedAt, at: now() });
      }}
      onAdvance={notes.advance}
      onRetreat={notes.retreat}
      onSelectBranch={notes.selectBranch}
    />
  );
}
