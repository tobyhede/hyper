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

const json = (response: ServerResponse, status: number, value: unknown): void => {
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  response.end(JSON.stringify(value));
};

const readJson = async (request: IncomingMessage): Promise<unknown> => {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
};

export const createSpaceHttpHandler = (repository: SpaceRepository): SpaceHttpHandler =>
  async (request, response) => {
    const url = new URL(request.url ?? '/', 'http://localhost');
    if (url.pathname === '/api/spaces') {
      if (request.method !== 'GET') return false;
      json(response, 200, await repository.listSpaces());
      return true;
    }
    const match = /^\/api\/spaces\/([^/]+)$/.exec(url.pathname);
    if (match === null) return false;
    const parsedId = uuidSchema.safeParse(match[1]);
    if (!parsedId.success) {
      json(response, 400, { message: 'Space id must be a UUID' });
      return true;
    }
    if (request.method === 'GET') {
      const loaded = await repository.loadSpace(parsedId.data);
      if (loaded === undefined) json(response, 404, { message: `Space ${parsedId.data} does not exist` });
      else json(response, 200, encodeLoadedSpace(loaded));
      return true;
    }
    if (request.method !== 'PUT') return false;
    try {
      const commit = decodeCommitRequest(await readJson(request));
      if (commit.snapshot.id !== parsedId.data) {
        json(response, 400, { message: 'Path id must match snapshot id' });
        return true;
      }
      const result = await repository.commitSpace(commit.snapshot, commit.expectedRevision);
      if (result.kind === 'committed') json(response, 200, { revision: result.revision.toString() });
      else if (result.kind === 'conflict') json(response, 409, encodeLoadedSpace(result.current));
      else json(response, result.code === 'not-found' ? 404 : 422, { message: result.message });
    } catch (error) {
      json(response, 400, { message: error instanceof Error ? error.message : 'Invalid request' });
    }
    return true;
  };
