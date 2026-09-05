import { HttpSpaceBackend } from '@project/http';
import { newUuid, type UUID } from '@project/core';
import type { SpaceBackend } from '@project/persistence';
import type { HistoryApi } from './browser-location';
import type { OpenedApplicationStartup } from './startup';
import { createOpenSpaces, type OpenSpaces } from './open-spaces';

export type { OpenSpace } from './open-spaces';

export interface SpaceStartup {
  resolve(pathname: string): Promise<OpenedApplicationStartup>;
}

/**
 * The one adapter over the real browser (ADR 0081).
 *
 * `window.history` and `window.location` are named here and in `main.tsx`, and
 * nowhere else in `packages/app/src`: everything above this takes
 * {@link HistoryApi}, which is what makes the rules that decide a history entry
 * testable without a DOM.
 */
const browserHistory = (): HistoryApi => ({
  pathname: () => window.location.pathname,
  href: () => window.location.href,
  push: (path) => window.history.pushState(null, '', path),
  replace: (path) => window.history.replaceState(null, '', path),
  onPopState: (listener) => {
    window.addEventListener('popstate', listener);
    return () => window.removeEventListener('popstate', listener);
  },
});

/**
 * Compose browser startup around one fixed persistence backend.
 *
 * The three seams default together and for one reason: this is the composition
 * root, and it is where the ambient browser, the ambient generator and the real
 * transport are named. Everything below takes each of them required.
 */
export const createSpaceStartup = (
  backend: SpaceBackend = new HttpSpaceBackend(),
  newId: () => UUID = newUuid,
  history: HistoryApi = browserHistory(),
): SpaceStartup => {
  let owner: Promise<OpenSpaces> | undefined;
  const openSpaces = (): Promise<OpenSpaces> => {
    if (owner !== undefined) return owner;
    const opening = backend.loadAggregate().then((result) => {
      if (result.kind === 'uninitialized')
        throw new Error('The Space repository is uninitialized.');
      return createOpenSpaces({
        backend,
        metaSpaceId: result.aggregate.metaSpaceId,
        newId,
        history,
      });
    });
    owner = opening;
    // A failed attempt is not the owner. Retaining the rejected promise would
    // answer every later startup with the first transport error, so the memo
    // holds only an owner that exists.
    void opening.catch(() => {
      if (owner === opening) owner = undefined;
    });
    return opening;
  };
  return {
    resolve: async (pathname) => {
      const spaces = await openSpaces();
      const { opened, opening } = await spaces.openPath(pathname);
      return {
        kind: 'opened',
        opened,
        spaces,
        opening,
        browserLocation: spaces.browserLocation,
      };
    },
  };
};
