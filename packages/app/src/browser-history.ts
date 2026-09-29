import type { HistoryApi } from './browser-location';

interface HistoryPosition {
  readonly hyperHistoryIndex: number;
}

/** The browser's history state is external input, including entries authored before startup. */
const isHistoryPosition = (value: unknown): value is HistoryPosition =>
  typeof value === 'object' &&
  value !== null &&
  'hyperHistoryIndex' in value &&
  typeof value.hyperHistoryIndex === 'number' &&
  Number.isSafeInteger(value.hyperHistoryIndex);

/**
 * The part of `window` the adapter reads and writes, and the whole of it.
 *
 * `window` satisfies it as it stands; naming it is what lets the index
 * arithmetic below run against a stand-in browser in the node environment
 * (`packages/app/test/browser-history.test.ts`).
 */
export interface NativeBrowser {
  readonly history: Pick<History, 'state' | 'pushState' | 'replaceState' | 'go'>;
  readonly location: Pick<Location, 'pathname' | 'href'>;
  addEventListener(type: 'popstate', listener: (event: Pick<PopStateEvent, 'state'>) => void): void;
  removeEventListener(
    type: 'popstate',
    listener: (event: Pick<PopStateEvent, 'state'>) => void,
  ): void;
}

/** Same-document traversals can be held without overwriting either history entry. */
export function createBrowserHistory(browser: NativeBrowser): HistoryApi {
  const initial: unknown = browser.history.state;
  let index = isHistoryPosition(initial) ? initial.hyperHistoryIndex : 0;
  browser.history.replaceState({ hyperHistoryIndex: index }, '', browser.location.href);
  return {
    pathname: () => browser.location.pathname,
    href: () => browser.location.href,
    push: (path) => browser.history.pushState({ hyperHistoryIndex: ++index }, '', path),
    replace: (path) => browser.history.replaceState({ hyperHistoryIndex: index }, '', path),
    onPopState: (listener) => {
      let returning = false;
      /** Counts kept traversals, so a late hold can tell whether it is still the latest. */
      let traversal = 0;
      /** Return the browser from the entry at `at` to the entry at `from`. */
      const hold = (from: number, at: number): void => {
        index = from;
        returning = true;
        browser.history.go(from - at);
      };
      /** Ask the listener about the arrival at the entry numbered `next`. */
      const arrive = (next: number): void => {
        const from = index;
        const answer = listener();
        if (answer === false) {
          if (next !== from) hold(from, next);
          return;
        }
        index = next;
        const kept = ++traversal;
        if (answer === undefined) return;
        void answer.then((late) => {
          if (
            late === false &&
            kept === traversal &&
            !returning &&
            index === next &&
            next !== from
          ) {
            hold(from, next);
          }
        });
      };
      /**
       * An entry with no position is taken to be one a fragment navigation has
       * just written: the browser writes it after the current entry and fires
       * `popstate` as it arrives, so it is numbered and stamped here and then
       * treated as any traversal. An entry written with no `popstate`, such as
       * another script's `pushState`, cannot be counted: a rewind across it
       * misses by one entry, a rewind that lands on it stops there, and a
       * traversal to it is numbered as though it followed the entry left.
       */
      const popped = (event: Pick<PopStateEvent, 'state'>): void => {
        const position: unknown = event.state;
        if (!isHistoryPosition(position)) {
          if (returning) {
            returning = false;
            return;
          }
          browser.history.replaceState({ hyperHistoryIndex: index + 1 }, '', browser.location.href);
          arrive(index + 1);
          return;
        }
        const next = position.hyperHistoryIndex;
        if (returning) {
          if (next === index) returning = false;
          else browser.history.go(index - next);
          return;
        }
        arrive(next);
      };
      browser.addEventListener('popstate', popped);
      return () => browser.removeEventListener('popstate', popped);
    },
  };
}
