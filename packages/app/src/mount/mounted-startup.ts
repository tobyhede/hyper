import type { UUID } from '@project/core';
import { productDestinationPath } from '@project/http';
import type { HistoryApi } from '../browser-location';
import type { PresentationLinks } from '../presentation-link';
import type { Fullscreen } from '../presenting-fullscreen';
import { browserImageSources, createSpaceStartup, type SpaceStartup } from '../space';
import { describeMountRefusal, mountAggregate, type AggregateMount } from './mount';

/**
 * Everything a mounted startup is composed with. Every seam is required: the
 * entry that composes one names the page's own adapters, and a test names its
 * own.
 */
export interface MountedStartupOptions extends AggregateMount {
  readonly fullscreen: Fullscreen;
  readonly presentations: PresentationLinks;
  readonly history: HistoryApi;
}

/**
 * Browser startup over a mounted aggregate (ADR 0130): the files are mounted
 * once, on the first resolve, and the application then opens over the mounted
 * backend exactly as it opens over a host.
 *
 * A refusal is thrown with the CLI's sentence and diagnostics, so the
 * application's own startup failure shows it. The root resolves here, in the
 * client, to the Meta Space's address, as the Space host's redirect does on a
 * server, and the address is moved there as that redirect moves it.
 */
export const createMountedStartup = (options: MountedStartupOptions): SpaceStartup => {
  let mounting: Promise<{ readonly startup: SpaceStartup; readonly metaSpaceId: UUID }> | undefined;
  const mount = () =>
    (mounting ??= mountAggregate(options).then((result) => {
      if (!result.ok) throw new Error(describeMountRefusal(result.refusal, options.name));
      const { backend, displayImage, metaSpaceId } = result.mounted;
      const startup = createSpaceStartup(
        options.fullscreen,
        options.presentations,
        backend,
        options.newId,
        options.history,
        browserImageSources(backend, displayImage),
        displayImage,
        { mounted: true },
      );
      return { startup, metaSpaceId };
    }));
  return {
    resolve: async (pathname) => {
      const { startup, metaSpaceId } = await mount();
      if (pathname !== '/') return await startup.resolve(pathname);
      const meta = productDestinationPath({ kind: 'space', spaceId: metaSpaceId });
      options.history.replace(meta);
      return await startup.resolve(meta);
    },
  };
};
