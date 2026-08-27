import { decodeCompactUuid, encodeCompactUuid } from '@project/core';
import { createSpaceHttpApp, type SpaceHttpApp } from '@project/http';
import type { SpaceRepository } from '../persistence/space-repository';

export interface ProductResponse {
  status: 302 | 400 | 404;
  headers?: Readonly<Record<string, string>>;
  body?: string;
}

export type SpaceHostApplication = SpaceHttpApp & {
  resolveProductRequest(pathname: string): Promise<ProductResponse | undefined>;
};

const problem = (status: 400 | 404, body: string): ProductResponse => ({ status, body });

/** Compose API resources and the product paths the HTTP host owns before SPA fallback. */
export const createSpaceHost = (repository: SpaceRepository): SpaceHostApplication => {
  const api = createSpaceHttpApp(repository);
  const resolveProductRequest = async (pathname: string): Promise<ProductResponse | undefined> => {
    if (pathname === '/') {
      const entrySpaceId = await repository.entrySpaceId();
      if (entrySpaceId === undefined) return problem(404, 'Entry Space not found');
      if ((await repository.loadSpace(entrySpaceId)) === undefined) {
        return problem(404, 'Entry Space not found');
      }
      return {
        status: 302,
        headers: { location: `/spaces/${encodeCompactUuid(entrySpaceId)}` },
      };
    }

    if (!pathname.startsWith('/spaces')) return undefined;
    const match = /^\/spaces\/([^/]+)$/.exec(pathname);
    if (match === null) return problem(400, 'Invalid Space URL');
    const compactId = match[1];
    if (compactId === undefined) return problem(400, 'Invalid Space URL');
    const spaceId = decodeCompactUuid(compactId);
    if (spaceId === undefined) return problem(400, 'Invalid Space id');
    if ((await repository.loadSpace(spaceId)) === undefined) {
      return problem(404, 'Space not found');
    }
    return undefined;
  };
  return Object.assign(api, { resolveProductRequest });
};
