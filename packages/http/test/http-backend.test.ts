import { uuidSchema, type SpaceSnapshot } from '@project/core';
import {
  encodeCommitConflict,
  encodeCommitRefusal,
  encodeCommitResponse,
  encodeLoadedAggregate,
  encodeProblemDetails,
  type HyperProblemCode,
  type SpaceCommit,
} from '@project/persistence';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HttpSpaceBackend } from '@project/http';

const SPACE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000001');
const CARD_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000002');
const snapshot: SpaceSnapshot = {
  id: SPACE_ID,
  document: { version: 1, title: 'One' },
  cards: [{ id: CARD_ID, document: { title: 'A', kind: 'markdown', body: '' } }],
};
const loaded = { snapshot, revision: 4n, exportedRevision: 2n };
const commit: SpaceCommit = {
  changes: [{ kind: 'update', spaceId: SPACE_ID, snapshot, expectedRevision: 3n }],
};

const backendAnswering = (response: Response): HttpSpaceBackend =>
  new HttpSpaceBackend('http://example.test', { fetch: () => Promise.resolve(response) });

type JsonResponseBody =
  | ReturnType<typeof encodeLoadedAggregate>
  | ReturnType<typeof encodeCommitResponse>
  | ReturnType<typeof encodeCommitConflict>
  | ReturnType<typeof encodeCommitRefusal>
  | { readonly message: string }
  | readonly never[];

const jsonResponse = (body: JsonResponseBody, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });

const problemResponse = (
  code: HyperProblemCode,
  detail: string,
  headers?: HeadersInit,
): Response => {
  const body = encodeProblemDetails(code, detail);
  const responseHeaders = new Headers(headers);
  responseHeaders.set('Content-Type', 'application/problem+json');
  return new Response(JSON.stringify(body), { status: body.status, headers: responseHeaders });
};

describe('HTTP Space backend aggregate protocol', () => {
  it('loads the complete aggregate through its codec', async () => {
    const aggregate = {
      kind: 'loaded' as const,
      aggregate: { metaSpaceId: SPACE_ID, spaces: [loaded] },
    };

    await expect(
      backendAnswering(jsonResponse(encodeLoadedAggregate(aggregate))).loadAggregate(),
    ).resolves.toEqual(aggregate);
  });

  it('decodes committed revisions and deleted Space ids', async () => {
    const committed = {
      kind: 'committed' as const,
      revisions: [{ spaceId: SPACE_ID, revision: 5n }],
      deletedSpaceIds: [SPACE_ID],
    };

    await expect(
      backendAnswering(jsonResponse(encodeCommitResponse(committed))).commit(commit),
    ).resolves.toEqual(committed);
  });

  it('decodes every conflicting current value', async () => {
    const conflict = {
      kind: 'conflict' as const,
      conflicts: [{ spaceId: SPACE_ID, current: loaded }],
    };

    await expect(
      backendAnswering(jsonResponse(encodeCommitConflict(conflict), 409)).commit(commit),
    ).resolves.toEqual(conflict);
  });

  it('decodes aggregate refusal identities and locations', async () => {
    const refusal = {
      kind: 'aggregate-refused' as const,
      errors: [
        {
          kind: 'space-card-target-missing' as const,
          spaceId: SPACE_ID,
          cardId: CARD_ID,
          targetSpaceId: uuidSchema.parse('00000000-0000-4000-8000-000000000003'),
        },
      ],
    };

    await expect(
      backendAnswering(jsonResponse(encodeCommitRefusal(refusal), 422)).commit(commit),
    ).resolves.toEqual(refusal);
  });
});

describe('HTTP Space backend failure mapping', () => {
  it.each([
    ['request-timeout', 'timeout'],
    ['rate-limited', 'rate-limited'],
    ['persistence-unavailable', 'unavailable'],
    ['internal-error', 'unavailable'],
  ] as const)('maps %s to retryable %s', async (problemCode, resultCode) => {
    const result = await backendAnswering(
      problemResponse(problemCode, 'Try later', { 'Retry-After': '3' }),
    ).commit(commit);

    expect(result).toMatchObject({
      kind: 'retryable-failure',
      code: resultCode,
      message: 'Try later',
    });
  });

  it.each([
    ['unauthorized', 'forbidden'],
    ['forbidden', 'forbidden'],
    ['invalid-request', 'invalid-commit'],
  ] as const)('maps %s to permanent %s', async (problemCode, resultCode) => {
    await expect(
      backendAnswering(problemResponse(problemCode, 'Correct the request.')).commit(commit),
    ).resolves.toEqual({
      kind: 'permanent-failure',
      code: resultCode,
      message: 'Correct the request.',
    });
  });

  it('requires Problem Details for an ordinary error response', async () => {
    await expect(
      backendAnswering(jsonResponse({ message: 'old shape' }, 400)).commit(commit),
    ).resolves.toMatchObject({ kind: 'permanent-failure', code: 'protocol' });
  });

  it('rejects Problem Details whose status disagrees with the response', async () => {
    const body = encodeProblemDetails('invalid-request', 'Correct the request.');
    const response = new Response(JSON.stringify(body), {
      status: 503,
      headers: { 'Content-Type': 'application/problem+json' },
    });

    await expect(backendAnswering(response).commit(commit)).resolves.toEqual({
      kind: 'permanent-failure',
      code: 'protocol',
      message: 'Problem status does not match the HTTP status',
    });
  });

  it('contains a non-Error response decoding failure', async () => {
    const response = new Response(null, {
      status: 400,
      headers: { 'Content-Type': 'application/problem+json' },
    });
    Object.defineProperty(response, 'json', {
      // A host Response implementation can reject with an arbitrary value.
      // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
      value: () => Promise.reject(null),
    });

    await expect(backendAnswering(response).commit(commit)).resolves.toEqual({
      kind: 'permanent-failure',
      code: 'protocol',
      message: 'Malformed response',
    });
  });

  it('treats a non-Error network rejection as a network failure', async () => {
    const backend = new HttpSpaceBackend('http://example.test', {
      // A caller-injected fetch can reject with anything; that is the regression case.
      // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
      fetch: () => Promise.reject('offline'),
    });

    await expect(backend.commit(commit)).resolves.toEqual({
      kind: 'retryable-failure',
      code: 'network',
      message: 'Network request failed',
    });
  });
});

describe('HTTP Space backend transport', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('falls back to global fetch', async () => {
    const globalFetch = vi.fn(() => Promise.resolve(jsonResponse([])));
    vi.stubGlobal('fetch', globalFetch);

    await expect(new HttpSpaceBackend('http://example.test').listSpaces()).resolves.toEqual([]);
    expect(globalFetch).toHaveBeenCalledOnce();
  });

  it('rejects an unsuccessful lazy load by status', async () => {
    await expect(
      backendAnswering(new Response('gateway', { status: 502 })).loadSpace(SPACE_ID),
    ).rejects.toThrow('Unable to load space: HTTP 502');
  });

  it('rejects an unsuccessful aggregate load by status', async () => {
    await expect(
      backendAnswering(new Response('gateway', { status: 502 })).loadAggregate(),
    ).rejects.toThrow('Unable to load aggregate: HTTP 502');
  });
});
