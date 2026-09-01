import { uuidSchema, type SpaceSnapshot } from '@project/core';
import {
  decodeProblemDetails,
  encodeCommitRequest,
  problemCatalogue,
  type HyperProblemCode,
  type SpaceCommit,
  type SpaceResourceRepository,
} from '@project/persistence';
import { describe, expect, it, vi } from 'vitest';
import { createSpaceHttpApp, MAX_COMMIT_BODY_BYTES, MAX_DRAINED_BODY_BYTES } from '@project/http';
import { HTTPException } from 'hono/http-exception';

const SPACE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000001');
const CARD_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000002');
const TARGET_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000003');
const snapshot: SpaceSnapshot = {
  id: SPACE_ID,
  document: { version: 1, title: 'One' },
  cards: [{ id: CARD_ID, document: { title: 'A', kind: 'markdown', body: '' } }],
};
const loaded = { snapshot, revision: 0n, exportedRevision: null };

const updateCommit = (next = snapshot): SpaceCommit => ({
  changes: [{ kind: 'update', spaceId: SPACE_ID, snapshot: next, expectedRevision: 0n }],
});

const repository = (overrides: Partial<SpaceResourceRepository> = {}): SpaceResourceRepository => ({
  listSpaces: () => Promise.resolve([{ id: SPACE_ID, title: 'One' }]),
  loadSpace: () => Promise.resolve(loaded),
  loadAggregate: () => Promise.resolve({ metaSpaceId: SPACE_ID, spaces: [loaded] }),
  commit: () =>
    Promise.resolve({
      kind: 'committed' as const,
      revisions: [{ spaceId: SPACE_ID, revision: 1n }],
      deletedSpaceIds: [],
    }),
  ...overrides,
});

// The identity is asserted, not just the status: several codes share one status
// — `invalid-request` and `invalid-space-id` are both 400 — so a status-only
// helper reads green when a request is refused by the wrong guard. `title` comes
// with it because the catalogue is what a client branches on, and a response
// naming a type whose title has drifted is a contract change wearing a status
// that has not.
const expectProblem = async (response: Response, code: HyperProblemCode, detail?: string) => {
  expect(response.status).toBe(problemCatalogue[code].status);
  expect(response.headers.get('content-type')).toBe('application/problem+json');
  expect(response.headers.get('cache-control')).toBe('no-store');
  const decoded = decodeProblemDetails(await response.json());
  expect(decoded.type).toBe(problemCatalogue[code].type);
  expect(decoded.title).toBe(problemCatalogue[code].title);
  if (detail !== undefined) expect(decoded.detail).toBe(detail);
  return decoded;
};

const postCommit = (app: ReturnType<typeof createSpaceHttpApp>, commit = updateCommit()) =>
  app.request('/api/spaces', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(encodeCommitRequest(commit)),
  });

const OVERSIZED_DETAIL = `Send a request body no larger than ${MAX_COMMIT_BODY_BYTES} bytes.`;

const oversizedSnapshot: SpaceSnapshot = {
  ...snapshot,
  cards: [{ id: CARD_ID, document: { title: 'A', kind: 'markdown', body: 'x'.repeat(1_048_576) } }],
};

