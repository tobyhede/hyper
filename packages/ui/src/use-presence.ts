import { useLayoutEffect, useRef, useState } from 'react';

export type PresenceState = 'entering' | 'present' | 'leaving';

export interface Presence {
  readonly mounted: boolean;
  readonly state: PresenceState;
}

/**
 * Keeps presentation children mounted long enough to draw their exit.
 *
 * The caller owns what the states look like and supplies the duration of that
 * exit. Re-entering cancels a pending unmount, so rapid toggles always settle
 * on the latest requested presence rather than replaying queued transitions.
 */
export function usePresence(visible: boolean, exitDurationMs: number): Presence {
  const [presence, setPresence] = useState<Presence & { readonly requested: boolean }>({
    requested: visible,
    mounted: visible,
    state: visible ? 'entering' : 'leaving',
  });
  const frame = useRef<number | undefined>(undefined);

  if (presence.requested !== visible) {
    setPresence({
      requested: visible,
      mounted: true,
      state: visible ? 'entering' : 'leaving',
    });
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
      () => setPresence((current) => ({ ...current, mounted: false })),
      exitDurationMs,
    );
    return () => window.clearTimeout(timeout);
  }, [exitDurationMs, presence.mounted, presence.state]);

  return { mounted: presence.mounted, state: presence.state };
}
