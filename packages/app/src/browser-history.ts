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
  /** Counts the entries the application has written, so a late hold can tell whether one was. */
  let written = 0;
  return {
    pathname: () => browser.location.pathname,
    href: () => browser.location.href,
    push: (path) => {
      written += 1;
      browser.history.pushState({ hyperHistoryIndex: ++index }, '', path);
    },
    replace: (path) => {
      written += 1;
      browser.history.replaceState({ hyperHistoryIndex: index }, '', path);
    },
    onPopState: (listener) => {
      /**
       * The deltas of the rewinds issued and not yet arrived, oldest first.
       * The browser is returning to the entry at `index` while any remain.
       */
      let rewinds: number[] = [];
      /** The entry the browser last arrived at while returning. */
      let at = index;
      /** Counts kept traversals, so a late hold can tell whether it is still the latest. */
      let traversal = 0;
      const rewind = (delta: number): void => {
        rewinds.push(delta);
        browser.history.go(delta);
      };
      /** Issue one more rewind whenever the outstanding ones would land anywhere but `index`. */
      const correct = (): void => {
        const landing = rewinds.reduce((entry, outstanding) => entry + outstanding, at);
        if (landing !== index) rewind(index - landing);
      };
      /** Return the browser from the entry at `arrived` to the entry at `from`. */
      const hold = (from: number, arrived: number): void => {
        index = from;
        at = arrived;
        correct();
      };
      /** Ask the listener about the arrival at the entry numbered `next`. */
      const arrive = (next: number): void => {
        const from = index;
        const answer = listener();
        if (answer === false) {
          if (next !== from) hold(from, next);
          return;
        }
        keep(from, next, answer);
      };
      /**
       * Keep the traversal from the entry at `from` to the entry at `next`,
       * holding it on a late `false` while no later traversal has been kept and
       * no entry written. A later traversal the listener held is returning the
       * browser to `next`, so the late hold retargets that return at `from`.
       */
      const keep = (
        from: number,
        next: number,
        answer: undefined | Promise<undefined | false>,
      ): void => {
        index = next;
        const kept = ++traversal;
        const unwritten = written;
        if (answer === undefined) return;
        void answer.then((late) => {
          if (
            late === false &&
            kept === traversal &&
            unwritten === written &&
            index === next &&
            next !== from
          ) {
            hold(from, rewinds.length === 0 ? next : at);
          }
        });
      };
      /**
       * Steer a return by the arrival at the entry numbered `next`. The browser
       * applies the rewinds in the order they were issued, among the
       * traversals the reader queued before or between them, and a rewind a
       * reader's traversal has pushed past either end arrives nowhere. So an
       * arrival whose delta matches an outstanding rewind is taken to be the
       * oldest such rewind, settling the rewinds older than it; any other
       * arrival is the reader's, and is asked about like any traversal, ending
       * the return unless the listener holds it. One more rewind is issued
       * whenever the rewinds still outstanding would land anywhere but `index`.
       * Two traversals with the same delta move the browser alike, so mistaking
       * one for the other is corrected by the next arrival.
       */
      const steer = (next: number): void => {
        const delta = next - at;
        at = next;
        const arrived = rewinds.indexOf(delta);
        if (arrived >= 0) rewinds = rewinds.slice(arrived + 1);
        else {
          const answer = listener();
          if (answer !== false) {
            rewinds = [];
            keep(index, next, answer);
            return;
          }
        }
        correct();
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
          if (rewinds.length > 0) {
            rewinds = [];
            return;
          }
          browser.history.replaceState({ hyperHistoryIndex: index + 1 }, '', browser.location.href);
          arrive(index + 1);
          return;
        }
        const next = position.hyperHistoryIndex;
        if (rewinds.length > 0) {
          steer(next);
          return;
        }
        arrive(next);
      };
      browser.addEventListener('popstate', popped);
      return () => browser.removeEventListener('popstate', popped);
    },
  };
}
