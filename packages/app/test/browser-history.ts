import type { NativeBrowser, NativeNavigation } from '../src/browser-history';
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
  /** The Navigation API's key, which `replaceState` keeps and every new entry mints. */
  readonly key: string;
}

type PopListener = (event: { readonly state: unknown }) => void;

/** A queued traversal: a relative `go`, as the reader's Back and Forward are, or a `traverseTo`. */
type Traversal =
  | { readonly by: number }
  | { readonly key: string; readonly done: PromiseWithResolvers<undefined> };

/**
 * A stand-in browser for the native history adapter.
 *
 * It keeps one session history for one document: `pushState` truncates the
 * entries ahead of the current one, and every traversal — the reader's Back
 * and Forward and the adapter's own `go` — is queued and applied in order by
 * `settle`, firing `popstate` with the arriving entry's state
 * before the next traversal starts. A `go` past either end does nothing.
 *
 * With `navigation`, it also offers the part of the Navigation API the adapter
 * uses, as far as the HTML standard describes it: every entry has a key,
 * `replaceState` keeps the entry's key, and `traverseTo(key)` joins the same
 * queue as every other traversal and moves to that entry wherever the browser
 * is when it applies, firing `popstate` like any traversal. One to the current
 * entry, at the call or when it applies, moves nothing and fires nothing; one
 * to a key no entry holds rejects, at the call or when it applies.
 *
 * Whether a real browser honours these writes is what
 * `packages/app/e2e/image-resource.spec.ts` and
 * `packages/app/e2e/held-traversal.spec.ts` prove, which a stand-in cannot.
 */
export const standInBrowser = (initial: {
  readonly path: string;
  readonly state?: unknown;
  readonly navigation?: boolean;
}) => {
  let minted = 0;
  const mint = (): string => `key-${String(minted++)}`;
  const entries: Entry[] = [
    { state: initial.state ?? null, url: new URL(initial.path, ORIGIN), key: mint() },
  ];
  let current = 0;
  const traversals: Traversal[] = [];
  const listeners = new Set<PopListener>();
  const at = (): Entry => {
    const entry = entries[current];
    if (entry === undefined) throw new Error('The stand-in browser lost its current entry.');
    return entry;
  };
  const resolve = (url: string | URL | null | undefined): URL =>
    new URL(String(url ?? at().url), at().url);
  const gone = () =>
    Promise.reject(new DOMException('No entry holds that key.', 'InvalidStateError'));
  const navigation: NativeNavigation = {
    get currentEntry() {
      return { key: at().key };
    },
    traverseTo: (key) => {
      if (key === at().key) {
        const entry = Promise.resolve(undefined);
        return { committed: entry, finished: entry };
      }
      if (!entries.some((entry) => entry.key === key))
        return { committed: gone(), finished: gone() };
      const done = Promise.withResolvers<undefined>();
      traversals.push({ key, done });
      return { committed: done.promise, finished: done.promise };
    },
  };
  const withoutNavigation: NativeBrowser = {
    history: {
      get state() {
        return at().state;
      },
      pushState: (state, _unused, url) => {
        entries.splice(current + 1);
        entries.push({ state, url: resolve(url), key: mint() });
        current += 1;
      },
      replaceState: (state, _unused, url) => {
        entries[current] = { state, url: resolve(url), key: at().key };
      },
      go: (by = 0) => {
        traversals.push({ by });
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
  const browser: NativeBrowser =
    initial.navigation === true ? { ...withoutNavigation, navigation } : withoutNavigation;
  /** Where the oldest queued traversal goes, or `undefined` where it goes nowhere. */
  const destination = (traversal: Traversal): number | undefined => {
    if ('by' in traversal) {
      const target = current + traversal.by;
      return traversal.by === 0 || target < 0 || target >= entries.length ? undefined : target;
    }
    const target = entries.findIndex((entry) => entry.key === traversal.key);
    if (target < 0) {
      traversal.done.reject(new DOMException('No entry holds that key.', 'InvalidStateError'));
      return undefined;
    }
    traversal.done.resolve(undefined);
    return target === current ? undefined : target;
  };
  const step = (): void => {
    const traversal = traversals.shift();
    const target = traversal === undefined ? undefined : destination(traversal);
    if (target === undefined) return;
    current = target;
    const { state } = at();
    for (const listener of [...listeners]) listener({ state });
  };
  const add = (path: string): void => {
    entries.splice(current + 1);
    entries.push({ state: null, url: new URL(path, ORIGIN), key: mint() });
    current += 1;
  };
  return {
    browser,
    entries,
    back: () => traversals.push({ by: -1 }),
    forward: () => traversals.push({ by: 1 }),
    traverse: (by: number) => traversals.push({ by }),
    /** A same-document entry this adapter did not write, written without a `popstate`. */
    foreignPush: add,
    /**
     * A fragment navigation: the browser writes an entry after the current one
     * with no state, and fires `popstate` with that state as it arrives.
     */
    fragment: (path: string) => {
      add(path);
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