describe('commit wire policy', () => {
  // Every judgement in this block is made at the wire, before the change set
  // means anything, so the repository must not be asked. A policy that produced
  // the right status while still handing the commit to storage would satisfy a
  // status-only assertion and lose the property the status exists to carry.
  const wireRejection = async (request: RequestInit, code: HyperProblemCode, detail?: string) => {
    const commit = vi.fn();
    const response = await createSpaceHttpApp(repository({ commit })).request(
      '/api/spaces',
      request,
    );

    const decoded = await expectProblem(response, code, detail);
    expect(commit).not.toHaveBeenCalled();
    return decoded;
  };

  const commitBody = (committed = snapshot) =>
    JSON.stringify(encodeCommitRequest(updateCommit(committed)));

  it.each([
    ['missing media type', undefined, 'Send the request as application/json.'],
    ['non-JSON media type', 'text/plain; charset=utf-8', 'Send the request as application/json.'],
    ['non-UTF-8 charset', 'application/json; charset=utf-16', 'Encode the JSON request as UTF-8.'],
    [
      'duplicate charset',
      'application/json; charset=utf-8; charset=utf-16',
      'Send the request as application/json.',
    ],
    [
      'malformed charset',
      'application/json; charset="utf-8',
      'Send the request as application/json.',
    ],
  ])('rejects %s', async (_name, contentType, detail) => {
    const request: RequestInit =
      contentType === undefined
        ? { method: 'POST', body: commitBody() }
        : { method: 'POST', headers: { 'Content-Type': contentType }, body: commitBody() };

    await wireRejection(request, 'unsupported-media-type', detail);
  });

  // A list naming `identity` beside another encoding is still a body this
  // application cannot read, so the guard compares the whole header rather than
  // asking whether `identity` appears in it.
  it.each(['gzip', 'br', 'deflate', 'gzip, identity'])(
    'rejects a %s-encoded request body',
    async (contentEncoding) => {
      await wireRejection(
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Content-Encoding': contentEncoding },
          body: commitBody(),
        },
        'unsupported-media-type',
        'Send the request without content encoding.',
      );
    },
  );

  // `identity` is the one encoding a client may declare, in any case. Rejecting
  // it would refuse a request that says only what every other request means.
  it.each(['identity', 'Identity'])(
    'accepts a request declaring %s content encoding',
    async (contentEncoding) => {
      const response = await createSpaceHttpApp(repository()).request('/api/spaces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Encoding': contentEncoding },
        body: commitBody(),
      });

      expect(response.status).toBe(200);
    },
  );

  // The media judgement has to be reached before anything reads the body. Both
  // bodies here would be refused on their own — one is past the size cap, the
  // other is not JSON — so a 413 or a 400 in place of the 415 says the order has
  // inverted and a body under an unsupported charset is being decoded.
  it.each([
    ['a body over the size cap', `{"padding":"${'x'.repeat(MAX_COMMIT_BODY_BYTES)}"}`],
    ['a malformed body', '{'],
  ])('rejects an unsupported charset carrying %s before reading it', async (_name, body) => {
    await wireRejection(
      { method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-16' }, body },
      'unsupported-media-type',
      'Encode the JSON request as UTF-8.',
    );
  });

  it.each([
    ['honest', String(MAX_COMMIT_BODY_BYTES + 500)],
    ['understated', '1'],
  ])('rejects a body over 1 MiB with an %s declared length', async (_name, contentLength) => {
    await wireRejection(
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': contentLength },
        body: commitBody(oversizedSnapshot),
      },
      'payload-too-large',
      OVERSIZED_DETAIL,
    );
  });

  it('measures the body rather than trusting an over-declared length', async () => {
    await wireRejection(
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': '1048577' },
        body: '{}',
      },
      'invalid-request',
      // Named, because a bare 400 would also be produced by a guard that read
      // the declared length and refused the request before decoding it — which
      // is the behaviour this case exists to rule out.
      'commit request has unexpected fields',
    );
  });

  it('rejects a streamed body over 1 MiB without a declared length', async () => {
    await wireRejection(
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: `{"padding":"${'x'.repeat(MAX_COMMIT_BODY_BYTES)}"}`,
      },
      'payload-too-large',
      OVERSIZED_DETAIL,
    );
  });

  // The drain is what lets a keep-alive connection survive its own 413, and it
  // buys that only by reading the body to its end. An honest overshoot well
  // inside the allowance is therefore pulled in full rather than abandoned once
  // the cap is passed; `vite-hono-host.test.ts` pins the connection it saves.
  it('drains an oversized body that ends within the drain allowance', async () => {
    const chunk = 64 * 1024;
    const chunks = (MAX_COMMIT_BODY_BYTES * 4) / chunk;
    let pulled = 0;
    const overshoot = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (pulled === chunks) {
          controller.close();
          return;
        }
        pulled += 1;
        controller.enqueue(new Uint8Array(chunk));
      },
    });
    const streamingRequest: RequestInit & { duplex: 'half' } = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: overshoot,
      duplex: 'half',
    };
    const response = await createSpaceHttpApp(repository()).request(
      '/api/spaces',
      streamingRequest,
    );

    expect(response.status).toBe(413);
    expect(pulled).toBe(chunks);
  });

  it('stops draining a body that keeps arriving past the drain allowance', async () => {
    const chunk = 64 * 1024;
    let pulled = 0;
    const endless = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled += chunk;
        controller.enqueue(new Uint8Array(chunk));
      },
    });
    const streamingRequest: RequestInit & { duplex: 'half' } = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: endless,
      duplex: 'half',
    };
    const response = await createSpaceHttpApp(repository()).request(
      '/api/spaces',
      streamingRequest,
    );

    expect(response.status).toBe(413);
    // Two-sided, because each half is a different regression, and both are read
    // against the allowance rather than a literal — the number itself is a
    // policy choice this test has no business pinning. The lower bound is the
    // drain doing its job: stopping at the cap instead would leave the body
    // unconsumed and cost every honest overshoot its connection. The upper bound
    // is what the cap check consumed before the drain began, plus the allowance,
    // plus slack for the stream's own read-ahead — so a drain reading twice what
    // it is allowed fails here, where the 16 MiB literal this once asserted was
    // two whole allowances of slack and would not have. The slack is eight
    // chunks against the one actually observed: how far a `ReadableStream` reads
    // ahead is a runtime detail, and a Node that read two chunks ahead should
    // not turn this red without a behaviour change.
    expect(pulled).toBeGreaterThan(MAX_DRAINED_BODY_BYTES);
    expect(pulled).toBeLessThanOrEqual(MAX_DRAINED_BODY_BYTES + MAX_COMMIT_BODY_BYTES + chunk * 8);
  });

  it('still answers 413 when the client vanishes mid-drain', async () => {
    let reads = 0;
    const flaky = new ReadableStream<Uint8Array>({
      pull(controller) {
        reads += 1;
        if (reads > 20) {
          controller.error(new Error('client disconnected'));
          return;
        }
        controller.enqueue(new Uint8Array(64 * 1024));
      },
    });
    const streamingRequest: RequestInit & { duplex: 'half' } = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: flaky,
      duplex: 'half',
    };
    const response = await createSpaceHttpApp(repository()).request(
      '/api/spaces',
      streamingRequest,
    );

    expect(response.status).toBe(413);
  });

  // The limit is a maximum, not a threshold the body must stay under, and both
  // framings are driven because the count is the only check either goes through.
  // A `>` quietly becoming `>=` would keep every oversize case above green while
  // failing every commit of exactly the permitted size.
  it('accepts a body of exactly the 1 MiB limit through both framings', async () => {
    const padded = (length: number): SpaceSnapshot => ({
      ...snapshot,
      cards: [
        { id: CARD_ID, document: { title: 'A', kind: 'markdown', body: 'x'.repeat(length) } },
      ],
    });
    const overhead = commitBody(padded(0)).length;
    const body = commitBody(padded(MAX_COMMIT_BODY_BYTES - overhead));
    expect(new TextEncoder().encode(body).byteLength).toBe(MAX_COMMIT_BODY_BYTES);

    const declared = await createSpaceHttpApp(repository()).request('/api/spaces', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': String(MAX_COMMIT_BODY_BYTES),
      },
      body,
    });
    expect(declared.status).toBe(200);

    const streamed = await createSpaceHttpApp(repository()).request('/api/spaces', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
    expect(streamed.status).toBe(200);
  });

  // An absent charset and UTF-8 in any spelling both reach the handler. The last
  // three are RFC 9110 legal and Hono's own narrower json regex rejects them, so
  // without the rewrite `requireSupportedRequestMedia` performs they arrive at
  // the validator as `{}` and are answered 400 about a body never read — which
  // is why the commit the repository receives is asserted, not just the status.
  it.each([
    'application/json',
    'application/json; charset=utf-8',
    'Application/JSON; charset="UTF-8"',
    'application/json ; charset=utf-8',
    'application/json; charset = utf-8',
    'application/json; x_1=2',
    'application/json; foo="a;b"',
  ])('normalizes and accepts legal JSON media type %s', async (contentType) => {
    const commit = vi.fn(() =>
      Promise.resolve({
        kind: 'committed' as const,
        revisions: [{ spaceId: SPACE_ID, revision: 1n }],
        deletedSpaceIds: [],
      }),
    );
    const response = await createSpaceHttpApp(repository({ commit })).request('/api/spaces', {
      method: 'POST',
      headers: { 'Content-Type': contentType },
      body: commitBody(),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/json; charset=utf-8');
    expect(commit).toHaveBeenCalledWith(updateCommit());
  });
});

