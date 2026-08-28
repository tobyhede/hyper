import { HttpSpaceBackend } from '@project/http';
import type { SpaceBackend } from '@project/persistence';
import { openStoredSpace } from './open-space';
import {
  decodeCompactUuid,
  parseSpaceViewDestination,
  resolveSpaceViewDestination,
} from '@project/core';
import type { OpenedApplicationStartup } from './startup';

export type { OpenedSpace } from './open-space';

export interface SpaceStartup {
  resolve(pathname: string): Promise<OpenedApplicationStartup>;
}

/** Compose browser startup around one fixed persistence backend. */
export const createSpaceStartup = (
  backend: SpaceBackend = new HttpSpaceBackend(),
): SpaceStartup => ({
  resolve: async (pathname) => {
    const view = parseSpaceViewDestination(pathname);
    const compactId =
      /^\/spaces\/([^/]+)$/.exec(pathname)?.[1] ??
      (pathname.startsWith('/') ? undefined : pathname);
    const id = view.kind === 'parsed' ? view.spaceId : decodeCompactUuid(compactId ?? '');
    if (id === undefined) throw new Error('The Space URL contains an invalid id.');
    const opened = await openStoredSpace(backend, id);
    if (view.kind === 'malformed') return { kind: 'opened', opened };
    const resolution = resolveSpaceViewDestination(
      opened.spaceSession.getState().working,
      pathname,
    );
    if (resolution.kind !== 'resolved') throw new Error('The Space View URL does not resolve.');
    return { kind: 'opened', opened, selection: resolution.spaceViewId };
  },
});
