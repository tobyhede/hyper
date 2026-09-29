import type { NativeBrowser } from '../src/browser-history';
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
export const ORIGIN = 'https://space.test';

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

interface Entry {
  readonly state: unknown;
  readonly url: URL;
}

type PopListener = (event: { readonly state: unknown }) => void;

/**
 * A stand-in browser for the native history adapter.
 *
 * It keeps one session history for one document: `pushState` truncates the
 * entries ahead of the current one, and every traversal — the reader's Back
 * and Forward and the adapter's own `go` — is queued and applied in order by
 * `settle`, firing `popstate` with the arriving entry's state
 * before the next traversal starts. A `go` past either end does nothing.
 *
 * Whether a real browser honours these writes is what
 * `packages/app/e2e/image-resource.spec.ts` proves, which a stand-in cannot.
 */
export const standInBrowser = (initial: { readonly path: string; readonly state?: unknown }) => {
  const entries: Entry[] = [{ state: initial.state ?? null, url: new URL(initial.path, ORIGIN) }];
  let current = 0;
  const traversals: number[] = [];
  const listeners = new Set<PopListener>();
  const at = (): Entry => {
    const entry = entries[current];
    if (entry === undefined) throw new Error('The stand-in browser lost its current entry.');
    return entry;
  };
  const browser: NativeBrowser = {
    history: {
      get state() {
        return at().state;
      },
      pushState: (state, _unused, url) => {
        entries.splice(current + 1);
        entries.push({ state, url: new URL(String(url ?? at().url), at().url) });
        current += 1;
      },
      replaceState: (state, _unused, url) => {
        entries[current] = { state, url: new URL(String(url ?? at().url), at().url) };
      },
      go: (delta = 0) => {
        traversals.push(delta);
      },
    },
    location: {
      get pathname() {
        return at().url.pathname;
      },
      get href() {
        return at().url.href;
      },
    },
    addEventListener: (_type, listener) => {
      listeners.add(listener);
    },
    removeEventListener: (_type, listener) => {
      listeners.delete(listener);
    },
  };
  const step = (): void => {
    const delta = traversals.shift() ?? 0;
    const target = current + delta;
    if (delta === 0 || target < 0 || target >= entries.length) return;
    current = target;
    const { state } = at();
    for (const listener of [...listeners]) listener({ state });
  };
  return {
    browser,
    entries,
    back: () => traversals.push(-1),
    forward: () => traversals.push(1),
    traverse: (delta: number) => traversals.push(delta),
    /** A same-document entry this adapter did not write, written without a `popstate`. */
    foreignPush: (path: string) => {
      entries.splice(current + 1);
      entries.push({ state: null, url: new URL(path, ORIGIN) });
      current += 1;
    },
    /**
     * A fragment navigation: the browser writes an entry after the current one
     * with no state, and fires `popstate` with that state as it arrives.
     */
    fragment: (path: string) => {
      entries.splice(current + 1);
      entries.push({ state: null, url: new URL(path, ORIGIN) });
      current += 1;
      for (const listener of [...listeners]) listener({ state: null });
    },
    /** Apply the oldest queued traversal alone, leaving any it queues. */
    step,
    settle: () => {
      for (let guard = 0; traversals.length > 0; guard += 1) {
        if (guard > 100) throw new Error('Traversals did not settle.');
        step();
      }
    },
  };
};
