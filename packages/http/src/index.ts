import { uuidSchema, type SpaceSnapshot, type UUID } from '@project/core';
import {
  decodeCommitRequest,
  encodeLoadedSpace,
  type LoadedSpace,
  type SpaceSummary,
} from '@project/persistence';
import { parse as parseContentType } from 'content-type';
import { Hono } from 'hono';
import { createMiddleware } from 'hono/factory';
import { HTTPException } from 'hono/http-exception';
import { bodyLimit } from 'hono/body-limit';
import { validator } from 'hono/validator';

export const MAX_COMMIT_BODY_BYTES = 1_048_576;

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

const requireSupportedRequestMedia = createMiddleware(async (context, next) => {
  const contentEncoding = context.req.header('Content-Encoding');
  if (contentEncoding !== undefined && contentEncoding.trim().toLowerCase() !== 'identity') {
    return context.json({ message: 'Content-Encoding must be identity' }, 415);
  }
  const contentType = context.req.header('Content-Type');
  if (contentType === undefined) {
    return context.json({ message: 'Content-Type must be application/json' }, 415);
  }
  let parsed: ReturnType<typeof parseContentType>;
  try {
    parsed = parseContentType(contentType);
  } catch {
    return context.json({ message: 'Content-Type must be application/json' }, 415);
  }
  if (parsed.type !== 'application/json') {
    return context.json({ message: 'Content-Type must be application/json' }, 415);
  }
  const charset = parsed.parameters['charset'];
  if (charset !== undefined && charset.toLowerCase() !== 'utf-8') {
    return context.json({ message: 'JSON charset must be UTF-8' }, 415);
  }
  return next();
});

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
        return context.json(await repository.listSpaces());
      } catch (error) {
        logError('Failed to list spaces', error);
        return context.json({ message: 'Persistence service unavailable' }, 503);
      }
    })
    .get('/api/spaces/:id', validateSpaceId, async (context) => {
      const { id } = context.req.valid('param');
      try {
        const loaded = await repository.loadSpace(id);
        if (loaded === undefined) {
          return context.json({ message: `Space ${id} does not exist` }, 404);
        }
        return context.json(encodeLoadedSpace(loaded));
      } catch (error) {
        logError(`Failed to load space ${id}`, error);
        return context.json({ message: 'Persistence service unavailable' }, 503);
      }
    })
    .put(
      '/api/spaces/:id',
      validateSpaceId,
      requireSupportedRequestMedia,
      bodyLimit({
        maxSize: MAX_COMMIT_BODY_BYTES,
        onError: (context) =>
          context.json({ message: `Request body exceeds ${MAX_COMMIT_BODY_BYTES} bytes` }, 413),
      }),
      validator('json', (value, context) => {
        try {
          return decodeCommitRequest(value);
        } catch (error) {
          return context.json(
            { message: error instanceof Error ? error.message : 'Invalid request' },
            400,
          );
        }
      }),
      async (context) => {
        const { id } = context.req.valid('param');
        const commit = context.req.valid('json');
        if (commit.snapshot.id !== id) {
          return context.json({ message: 'Path id must match snapshot id' }, 400);
        }
        try {
          const result = await repository.commitSpace(commit.snapshot, commit.expectedRevision);
          if (result.kind === 'committed') {
            return context.json({ revision: result.revision.toString() });
          }
          if (result.kind === 'conflict') {
            return context.json(encodeLoadedSpace(result.current), 409);
          }
          return context.json({ message: result.message }, result.code === 'not-found' ? 404 : 422);
        } catch (error) {
          logError(`Failed to commit space ${id}`, error);
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
    return context.notFound();
  });
  app.onError((error, context) => {
    if (error instanceof HTTPException && error.status === 400) {
      return context.json({ message: error.message }, 400);
    }
    throw error;
  });
  return app;
};

export type SpaceHttpApp = ReturnType<typeof createSpaceHttpApp>;
