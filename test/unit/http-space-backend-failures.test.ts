import { describe, expect, it } from 'vitest';
import { HttpSpaceBackend } from '@project/http';
import { encodeProblemDetails, type HyperProblemCode } from '@project/persistence';
import { CARD_ID, SPACE_ID, oneCardSnapshot as snapshot } from '../support/space-fixtures';

const backendFor = (response: Response): HttpSpaceBackend =>
  new HttpSpaceBackend('/', { fetch: () => Promise.resolve(response) });

const commitUpdate = (backend: HttpSpaceBackend) =>
  backend.commit({
    changes: [{ kind: 'update', spaceId: SPACE_ID, snapshot, expectedRevision: 0n }],
  });

const problemResponse = (
  problemCode: HyperProblemCode,
  detail: string,
  headers?: HeadersInit,
): Response => {
  const body = encodeProblemDetails(problemCode, detail);
  const responseHeaders = new Headers(headers);
  responseHeaders.set('Content-Type', 'application/problem+json');
  return new Response(JSON.stringify(body), { status: body.status, headers: responseHeaders });
};

describe('typed Hono HttpSpaceBackend failure classification', () => {
  const permanent = [
    ['invalid-request', 'invalid-commit', 'Denied'],
    ['unauthorized', 'forbidden', 'Denied'],
    ['forbidden', 'forbidden', 'Denied'],
    ['not-found', 'protocol', 'Denied'],
    ['invalid-snapshot', 'protocol', 'commit refusal has unexpected fields'],
  ] as const;

  for (const [problemCode, code, message] of permanent) {
    it(`maps ${problemCode} to permanent ${code}`, async () => {
      await expect(
        commitUpdate(backendFor(problemResponse(problemCode, 'Denied'))),
      ).resolves.toEqual({ kind: 'permanent-failure', code, message });
    });
  }

  // The HTTP status is irrelevant here: a malformed body fails at JSON parsing
  // or Problem Details decoding, before the status is ever consulted, so one
  // representative status covers every status this backend could see.
  const malformedBodies = ['', '<html>broken</html>', '{', JSON.stringify({ nope: true })];

  for (const body of malformedBodies) {
    it(`rejects a malformed Problem Details body: ${JSON.stringify(body)}`, async () => {
      await expect(
        commitUpdate(
          backendFor(
            new Response(body, {
              status: 503,
              headers: { 'Content-Type': 'application/problem+json' },
            }),
          ),
        ),
      ).resolves.toMatchObject({ kind: 'permanent-failure', code: 'protocol' });
    });
  }

  it('rejects a well-formed Problem Details body sent with the wrong media type', async () => {
    const body = encodeProblemDetails('persistence-unavailable', 'Down');
    await expect(
      commitUpdate(backendFor(new Response(JSON.stringify(body), { status: body.status }))),
    ).resolves.toEqual({
      kind: 'permanent-failure',
      code: 'protocol',
      message: 'Error response must use application/problem+json',
    });
  });

  it('uses a valid retryable error message and Retry-After seconds', async () => {
    await expect(
      commitUpdate(
        backendFor(problemResponse('rate-limited', 'Try later', { 'Retry-After': '2' })),
      ),
    ).resolves.toEqual({
      kind: 'retryable-failure',
      code: 'rate-limited',
      message: 'Try later',
      retryAfterMs: 2000,
    });
  });

  it('honours Retry-After on an unavailable response', async () => {
    for (const problemCode of ['internal-error', 'persistence-unavailable'] as const) {
      await expect(
        commitUpdate(
          backendFor(problemResponse(problemCode, 'Down for maintenance', { 'Retry-After': '30' })),
        ),
      ).resolves.toEqual({
        kind: 'retryable-failure',
        code: 'unavailable',
        message: 'Down for maintenance',
        retryAfterMs: 30_000,
      });
    }
  });

  it('omits Retry-After when a retryable response does not send one', async () => {
    await expect(
      commitUpdate(backendFor(problemResponse('persistence-unavailable', 'Down'))),
    ).resolves.toEqual({
      kind: 'retryable-failure',
      code: 'unavailable',
      message: 'Down',
    });
  });

  it('omits an unusable Retry-After rather than deriving a delay from it', async () => {
    // The last case is why the header shares `CANONICAL_DECIMAL` with revision
    // decoding: an arbitrarily long digit string is work `BigInt` has to do
    // before any range check can reject what it produced.
    const unusable = ['soon', '-1', '01', '1.5', '9'.repeat(19), '9'.repeat(4096)];
    for (const value of unusable) {
      await expect(
        commitUpdate(
          backendFor(problemResponse('persistence-unavailable', 'Down', { 'Retry-After': value })),
        ),
      ).resolves.toEqual({ kind: 'retryable-failure', code: 'unavailable', message: 'Down' });
    }
  });

  it('rejects malformed success and conflict bodies as permanent protocol failures', async () => {
    for (const status of [200, 409]) {
      await expect(
        commitUpdate(backendFor(new Response(JSON.stringify({ revision: 4 }), { status }))),
      ).resolves.toMatchObject({ kind: 'permanent-failure', code: 'protocol' });
    }
  });

  it('rejects malformed list and load bodies at the runtime trust boundary', async () => {
    const malformed = new Response(JSON.stringify({ inferred: 'but untrusted' }), { status: 200 });
    await expect(backendFor(malformed.clone()).listSpaces()).rejects.toThrow(
      'space summaries must be an array',
    );
    await expect(backendFor(malformed).loadSpace(SPACE_ID)).rejects.toThrow(
      'loaded space has unexpected fields',
    );
  });

  it('maps unexpected client errors to permanent protocol failures', async () => {
    await expect(
      commitUpdate(
        backendFor(new Response(JSON.stringify({ message: 'Teapot' }), { status: 418 })),
      ),
    ).resolves.toMatchObject({ kind: 'permanent-failure', code: 'protocol' });
  });

  it('maps Fetch rejection to a retryable network failure', async () => {
    const backend = new HttpSpaceBackend('/', {
      fetch: () => Promise.reject(new Error('offline')),
    });
    await expect(commitUpdate(backend)).resolves.toEqual({
      kind: 'retryable-failure',
      code: 'network',
      message: 'offline',
    });
  });

  it('reports a descriptive message when a read times out', async () => {
    const backend = new HttpSpaceBackend('/', {
      timeoutMs: 5,
      fetch: (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        }),
    });
    await expect(backend.listSpaces()).rejects.toThrow('Request timed out');
    await expect(backend.loadSpace(SPACE_ID)).rejects.toThrow('Request timed out');
  });

  it('decodes a listing into summaries and rejects one it cannot', async () => {
    const summaries = [
      { id: SPACE_ID, title: 'One' },
      { id: CARD_ID, title: 'Two' },
    ];
    await expect(
      backendFor(new Response(JSON.stringify(summaries), { status: 200 })).listSpaces(),
    ).resolves.toEqual(summaries);

    await expect(
      backendFor(new Response(JSON.stringify([{ id: 'not-a-uuid', title: 'One' }]))).listSpaces(),
    ).rejects.toThrow();
    await expect(
      backendFor(new Response(JSON.stringify({ spaces: summaries }))).listSpaces(),
    ).rejects.toThrow();
  });

  it('reports an unsuccessful listing by status rather than decoding it', async () => {
    await expect(backendFor(new Response('gateway', { status: 502 })).listSpaces()).rejects.toThrow(
      'Unable to list spaces: HTTP 502',
    );
  });

  /**
   * Fetch aborts the body stream too, so a `signal` that fires after the headers
   * have arrived rejects the pending `json()`/`text()`. A timer cleared when the
   * headers land leaves that read with nothing to interrupt it.
   */
  const stalledBody = (status: number, signal: AbortSignal | undefined): Response => {
    const stalled = <T>(): Promise<T> =>
      new Promise<T>((_resolve, reject) => {
        signal?.addEventListener('abort', () => reject(new Error('aborted')));
      });
    return Object.assign(
      new Response(null, { status, headers: { 'Content-Type': 'application/problem+json' } }),
      {
        json: stalled<unknown>,
        text: stalled<string>,
      },
    );
  };

  it('times out a response whose body never arrives', async () => {
    const backend = new HttpSpaceBackend('/api/spaces', {
      timeoutMs: 5,
      fetch: (_input, init) => Promise.resolve(stalledBody(200, init?.signal ?? undefined)),
    });

    await expect(backend.listSpaces()).rejects.toThrow('Request timed out');
    await expect(backend.loadSpace(SPACE_ID)).rejects.toThrow('Request timed out');
    await expect(commitUpdate(backend)).resolves.toEqual({
      kind: 'retryable-failure',
      code: 'timeout',
      message: 'Request timed out',
    });
  });

  it('applies its timeout to a caller-provided Fetch', async () => {
    const backend = new HttpSpaceBackend('/', {
      timeoutMs: 5,
      fetch: (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        }),
    });
    await expect(commitUpdate(backend)).resolves.toEqual({
      kind: 'retryable-failure',
      code: 'timeout',
      message: 'Request timed out',
    });
  });

  /**
   * Headers arriving is not the request completing. A body that stalls after a
   * prompt status line hangs the read for as long as the peer holds it open, so
   * the timeout has to stay armed until the body has been decoded — exactly as
   * a real Fetch ties its signal to the response stream.
   *
   * The response is built synchronously inside the Fetch, so its status line,
   * headers and first bytes exist before `#timedRequest`'s timer can fire. A
   * real socket cannot promise that ordering: the timer is armed before the
   * request is dispatched, so on a loaded machine the abort wins the race and
   * the peer is left with no request to answer — and a test waiting on the peer
   * to report headers then waits forever.
   */
  const stalledBodyFetch =
    (status: number, headers: Record<string, string> = {}): typeof globalThis.fetch =>
    (_input, init) =>
      Promise.resolve(
        new Response(
          new ReadableStream({
            start(controller) {
              // Prompt, delivered — and still never a complete body.
              controller.enqueue(new TextEncoder().encode('{"type":"https://hyper.dev/problems/'));
              init?.signal?.addEventListener('abort', () => {
                controller.error(new Error('aborted'));
              });
            },
          }),
          { status, headers: { 'content-type': 'application/problem+json', ...headers } },
        ),
      );

  it('times out a read whose body stalls after the status line', async () => {
    const backend = new HttpSpaceBackend('/', {
      timeoutMs: 5,
      fetch: stalledBodyFetch(200),
    });
    await expect(backend.listSpaces()).rejects.toThrow('Request timed out');
    await expect(backend.loadSpace(SPACE_ID)).rejects.toThrow('Request timed out');
  }, 1000);

  it('reports a commit whose body stalls after the status line as a retryable timeout', async () => {
    const backend = new HttpSpaceBackend('/', {
      timeoutMs: 5,
      fetch: stalledBodyFetch(200),
    });
    await expect(commitUpdate(backend)).resolves.toEqual({
      kind: 'retryable-failure',
      code: 'timeout',
      message: 'Request timed out',
    });
  }, 1000);

  // `Retry-After` is present and would classify these as `rate-limited` and
  // `unavailable` with a `retryAfterMs` — but only if the body were ever read to
  // completion. The timeout outranks it, and that is what these two pin.
  it('reports a rate-limited response whose body stalls as a timeout without Retry-After', async () => {
    const backend = new HttpSpaceBackend('/', {
      timeoutMs: 5,
      fetch: stalledBodyFetch(429, { 'Retry-After': '60' }),
    });
    await expect(commitUpdate(backend)).resolves.toEqual({
      kind: 'retryable-failure',
      code: 'timeout',
      message: 'Request timed out',
    });
  }, 1000);

  it('reports an unavailable response whose body stalls as a timeout without Retry-After', async () => {
    const backend = new HttpSpaceBackend('/', {
      timeoutMs: 5,
      fetch: stalledBodyFetch(503, { 'Retry-After': '30' }),
    });
    await expect(commitUpdate(backend)).resolves.toEqual({
      kind: 'retryable-failure',
      code: 'timeout',
      message: 'Request timed out',
    });
  }, 1000);
});