describe('Space HTTP reads', () => {
  it('retains collection listing and lazy resource loading', async () => {
    const app = createSpaceHttpApp(repository());

    const collection = await app.request('/api/spaces');
    const resource = await app.request(`/api/spaces/${SPACE_ID}`);

    await expect(collection.json()).resolves.toEqual([{ id: SPACE_ID, title: 'One' }]);
    await expect(resource.json()).resolves.toEqual({
      snapshot,
      revision: '0',
      exportedRevision: null,
    });
    expect(collection.headers.get('cache-control')).toBe('no-store');
    expect(resource.headers.get('content-type')).toBe('application/json; charset=utf-8');
  });

  it('loads the complete aggregate from its own resource', async () => {
    const response = await createSpaceHttpApp(repository()).request('/api/aggregate');

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      metaSpaceId: SPACE_ID,
      spaces: [{ snapshot, revision: '0', exportedRevision: null }],
    });
  });

  it('returns not found for an absent lazy resource', async () => {
    const response = await createSpaceHttpApp(
      repository({ loadSpace: () => Promise.resolve(undefined) }),
    ).request(`/api/spaces/${TARGET_ID}`);

    await expectProblem(response, 'not-found');
  });

  it('hides and logs aggregate repository failures', async () => {
    const failure = new Error('database credentials');
    const logError = vi.fn();
    const response = await createSpaceHttpApp(
      repository({ loadAggregate: () => Promise.reject(failure) }),
      { logError },
    ).request('/api/aggregate');

    await expectProblem(response, 'persistence-unavailable');
    expect(logError).toHaveBeenCalledWith('Failed to load the Space aggregate', failure);
  });

  it('hides and logs collection and lazy-resource repository failures', async () => {
    const failure = new Error('database credentials');
    const logError = vi.fn();
    const app = createSpaceHttpApp(
      repository({
        listSpaces: () => Promise.reject(failure),
        loadSpace: () => Promise.reject(failure),
      }),
      { logError },
    );

    await expectProblem(await app.request('/api/spaces'), 'persistence-unavailable');
    await expectProblem(await app.request(`/api/spaces/${SPACE_ID}`), 'persistence-unavailable');
    expect(logError).toHaveBeenCalledWith('Failed to list spaces', failure);
    expect(logError).toHaveBeenCalledWith(`Failed to load space ${SPACE_ID}`, failure);
  });

  it('contains a failing repository log sink as an internal error', async () => {
    const response = await createSpaceHttpApp(
      repository({ listSpaces: () => Promise.reject(new Error('database')) }),
      {
        logError: () => {
          throw new Error('logger');
        },
      },
    ).request('/api/spaces');

    await expectProblem(response, 'internal-error');
  });

  it('reports repository failures through the default error sink', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const failure = new Error('database');

    const response = await createSpaceHttpApp(
      repository({ listSpaces: () => Promise.reject(failure) }),
    ).request('/api/spaces');

    await expectProblem(response, 'persistence-unavailable');
    expect(logged).toHaveBeenCalledWith('Failed to list spaces', failure);
  });
  // The swallow arm of `invokeLogError`. Hono forwards an `Error` thrown by a
  // log sink to `onError`, which is the case above; a non-`Error` throw escapes
  // `app.fetch()` entirely and a host without a `.catch` is killed by Node for
  // the unhandled rejection. Every route that logs is driven, because the
  // containment is one helper and a route that stopped calling it would lose it.
  it('returns service unavailable when failure logging itself throws a non-Error', async () => {
    const failure = new Error('repository failure');
    const options = {
      logError: () => {
        // JavaScript callers can violate the TypeScript convention; that is the regression case.
        // eslint-disable-next-line @typescript-eslint/only-throw-error
        throw 'logger failure';
      },
    };
    const responses = await Promise.all([
      createSpaceHttpApp(
        repository({ listSpaces: () => Promise.reject(failure) }),
        options,
      ).request('/api/spaces'),
      createSpaceHttpApp(repository({ loadSpace: () => Promise.reject(failure) }), options).request(
        `/api/spaces/${SPACE_ID}`,
      ),
      createSpaceHttpApp(
        repository({ loadAggregate: () => Promise.reject(failure) }),
        options,
      ).request('/api/aggregate'),
      postCommit(
        createSpaceHttpApp(repository({ commit: () => Promise.reject(failure) }), options),
      ),
    ]);

    await Promise.all(
      responses.map((response) =>
        expectProblem(response, 'persistence-unavailable', 'Try the request again later.'),
      ),
    );
  });
});

