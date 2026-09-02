import { newUuid, uuidSchema, type UUID } from '@project/core';
import {
  decodeCommitRequest,
  encodeCommitConflict,
  encodeCommitRefusal,
  encodeCommitResponse,
  encodeLoadedAggregate,
  encodeProblemDetails,
  encodeLoadedSpace,
  createWorkingSpaceLoader,
  problemCatalogue,
  type HyperProblemCode,
  type ProblemError,
  type CommitRequestJson,
  type SpaceResourceRepository,
} from '@project/persistence';
import { parse as parseContentType } from 'content-type';
import { Hono, type Context, type Env } from 'hono';
import { createMiddleware } from 'hono/factory';
import { HTTPException } from 'hono/http-exception';
import { validator } from 'hono/validator';
import { hasValidUniqueMediaTypeParameters } from './media-type';

export {
  productAddress,
  productDestinationPath,
  resolveProductDestination,
  resolveProductDestinationInSnapshot,
  type ProductAddress,
  type ProductDestination,
  type ProductDestinationResolution,
  type ProductDestinationSnapshotResolution,
  type ProductRequestResolver,
  type ProductResponse,
} from './product-destination';

export { HttpSpaceBackend, NETWORK_FAILURE_MESSAGE } from './backend';
export type { HttpSpaceBackendOptions } from './backend';

export const MAX_COMMIT_BODY_BYTES = 1_048_576;

// Named so the route registration and the json validator's explicit path type
// cannot drift apart; the validator needs the literal to stay in the schema.
const SPACE_RESOURCE_PATH = '/api/spaces/:id';
const SPACE_COLLECTION_PATH = '/api/spaces';
const SPACE_AGGREGATE_PATH = '/api/aggregate';
// The resource path again as a matcher, for a request no route served. Hono has
// finished routing by then, so its own pattern is no longer available to ask,
// and this must keep matching what `SPACE_RESOURCE_PATH` registers.
const SPACE_RESOURCE_PATTERN = /^\/api\/spaces\/([^/]+)$/;

export interface SpaceHttpAppOptions {
  logError?: (message: string, error: unknown) => void;
  newId?: () => UUID;
}

const defaultLogError = (message: string, error: unknown): void => {
  console.error(message, error);
};

const invokeLogError = (
  logError: NonNullable<SpaceHttpAppOptions['logError']>,
  message: string,
  error: unknown,
): void => {
  try {
    logError(message, error);
  } catch (loggingFailure) {
    if (loggingFailure instanceof Error) {
      throw loggingFailure;
    }
    // Hono forwards Error instances to onError, but non-Error throws escape app.fetch().
  }
};

/**
 * How much of an oversized body is read and discarded so the connection stays
 * reusable. Reusing a persistent connection means consuming the whole message
 * body, and an honest client that overshoots the cap deserves its 413 on a
 * connection it can keep using. A client that just keeps sending does not: past
 * this allowance the drain stops, the body is left unconsumed and the host
 * drops the connection, which is the answer that costs us least.
 */
export const MAX_DRAINED_BODY_BYTES = MAX_COMMIT_BODY_BYTES * 8;

const problem = (
  context: Context,
  code: HyperProblemCode,
  detail: string,
  errors?: readonly ProblemError[],
) => {
  const body = encodeProblemDetails(code, detail, errors);
  const response = context.json(body, body.status);
  response.headers.set('Content-Type', 'application/problem+json');
  return response;
};

const rejectOversizedBody = (context: Context) =>
  problem(
    context,
    'payload-too-large',
    `Send a request body no larger than ${MAX_COMMIT_BODY_BYTES} bytes.`,
  );

/** Read and discard what is left, up to the allowance. Bytes are never buffered. */
const drainRejectedBody = async (
  reader: ReadableStreamDefaultReader<Uint8Array>,
): Promise<void> => {
  let drained = 0;
  try {
    while (drained < MAX_DRAINED_BODY_BYTES) {
      const { done, value } = await reader.read();
      if (done) return;
      drained += value.byteLength;
    }
  } catch {
    // A client that vanishes mid-drain costs its own connection, not our response.
  }
};

