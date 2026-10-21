import { mapSource } from '@project/aggregate';
import type { UUID } from '@project/core';
import {
  productAddress,
  productDestinationPath,
  resolveProductDestination,
  type HttpSpaceBackend,
} from '@project/http';
import type { HistoryApi } from '../browser-location';
import type { PresentationLinks } from '../presentation-link';
import type { Fullscreen } from '../presenting-fullscreen';
import { carriedAddress } from '../source-parameter';
import { browserImageSources, createSpaceStartup, type SpaceStartup } from '../space';
import {
  formatGitHubLocation,
  type GitHubLocation,
  type ResolvedGitHubLocation,
} from './github-location';
import { describeGitHubSourceFailure, readGitHubLocation } from './github-source';
import { pinSource } from './mount-source';
import { describeMountRefusal, mountAggregate, type AggregateMount } from './mount';

/**
 * Everything a mounted startup is composed with. Every seam is required: the
 * entry that composes one names the page's own adapters, and a test names its
 * own, a `fetch` answering GitHub's requests from files among them.
 */
export interface MountedStartupOptions extends Pick<AggregateMount, 'newId' | 'createObjectUrl'> {
  /** The GitHub location to mount, as `resolveMountSource` answered it. */
  readonly location: GitHubLocation;
  /** Reaches GitHub (ADR 0109): the page's own `fetch`. */
  readonly fetch: typeof globalThis.fetch;
  readonly fullscreen: Fullscreen;
  /**
   * The presentation links of the mounted revision, given its scope: the
   * complete resolved location, which `createBrowserPresentationLinks` takes
   * as `scope` (ADR 0130). Called once, after the location resolves.
   */
  readonly presentations: (scope: string) => PresentationLinks;
  /** The session's one history, which the mount pins its source into. */
  readonly history: HistoryApi;
}

interface Mounted {
  readonly startup: SpaceStartup;
  readonly backend: HttpSpaceBackend;
  readonly metaSpaceId: UUID;
  /** The complete resolved location, as `source` names it. */
  readonly pinned: string;
  readonly resolved: ResolvedGitHubLocation;
}

/**
 * Browser startup over a GitHub location mounted in the page (ADR 0130): the
 * location is read and mounted once, on the first resolve that succeeds, and the
 * application then opens over the mounted backend exactly as it opens over a
 * host.
 *
 * A GitHub failure or an aggregate refusal is thrown with its sentence, so the
 * application's own startup failure shows it. Once mounted, the address names
 * the complete resolved location in `source`, so a reload, a copied link and a
 * Notes window read the same commit. The root resolves here, in the client, to
 * the Meta Space's address, as the Space host's redirect does on a server, and
 * the one write that moves the address there pins the source as well. An
 * address that names nothing opens the Meta Space under the application's
 * "not found" report, where a server would answer 404.
 */
export const createMountedStartup = (options: MountedStartupOptions): SpaceStartup => {
  const { history } = options;
  let mounting: Promise<Mounted> | undefined;
  const mount = (): Promise<Mounted> => {
    if (mounting !== undefined) return mounting;
    const attempt = (async () => {
      const read = await readGitHubLocation(options.location, options.fetch);
      if (!read.ok) throw new Error(describeGitHubSourceFailure(read.failure));
      const pinned = formatGitHubLocation(read.aggregate.location);
      const result = await mountAggregate({
        source: mapSource(pinned, read.aggregate.files),
        newId: options.newId,
        createObjectUrl: options.createObjectUrl,
      });
      if (!result.ok) throw new Error(describeMountRefusal(result.refusal, pinned));
      const { backend, displayImage, metaSpaceId } = result.mounted;
      const startup = createSpaceStartup(
        options.fullscreen,
        options.presentations(pinned),
        backend,
        options.newId,
        history,
        browserImageSources(backend, displayImage),
        displayImage,
        { mounted: true },
      );
      return { startup, backend, metaSpaceId, pinned, resolved: read.aggregate.location };
    })();
    mounting = attempt;
    // A failed read or a refusal is not kept, so a later resolve reads again.
    void attempt.catch(() => {
      mounting = undefined;
    });
    return attempt;
  };
  return {
    resolve: async (pathname) => {
      const { startup, backend, metaSpaceId, pinned, resolved } = await mount();
      const meta = productDestinationPath({ kind: 'space', spaceId: metaSpaceId });
      // A static host may serve the application at `/index.html` as well as
      // at the root, and both mean the root.
      if (pathname === '/' || pathname === '/index.html') {
        history.replace(carriedAddress(meta, history.href(), pinned));
        return await startup.resolve(meta);
      }
      pinSource(history, resolved);
      // A Notes window follows a presenting window, so one over a missing
      // Space has nothing to follow and fails startup as it does on a host.
      const address = productAddress(pathname);
      if (address.kind === 'addressed' && address.destination.kind === 'notes') {
        return await startup.resolve(pathname);
      }
      const resolution = await resolveProductDestination(
        { loadSpace: (spaceId) => backend.loadSpace(spaceId) },
        pathname,
      );
      if (resolution.kind === 'resolved') return await startup.resolve(pathname);
      // A static host answers every path with the application, so an address
      // that names nothing is answered here: the Meta Space, with the
      // application's "not found" report over it and the address left as the
      // reader typed it, until their first move corrects it.
      const result = await startup.resolve(meta);
      if (result.kind === 'opened') result.spaces.browserLocation.reportArrivalNotFound();
      return result;
    },
  };
};
