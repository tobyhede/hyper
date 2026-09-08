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
  isAggregateInvariant,
  type AggregateLoadResult,
  type HyperProblemCode,
} from '@project/persistence';
import type { UUID } from '@project/core';
import type { SpaceRepository } from '../persistence/space-repository';

export type SpaceHostApplication = SpaceHttpApp & ProductRequestResolver;

const escapeHtml = (value: string): string =>
  value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

const problem = (
  code: Extract<
    HyperProblemCode,
    | 'invalid-request'
    | 'not-found'
    | 'method-not-allowed'
    | 'persistence-unavailable'
    | 'internal-error'
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
 * Read the aggregate, and read it again before letting one invariant failure
 * stand as the answer.
 *
 * One `AggregateInvariantError` is not proof of broken stored state. It is also
 * what a healthy repository shows for an instant: `loadAggregate` runs at READ
 * COMMITTED and reads in two statements, so a rival host committing between them
 * is reported as Spaces without Meta. Two hosts against one fresh database is
 * the ordinary way to see it — a dev server and `test:integration:postgres`.
 *
 * Start-up's retry already required two consecutive failures for exactly this
 * reason (`src/startup/database-startup.ts`). Drawing a permanent 500 from the
 * first left the two halves classifying the same error differently, and told a
 * browser its database was broken when a reload would have redirected. The
 * second read costs a full aggregate read, and only on a path that has already
 * failed one.
 */
const readAggregate = async (repository: SpaceRepository): Promise<AggregateLoadResult> => {
  try {
    return await repository.loadAggregate();
  } catch (error) {
    if (!isAggregateInvariant(error)) throw error;
    return await repository.loadAggregate();
  }
};

/**
 * Compose API resources and the product paths the HTTP host owns before SPA
 * fallback.
 *
 * `newId` is the composition-owned identity source (ADR 0016), and it is the
 * host's only one. One thing the host composes mints: the API tree's
 * working-space loader durably initializes a stored layoutless Space on first
 * load (ADR 0079). So it is forwarded to `createSpaceHttpApp` rather than left
 * to that function's own default, which would reinstate the ambient generator
 * behind this composition's back — a host handed a deterministic minter would
 * then be random on load.
 *
 * The root address mints nothing. It used to establish the Meta Space when the
 * repository had none, which made two safe methods create durable authored
 * state; establishment is start-up's alone now, and start-up retries it
 * (`src/http/postgres-http-runtime.ts`).
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
      // Space, and reading is the whole of it. `GET` and `HEAD` are both safe
      // methods, so neither may create durable authored state — this used to
      // establish the Meta Space here, minting four identities and writing two
      // rows for a request that promised to change nothing.
      let loaded: AggregateLoadResult;
      try {
        loaded = await readAggregate(repository);
      } catch (error) {
        // The reason travels to the operator rather than in the answer. The
        // detail is fixed prose like every other one here, so whatever a driver
        // put in its message is not served to an unauthenticated client.
        console.error('Failed to read the Meta Space', error);
        // Two unrelated failures, told apart by type rather than by matching
        // message prose (`isAggregateInvariant`, which walks the cause chain
        // the driver wraps a failed rollback in). Contradictory stored state —
        // Spaces without Meta, an aggregate that fails complete intake, or a
        // stored document that does not parse — is a defect this deployment
        // carries and no retry cures, so it is a 500. Anything else is the
        // database being unreachable, which is temporary, and 503 says so.
        //
        // `GET /api/aggregate` answers 503 for the unreachable arm too, and the
        // two halves agree there and only there: that handler answers 503 for
        // *every* throw out of `loadAggregate`, an invariant violation included,
        // because it classifies nothing (`packages/http/src/index.ts`). So it is
        // not the precedent for this branch — it is the half that still cannot
        // say a stored aggregate is broken, and fixing it is not this ticket's.
        // The identity it would need is now on the shared seam and reachable
        // from there, which is the half of it this ticket could settle.
        return isAggregateInvariant(error)
          ? problem('internal-error', 'Stored repository state is not usable.', accept)
          : problem('persistence-unavailable', 'Try the request again later.', accept);
      }
      if (loaded.kind === 'uninitialized') {
        // Healthy, and nothing to redirect to yet. 503 because it is the only
        // one of these that claims something true: 404 says the root is missing
        // when it is not, 500 says a defect where there is none, and 302 needs
        // a Space id that does not exist. So this case and an unreachable
        // database share a status, and the detail is what separates them —
        // ticket 21 asked for one status each, and there is no second status in
        // `ProductResponse` that is true of this state.
        //
        // The wait is literal rather than a hedge: a host reaches here only by
        // failing to establish at start-up, and start-up retries without an
        // attempt bound, so the condition ends without anything the client does.
        return problem(
          'persistence-unavailable',
          'No Meta Space has been established yet.',
          accept,
        );
      }
      // No second read proves the Space is there. Reading the aggregate has
      // already read and validated every stored document to answer at all, and
      // its Meta identity is the id the repository state names under its
      // restraining foreign key, so it names a Space that exists — and the
      // redirect target's first act is to load that very Space anyway, which is
      // where a Space that vanished between the two would be answered exactly
      // as any other missing Space is.
      return {
        status: 302,
        headers: {
          location: productDestinationPath({
            kind: 'space',
            spaceId: loaded.aggregate.metaSpaceId,
          }),
        },
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
