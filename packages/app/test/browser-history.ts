import type { HistoryApi, PopStateAnswer } from '../src/browser-location';

export interface HistoryWrite {
  readonly method: 'push' | 'replace';
  readonly path: string;
}

/**
 * The second {@link HistoryApi} adapter, and the one that makes the seam real.
 *
 * It records what was written rather than performing it, so every rule that
 * decides a history entry is observable without a DOM — which is the whole
 * reason the browser is behind an interface at all. `popTo` is Back and Forward:
 * the location moves and the listeners fire, exactly as the browser does it and
 * with no entry taken. A listener that holds the traversal, at once or once its
 * promise settles, returns the location to where it was.
 */
export interface RecordingHistory extends HistoryApi {
  readonly writes: readonly HistoryWrite[];
  readonly popTo: (path: string) => void;
  readonly listenerCount: () => number;
}

/** Any origin will do; only the path is ever asserted on. */
const ORIGIN = 'https://space.test';

export const recordingHistory = (initial = '/'): RecordingHistory => {
  const writes: HistoryWrite[] = [];
  const listeners = new Set<() => PopStateAnswer>();
  let location = new URL(initial, ORIGIN);
  return {
    writes,
    pathname: () => location.pathname,
    href: () => location.href,
    push: (path) => {
      writes.push({ method: 'push', path });
      location = new URL(path, ORIGIN);
    },
    replace: (path) => {
      writes.push({ method: 'replace', path });
      location = new URL(path, ORIGIN);
    },
    onPopState: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    popTo: (path) => {
      const previous = location;
      const arrived = new URL(path, ORIGIN);
      location = arrived;
      for (const listener of [...listeners]) {
        const answer = listener();
        if (answer === false) location = previous;
        else if (answer !== undefined) {
          void answer.then((late) => {
            if (late === false && location === arrived) location = previous;
          });
        }
      }
    },
    listenerCount: () => listeners.size,
  };
};
