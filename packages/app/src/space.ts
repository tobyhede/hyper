import { HttpSpaceBackend } from '@project/http';
import { newUuid, type ImageNaturalSize, type UUID } from '@project/core';
import type { SpaceBackend } from '@project/persistence';
import type { HistoryApi } from './browser-location';
import { createBrowserHistory } from './browser-history';
import type { ImageSources } from './image-creation';
import type { OpenedApplicationStartup } from './startup';
import { createOpenSpaces, type OpenSpaces } from './open-spaces';

export type { OpenSpace } from './open-spaces';

export interface SpaceStartup {
  resolve(pathname: string): Promise<OpenedApplicationStartup>;
}

/**
 * The one adapter over the real browser (ADR 0081).
 *
 * The native history adapter lives in `browser-history.ts`; everything above this takes
 * {@link HistoryApi}, which is what makes the rules that decide a history entry
 * testable without a DOM.
 */
const browserHistory = (): HistoryApi => createBrowserHistory(window);

/** How long a picture may take to load before it is taken as one that did not. */
const MEASURE_TIMEOUT_MS = 10_000;

/**
 * The browser loading a picture to learn its natural size (ADR 0106): the one
 * place the application builds an `Image`. A picture that errors, never
 * answers, or has no intrinsic size answers `undefined`.
 */
const measureInBrowser = (url: string): Promise<ImageNaturalSize | undefined> =>
  new Promise((resolve) => {
    const picture = new Image();
    const settle = (size: ImageNaturalSize | undefined): void => {
      clearTimeout(timer);
      picture.onload = null;
      picture.onerror = null;
      resolve(size);
    };
    const timer = setTimeout(() => settle(undefined), MEASURE_TIMEOUT_MS);
    picture.onload = () => {
      const { naturalWidth: width, naturalHeight: height } = picture;
      settle(width > 0 && height > 0 ? { width, height } : undefined);
    };
    picture.onerror = () => settle(undefined);
    picture.src = url;
  });

/** The host's image store over HTTP, and the browser measuring what it loads. */
const browserImageSources = (): ImageSources => {
  const host = new HttpSpaceBackend();
  return {
    store: (image) => host.storeImage(image),
    measure: measureInBrowser,
  };
};

/**
 * Compose browser startup around one fixed persistence backend.
 *
 * The four seams default together and for one reason: this is the composition
 * root, and it is where the ambient browser, the ambient generator and the real
 * transport — for Spaces and for images — are named. Everything below takes each of them required.
 */
export const createSpaceStartup = (
  backend: SpaceBackend = new HttpSpaceBackend(),
  newId: () => UUID = newUuid,
  history: HistoryApi = browserHistory(),
  images: ImageSources = browserImageSources(),
): SpaceStartup => {
  let owner: Promise<OpenSpaces> | undefined;
  const openSpaces = (): Promise<OpenSpaces> => {
    if (owner !== undefined) return owner;
    const opening = backend.loadAggregate().then((result) => {
      if (result.kind === 'uninitialized')
        throw new Error('The Space repository is uninitialized.');
      const { metaSpaceId, spaces } = result.aggregate;
      const meta = spaces.find(({ snapshot }) => snapshot.id === metaSpaceId);
      if (meta === undefined) throw new Error('The loaded aggregate does not hold its Meta Space.');
      return createOpenSpaces({
        backend,
        metaSpaceId,
        metaSpaceTitle: meta.snapshot.document.title,
        newId,
        history,
        images,
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
      };
    },
  };
};