describe('Space HTTP aggregate commit', () => {
  it('posts the decoded non-empty change set to the repository', async () => {
    const commit = updateCommit();
    const commitRepository = vi.fn(() =>
      Promise.resolve({
        kind: 'committed' as const,
        revisions: [{ spaceId: SPACE_ID, revision: 7n }],
        deletedSpaceIds: [TARGET_ID],
      }),
    );

    const response = await postCommit(
      createSpaceHttpApp(repository({ commit: commitRepository })),
      commit,
    );

    expect(commitRepository).toHaveBeenCalledWith(commit);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      revisions: [{ spaceId: SPACE_ID, revision: '7' }],
      deletedSpaceIds: [TARGET_ID],
    });
  });

  it('returns every conflict through the persistence codec', async () => {
    const response = await postCommit(
      createSpaceHttpApp(
        repository({
          commit: () =>
            Promise.resolve({
              kind: 'conflict',
              conflicts: [{ spaceId: SPACE_ID, current: loaded }],
            }),
        }),
      ),
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      conflicts: [
        {
          spaceId: SPACE_ID,
          current: { snapshot, revision: '0', exportedRevision: null },
        },
      ],
    });
  });

  it('preserves stable aggregate-refusal identity and location fields', async () => {
    const error = {
      kind: 'space-card-target-missing' as const,
      spaceId: SPACE_ID,
      cardId: CARD_ID,
      targetSpaceId: TARGET_ID,
    };
    const response = await postCommit(
      createSpaceHttpApp(
        repository({
          commit: () => Promise.resolve({ kind: 'aggregate-refused', errors: [error] }),
        }),
      ),
    );

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual({ errors: [error] });
  });

  it('maps a rejected commit to request correction', async () => {
    const response = await postCommit(
      createSpaceHttpApp(
        repository({
          commit: () =>
            Promise.resolve({ kind: 'rejected', code: 'invalid-commit', message: 'Duplicate id' }),
        }),
      ),
    );

    const problem = await expectProblem(response, 'invalid-request', 'Duplicate id');
    expect(problem.errors).toEqual([{ code: 'invalid-value', pointer: '' }]);
  });

  it('hides and logs repository failures', async () => {
    const failure = new Error('database host');
    const logError = vi.fn();
    const response = await postCommit(
      createSpaceHttpApp(repository({ commit: () => Promise.reject(failure) }), { logError }),
    );

    await expectProblem(response, 'persistence-unavailable');
    expect(logError).toHaveBeenCalledWith('Failed to commit spaces', failure);
  });
});

