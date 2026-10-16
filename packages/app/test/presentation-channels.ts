import type { PresentationChannel, PresentationMessage } from '../src/presentation-link';

/**
 * Windows on one Space's channel, joined as `BroadcastChannel` joins them: each
 * hears every other window's messages and never its own.
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
