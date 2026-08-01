import { uuidSchema, type SpaceSnapshot, type UUID } from '@project/core';
import {
  decodeCommitRequest,
  encodeLoadedSpace,
  type CommitRequestJson,
  type LoadedSpace,
  type SpaceSummary,
} from '@project/persistence';
import { parse as parseContentType } from 'content-type';
import { Hono, type Context, type Env } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { createMiddleware } from 'hono/factory';
import { HTTPException } from 'hono/http-exception';
import { validator } from 'hono/validator';
import { hasValidUniqueMediaTypeParameters } from './media-type';

export { HttpSpaceBackend } from './backend';
export type { HttpSpaceBackendOptions } from './backend';

export const MAX_COMMIT_BODY_BYTES = 1_048_576;

// Named so the route registration and the json validator's explicit path type
// cannot drift apart; the validator needs the literal to stay in the schema.
const SPACE_RESOURCE_PATH = '/api/spaces/:id';

export type SpaceResourceCommitResult =
  | { kind: 'committed'; revision: bigint }
  | { kind: 'conflict'; current: LoadedSpace }
  | {
      kind: 'rejected';
      code: 'invalid-snapshot' | 'not-found';
      message: string;
    };

export interface SpaceResourceRepository {
  listSpaces(): Promise<readonly SpaceSummary[]>;
  loadSpace(id: UUID): Promise<LoadedSpace | undefined>;
  commitSpace(
    snapshot: SpaceSnapshot,
    expectedRevision: bigint,
  ): Promise<SpaceResourceCommitResult>;
}

