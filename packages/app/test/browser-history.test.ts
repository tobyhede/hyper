import { describe, expect, it } from 'vitest';
import { createBrowserHistory, type NativeBrowser } from '../src/browser-history';

/**
 * The native history adapter's index arithmetic, against a stand-in browser.
 *
 * The stand-in keeps one session history for one document: `pushState`
 * truncates the entries ahead of the current one, and every traversal — the
 * reader's Back and Forward and the adapter's own `go` — is queued and applied
 * in order by `settle`, firing `popstate` with the arriving entry's state
 * before the next traversal starts. A `go` past either end does nothing.
 *
 * Whether a real browser honours these writes is what
 * `packages/app/e2e/image-resource.spec.ts` proves, which a stand-in cannot.
 */

const ORIGIN = 'https://space.test';

interface Entry {
  readonly state: unknown;
  readonly url: URL;
}

type PopListener = (event: { readonly state: unknown }) => void;

const standInBrowser = (initial: { readonly path: string; readonly state?: unknown }) => {
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
  return {
    browser,
    entries,
    back: () => traversals.push(-1),
    forward: () => traversals.push(1),
    traverse: (delta: number) => traversals.push(delta),
    /** A same-document entry this adapter did not write, such as a fragment link's. */
    foreignPush: (path: string) => {
      entries.splice(current + 1);
      entries.push({ state: null, url: new URL(path, ORIGIN) });
      current += 1;
    },
    settle: () => {
      for (let guard = 0; traversals.length > 0; guard += 1) {
        if (guard > 100) throw new Error('Traversals did not settle.');
        const delta = traversals.shift() ?? 0;
        const target = current + delta;
        if (delta === 0 || target < 0 || target >= entries.length) continue;
        current = target;
        const { state } = at();
        for (const listener of [...listeners]) listener({ state });
      }
    },
  };
};

/** The state the adapter writes for the entry at `index`. */
const stamp = (index: number) => ({ hyperHistoryIndex: index });

describe('the native history adapter', () => {
  it('stamps the entry it starts on without moving it, and numbers each push', () => {
    const stand = standInBrowser({ path: '/spaces/a' });
    const history = createBrowserHistory(stand.browser);
    expect(stand.entries.map(({ state }) => state)).toEqual([stamp(0)]);
    expect(history.pathname()).toBe('/spaces/a');
    history.push('/spaces/b');
    history.replace('/spaces/c');
    history.push('/spaces/d');
    expect(stand.entries.map(({ state, url }) => [state, url.pathname])).toEqual([
      [stamp(0), '/spaces/a'],
      [stamp(1), '/spaces/c'],
      [stamp(2), '/spaces/d'],
    ]);
  });

  it('continues from the index a reload restored', () => {
    const stand = standInBrowser({ path: '/spaces/a', state: { hyperHistoryIndex: 3 } });
    const history = createBrowserHistory(stand.browser);
    history.push('/spaces/b');
    expect(stand.entries.map(({ state }) => state)).toEqual([stamp(3), stamp(4)]);
  });

  it('adopts the index a permitted traversal arrives at', () => {
    const stand = standInBrowser({ path: '/a' });
    const history = createBrowserHistory(stand.browser);
    history.push('/b');
    history.push('/c');
    const heard: string[] = [];
    history.onPopState(() => {
      heard.push(history.pathname());
      return undefined;
    });
    stand.back();
    stand.back();
    stand.settle();
    expect(heard).toEqual(['/b', '/a']);
    // Pushing from the arrived entry numbers the next one after it.
    history.push('/d');
    expect(stand.entries.map(({ state, url }) => [state, url.pathname])).toEqual([
      [stamp(0), '/a'],
      [stamp(1), '/d'],
    ]);
  });

  it('rewinds a held Back to the entry it left, and keeps the entry it skipped', () => {
    const stand = standInBrowser({ path: '/a' });
    const history = createBrowserHistory(stand.browser);
    history.push('/b');
    let calls = 0;
    history.onPopState(() => {
      calls += 1;
      return false;
    });
    stand.back();
    stand.settle();
    expect(history.pathname()).toBe('/b');
    expect(calls).toBe(1);
    expect(stand.entries.map(({ url }) => url.pathname)).toEqual(['/a', '/b']);
  });

  it('rewinds a held Forward and a held traversal across several entries', () => {
    const stand = standInBrowser({ path: '/a' });
    const history = createBrowserHistory(stand.browser);
    history.push('/b');
    history.push('/c');
    let hold = false;
    history.onPopState(() => (hold ? false : undefined));
    stand.traverse(-2);
    stand.settle();
    expect(history.pathname()).toBe('/a');
    hold = true;
    stand.forward();
    stand.settle();
    expect(history.pathname()).toBe('/a');
    stand.traverse(2);
    stand.settle();
    expect(history.pathname()).toBe('/a');
    hold = false;
    stand.traverse(2);
    stand.settle();
    expect(history.pathname()).toBe('/c');
  });

  it('rewinds a traversal its listener holds once the answer settles', async () => {
    const stand = standInBrowser({ path: '/a' });
    const history = createBrowserHistory(stand.browser);
    history.push('/b');
    const answer = Promise.withResolvers<undefined | false>();
    history.onPopState(() => answer.promise);
    stand.back();
    stand.settle();
    expect(history.pathname()).toBe('/a');
    answer.resolve(false);
    await answer.promise;
    await Promise.resolve();
    stand.settle();
    expect(history.pathname()).toBe('/b');
    history.push('/c');
    expect(stand.entries.map(({ state, url }) => [state, url.pathname])).toEqual([
      [stamp(0), '/a'],
      [stamp(1), '/b'],
      [stamp(2), '/c'],
    ]);
  });

  it('keeps a later traversal when an earlier answer holds too late', async () => {
    const stand = standInBrowser({ path: '/a' });
    const history = createBrowserHistory(stand.browser);
    history.push('/b');
    history.push('/c');
    const answers: PromiseWithResolvers<undefined | false>[] = [];
    history.onPopState(() => {
      const answer = Promise.withResolvers<undefined | false>();
      answers.push(answer);
      return answer.promise;
    });
    stand.back();
    stand.settle();
    stand.back();
    stand.settle();
    expect(history.pathname()).toBe('/a');
    answers[0]?.resolve(false);
    answers[1]?.resolve(undefined);
    await Promise.all(answers.map(({ promise }) => promise));
    await Promise.resolve();
    stand.settle();
    expect(history.pathname()).toBe('/a');
  });

  it('asks the listener about an entry it did not write, and keeps its own index', () => {
    const stand = standInBrowser({ path: '/a' });
    const history = createBrowserHistory(stand.browser);
    history.push('/b');
    stand.foreignPush('/b#section');
    const heard: string[] = [];
    history.onPopState(() => {
      heard.push(history.pathname());
      return undefined;
    });
    stand.back();
    stand.settle();
    stand.forward();
    stand.settle();
    expect(heard).toEqual(['/b', '/b']);
    // The foreign entry carries no index, so the next push still follows /b's.
    history.push('/c');
    expect(stand.entries.at(-1)?.state).toEqual(stamp(2));
  });

  it('stops listening when released', () => {
    const stand = standInBrowser({ path: '/a' });
    const history = createBrowserHistory(stand.browser);
    history.push('/b');
    let calls = 0;
    const release = history.onPopState(() => {
      calls += 1;
      return undefined;
    });
    release();
    stand.back();
    stand.settle();
    expect(calls).toBe(0);
  });
});