describe('Space HTTP commit request policy', () => {
  const encoded = encodeCommitRequest(updateCommit());
  const [encodedChange] = encoded.changes;

  // Each case carries the guard that should refuse it. Asserting only the 400
  // lets any case pass on any other guard's refusal — a noncanonical revision
  // rejected as an unexpected field reads as green, and the envelope decoder
  // could lose a whole arm without a single test noticing.
  it.each([
    ['an array envelope', [], /^commit request must be an object$/],
    [
      'an unexpected envelope field',
      { ...encoded, extra: true },
      /^commit request has unexpected fields$/,
    ],
    ['changes that are not an array', { changes: {} }, /^commit changes must be an array$/],
    ['an empty change set', { changes: [] }, /^commit changes must be non-empty$/],
    [
      'a change that is not an object',
      { changes: ['update'] },
      /^commit change must be an object$/,
    ],
    [
      'a change of an unknown kind',
      { changes: [{ ...encodedChange, kind: 'replace' }] },
      /^commit change has an unknown kind$/,
    ],
    [
      'an unexpected change field',
      { changes: [{ ...encodedChange, extra: true }] },
      /^update change has unexpected fields$/,
    ],
    [
      'a noncanonical revision',
      { changes: [{ ...encodedChange, expectedRevision: '01' }] },
      /^expectedRevision must be a canonical non-negative decimal string$/,
    ],
    [
      'a change naming a Space its snapshot does not',
      { changes: [{ ...encodedChange, spaceId: TARGET_ID }] },
      /does not match its snapshot$/,
    ],
    [
      'one Space named twice',
      { changes: [encodedChange, encodedChange] },
      /is named more than once$/,
    ],
    [
      'a schema-invalid snapshot',
      {
        changes: [
          {
            ...encodedChange,
            snapshot: { ...snapshot, document: { ...snapshot.document, title: '' } },
          },
        ],
      },
      // The snapshot guard, naming the field it refused: a bare /title/ would
      // also pass on an envelope guard that happened to mention the word.
      /^update change snapshot is invalid: document\.title/,
    ],
  ])('rejects %s as an invalid request', async (_name, body, expectedMessage) => {
    const commit = vi.fn();
    const response = await createSpaceHttpApp(repository({ commit })).request('/api/spaces', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const refusal = await expectProblem(response, 'invalid-request');
    expect(refusal.detail).toMatch(expectedMessage);
    expect(commit).not.toHaveBeenCalled();
  });

  /*
   * Problem `detail` is the display-prose contract, and every other 400 honours
   * it with a sentence. Zod serializes its whole issue array into
   * `Error.message`, so a snapshot that fails the schema would otherwise answer
   * with hundreds of characters of internal schema shape — a JSON document
   * nested inside a field the client renders as prose.
   */
  it('describes a schema-invalid snapshot in prose rather than serialized issues', async () => {
    const response = await createSpaceHttpApp(repository()).request('/api/spaces', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        changes: [
          {
            ...encodedChange,
            snapshot: { ...snapshot, document: { ...snapshot.document, title: '' } },
          },
        ],
      }),
    });

    const refusal = await expectProblem(response, 'invalid-request');
    expect(refusal.detail).toContain('snapshot is invalid');
    expect(refusal.detail).toContain('document.title');
    expect(refusal.detail).not.toContain('{');
    expect(refusal.detail.length).toBeLessThan(200);
  });

  it('rejects a malformed body without calling the repository', async () => {
    const commit = vi.fn();
    const response = await createSpaceHttpApp(repository({ commit })).request('/api/spaces', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{',
    });

    await expectProblem(response, 'invalid-request');
    expect(commit).not.toHaveBeenCalled();
  });

  // A media-typed request with no body at all is the one path through
  // `requireBoundedCommitBody` that never reads a byte, and it must reach the
  // decoder rather than be answered by the size guard.
  it('rejects a media-typed request with no body', async () => {
    const commit = vi.fn();
    const response = await createSpaceHttpApp(repository({ commit })).request('/api/spaces', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });

    await expectProblem(response, 'invalid-request');
    expect(commit).not.toHaveBeenCalled();
  });
});

