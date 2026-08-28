import {
  createSpaceHttpApp,
  productDestinationPath,
  resolveProductDestination,
  type SpaceHttpApp,
} from '@project/http';
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
        headers: { location: productDestinationPath({ kind: 'space', spaceId: entrySpaceId }) },
      };
    }

    const resolution = await resolveProductDestination(repository, pathname);
    switch (resolution.kind) {
      case 'outside':
      case 'resolved':
        return undefined;
      case 'malformed':
        return problem(400, 'Invalid product URL');
      case 'unresolved':
        return problem(404, 'Product destination not found');
    }
  };
  return Object.assign(api, { resolveProductRequest });
};
