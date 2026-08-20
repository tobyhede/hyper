import { uuidSchema, type SpaceSnapshot } from '@project/core';
import { encodeLoadedSpace, encodeProblemDetails } from '@project/persistence';
import { describe, expect, it } from 'vitest';
import { HttpSpaceBackend } from '@project/http';

const SPACE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000001');
const CARD_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000002');
const snapshot: SpaceSnapshot = {
  id: SPACE_ID,
  document: { version: 1, title: 'One' },
  cards: [{ id: CARD_ID, document: { title: 'A', kind: 'markdown', body: '' } }],
};

const backendAnswering = (response: Response): HttpSpaceBackend =>
  new HttpSpaceBackend('http://example.test', {
    fetch: () => Promise.resolve(response),
  });

const problemResponse = (
  code: Parameters<typeof encodeProblemDetails>[0],
  detail: string,
  headers?: HeadersInit,
): Response => {
  const body = encodeProblemDetails(code, detail);
  const responseHeaders = new Headers(headers);
  responseHeaders.set('Content-Type', 'application/problem+json');
  return new Response(JSON.stringify(body), {
    status: body.status,
    headers: responseHeaders,
  });
};

describe('HTTP Space backend Problem Details decoding', () => {
  it.each([
    ['request-timeout', 'timeout'],
    ['rate-limited', 'rate-limited'],
    ['persistence-unavailable', 'unavailable'],
    ['internal-error', 'unavailable'],
  ] as const)('maps %s to retryable %s', async (problemCode, resultCode) => {
    const result = await backendAnswering(
      problemResponse(problemCode, 'Try later', { 'Retry-After': '3' }),
    ).commitSpace(snapshot, 0n);

    expect(result).toMatchObject({
      kind: 'retryable-failure',
      code: resultCode,
      message: 'Try later',
    });
    if (problemCode !== 'request-timeout') expect(result).toHaveProperty('retryAfterMs', 3000);
  });

  it.each([
    ['unauthorized', 'forbidden'],
    ['forbidden', 'forbidden'],
    ['not-found', 'not-found'],
    ['invalid-snapshot', 'invalid-snapshot'],
  ] as const)('maps %s to permanent %s', async (problemCode, resultCode) => {
    await expect(
      backendAnswering(problemResponse(problemCode, 'Correct the request.')).commitSpace(
        snapshot,
        0n,
      ),
    ).resolves.toEqual({
      kind: 'permanent-failure',
      code: resultCode,
      message: 'Correct the request.',
    });
  });

  it('has no compatibility path for the retired message envelope', async () => {
    const response = new Response(JSON.stringify({ message: 'old shape' }), { status: 422 });

    await expect(backendAnswering(response).commitSpace(snapshot, 0n)).resolves.toMatchObject({
      kind: 'permanent-failure',
      code: 'protocol',
    });
  });

  it('rejects disagreement between the HTTP status and body status', async () => {
    const body = encodeProblemDetails('not-found', 'Missing.');
    const response = new Response(JSON.stringify(body), {
      status: 400,
      headers: { 'Content-Type': 'application/problem+json' },
    });

    await expect(backendAnswering(response).commitSpace(snapshot, 0n)).resolves.toEqual({
      kind: 'permanent-failure',
      code: 'protocol',
      message: 'Problem status does not match the HTTP status',
    });
  });

  it('requires the Problem Details media type', async () => {
    const body = encodeProblemDetails('invalid-snapshot', 'Correct the snapshot.');
    const response = new Response(JSON.stringify(body), {
      status: 422,
      headers: { 'Content-Type': 'application/json' },
    });

    await expect(backendAnswering(response).commitSpace(snapshot, 0n)).resolves.toEqual({
      kind: 'permanent-failure',
      code: 'protocol',
      message: 'Error response must use application/problem+json',
    });
  });

  it('accepts a Problem Details response whose Content-Type carries parameters', async () => {
    const body = encodeProblemDetails('persistence-unavailable', 'Down for maintenance');
    const response = new Response(JSON.stringify(body), {
      status: body.status,
      headers: { 'Content-Type': 'application/problem+json; charset=utf-8' },
    });

    await expect(backendAnswering(response).commitSpace(snapshot, 0n)).resolves.toMatchObject({
      kind: 'retryable-failure',
      code: 'unavailable',
      message: 'Down for maintenance',
    });
  });

  it('rejects a Problem Details response whose Content-Type is not a valid media type', async () => {
    const body = encodeProblemDetails('persistence-unavailable', 'Down for maintenance');
    const response = new Response(JSON.stringify(body), {
      status: body.status,
      headers: { 'Content-Type': 'application/problem+json; charset=' },
    });

    await expect(backendAnswering(response).commitSpace(snapshot, 0n)).resolves.toEqual({
      kind: 'permanent-failure',
      code: 'protocol',
      message: 'Error response must use application/problem+json',
    });
  });

  it('keeps the 409 recovery representation as LoadedSpace', async () => {
    const current = { snapshot, revision: 4n, exportedRevision: 2n };
    const response = new Response(JSON.stringify(encodeLoadedSpace(current)), { status: 409 });

    await expect(backendAnswering(response).commitSpace(snapshot, 3n)).resolves.toEqual({
      kind: 'conflict',
      current,
    });
  });
});
