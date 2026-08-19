import { describe, expect, it } from 'vitest';
import { HttpSpaceBackend } from '@project/http';
import { encodeProblemDetails, type ProblemCode } from '@project/persistence';
import { CARD_ID, SPACE_ID, oneCardSnapshot as snapshot } from '../support/space-fixtures';

const backendFor = (response: Response): HttpSpaceBackend =>
  new HttpSpaceBackend('/', { fetch: () => Promise.resolve(response) });

const problemResponse = (
  code: ProblemCode,
  detail: string,
  headers: Record<string, string> = {},
): Response => {
  const problem = encodeProblemDetails(code, detail);
  return new Response(JSON.stringify(problem), {
    status: problem.status,
    headers: { 'Content-Type': 'application/problem+json', ...headers },
  });
};

describe('typed Hono HttpSpaceBackend failure classification', () => {
  const permanent = [
    ['invalid-request', 'protocol'],
    ['authentication-required', 'forbidden'],
    ['forbidden', 'forbidden'],
    ['not-found', 'not-found'],
    ['invalid-snapshot', 'invalid-snapshot'],
  ] as const;

  for (const [problemCode, code] of permanent) {
    it(`maps ${problemCode} to permanent ${code}`, async () => {
      await expect(
        backendFor(problemResponse(problemCode, 'Denied')).commitSpace(snapshot, 0n),
      ).resolves.toEqual({ kind: 'permanent-failure', code, message: 'Denied' });
    });
  }

  const retryable = [
    ['request-timeout', 'timeout'],
    ['rate-limited', 'rate-limited'],
    ['internal-error', 'unavailable'],
    ['service-unavailable', 'unavailable'],
  ] as const;

  for (const [problemCode, code] of retryable) {
    it(`maps ${problemCode} to retryable ${code}`, async () => {
      await expect(
        backendFor(problemResponse(problemCode, 'Try later')).commitSpace(snapshot, 0n),
      ).resolves.toEqual({ kind: 'retryable-failure', code, message: 'Try later' });
    });
  }

  it.each(['', '<html>broken</html>', '{', JSON.stringify({ nope: true })])(
    'rejects an off-contract error body %j as a protocol failure',
    async (body) => {
      await expect(
        backendFor(
          new Response(body, {
            status: 503,
            headers: { 'Content-Type': 'application/problem+json' },
          }),
        ).commitSpace(snapshot, 0n),
      ).resolves.toMatchObject({ kind: 'permanent-failure', code: 'protocol' });
    },
  );

  it('uses a valid retryable error message and Retry-After seconds', async () => {
    await expect(
      backendFor(problemResponse('rate-limited', 'Try later', { 'Retry-After': '2' })).commitSpace(
        snapshot,
        0n,
      ),
    ).resolves.toEqual({
      kind: 'retryable-failure',
      code: 'rate-limited',
      message: 'Try later',
      retryAfterMs: 2000,
    });
  });

  it('honours Retry-After on an unavailable response', async () => {
    for (const code of ['internal-error', 'service-unavailable'] as const) {
      await expect(
        backendFor(
          problemResponse(code, 'Down for maintenance', { 'Retry-After': '30' }),
        ).commitSpace(snapshot, 0n),
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
      backendFor(problemResponse('service-unavailable', 'Down')).commitSpace(snapshot, 0n),
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
        backendFor(
          problemResponse('service-unavailable', 'Down', { 'Retry-After': value }),
        ).commitSpace(snapshot, 0n),
      ).resolves.toEqual({ kind: 'retryable-failure', code: 'unavailable', message: 'Down' });
    }
  });

  it('rejects malformed success and conflict bodies as permanent protocol failures', async () => {
    for (const status of [200, 409]) {
      await expect(
        backendFor(new Response(JSON.stringify({ revision: 4 }), { status })).commitSpace(
          snapshot,
          0n,
        ),
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

  it('maps an error without Problem Details to a permanent protocol failure', async () => {
    await expect(
      backendFor(new Response(JSON.stringify({ message: 'Teapot' }), { status: 418 })).commitSpace(
        snapshot,
        0n,
      ),
    ).resolves.toEqual({
      kind: 'permanent-failure',
      code: 'protocol',
      message: 'error response must use application/problem+json',
    });
  });

  it('rejects a Problem Details status that differs from the HTTP status', async () => {
    const body = encodeProblemDetails('not-found', 'Missing');
    await expect(
      backendFor(
        new Response(JSON.stringify(body), {
          status: 503,
          headers: { 'Content-Type': 'application/problem+json' },
        }),
      ).commitSpace(snapshot, 0n),
    ).resolves.toEqual({
      kind: 'permanent-failure',
      code: 'protocol',
      message: 'HTTP status does not match problem status',
    });
  });

  it('maps Fetch rejection to a retryable network failure', async () => {
    const backend = new HttpSpaceBackend('/', {
      fetch: () => Promise.reject(new Error('offline')),
    });
    await expect(backend.commitSpace(snapshot, 0n)).resolves.toEqual({
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
    return {
      ok: status >= 200 && status < 300,
      status,
      headers: new Headers(),
      json: stalled<unknown>,
      text: stalled<string>,
    } as unknown as Response;
  };

  it('times out a response whose body never arrives', async () => {
    const backend = new HttpSpaceBackend('/api/spaces', {
      timeoutMs: 5,
      fetch: (_input, init) => Promise.resolve(stalledBody(200, init?.signal ?? undefined)),
    });

    await expect(backend.listSpaces()).rejects.toThrow('Request timed out');
    await expect(backend.loadSpace(SPACE_ID)).rejects.toThrow('Request timed out');
    await expect(backend.commitSpace(snapshot, 0n)).resolves.toEqual({
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
    await expect(backend.commitSpace(snapshot, 0n)).resolves.toEqual({
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
              controller.enqueue(new TextEncoder().encode('{"type":"urn:hyper:problem:'));
              init?.signal?.addEventListener('abort', () => {
                controller.error(new Error('aborted'));
              });
            },
          }),
          {
            status,
            headers: {
              'content-type': status >= 400 ? 'application/problem+json' : 'application/json',
              ...headers,
            },
          },
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
    await expect(backend.commitSpace(snapshot, 0n)).resolves.toEqual({
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
    await expect(backend.commitSpace(snapshot, 0n)).resolves.toEqual({
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
    await expect(backend.commitSpace(snapshot, 0n)).resolves.toEqual({
      kind: 'retryable-failure',
      code: 'timeout',
      message: 'Request timed out',
    });
  }, 1000);
});