/**
 * One size policy: count the bytes that arrive, and never consult the declared
 * length. Hono's `bodyLimit` cannot serve here for two independent reasons.
 * It *trusts* `Content-Length` when present — comparing and returning without
 * reading a byte, so an understated length would smuggle any body through. And
 * on overflow it abandons a **locked** reader without consuming the rest, so
 * nothing downstream can drain the request: Node's own `_dump()` cannot resume a
 * stream the web wrapper holds, the socket dies with the 413, and a keep-alive
 * client loses the connection. Both are pinned by tests — the size cases in this
 * package, the connection reuse in `vite-hono-host.test.ts`.
 *
 * Draining on overflow is also what the superseded raw Node handler did: it
 * cleared its buffer and called `request.resume()` for exactly this reason.
 *
 * A declared-length pre-check sat here once and was dropped. It was never
 * required for the bound — counting catches an honest over-declaration too, only
 * later — and trusting the header meant a client could be answered 413 for a
 * body it had not sent. Measuring is the answer a lying header deserves. Do not
 * reintroduce it without first deciding what a dishonest length should mean.
 *
 * The cost is the fast path: every legitimate commit is buffered and re-read.
 */
const requireBoundedCommitBody = createMiddleware(async (context, next) => {
  const body = context.req.raw.body;
  if (body === null) {
    return next();
  }
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_COMMIT_BODY_BYTES) {
      // Free what was buffered before draining, so an oversized body never costs
      // more than the cap in memory no matter how much more of it arrives.
      chunks.length = 0;
      await drainRejectedBody(reader);
      return rejectOversizedBody(context);
    }
    chunks.push(value);
  }

  // Rebuilding the request calls the *global* `Request` constructor on whatever
  // the host handed in, so a host whose request objects are not its own globals'
  // instances breaks here. That is a real constraint, not a theoretical one: see
  // the note beside the same rebuild in `requireSupportedRequestMedia`.
  const headers = new Headers(context.req.raw.headers);
  // The request handed downstream carries our own re-enqueued body. An
  // over-declared length from the original request would describe it wrongly,
  // and nothing below this point has any business reading a declared size.
  headers.delete('Content-Length');
  const rebuilt = {
    headers,
    body: new ReadableStream({
      start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(chunk);
        }
        controller.close();
      },
    }),
    duplex: 'half',
  };
  context.req.raw = new Request(context.req.raw, rebuilt);
  return next();
});

const requireSupportedRequestMedia = createMiddleware(async (context, next) => {
  const contentEncoding = context.req.header('Content-Encoding');
  if (contentEncoding !== undefined && contentEncoding.trim().toLowerCase() !== 'identity') {
    return problem(context, 'unsupported-media-type', 'Send the request without content encoding.');
  }
  const contentType = context.req.header('Content-Type');
  if (contentType === undefined || !hasValidUniqueMediaTypeParameters(contentType)) {
    return problem(context, 'unsupported-media-type', 'Send the request as application/json.');
  }
  // `parse` only splits and lowercases a value `./media-type` has already
  // accepted — `content-type@2` validates nothing itself. See that module.
  const parsed = parseContentType(contentType);
  if (parsed.type !== 'application/json') {
    return problem(context, 'unsupported-media-type', 'Send the request as application/json.');
  }
  const charset = parsed.parameters['charset'];
  if (charset !== undefined && charset.toLowerCase() !== 'utf-8') {
    return problem(context, 'unsupported-media-type', 'Encode the JSON request as UTF-8.');
  }
  // Hono's json validator applies its own narrower Content-Type regex, and when
  // that disagrees it does not parse the body — it hands the validator `{}` and
  // says nothing. Rewriting the header this guard has just accepted leaves one
  // media policy in force. Without it an RFC 9110-legal `application/json ;
  // charset=utf-8` is answered 400 about the fields of a body never read.
  //
  // This is the module's one host requirement, and it is not free: `new Request`
  // resolves to whatever `globalThis.Request` is, so the host must hand in
  // requests that constructor accepts. `@hono/node-server` satisfies it by
  // installing its own `Request`/`Response` globals, which is why the Vite host
  // must not disable that. Portable does not mean indifferent to the host.
  const headers = new Headers(context.req.raw.headers);
  headers.set('Content-Type', 'application/json');
  context.req.raw = new Request(context.req.raw, { headers });
  return next();
});

/**
 * Hono infers a json validator's *input* from its callback's return type unless
 * the wire type is supplied, which put the decoded `bigint` revision into the
 * request contract — a value `JSON.stringify` throws on, so `hc<SpaceHttpApp>`
 * demanded something no client could send.
 *
 * Supplying only `InputType` is not enough: TypeScript has no partial type
 * argument inference, so every parameter left off falls back to its default
 * rather than being inferred, and `VF` defaulting to `=> any` drops the route
 * from the schema entirely. Naming the callback lets `VF` be supplied too, so
 * `in` comes from the wire type and `out` from what the callback returns.
 */
