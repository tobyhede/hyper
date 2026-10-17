import type {
  PresentationChannel,
  PresentationLinks,
  PresentationMessage,
} from '#src/presentation-link';

/**
 * Presentation links that reach no other window: nothing posted is heard and
 * nothing arrives. A story or a test that is not about Notes windows presents
 * alone, as `refusingFullscreen` lets it present without fullscreen. Shared by
 * the catalogue and the unit tests.
 */
export const unlinkedPresentations: PresentationLinks = {
  open: () => ({
    post: () => undefined,
    subscribe: () => () => undefined,
    close: () => undefined,
  }),
  now: () => 0,
  leaving: () => () => undefined,
  presence: { hold: () => () => undefined, watch: () => () => undefined },
};

/**
 * Windows on one Space's channel, joined as `BroadcastChannel` joins them: each
 * hears every other window's messages and never its own. Shared by the
 * catalogue's Notes window stories and the unit tests.
 */
export function channelHub() {
  const listeners = new Set<{
    readonly owner: number;
    readonly listener: (message: PresentationMessage) => void;
  }>();
  let windows = 0;
  return (): PresentationChannel => {
    const owner = windows++;
    return {
      post: (message) => {
        for (const entry of [...listeners]) {
          if (entry.owner !== owner) entry.listener(structuredClone(message));
        }
      },
      subscribe: (listener) => {
        const entry = { owner, listener };
        listeners.add(entry);
        return () => listeners.delete(entry);
      },
      close: () => {
        for (const entry of [...listeners]) if (entry.owner === owner) listeners.delete(entry);
      },
    };
  };
}
