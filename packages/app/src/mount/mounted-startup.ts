import type { UUID } from '@project/core';
import { productDestinationPath } from '@project/http';
import type { HistoryApi } from '../browser-location';
import type { PresentationLinks } from '../presentation-link';
import type { Fullscreen } from '../presenting-fullscreen';
import { withSource } from '../source-parameter';
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
  readonly metaSpaceId: UUID;
  /** The complete resolved location, as `source` names it. */
  readonly pinned: string;
  readonly resolved: ResolvedGitHubLocation;
}

/**
 * Browser startup over a GitHub location mounted in the page (ADR 0130): the
 * location is read and mounted once, on the first resolve, and the
 * application then opens over the mounted backend exactly as it opens over a
 * host.
 *
 * A GitHub failure or an aggregate refusal is thrown with its sentence, so the
 * application's own startup failure shows it. Once mounted, the address names
 * the complete resolved location in `source`, so a reload, a copied link and a
 * Notes window read the same commit. The root resolves here, in the client, to
 * the Meta Space's address, as the Space host's redirect does on a server, and
 * the one write that moves the address there pins the source as well.
 */
export const createMountedStartup = (options: MountedStartupOptions): SpaceStartup => {
  const { history } = options;
  let mounting: Promise<Mounted> | undefined;
  const mount = (): Promise<Mounted> =>
    (mounting ??= (async () => {
      const read = await readGitHubLocation(options.location, options.fetch);
      if (!read.ok) throw new Error(describeGitHubSourceFailure(read.failure));
      const pinned = formatGitHubLocation(read.aggregate.location);
      const result = await mountAggregate({
        name: pinned,
        files: read.aggregate.files,
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
        true,
      );
      return { startup, metaSpaceId, pinned, resolved: read.aggregate.location };
    })());
  return {
    resolve: async (pathname) => {
      const { startup, metaSpaceId, pinned, resolved } = await mount();
      if (pathname !== '/') {
        pinSource(history, resolved);
        return await startup.resolve(pathname);
      }
      const meta = productDestinationPath({ kind: 'space', spaceId: metaSpaceId });
      history.replace(withSource(meta, pinned));
      return await startup.resolve(meta);
    },
  };
};