const decodeCommitBody = (
  value: CommitRequestJson,
  context: Context<Env, typeof SPACE_COLLECTION_PATH>,
) => {
  try {
    return decodeCommitRequest(value);
  } catch (error) {
    // Problem Details requires a non-empty `detail`, and `error instanceof Error`
    // does not guarantee `error.message` is one — the same fallback the
    // `HTTPException` branch in `onError` needs, for the same reason.
    const detail =
      error instanceof Error && error.message.length > 0
        ? error.message
        : 'Correct the request body.';
    return problem(context, 'invalid-request', detail, [{ code: 'invalid-value', pointer: '' }]);
  }
};

const validateCommitBody = validator<
  CommitRequestJson,
  typeof SPACE_COLLECTION_PATH,
  'post',
  'json',
  typeof SPACE_COLLECTION_PATH,
  typeof decodeCommitBody
>('json', decodeCommitBody);

const validateSpaceId = validator('param', (value, context) => {
  const id = uuidSchema.safeParse(value['id']);
  return id.success
    ? { id: id.data }
    : problem(context, 'invalid-space-id', 'Use a UUID for the Space id.');
});

/**
 * The answer for a request naming a path on the contract that no handler will
 * serve. Two callers reach it and they must agree, which is why it is one
 * function rather than two regexes: `app.notFound()`, for a method the route
 * tree never declared, and the HEAD guard, because Hono answers HEAD from the
 * GET handler and drops the body — a 200 that silently carries nothing.
 *
 * A non-UUID segment is a 400 here exactly as `validateSpaceId` makes it for
 * GET. Advertising `Allow` for it instead would name methods for a
 * resource no request can address, and disagree with GET on the same URL.
 *
 * `undefined` means the path is not on the contract at all; only `notFound`
 * has an answer for that, and the HEAD guard must let it fall through.
 */
const unservedContractPath = (context: Context): Response | undefined => {
  if (context.req.path === SPACE_COLLECTION_PATH) {
    context.header('Allow', 'GET, POST');
    return problem(context, 'method-not-allowed', 'Use GET or POST for the Space collection.');
  }
  if (context.req.path === SPACE_AGGREGATE_PATH) {
    context.header('Allow', 'GET');
    return problem(context, 'method-not-allowed', 'Use GET for the aggregate resource.');
  }
  const resource = SPACE_RESOURCE_PATTERN.exec(context.req.path);
  if (resource === null) {
    return undefined;
  }
  if (!uuidSchema.safeParse(resource[1]).success) {
    return problem(context, 'invalid-space-id', 'Use a UUID for the Space id.');
  }
  context.header('Allow', 'GET');
  return problem(context, 'method-not-allowed', 'Use GET for a Space resource.');
};

/**
 * `c.json()` sets a bare `application/json`, so naming the charset is a rewrite
 * of what Hono produced rather than a default applied to what we omitted. Both
 * of the middleware's exits reach it: a response that fell through the route
 * tree, and the HEAD guard's early return. Only the first went through it
 * before, so `/api/spaces/not-a-uuid` answered GET and HEAD with the same 400
 * under two different media types.
 */
const normalizeJsonMedia = (response: Response): Response => {
  if (response.headers.get('Content-Type') === 'application/json') {
    response.headers.set('Content-Type', 'application/json; charset=utf-8');
  }
  return response;
};

/**
 * What holds for every request whatever route serves it: nothing is cacheable,
 * HEAD never reaches a GET handler, and a JSON response names its charset.
 *
 * Written through `createMiddleware` like its siblings rather than inline in the
 * chain. An inline `use('*')` handler's context carries `any` in its input slot,
 * which makes handing it to `unservedContractPath` an unsafe argument that lint
 * rejects — the factory types it properly.
 */
const applyTransportPolicy = createMiddleware(async (context, next) => {
  context.header('Cache-Control', 'no-store');
  if (context.req.method === 'HEAD') {
    const unserved = unservedContractPath(context);
    if (unserved !== undefined) {
      return normalizeJsonMedia(unserved);
    }
  }
  await next();
  normalizeJsonMedia(context.res);
  return;
});

