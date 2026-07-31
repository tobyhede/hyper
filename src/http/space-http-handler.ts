import type { IncomingMessage, ServerResponse } from 'node:http';
import { uuidSchema } from '@project/core';
import {
  decodeCommitRequest,
  encodeLoadedSpace,
} from '../../packages/persistence/src/http-protocol';
import type { SpaceRepository } from '../persistence/space-repository';

export type SpaceHttpHandler = (
  request: IncomingMessage,
  response: ServerResponse,
) => Promise<boolean>;

export const MAX_COMMIT_BODY_BYTES = 1_048_576;

const json = (response: ServerResponse, status: number, value: unknown): void => {
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  response.end(JSON.stringify(value));
};

const rejectBeforeBody = (response: ServerResponse, message: string): void => {
  response.setHeader('Connection', 'close');
  json(response, 400, { message });
};

const readBoundedJson = async (
  request: IncomingMessage,
): Promise<{ ok: true; value: unknown } | { ok: false }> => {
  const chunks: Buffer[] = [];
  let size = 0;
  let oversized = false;
  await new Promise<void>((resolve, reject) => {
    request.on('data', (chunk: Buffer | string) => {
      if (oversized) return;
      const buffer = Buffer.from(chunk);
      size += buffer.byteLength;
      if (size > MAX_COMMIT_BODY_BYTES) {
        oversized = true;
        chunks.length = 0;
        request.resume();
      } else {
        chunks.push(buffer);
      }
    });
    request.on('end', resolve);
    request.on('error', reject);
    request.on('aborted', () => reject(new Error('Request aborted')));
  });
  if (oversized) return { ok: false };
  return { ok: true, value: JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown };
};

const hasJsonContentType = (request: IncomingMessage): boolean => {
  const value = request.headers['content-type'];
  return (
    typeof value === 'string' && value.split(';', 1)[0]?.trim().toLowerCase() === 'application/json'
  );
};

const declaredContentLength = (
  request: IncomingMessage,
): { ok: true; value?: number } | { ok: false } => {
  const values = request.headersDistinct['content-length'];
  if (values === undefined) return { ok: true };
  if (values.length !== 1) return { ok: false };
  const value = values[0];
  if (value === undefined || !/^(0|[1-9]\d*)$/.test(value)) return { ok: false };
  const parsed = BigInt(value);
  if (parsed > BigInt(MAX_COMMIT_BODY_BYTES)) return { ok: false };
  return { ok: true, value: Number(parsed) };
};

const methodNotAllowed = (response: ServerResponse, allow: string): void => {
  response.statusCode = 405;
  response.setHeader('Allow', allow);
  response.setHeader('Cache-Control', 'no-store');
  response.end();
};

const unavailable = (response: ServerResponse): void => {
  json(response, 503, { message: 'Persistence service unavailable' });
};

export const createSpaceHttpHandler = (repository: SpaceRepository): SpaceHttpHandler =>
  async (request, response) => {
    const url = new URL(request.url ?? '/', 'http://localhost');
    if (url.pathname === '/api/spaces') {
      if (request.method !== 'GET') {
        methodNotAllowed(response, 'GET');
        return true;
      }
      try {
        json(response, 200, await repository.listSpaces());
      } catch {
        unavailable(response);
      }
      return true;
    }
    const match = /^\/api\/spaces\/([^/]+)$/.exec(url.pathname);
    if (match === null) return false;
    const parsedId = uuidSchema.safeParse(match[1]);
    if (!parsedId.success) {
      if (request.method === 'PUT') rejectBeforeBody(response, 'Space id must be a UUID');
      else json(response, 400, { message: 'Space id must be a UUID' });
      return true;
    }
    if (request.method === 'GET') {
      try {
        const loaded = await repository.loadSpace(parsedId.data);
        if (loaded === undefined) json(response, 404, { message: `Space ${parsedId.data} does not exist` });
        else json(response, 200, encodeLoadedSpace(loaded));
      } catch {
        unavailable(response);
      }
      return true;
    }
    if (request.method !== 'PUT') {
      methodNotAllowed(response, 'GET, PUT');
      return true;
    }
    if (!hasJsonContentType(request)) {
      rejectBeforeBody(response, 'Content-Type must be application/json');
      return true;
    }
    const contentLength = declaredContentLength(request);
    if (!contentLength.ok) {
      rejectBeforeBody(response, `Content-Length must be canonical and at most ${MAX_COMMIT_BODY_BYTES}`);
      return true;
    }
    let commit: ReturnType<typeof decodeCommitRequest>;
    try {
      const body = await readBoundedJson(request);
      if (!body.ok) {
        json(response, 400, { message: `Request body exceeds ${MAX_COMMIT_BODY_BYTES} bytes` });
        return true;
      }
      commit = decodeCommitRequest(body.value);
      if (commit.snapshot.id !== parsedId.data) {
        json(response, 400, { message: 'Path id must match snapshot id' });
        return true;
      }
    } catch (error) {
      json(response, 400, { message: error instanceof Error ? error.message : 'Invalid request' });
      return true;
    }
    try {
      const result = await repository.commitSpace(commit.snapshot, commit.expectedRevision);
      if (result.kind === 'committed') json(response, 200, { revision: result.revision.toString() });
      else if (result.kind === 'conflict') json(response, 409, encodeLoadedSpace(result.current));
      else json(response, result.code === 'not-found' ? 404 : 422, { message: result.message });
    } catch {
      unavailable(response);
    }
    return true;
  };
