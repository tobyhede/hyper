import { useLayoutEffect, useRef, useState } from 'react';

export type PresenceState = 'entering' | 'present' | 'leaving';

/**
 * Whether the value is drawn, and which one. `value` is the value supplied
 * while entering or present, and the last one supplied while leaving.
 */
export type Presence<T> =
  | { readonly mounted: false }
  | { readonly mounted: true; readonly state: PresenceState; readonly value: T };

interface HeldPresence<T> {
  /** The last non-null value supplied; kept so leaving can still draw it. */
  readonly value: T | null;
  readonly mounted: boolean;
  readonly state: PresenceState;
}

/**
 * Keeps a value drawn long enough to draw its exit.
 *
 * The value is visible while it is not `null`. When it becomes `null`, the
 * value last supplied stays drawn as `leaving` until the exit has run, so the
 * exit fades out what was on screen rather than nothing. Transitions compare
 * visibility only; a new non-null value while entering or present is drawn as
 * it arrives. The value is held by identity, so a caller must supply one that
 * keeps its identity while unchanged — a primitive or a memoised object —
 * because a fresh object on every render is a change on every render.
 *
 * The caller owns what the states look like and reads the duration from the
 * element that draws the exit. Reading it only once the leaving state is in
 * the DOM keeps unmount synchronized with CSS overrides and reduced motion.
 * Re-entering cancels a pending unmount and takes the new value, so rapid
 * toggles always settle on the latest requested presence rather than replaying
 * queued transitions.
 */
export function usePresence<T>(value: T | null, exitDurationMs: () => number): Presence<T> {
  const visible = value !== null;
  const [presence, setPresence] = useState<HeldPresence<T>>({
    value,
    mounted: visible,
    state: visible ? 'entering' : 'leaving',
  });
  const frame = useRef<number | undefined>(undefined);

  if (visible !== (presence.state !== 'leaving')) {
    setPresence({
      value: visible ? value : presence.value,
      mounted: true,
      state: visible ? 'entering' : 'leaving',
    });
  } else if (visible && value !== presence.value) {
    setPresence({ ...presence, value });
  }

  useLayoutEffect(() => {
    if (frame.current !== undefined) cancelAnimationFrame(frame.current);

    if (presence.state === 'entering') {
      frame.current = requestAnimationFrame(() => {
        setPresence((current) =>
          current.state === 'entering' ? { ...current, state: 'present' } : current,
        );
        frame.current = undefined;
      });
      return () => {
        if (frame.current !== undefined) cancelAnimationFrame(frame.current);
      };
    }

    if (presence.state !== 'leaving' || !presence.mounted) return undefined;
    const timeout = window.setTimeout(
      () => setPresence((current) => ({ ...current, value: null, mounted: false })),
      exitDurationMs(),
    );
    return () => window.clearTimeout(timeout);
  }, [exitDurationMs, presence.mounted, presence.state]);

  if (!presence.mounted || presence.value === null) return { mounted: false };
  return { mounted: true, state: presence.state, value: presence.value };
}
