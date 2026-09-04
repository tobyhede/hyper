import {
  createSpaceHttpApp,
  productAddress,
  productDestinationPath,
  resolveProductDestination,
  type ProductRequestResolver,
  type ProductResponse,
  type SpaceHttpApp,
} from '@project/http';
import {
  encodeProblemDetails,
  problemCatalogue,
  type HyperProblemCode,
} from '@project/persistence';
import type { SpaceRepository } from '../persistence/space-repository';

export type SpaceHostApplication = SpaceHttpApp & ProductRequestResolver;

const escapeHtml = (value: string): string =>
  value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

const problem = (
  code: Extract<
    HyperProblemCode,
    'invalid-request' | 'not-found' | 'method-not-allowed' | 'internal-error'
  >,
  detail: string,
  accept?: string,
): ProductResponse => {
  const catalogue = problemCatalogue[code];
  if (accept?.split(',').some((media) => media.trim().split(';')[0] === 'text/html') === true) {
    return {
      status: catalogue.status,
      headers: { 'content-type': 'text/html; charset=utf-8' },
      body: `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(catalogue.title)}</title></head><body><main><h1>${escapeHtml(catalogue.title)}</h1><p>${escapeHtml(detail)}</p></main></body></html>`,
    };
  }
  return {
    status: catalogue.status,
    headers: { 'content-type': 'application/problem+json' },
    body: JSON.stringify(encodeProblemDetails(code, detail)),
  };
};

/**
 * What a product address serves. Reading one is the whole of it: everything
 * that changes a Space is a Space Edit committed through the API, so no product
 * URL has ever taken a body.
 */
const PRODUCT_METHODS = 'GET, HEAD';

const methodNotAllowed = (accept?: string): ProductResponse => {
  const response = problem('method-not-allowed', 'Use GET or HEAD for a product URL.', accept);
  return { ...response, headers: { ...response.headers, allow: PRODUCT_METHODS } };
};

/** Compose API resources and the product paths the HTTP host owns before SPA fallback. */
export const createSpaceHost = (repository: SpaceRepository): SpaceHostApplication => {
  const api = createSpaceHttpApp(repository);
  const resolveProductRequest = async (
    pathname: string,
    method: string,
    accept?: string,
  ): Promise<ProductResponse | undefined> => {
    const reads = method === 'GET' || method === 'HEAD';
    if (pathname === '/') {
      if (!reads) return methodNotAllowed(accept);
      const entrySpaceId = await repository.entrySpaceId();
      if (entrySpaceId === undefined)
        return problem('not-found', 'Choose an Entry Space that exists.', accept);
      // The document is not read to prove it is there. `entrySpaceId` is the id
      // of the row carrying the Entry Space flag, so it names a Space that
      // exists — and the redirect target's first act is to load that very Space
      // anyway, which is where a Space that vanished between the two would be
      // answered exactly as any other missing Space is.
      return {
        status: 302,
        headers: { location: productDestinationPath({ kind: 'space', spaceId: entrySpaceId }) },
      };
    }

    // These are web addresses and a direct request carries real HTTP semantics
    // (ADR 0069), so a method the contract does not serve is answered here
    // rather than left to the SPA fallback — which handed back the application
    // shell with a 200 for the very URL GET answers 400.
    //
    // Identity first and method second, the shape `unservedContractPath`
    // already gives the API tree: an address that cannot be read is the same
    // 400 whatever the method, and only a readable one is worth an `Allow`.
    // Nothing is loaded to decide either, because no Space could change them.
    if (!reads) {
      const address = productAddress(pathname);
      if (address.kind === 'outside') return undefined;
      return address.kind === 'malformed'
        ? problem('invalid-request', 'Use a valid product URL.', accept)
        : methodNotAllowed(accept);
    }

    const resolution = await resolveProductDestination(repository, pathname);
    switch (resolution.kind) {
      case 'outside':
      case 'resolved':
        return undefined;
      case 'malformed':
        return problem('invalid-request', 'Use a valid product URL.', accept);
      case 'unresolved':
        return problem('not-found', 'Choose a product destination that exists.', accept);
    }
  };
  return Object.assign(api, { resolveProductRequest });
};