describe('Space HTTP method and path policy', () => {
  it.each([
    ['/api/spaces', 'GET, POST', 'Use GET or POST for the Space collection.'],
    ['/api/aggregate', 'GET', 'Use GET for the aggregate resource.'],
    [`/api/spaces/${SPACE_ID}`, 'GET', 'Use GET for a Space resource.'],
  ])('advertises the methods for %s', async (path, allow, detail) => {
    const response = await createSpaceHttpApp(repository()).request(path, { method: 'DELETE' });

    await expectProblem(response, 'method-not-allowed', detail);
    expect(response.headers.get('allow')).toBe(allow);
  });

  it('refuses the retired PUT resource commit', async () => {
    const commit = vi.fn();
    const response = await createSpaceHttpApp(repository({ commit })).request(
      `/api/spaces/${SPACE_ID}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(encodeCommitRequest(updateCommit())),
      },
    );

    await expectProblem(response, 'method-not-allowed');
    expect(response.headers.get('allow')).toBe('GET');
    expect(commit).not.toHaveBeenCalled();
  });

  it('keeps invalid ids distinct from undeclared paths', async () => {
    const app = createSpaceHttpApp(repository());

    await expectProblem(await app.request('/api/spaces/not-a-uuid'), 'invalid-space-id');
    await expectProblem(await app.request('/api/unknown'), 'not-found');
  });

  // Hono routes HEAD to the GET handler and strips the body, so a route tree
  // that stopped intercepting HEAD would answer 200 carrying nothing rather
  // than 405 — a status difference invisible in the body, which is why `Allow`
  // and the media type are asserted here and not only the status. The three
  // paths are separate arms of `unservedContractPath` and each must match: an
  // arm that stopped matching falls through to the GET graph.
  it.each([
    ['the collection', '/api/spaces', 'GET, POST'],
    ['the aggregate resource', '/api/aggregate', 'GET'],
    ['a Space resource', `/api/spaces/${SPACE_ID}`, 'GET'],
  ])('does not add an implicit HEAD resource for %s', async (_name, path, allow) => {
    const response = await createSpaceHttpApp(repository()).request(path, { method: 'HEAD' });

    expect(response.status).toBe(405);
    expect(response.headers.get('allow')).toBe(allow);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('content-type')).toBe('application/problem+json');
    await expect(response.text()).resolves.toBe('');
  });

  // The declared methods reject a non-UUID through `validateSpaceId`, so this
  // reaches the same judgement by the other graph: an undeclared method has no
  // validator to run and lands in `app.notFound()`, which has to identify the
  // path itself rather than advertise `Allow` for a resource that cannot exist.
  //
  // HEAD is in that same position and must reach the same judgement. A guard
  // that matches the resource shape without reading the identity answers 405
  // `Allow: GET` for a path no method can address, so it advertises a resource
  // that cannot exist and disagrees with GET on the same URL.
  it.each([
    ['an undeclared method', 'DELETE'],
    // Hono strips a HEAD response's body itself, so the guard that intercepts
    // HEAD is observable only in the status and headers. The empty string is
    // asserted rather than ignored: it is why the guard cannot simply be
    // deleted and left to the GET graph, which answers 200 with nothing.
    ['HEAD', 'HEAD'],
  ])('rejects an invalid path identity for %s', async (_name, method) => {
    const response = await createSpaceHttpApp(repository()).request('/api/spaces/not-a-uuid', {
      method,
    });

    expect(response.status).toBe(400);
    expect(response.headers.get('allow')).toBeNull();
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('content-type')).toBe('application/problem+json');
    if (method === 'HEAD') {
      await expect(response.text()).resolves.toBe('');
    } else {
      await expectProblem(response, 'invalid-space-id', 'Use a UUID for the Space id.');
    }
  });

  // The `undefined` arm of `unservedContractPath`, which nothing else reaches:
  // a path not on the contract at all has no `Allow` to advertise, so the HEAD
  // guard has to let it fall through to `app.notFound()` rather than answer 405
  // for a resource that does not exist. A guard returning a refusal here instead
  // would pass every other case in this file.
  it('lets HEAD fall through to not-found for a path off the contract', async () => {
    const response = await createSpaceHttpApp(repository()).request('/api/unknown', {
      method: 'HEAD',
    });

    expect(response.status).toBe(404);
    expect(response.headers.get('allow')).toBeNull();
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('content-type')).toBe('application/problem+json');
    await expect(response.text()).resolves.toBe('');
  });

  // `c.notFound()` inside the handler installed by `app.notFound()` calls that
  // same handler — Hono seeds the Context's not-found handler from the app's —
  // so it recurses until the stack blows. Every path off the declared contract
  // reached it, including the trailing slash a browser address bar produces.
  it.each(['/', '/api', '/api/spaces/', '/api/aggregate/', '/index.html', '/api/spaces/one/two'])(
    'answers %s outside the declared contract without recursing',
    async (path) => {
      const response = await createSpaceHttpApp(repository()).request(path);

      await expectProblem(response, 'not-found', 'Use a declared Space API path.');
    },
  );
});

// The normalization matches `Content-Type` exactly, which holds only while
// `c.json()` sets a bare `application/json` for Hono to rewrite. An upgrade
// emitting its own `charset` would not match, and every JSON response would
// silently carry a different header than the commit path pinned above — so the
// invariant is asserted across the whole status range rather than one path.
describe('Space HTTP response media', () => {
  const JSON_MEDIA = 'application/json; charset=utf-8';
  const PROBLEM_MEDIA = 'application/problem+json';
  const post = (body: string, contentType = 'application/json') => ({
    method: 'POST',
    headers: { 'Content-Type': contentType },
    body,
  });
  const commitBody = JSON.stringify(encodeCommitRequest(updateCommit()));

  it('normalizes the media type of every JSON response', async () => {
    const swallowed: unknown[] = [];
    const oversized = `{"padding":"${'x'.repeat(MAX_COMMIT_BODY_BYTES)}"}`;

    const cases = [
      {
        status: 200,
        contentType: JSON_MEDIA,
        request: () => createSpaceHttpApp(repository()).request('/api/spaces'),
      },
      {
        status: 200,
        contentType: JSON_MEDIA,
        request: () => createSpaceHttpApp(repository()).request(`/api/spaces/${SPACE_ID}`),
      },
      {
        status: 200,
        contentType: JSON_MEDIA,
        request: () => createSpaceHttpApp(repository()).request('/api/aggregate'),
      },
      {
        status: 404,
        contentType: PROBLEM_MEDIA,
        request: () =>
          createSpaceHttpApp(repository({ loadSpace: () => Promise.resolve(undefined) })).request(
            `/api/spaces/${SPACE_ID}`,
          ),
      },
      {
        status: 400,
        contentType: PROBLEM_MEDIA,
        request: () => createSpaceHttpApp(repository()).request('/api/spaces/not-a-uuid'),
      },
      {
        status: 400,
        contentType: PROBLEM_MEDIA,
        request: () =>
          createSpaceHttpApp(repository()).request('/api/spaces/not-a-uuid', { method: 'DELETE' }),
      },
      {
        status: 404,
        contentType: PROBLEM_MEDIA,
        request: () => createSpaceHttpApp(repository()).request('/off-contract'),
      },
      {
        status: 405,
        contentType: PROBLEM_MEDIA,
        request: () =>
          createSpaceHttpApp(repository()).request('/api/spaces', { method: 'DELETE' }),
      },
      {
        status: 200,
        contentType: JSON_MEDIA,
        request: () => createSpaceHttpApp(repository()).request('/api/spaces', post(commitBody)),
      },
      {
        status: 400,
        contentType: PROBLEM_MEDIA,
        request: () => createSpaceHttpApp(repository()).request('/api/spaces', post('not json')),
      },
      {
        status: 400,
        contentType: PROBLEM_MEDIA,
        request: () => createSpaceHttpApp(repository()).request('/api/spaces', post('{}')),
      },
      {
        status: 415,
        contentType: PROBLEM_MEDIA,
        request: () =>
          createSpaceHttpApp(repository()).request(
            '/api/spaces',
            post('{}', 'text/plain; charset=utf-8'),
          ),
      },
      {
        status: 413,
        contentType: PROBLEM_MEDIA,
        request: () => createSpaceHttpApp(repository()).request('/api/spaces', post(oversized)),
      },
      // Conflict and refusal encode whole documents rather than a message, so
      // each reaches `context.json` by a different graph than its neighbours —
      // and neither is a Problem, which is the distinction this pins.
      {
        status: 409,
        contentType: JSON_MEDIA,
        request: () =>
          createSpaceHttpApp(
            repository({
              commit: () =>
                Promise.resolve({
                  kind: 'conflict' as const,
                  conflicts: [{ spaceId: SPACE_ID, current: loaded }],
                }),
            }),
          ).request('/api/spaces', post(commitBody)),
      },
      {
        status: 422,
        contentType: JSON_MEDIA,
        request: () =>
          createSpaceHttpApp(
            repository({
              commit: () =>
                Promise.resolve({
                  kind: 'aggregate-refused' as const,
                  errors: [
                    {
                      kind: 'space-card-target-missing' as const,
                      spaceId: SPACE_ID,
                      cardId: CARD_ID,
                      targetSpaceId: TARGET_ID,
                    },
                  ],
                }),
            }),
          ).request('/api/spaces', post(commitBody)),
      },
      {
        status: 503,
        contentType: PROBLEM_MEDIA,
        request: () =>
          createSpaceHttpApp(repository({ listSpaces: () => Promise.reject(new Error('down')) }), {
            logError: (message) => swallowed.push(message),
          }).request('/api/spaces'),
      },
    ];

    const responses = await Promise.all(cases.map(async (testCase) => testCase.request()));

    expect(swallowed).toEqual(['Failed to list spaces']);
    responses.forEach((response, index) => {
      expect(response.status).toBe(cases[index]?.status);
      expect(response.headers.get('content-type')).toBe(cases[index]?.contentType);
      expect(response.headers.get('cache-control')).toBe('no-store');
    });
  });
});

describe('Space HTTP exception containment', () => {
  it.each([
    [400, 'invalid-request'],
    [401, 'unauthorized'],
    [403, 'forbidden'],
    [404, 'not-found'],
    [405, 'method-not-allowed'],
    [408, 'request-timeout'],
    [413, 'payload-too-large'],
    [415, 'unsupported-media-type'],
    [422, 'invalid-snapshot'],
    [429, 'rate-limited'],
    [503, 'persistence-unavailable'],
    [418, 'internal-error'],
  ] as const)('maps an HTTP %s exception to %s', async (status, code) => {
    const app = createSpaceHttpApp(repository());
    app.get('/throw-http', () => {
      throw new HTTPException(status, { message: `status ${status}` });
    });

    await expectProblem(await app.request('/throw-http'), code, `status ${status}`);
  });

  /*
   * `new HTTPException(status)` with no `options.message` carries an empty
   * `Error#message`, and Problem Details requires a non-empty `detail`. The
   * catalogued title is the fallback, and it is named here rather than left
   * unasserted: `onError` must not throw its way out of this case, because Hono
   * has no third attempt and the throw would escape as an exception with no
   * message, losing the real status and code behind a generic 500.
   */
  it('supplies detail for a message-less HTTP exception', async () => {
    const app = createSpaceHttpApp(repository());
    app.get('/throw-http', () => {
      throw new HTTPException(401);
    });

    await expectProblem(
      await app.request('/throw-http'),
      'unauthorized',
      problemCatalogue.unauthorized.title,
    );
  });

  it('contains a non-HTTP throw even when its log sink also throws', async () => {
    const app = createSpaceHttpApp(repository(), {
      logError: () => {
        throw new Error('logger failed');
      },
    });
    app.get('/throw-value', () => {
      throw new Error('handler failed');
    });

    await expectProblem(await app.request('/throw-value'), 'internal-error');
  });
});
