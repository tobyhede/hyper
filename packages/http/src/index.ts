import { uuidSchema, type SpaceSnapshot, type UUID } from '@project/core';
import {
  decodeCommitRequest,
  encodeLoadedSpace,
  type LoadedSpace,
  type SpaceSummary,
} from '@project/persistence';
import { parse as parseContentType } from 'content-type';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { createMiddleware } from 'hono/factory';
import { HTTPException } from 'hono/http-exception';
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

const isOptionalWhitespace = (character: string): boolean =>
  character === ' ' || character === '\t';

const isTokenCharacter = (character: string): boolean =>
  /^[!#$%&'*+.^_`|~0-9A-Za-z-]$/.test(character);

const hasValidUniqueMediaTypeParameters = (value: string): boolean => {
  let index = 0;
  const skipWhitespace = (): void => {
    while (index < value.length && isOptionalWhitespace(value.charAt(index))) {
      index += 1;
    }
  };
  const readToken = (): string => {
    const start = index;
    while (index < value.length && isTokenCharacter(value.charAt(index))) {
      index += 1;
    }
    return value.slice(start, index);
  };

  skipWhitespace();
  if (readToken() === '' || value[index] !== '/') {
    return false;
  }
  index += 1;
  if (readToken() === '') {
    return false;
  }
  skipWhitespace();

  const parameterNames = new Set<string>();
  while (index < value.length) {
    if (value[index] !== ';') {
      return false;
    }
    index += 1;
    skipWhitespace();
    const parameterName = readToken().toLowerCase();
    if (parameterName === '' || parameterNames.has(parameterName)) {
      return false;
    }
    parameterNames.add(parameterName);
    skipWhitespace();
    if (value[index] !== '=') {
      return false;
    }
    index += 1;
    skipWhitespace();

    if (value[index] === '"') {
      index += 1;
      let closed = false;
      while (index < value.length) {
        const code = value.charCodeAt(index);
        if (code === 34) {
          index += 1;
          closed = true;
          break;
        }
        if (code === 92) {
          index += 1;
          if (index >= value.length) {
            return false;
          }
          const escapedCode = value.charCodeAt(index);
          if (
            escapedCode !== 9 &&
            (escapedCode < 32 || (escapedCode > 126 && escapedCode < 128) || escapedCode > 255)
          ) {
            return false;
          }
          index += 1;
          continue;
        }
        const isQuotedText =
          code === 9 ||
          code === 32 ||
          code === 33 ||
          (code >= 35 && code <= 91) ||
          (code >= 93 && code <= 126) ||
          (code >= 128 && code <= 255);
        if (!isQuotedText) {
          return false;
        }
        index += 1;
      }
      if (!closed) {
        return false;
      }
    } else if (readToken() === '') {
      return false;
    }
    skipWhitespace();
  }
  return true;
};

const requireBoundedCommitBody = createMiddleware(async (context, next) => {
  const declaredLength = context.req.header('Content-Length');
  if (declaredLength !== undefined && Number.parseInt(declaredLength, 10) > MAX_COMMIT_BODY_BYTES) {
    return context.json({ message: `Request body exceeds ${MAX_COMMIT_BODY_BYTES} bytes` }, 413);
  }

  const headers = new Headers(context.req.raw.headers);
  headers.delete('Content-Length');
  context.req.raw = new Request(context.req.raw, { headers });
  return bodyLimit({
    maxSize: MAX_COMMIT_BODY_BYTES,
    onError: (errorContext) =>
      errorContext.json({ message: `Request body exceeds ${MAX_COMMIT_BODY_BYTES} bytes` }, 413),
  })(context, next);
});

const requireSupportedRequestMedia = createMiddleware(async (context, next) => {
  const contentEncoding = context.req.header('Content-Encoding');
  if (contentEncoding !== undefined && contentEncoding.trim().toLowerCase() !== 'identity') {
    return context.json({ message: 'Content-Encoding must be identity' }, 415);
  }
  const contentType = context.req.header('Content-Type');
  if (contentType === undefined) {
    return context.json({ message: 'Content-Type must be application/json' }, 415);
  }
  if (!hasValidUniqueMediaTypeParameters(contentType)) {
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
        return context.json(await repository.listSpaces(), 200);
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
        return context.json(encodeLoadedSpace(loaded), 200);
      } catch (error) {
        logError(`Failed to load space ${id}`, error);
        return context.json({ message: 'Persistence service unavailable' }, 503);
      }
    })
    .put(
      '/api/spaces/:id',
      validateSpaceId,
      requireSupportedRequestMedia,
      requireBoundedCommitBody,
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
            return context.json({ revision: result.revision.toString() }, 200);
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