export const createSpaceHttpApp = (
  repository: SpaceResourceRepository,
  options: SpaceHttpAppOptions = {},
) => {
  const logError = options.logError ?? defaultLogError;
  const newId = options.newId ?? newUuid;
  const loadWorkingSpace = createWorkingSpaceLoader(repository, newId);
  const app = new Hono()
    .use('*', applyTransportPolicy)
    .get(SPACE_COLLECTION_PATH, async (context) => {
      try {
        return context.json(await repository.listSpaces(), 200);
      } catch (error) {
        invokeLogError(logError, 'Failed to list spaces', error);
        return problem(context, 'persistence-unavailable', 'Try the request again later.');
      }
    })
    .post(
      SPACE_COLLECTION_PATH,
      requireSupportedRequestMedia,
      requireBoundedCommitBody,
      validateCommitBody,
      async (context) => {
        const commit = context.req.valid('json');
        try {
          const result = await repository.commit(commit);
          if (result.kind === 'committed') {
            return context.json(encodeCommitResponse(result), 200);
          }
          if (result.kind === 'conflict') {
            return context.json(encodeCommitConflict(result), 409);
          }
          if (result.kind === 'aggregate-refused') {
            return context.json(encodeCommitRefusal(result), 422);
          }
          return problem(context, 'invalid-request', result.message, [
            { code: 'invalid-value', pointer: '' },
          ]);
        } catch (error) {
          invokeLogError(logError, 'Failed to commit spaces', error);
          return problem(context, 'persistence-unavailable', 'Try the request again later.');
        }
      },
    )
    .get(SPACE_AGGREGATE_PATH, async (context) => {
      try {
        return context.json(encodeLoadedAggregate(await repository.loadAggregate()), 200);
      } catch (error) {
        invokeLogError(logError, 'Failed to load the Space aggregate', error);
        return problem(context, 'persistence-unavailable', 'Try the request again later.');
      }
    })
    .get(SPACE_RESOURCE_PATH, validateSpaceId, async (context) => {
      const { id } = context.req.valid('param');
      try {
        const loaded = await loadWorkingSpace(id);
        if (loaded === undefined) {
          return problem(context, 'not-found', `Choose a Space that exists; Space ${id} does not.`);
        }
        if (loaded.initialization === 'created-layout') {
          context.header('X-Hyper-Space-Initialization', 'created-layout');
        }
        return context.json(encodeLoadedSpace(loaded), 200);
      } catch (error) {
        invokeLogError(logError, `Failed to load space ${id}`, error);
        return problem(context, 'persistence-unavailable', 'Try the request again later.');
      }
    });
  app.notFound(
    (context) =>
      unservedContractPath(context) ??
      // Not `context.notFound()`. Hono seeds the Context's not-found handler
      // from the app's, so calling it from inside the handler `app.notFound()`
      // installed re-enters this function until the stack blows — every path
      // off the declared contract, including the trailing slash an address bar
      // makes. The RPC docs independently say not to use it when a client
      // infers types.
      problem(context, 'not-found', 'Use a declared Space API path.'),
  );
  app.onError((error, context) => {
    // Answer through the context rather than `error.getResponse()`, whatever the
    // status. That method builds a bare `text/plain` Response carrying none of
    // this application's policy — no `Cache-Control: no-store`, and no Problem
    // Details body for the typed client to decode.
    if (error instanceof HTTPException) {
      const code = httpExceptionProblem(error.status);
      // `new HTTPException(status)` with no `options.message` carries an empty
      // `Error#message`, and Problem Details requires a non-empty `detail` —
      // falling through to that constructor here is what the next comment
      // warns about, so this cannot lean on the throw being caught.
      const detail = error.message.length > 0 ? error.message : problemCatalogue[code].title;
      return problem(context, code, detail);
    }
    // Never rethrow: Hono does not convert that into a 500, it re-invokes this
    // handler and lets the throw escape, so `app.fetch()` hands the host a
    // rejected promise instead of a response. A host without a `.catch` then
    // has an unhandled rejection, which Node 24 answers by killing the process.
    // A portable module owes its host a Response on every path.
    try {
      logError('Unhandled request failure', error);
    } catch {
      // A log sink that throws must not cost the caller its response either.
    }
    return problem(context, 'internal-error', 'Try the request again later.');
  });
  return app;
};

const httpExceptionProblem = (status: number): HyperProblemCode => {
  switch (status) {
    case 400:
      return 'invalid-request';
    case 401:
      return 'unauthorized';
    case 403:
      return 'forbidden';
    case 404:
      return 'not-found';
    case 405:
      return 'method-not-allowed';
    case 408:
      return 'request-timeout';
    case 413:
      return 'payload-too-large';
    case 415:
      return 'unsupported-media-type';
    case 422:
      return 'invalid-snapshot';
    case 429:
      return 'rate-limited';
    case 503:
      return 'persistence-unavailable';
    default:
      return 'internal-error';
  }
};

export type SpaceHttpApp = ReturnType<typeof createSpaceHttpApp>;
