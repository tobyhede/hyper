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
import type { UUID } from '@project/core';
import type { SpaceRepository } from '../persistence/space-repository';
import { establishMetaSpace } from '../startup/database-startup';

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

/**
 * Compose API resources and the product paths the HTTP host owns before SPA
 * fallback.
 *
 * `newId` is the composition-owned identity source (ADR 0016), and it is the
 * host's only one. Two things the host composes mint: the root address
 * establishes the Meta Space when the repository has none, and the API tree's
 * working-space loader durably initializes a stored layoutless Space on first
 * load (ADR 0079). So it is forwarded to `createSpaceHttpApp` rather than left
 * to that function's own default, which would reinstate the ambient generator
 * for the second of them behind this composition's back — a host handed a
 * deterministic minter would then be deterministic at the root and random on
 * load.
 */
export const createSpaceHost = (
  repository: SpaceRepository,
  newId: () => UUID,
): SpaceHostApplication => {
  const api = createSpaceHttpApp(repository, { newId });
  const resolveProductRequest = async (
    pathname: string,
    method: string,
    accept?: string,
  ): Promise<ProductResponse | undefined> => {
    const reads = method === 'GET' || method === 'HEAD';
    if (pathname === '/') {
      if (!reads) return methodNotAllowed(accept);
      // Opening the application without another destination opens the Meta
      // Space, and an uninitialized repository is initialized here rather than
      // redirected to nothing. A failure to establish it is reported as an
      // answer instead of being papered over with a redirect or a guess at
      // which Space was meant.
      let metaSpaceId: UUID;
      try {
        metaSpaceId = await establishMetaSpace(repository, newId);
      } catch (error) {
        // What failed is not something this can tell. Contradictory stored Meta
        // state — Spaces without Meta, or an aggregate that fails complete
        // intake — and a database that is simply unreachable both arrive here as
        // an ordinary `Error`, so classifying them would mean reading the
        // message, and the wire behaviour would turn on prose. Neither is
        // claimed, and the answer is the one `@project/http` already gives for a
        // request failure it cannot classify: the catalogued title with `Try the
        // request again later.` as its detail.
        //
        // A transient outage would be better answered by the 503
        // `persistence-unavailable` `GET /api/aggregate` gives for this very
        // throw, and telling the two apart is worth doing — but that wants the
        // repository raising an identifiable invariant error rather than a host
        // matching on text, and `ProductResponse`'s closed status set does not
        // admit 503.
        //
        // The reason travels to the operator rather than in the answer. The
        // detail is fixed prose like every other one here, so whatever a driver
        // put in its message is not served to an unauthenticated client.
        console.error('Failed to establish the Meta Space', error);
        return problem('internal-error', 'Try the request again later.', accept);
      }
      // No second read proves the Space is there. Establishment has already read
      // and validated every stored document to answer at all, and `metaSpaceId`
      // is the id the repository state names under its restraining foreign key,
      // so it names a Space that exists — and the redirect target's first act is
      // to load that very Space anyway, which is where a Space that vanished
      // between the two would be answered exactly as any other missing Space is.
      return {
        status: 302,
        headers: { location: productDestinationPath({ kind: 'space', spaceId: metaSpaceId }) },
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
