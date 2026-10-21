import { HttpSpaceBackend, productAddress } from '@project/http';
import { loadSpaceSnapshot, type Space } from '@project/graph';
import { newUuid, type ImageNaturalSize, type UUID } from '@project/core';
import type { SpaceBackend } from '@project/persistence';
import { displayImageAsAuthored, type ImageDisplay } from '@project/ui';
import type { HistoryApi } from './browser-location';
import { createBrowserHistory } from './browser-history';
import { pickImagesInBrowser } from './browser-file-picker';
import type { ImageSources } from './image-creation';
import type { Fullscreen } from './presenting-fullscreen';
import type { PresentationLinks } from './presentation-link';
import type { ApplicationStartupResult } from './startup';
import { createNotesWindow } from './notes-window';
import { createOpenSpaces, type OpenSpaces } from './open-spaces';

export type { OpenSpace } from './open-spaces';

export interface SpaceStartup {
  resolve(pathname: string): Promise<ApplicationStartupResult>;
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

/**
 * The host's image store over HTTP, and the browser measuring what it loads and
 * choosing files. A picture is measured where `displayImage` draws it from, so
 * a measurement loads what the Resource will show.
 */
export const browserImageSources = (
  host: HttpSpaceBackend = new HttpSpaceBackend(),
  displayImage: ImageDisplay = displayImageAsAuthored,
): ImageSources => ({
  store: (image) => host.storeImage(image),
  measure: (url) => measureInBrowser(displayImage(url)),
  pick: pickImagesInBrowser,
});

/**
 * Compose browser startup around one fixed persistence backend.
 *
 * `fullscreen` and `presentations` are required with no default: `main.tsx`
 * names `document`, `window` and `BroadcastChannel` and hands each to its one
 * adapter, and a test supplies hosts of its own.
 *
 * The other five seams default together and for one reason: this is the composition
 * root, and it is where the ambient browser, the ambient generator and the real
 * transport — for Spaces and for images — are named. Everything below takes each of them required.
 *
 * `displayImage` is where a picture is drawn from; a host serves its own stored
 * images, so the default draws every URL as authored, and a mounted aggregate
 * supplies its own (ADR 0130, `mount/mounted-startup.ts`).
 *
 * `session.mounted` says the session is Mounting an aggregate (ADR 0130), so
 * every Space it opens marks its Edits as lost on reload (ADR 0131). It is named rather than positional, and
 * defaults to `false`: only a mount composition sets it.
 */
export const createSpaceStartup = (
  fullscreen: Fullscreen,
  presentations: PresentationLinks,
  backend: SpaceBackend = new HttpSpaceBackend(),
  newId: () => UUID = newUuid,
  history: HistoryApi = browserHistory(),
  images: ImageSources = browserImageSources(),
  displayImage: ImageDisplay = displayImageAsAuthored,
  { mounted = false }: { readonly mounted?: boolean } = {},
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
        fullscreen,
        presentations,
        mounted,
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
      const address = productAddress(pathname);
      if (address.kind === 'addressed' && address.destination.kind === 'notes') {
        const { spaceId } = address.destination;
        const load = async (): Promise<Space | undefined> => {
          const loaded = await backend.loadSpace(spaceId);
          if (loaded === undefined) return undefined;
          const read = loadSpaceSnapshot(loaded.snapshot);
          if (!read.ok) throw new Error(read.errors.map((error) => error.message).join('; '));
          return read.space;
        };
        const space = await load();
        if (space === undefined) throw new Error('The product URL does not resolve.');
        return {
          kind: 'notes',
          notes: createNotesWindow({
            spaceId,
            space,
            reload: load,
            links: presentations,
            reportObserverError: (error) => console.error('Notes window observer failed', error),
          }),
          now: presentations.now,
          displayImage,
        };
      }
      const spaces = await openSpaces();
      const { opened, opening } = await spaces.openPath(pathname);
      return {
        kind: 'opened',
        opened,
        spaces,
        opening,
        displayImage,
      };
    },
  };
};