export interface SpaceHttpAppOptions {
  logError?: (message: string, error: unknown) => void;
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

const rejectOversizedBody = (context: Context) =>
  context.json({ message: `Request body exceeds ${MAX_COMMIT_BODY_BYTES} bytes` }, 413);

const countCommitBodyBytes = bodyLimit({
  maxSize: MAX_COMMIT_BODY_BYTES,
  onError: rejectOversizedBody,
});

/**
 * The two halves are complementary, not redundant, and removing either one
 * silently loses a case. `bodyLimit` *trusts* `Content-Length` when it is
 * present — it compares and returns without reading a byte — so an understated
 * length would skip counting entirely. Deleting the header forces its streaming
 * path, which counts what actually arrives; checking the declared length first
 * still buys a cheap rejection for an honest over-declaration, which is why the
 * manual check is not simply replaced by the deletion.
 *
 * The cost is the fast path: every legitimate commit is now buffered and
 * re-read. On a real Node host the understated length is already impossible —
 * the HTTP parser bounds the body at `Content-Length` — so this is defence for
 * a future host rather than a live hole, which is what `spec.md` says too.
 */
const requireBoundedCommitBody = createMiddleware(async (context, next) => {
  const declaredLength = context.req.header('Content-Length');
  if (declaredLength !== undefined && Number.parseInt(declaredLength, 10) > MAX_COMMIT_BODY_BYTES) {
    return rejectOversizedBody(context);
  }

  const headers = new Headers(context.req.raw.headers);
  headers.delete('Content-Length');
  context.req.raw = new Request(context.req.raw, { headers });
  // `bodyLimit` is declared as a bare `MiddlewareHandler`, whose response type
  // defaults to `Response`; returning its result directly widened the union and
  // erased 413 from the inferred client contract, while the hand-written 415
  // beside it survived. It answers with `onError` or with `next()`, and its
  // `onError` is ours, so a response here is always the oversize one — saying
  // that in code rather than in a cast keeps the status in the contract.
  const limited = await countCommitBodyBytes(context, next);
  return limited === undefined ? undefined : rejectOversizedBody(context);
});

const requireSupportedRequestMedia = createMiddleware(async (context, next) => {
  const contentEncoding = context.req.header('Content-Encoding');
  if (contentEncoding !== undefined && contentEncoding.trim().toLowerCase() !== 'identity') {
    return context.json({ message: 'Content-Encoding must be identity' }, 415);
  }
  const contentType = context.req.header('Content-Type');
  if (contentType === undefined || !hasValidUniqueMediaTypeParameters(contentType)) {
    return context.json({ message: 'Content-Type must be application/json' }, 415);
  }
  // `parse` only splits and lowercases a value `./media-type` has already
  // accepted — `content-type@2` validates nothing itself. See that module.
  const parsed = parseContentType(contentType);
  if (parsed.type !== 'application/json') {
    return context.json({ message: 'Content-Type must be application/json' }, 415);
  }
  const charset = parsed.parameters['charset'];
  if (charset !== undefined && charset.toLowerCase() !== 'utf-8') {
    return context.json({ message: 'JSON charset must be UTF-8' }, 415);
  }
  // Hono's json validator applies its own narrower Content-Type regex, and when
  // that disagrees it does not parse the body — it hands the validator `{}` and
  // says nothing. Rewriting the header this guard has just accepted leaves one
  // media policy in force. Without it an RFC 9110-legal `application/json ;
  // charset=utf-8` is answered 400 about the fields of a body never read.
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
  context: Context<Env, typeof SPACE_RESOURCE_PATH>,
) => {
  try {
    return decodeCommitRequest(value);
  } catch (error) {
    return context.json(
      { message: error instanceof Error ? error.message : 'Invalid request' },
      400,
    );
  }
};

const validateCommitBody = validator<
  CommitRequestJson,
  typeof SPACE_RESOURCE_PATH,
  'put',
  'json',
  typeof SPACE_RESOURCE_PATH,
  typeof decodeCommitBody
>('json', decodeCommitBody);

const validateSpaceId = validator('param', (value, context) => {
  const id = uuidSchema.safeParse(value['id']);
  return id.success ? { id: id.data } : context.json({ message: 'Space id must be a UUID' }, 400);
});

export const createSpaceHttpApp = (
  repository: SpaceResourceRepository,
  options: SpaceHttpAppOptions = {},
) => {
  const logError = options.logError ?? defaultLogError;
  const app = new Hono()
    .use('*', async (context, next) => {
      context.header('Cache-Control', 'no-store');
      if (context.req.method === 'HEAD') {
        if (context.req.path === '/api/spaces') {
          context.header('Allow', 'GET');
          return context.body(null, 405);
        }
        if (/^\/api\/spaces\/[^/]+$/.test(context.req.path)) {
          context.header('Allow', 'GET, PUT');
          return context.body(null, 405);
        }
      }
      await next();
      if (context.res.headers.get('Content-Type') === 'application/json') {
        context.header('Content-Type', 'application/json; charset=utf-8');
      }
      return;
    })
    .get('/api/spaces', async (context) => {
      try {
        return context.json(await repository.listSpaces(), 200);
      } catch (error) {
        invokeLogError(logError, 'Failed to list spaces', error);
        return context.json({ message: 'Persistence service unavailable' }, 503);
      }
    })
    .get(SPACE_RESOURCE_PATH, validateSpaceId, async (context) => {
      const { id } = context.req.valid('param');
      try {
        const loaded = await repository.loadSpace(id);
        if (loaded === undefined) {
          return context.json({ message: `Space ${id} does not exist` }, 404);
        }
        return context.json(encodeLoadedSpace(loaded), 200);
      } catch (error) {
        invokeLogError(logError, `Failed to load space ${id}`, error);
        return context.json({ message: 'Persistence service unavailable' }, 503);
      }
    })
    .put(
      SPACE_RESOURCE_PATH,
      validateSpaceId,
      requireSupportedRequestMedia,
      requireBoundedCommitBody,
      validateCommitBody,
      async (context) => {
        const { id } = context.req.valid('param');
        const commit = context.req.valid('json');
        if (commit.snapshot.id !== id) {
          return context.json({ message: 'Path id must match snapshot id' }, 400);
        }
        try {
          const result = await repository.commitSpace(commit.snapshot, commit.expectedRevision);
          if (result.kind === 'committed') {
            return context.json({ revision: result.revision.toString() }, 200);
          }
          if (result.kind === 'conflict') {
            return context.json(encodeLoadedSpace(result.current), 409);
          }
          return context.json({ message: result.message }, result.code === 'not-found' ? 404 : 422);
        } catch (error) {
          invokeLogError(logError, `Failed to commit space ${id}`, error);
          return context.json({ message: 'Persistence service unavailable' }, 503);
        }
      },
    );
  app.notFound((context) => {
    if (context.req.path === '/api/spaces') {
      context.header('Allow', 'GET');
      return context.body(null, 405);
    }
    const resource = /^\/api\/spaces\/([^/]+)$/.exec(context.req.path);
    if (resource !== null) {
      if (!uuidSchema.safeParse(resource[1]).success) {
        return context.json({ message: 'Space id must be a UUID' }, 400);
      }
      context.header('Allow', 'GET, PUT');
      return context.body(null, 405);
    }
    // Not `context.notFound()`. Hono seeds the Context's not-found handler from
    // the app's, so calling it from inside the handler `app.notFound()`
    // installed re-enters this function until the stack blows — every path off
    // the declared contract, including the trailing slash an address bar makes.
    // The RPC docs independently say not to use it when a client infers types.
    return context.json({ message: 'Not found' }, 404);
  });
  app.onError((error, context) => {
    if (error instanceof HTTPException) {
      return error.status === 400
        ? context.json({ message: error.message }, 400)
        : error.getResponse();
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
    return context.json({ message: 'Internal server error' }, 500);
  });
  return app;
};

export type SpaceHttpApp = ReturnType<typeof createSpaceHttpApp>;
