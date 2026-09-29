import { describe, expect, it } from 'vitest';
import { createBrowserHistory } from '../src/browser-history';
import type { PopStateAnswer } from '../src/browser-location';
import { ORIGIN, standInBrowser } from './browser-history';

/** The state the adapter writes for the entry at `index`. */
const stamp = (index: number) => ({ hyperHistoryIndex: index });

/** The native history adapter's index arithmetic, against the stand-in browser. */
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

  it('returns to the entry it left when two Backs are queued while held, asking about each', () => {
    const stand = standInBrowser({ path: '/0' });
    const history = createBrowserHistory(stand.browser);
    for (const path of ['/1', '/2', '/3', '/4', '/5']) history.push(path);
    let hold = false;
    const heard: string[] = [];
    history.onPopState(() => {
      heard.push(history.pathname());
      return hold ? false : undefined;
    });
    stand.traverse(-2);
    stand.settle();
    expect(history.pathname()).toBe('/3');
    hold = true;
    heard.length = 0;
    stand.back();
    stand.back();
    stand.settle();
    expect(history.pathname()).toBe('/3');
    expect(heard).toEqual(['/2', '/1']);
    hold = false;
    stand.back();
    stand.settle();
    expect(history.pathname()).toBe('/2');
    expect(heard).toEqual(['/2', '/1', '/2']);
    expect(stand.entries.map(({ url }) => url.pathname)).toEqual([
      '/0',
      '/1',
      '/2',
      '/3',
      '/4',
      '/5',
    ]);
  });

  it('returns to the entry it left when two Forwards are queued while held, asking about each', () => {
    const stand = standInBrowser({ path: '/0' });
    const history = createBrowserHistory(stand.browser);
    for (const path of ['/1', '/2', '/3', '/4', '/5']) history.push(path);
    let hold = false;
    let calls = 0;
    history.onPopState(() => {
      calls += 1;
      return hold ? false : undefined;
    });
    stand.traverse(-2);
    stand.settle();
    hold = true;
    stand.forward();
    stand.forward();
    stand.settle();
    expect(history.pathname()).toBe('/3');
    expect(calls).toBe(3);
  });

  it('returns to the entry it left when a queued jump pushes a rewind past the last entry, and asks about the next Back', () => {
    const stand = standInBrowser({ path: '/a' });
    const history = createBrowserHistory(stand.browser);
    history.push('/b');
    history.push('/c');
    let hold = false;
    const heard: string[] = [];
    history.onPopState(() => {
      heard.push(history.pathname());
      return hold ? false : undefined;
    });
    stand.back();
    stand.settle();
    hold = true;
    heard.length = 0;
    // The jump arrives at /c before the rewind to /b applies, so that rewind
    // steps past the last entry and the browser never arrives from it.
    stand.back();
    stand.traverse(2);
    stand.settle();
    expect(history.pathname()).toBe('/b');
    expect(heard).toEqual(['/a', '/c']);
    hold = false;
    stand.back();
    stand.settle();
    expect(history.pathname()).toBe('/a');
    expect(heard).toEqual(['/a', '/c', '/a']);
  });

  it('asks about the next Back once a return has lost rewinds past both ends', async () => {
    const stand = standInBrowser({ path: '/0' });
    const history = createBrowserHistory(stand.browser);
    for (const path of ['/1', '/2', '/3']) history.push(path);
    const late = Promise.withResolvers<undefined | false>();
    let answer: PopStateAnswer = undefined;
    const heard: string[] = [];
    history.onPopState(() => {
      heard.push(history.pathname());
      return answer;
    });
    stand.traverse(-3);
    stand.settle();
    answer = late.promise;
    stand.traverse(2);
    stand.settle();
    // The reader presses Back before the late hold's rewind is issued, and
    // jumps two entries on after it, so the rewinds that follow step past
    // /0 and past /3 and never arrive.
    stand.back();
    answer = false;
    late.resolve(false);
    await late.promise;
    await Promise.resolve();
    stand.traverse(2);
    stand.settle();
    heard.length = 0;
    answer = undefined;
    const arrived = history.pathname();
    stand.back();
    stand.settle();
    expect(heard).toEqual([history.pathname()]);
    expect(history.pathname()).not.toBe(arrived);
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

  it('returns to the entry an earlier traversal left when it holds late while a later hold is returning', async () => {
    const stand = standInBrowser({ path: '/a' });
    const history = createBrowserHistory(stand.browser);
    history.push('/b');
    history.push('/c');
    const late = Promise.withResolvers<undefined | false>();
    let answer: PopStateAnswer = late.promise;
    history.onPopState(() => answer);
    stand.back();
    stand.settle();
    answer = false;
    stand.back();
    stand.step();
    // The Back from /b is held, and its rewind to /b has not arrived when the
    // Back from /c is refused.
    expect(history.pathname()).toBe('/a');
    late.resolve(false);
    await late.promise;
    await Promise.resolve();
    stand.settle();
    expect(history.pathname()).toBe('/c');
    expect(stand.entries.map(({ url }) => url.pathname)).toEqual(['/a', '/b', '/c']);
  });

  it('keeps a traversal whose late hold arrives after an entry was written', async () => {
    const stand = standInBrowser({ path: '/a' });
    const history = createBrowserHistory(stand.browser);
    history.push('/b');
    const late = Promise.withResolvers<undefined | false>();
    history.onPopState(() => late.promise);
    stand.back();
    stand.settle();
    history.replace('/d');
    late.resolve(false);
    await late.promise;
    await Promise.resolve();
    stand.settle();
    expect(history.pathname()).toBe('/d');
  });

  it('asks the listener about a fragment navigation, and numbers its entry after the one it left', () => {
    const stand = standInBrowser({ path: '/a' });
    const history = createBrowserHistory(stand.browser);
    history.push('/b');
    const heard: string[] = [];
    history.onPopState(() => {
      heard.push(history.href());
      return undefined;
    });
    stand.fragment('/b#section');
    stand.back();
    stand.settle();
    stand.forward();
    stand.settle();
    expect(heard).toEqual([`${ORIGIN}/b#section`, `${ORIGIN}/b`, `${ORIGIN}/b#section`]);
    history.push('/c');
    expect(stand.entries.map(({ state, url }) => [state, url.pathname + url.hash])).toEqual([
      [stamp(0), '/a'],
      [stamp(1), '/b'],
      [stamp(2), '/b#section'],
      [stamp(3), '/c'],
    ]);
  });

  it('rewinds a held Back across a fragment navigation to the fragment entry', () => {
    const stand = standInBrowser({ path: '/a' });
    const history = createBrowserHistory(stand.browser);
    history.push('/b');
    let hold = false;
    history.onPopState(() => (hold ? false : undefined));
    stand.fragment('/b#section');
    hold = true;
    stand.traverse(-2);
    stand.settle();
    expect(history.href()).toBe(`${ORIGIN}/b#section`);
  });

  it('rewinds a held Forward onto a fragment entry to the entry it left', () => {
    const stand = standInBrowser({ path: '/a' });
    const history = createBrowserHistory(stand.browser);
    history.push('/b');
    let hold = false;
    history.onPopState(() => (hold ? false : undefined));
    stand.fragment('/b#section');
    stand.back();
    stand.settle();
    hold = true;
    stand.forward();
    stand.settle();
    expect(history.href()).toBe(`${ORIGIN}/b`);
    hold = false;
    stand.forward();
    stand.settle();
    expect(history.href()).toBe(`${ORIGIN}/b#section`);
  });

  it('asks nothing of an unnumbered entry a rewind lands on, and asks about the next traversal', () => {
    const stand = standInBrowser({ path: '/a' });
    const history = createBrowserHistory(stand.browser);
    history.push('/b');
    // Written with no `popstate`, so the adapter cannot count it.
    stand.foreignPush('/b#section');
    history.push('/c');
    let hold = true;
    const heard: string[] = [];
    history.onPopState(() => {
      heard.push(history.href());
      return hold ? false : undefined;
    });
    stand.traverse(-3);
    stand.settle();
    hold = false;
    stand.forward();
    stand.settle();
    expect(heard).toEqual([`${ORIGIN}/a`, `${ORIGIN}/c`]);
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
