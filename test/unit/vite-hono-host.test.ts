import {
  Agent,
  createServer,
  request as httpRequest,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http';
import { connect } from 'node:net';
import {
  FLOW_SPACE_VIEW_ID,
  encodeCompactUuid,
  uuidSchema,
  type SpaceSnapshot,
} from '@project/core';
import { createSpaceHttpApp, MAX_COMMIT_BODY_BYTES, MAX_DRAINED_BODY_BYTES } from '@project/http';
import {
  decodeProblemDetails,
  encodeCommitRequest,
  type SpaceResourceRepository,
} from '@project/persistence';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { spaceHttpPlugin } from '../../packages/app/vite-space-http-plugin';
import { send } from '../support/raw-http-request';
import { MemorySpaceRepository } from '../support/memory-space-repository';
import { createSpaceHost, type SpaceHostApplication } from '../../src/http/space-host';

const SPACE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000001');
const CARD_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000002');
const snapshot: SpaceSnapshot = {
  id: SPACE_ID,
  document: { version: 1, title: 'One' },
  cards: [{ id: CARD_ID, document: { title: 'A', kind: 'markdown', body: '' } }],
};
const updateCommit = {
  changes: [
    { kind: 'update' as const, spaceId: SPACE_ID, snapshot, expectedRevision: 2n },
  ] as const,
};

type Middleware = (
  request: IncomingMessage,
  response: ServerResponse,
  next: (error?: unknown) => void,
) => void;

interface RunningHost {
  url: string;
  close(): Promise<void>;
}

const hosts: RunningHost[] = [];

const repository = (): SpaceResourceRepository => ({
  listSpaces: () => Promise.resolve([]),
  loadSpace: () => Promise.resolve(undefined),
  loadAggregate: () => Promise.resolve({ metaSpaceId: SPACE_ID, spaces: [] }),
  commit: () => Promise.resolve({ kind: 'rejected', code: 'invalid-commit', message: 'missing' }),
});

const startHost = async (
  application: ReturnType<typeof createSpaceHttpApp> | SpaceHostApplication,
  fallback: (request: IncomingMessage, response: ServerResponse) => void = (_request, response) => {
    response.statusCode = 404;
    response.end();
  },
  // Development loads through Vite's SSR module runner and preview through a
  // plain import of the built artifact. Both reach the same `installMiddleware`,
  // but only by being registered — the hook a host never installs serves
  // nothing, and preview is the branch that carries the built PostgreSQL
  // runtime, so it is driven over a socket rather than trusted to symmetry.
  hook: 'development' | 'preview' = 'development',
) => {
  let middleware: Middleware | undefined;
  const hosted = Object.assign(application, {
    resolveProductRequest:
      'resolveProductRequest' in application
        ? application.resolveProductRequest.bind(application)
        : () => Promise.resolve(undefined),
  });
  const createApp = vi.fn(() => hosted);
  const plugin = spaceHttpPlugin({
    developmentModule: '/runtime.ts',
    previewModule: '/runtime.js',
    loadPreviewModule: (modulePath) =>
      modulePath === '/runtime.js'
        ? Promise.resolve({ createApp })
        : Promise.reject(new Error(`Unexpected preview module ${modulePath}`)),
  });
  const configure = hook === 'preview' ? plugin.configurePreviewServer : plugin.configureServer;
  if (typeof configure !== 'function') throw new Error(`Expected ${hook} hook`);
  // SAFETY: `this` is unused by either hook's implementation, and the fake
  // server exposes exactly the members `configureServer`/`configurePreviewServer`
  // read (`ssrLoadModule`, `middlewares.use`) — not Vite's full server interface.
  void configure.call(
    {} as never,
    {
      ssrLoadModule: () => Promise.resolve({ createApp }),
      middlewares: { use: (installed: Middleware) => (middleware = installed) },
    } as never,
  );
  if (middleware === undefined) throw new Error('Expected HTTP middleware');

  const installed = middleware;
  const connections: IncomingMessage['socket'][] = [];
  const server = createServer((request, response) => {
    connections.push(request.socket);
    installed(request, response, (error) => {
      if (error === undefined) fallback(request, response);
      else {
        response.statusCode = 500;
        response.end();
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('Expected TCP address');
  const host = {
    url: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  };
  hosts.push(host);
  return { host, createApp, connections };
};

const abortChunkedRequest = (baseUrl: string, path: string): Promise<void> =>
  new Promise((resolve) => {
    const request = httpRequest(new URL(path, baseUrl), {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'transfer-encoding': 'chunked' },
    });
    request.on('error', () => resolve());
    request.on('socket', (socket) => {
      socket.once('connect', () => {
        // Destroy from the write callback, not a timer. A fixed delay races the
        // flush: too early and the host never sees a partial body, too late and
        // the test pays the wait on every run.
        request.write('{"snapshot":', () => request.destroy());
      });
    });
  });

/**
 * A request line `node:http`'s client cannot produce. Node's own parser accepts
 * targets that are not valid URL references and hands them to the middleware
 * verbatim, so reaching that case means writing the line onto the socket.
 */
const sendRequestLine = (baseUrl: string, target: string): Promise<string> =>
  new Promise((resolve, reject) => {
    const { hostname, port } = new URL(baseUrl);
    const socket = connect(Number(port), hostname, () => {
      socket.write(`GET ${target} HTTP/1.1\r\nHost: hyper.test\r\nConnection: close\r\n\r\n`);
    });
    let received = '';
    socket.on('data', (chunk: Uint8Array) => (received += Buffer.from(chunk).toString('utf8')));
    socket.on('close', () => resolve(received.split('\r\n')[0] ?? ''));
    socket.on('error', reject);
  });

afterEach(async () => {
  await Promise.all(hosts.splice(0).map((host) => host.close()));
});

describe('Vite Hono host', () => {
  it('loads one Fetch application and serves its API through a real Node socket', async () => {
    const { host, createApp } = await startHost(createSpaceHttpApp(repository()));

    await expect(
      fetch(`${host.url}/api/spaces`).then((response) => response.json()),
    ).resolves.toEqual([]);
    await expect(fetch(`${host.url}/api/spaces`).then((response) => response.status)).resolves.toBe(
      200,
    );
    expect(createApp).toHaveBeenCalledOnce();
  });

  it('leaves non-API requests to the next Vite middleware', async () => {
    const { host } = await startHost(createSpaceHttpApp(repository()), (_request, response) => {
      response.setHeader('Content-Type', 'text/html');
      response.end('<main>Vite application</main>');
    });

    const response = await fetch(`${host.url}/index.html`);

    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toBe('<main>Vite application</main>');
  });

  it('redirects root to the compact Entry Space URL without reading its document', async () => {
    const stored = { snapshot, revision: 0n, exportedRevision: null };
    const spaceRepository = new MemorySpaceRepository([stored], SPACE_ID);
    const loadSpace = vi.spyOn(spaceRepository, 'loadSpace');
    const { host } = await startHost(createSpaceHost(spaceRepository));

    const response = await fetch(`${host.url}/`, { redirect: 'manual' });

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe(`/spaces/${encodeCompactUuid(SPACE_ID)}`);
    // The redirect target's first act is to load this Space, and the id came
    // from the row that holds it — so loading it here to prove it exists is a
    // read the answer never depended on.
    expect(loadSpace).not.toHaveBeenCalled();
  });

  it('answers malformed and unresolved Space URLs before Vite fallback', async () => {
    const hostApp = createSpaceHost(new MemorySpaceRepository());
    const { host } = await startHost(hostApp);

    await expect(
      fetch(`${host.url}/spaces/not-canonical`).then((value) => value.status),
    ).resolves.toBe(400);
    await expect(
      fetch(`${host.url}/spaces/${encodeCompactUuid(SPACE_ID)}`).then((value) => value.status),
    ).resolves.toBe(404);
    await expect(fetch(`${host.url}/`).then((value) => value.status)).resolves.toBe(404);
  });

  it('serves product failures as Problem Details or a browser error surface', async () => {
    const { host } = await startHost(createSpaceHost(new MemorySpaceRepository()));
    const path = `/spaces/${encodeCompactUuid(SPACE_ID)}`;

    const protocol = await fetch(`${host.url}${path}`, {
      headers: { Accept: 'application/problem+json' },
    });
    expect(protocol.status).toBe(404);
    expect(protocol.headers.get('content-type')).toBe('application/problem+json');
    expect(decodeProblemDetails(await protocol.json())).toMatchObject({
      status: 404,
      title: 'Not found',
    });

    const browser = await fetch(`${host.url}${path}`, { headers: { Accept: 'text/html' } });
    expect(browser.status).toBe(404);
    expect(browser.headers.get('content-type')).toBe('text/html; charset=utf-8');
    await expect(browser.text()).resolves.toContain('<h1>Not found</h1>');

    const head = await fetch(`${host.url}${path}`, {
      method: 'HEAD',
      headers: { Accept: 'text/html' },
    });
    expect(head.status).toBe(404);
    expect(head.headers.get('content-type')).toBe('text/html; charset=utf-8');
    await expect(head.text()).resolves.toBe('');
  });

  it('lets an existing canonical Space URL reach the SPA fallback', async () => {
    const stored = { snapshot, revision: 0n, exportedRevision: null };
    const hostApp = createSpaceHost(new MemorySpaceRepository([stored]));
    const { host } = await startHost(hostApp, (_request, response) => {
      response.setHeader('Content-Type', 'text/html');
      response.end('<main>Canonical Space</main>');
    });

    const response = await fetch(`${host.url}/spaces/${encodeCompactUuid(SPACE_ID)}`);

    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toBe('<main>Canonical Space</main>');
  });

  it('lets an existing Computed View destination reach the SPA fallback', async () => {
    const stored = { snapshot, revision: 0n, exportedRevision: null };
    const spaceRepository = new MemorySpaceRepository([stored]);
    const loadSpace = vi.spyOn(spaceRepository, 'loadSpace');
    const hostApp = createSpaceHost(spaceRepository);
    const { host } = await startHost(hostApp, (_request, response) => {
      response.end('<main>Computed View</main>');
    });

    const response = await fetch(
      `${host.url}/spaces/${encodeCompactUuid(SPACE_ID)}/views/${encodeCompactUuid(FLOW_SPACE_VIEW_ID)}`,
    );

    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toBe('<main>Computed View</main>');
    expect(loadSpace).toHaveBeenCalledOnce();
    expect(loadSpace).toHaveBeenCalledWith(SPACE_ID);
  });

  it('leaves a path outside product addressing to the SPA fallback without loading', async () => {
    const spaceRepository = new MemorySpaceRepository();
    const loadSpace = vi.spyOn(spaceRepository, 'loadSpace');
    const hostApp = createSpaceHost(spaceRepository);
    const { host } = await startHost(hostApp, (_request, response) => {
      response.end('<main>Outside product addressing</main>');
    });

    const response = await fetch(`${host.url}/index.html`);

    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toBe('<main>Outside product addressing</main>');
    expect(loadSpace).not.toHaveBeenCalled();
  });

  it('resolves HEAD like GET while sending no product response body', async () => {
    const stored = { snapshot, revision: 0n, exportedRevision: null };
    const hostApp = createSpaceHost(new MemorySpaceRepository([stored], SPACE_ID));
    const { host } = await startHost(hostApp, (_request, response) => {
      response.statusCode = 200;
      response.end('<main>Vite fallback</main>');
    });

    const root = await fetch(`${host.url}/`, { method: 'HEAD', redirect: 'manual' });
    expect(root.status).toBe(302);
    expect(root.headers.get('location')).toBe(`/spaces/${encodeCompactUuid(SPACE_ID)}`);
    await expect(root.text()).resolves.toBe('');

    const malformed = await fetch(`${host.url}/spaces/not-canonical`, { method: 'HEAD' });
    expect(malformed.status).toBe(400);
    await expect(malformed.text()).resolves.toBe('');

    const missing = await fetch(`${host.url}/spaces/${encodeCompactUuid(CARD_ID)}`, {
      method: 'HEAD',
    });
    expect(missing.status).toBe(404);
    await expect(missing.text()).resolves.toBe('');

    const existing = await fetch(`${host.url}/spaces/${encodeCompactUuid(SPACE_ID)}`, {
      method: 'HEAD',
    });
    expect(existing.status).toBe(200);
    await expect(existing.text()).resolves.toBe('');
  });

  /**
   * A stored Layout carrying an available Computed View's id. Intake rejects
   * one, so this is a document that reached storage some other way, and the
   * address then names two Space Views with no rule to choose between them (ADR
   * 0069). The fault is in what the host holds rather than in what was asked,
   * which is the difference between this and the 404 beside it.
   */
  it('answers a Space View identity collision as a server fault', async () => {
    const collided = {
      snapshot: {
        ...snapshot,
        document: {
          ...snapshot.document,
          layouts: [
            {
              id: FLOW_SPACE_VIEW_ID,
              title: 'Layout',
              kind: 'positioned' as const,
              positions: { [CARD_ID]: { x: 0, y: 0, open: false as const } },
              graphs: [],
            },
          ],
        },
      },
      revision: 0n,
      exportedRevision: null,
    };
    const { host } = await startHost(createSpaceHost(new MemorySpaceRepository([collided])));

    const response = await fetch(
      `${host.url}/spaces/${encodeCompactUuid(SPACE_ID)}/views/${encodeCompactUuid(FLOW_SPACE_VIEW_ID)}`,
    );

    expect(response.status).toBe(500);
    await expect(response.text()).resolves.toContain(FLOW_SPACE_VIEW_ID);
  });

  /**
   * A product URL is a web address and carries real HTTP semantics (ADR 0069),
   * so a method the contract does not serve is answered rather than handed to
   * the SPA fallback — which was returning the whole application shell with a
   * 200 for the very URL GET answers 400.
   *
   * The same shape as `unservedContractPath` gives the API tree: the identity
   * is judged first, so a segment that is not a compact id is the 400 GET says
   * about that URL for every method, and only a readable address gets the 405
   * and its `Allow`.
   */
  it('refuses a method the product contract does not serve', async () => {
    const stored = { snapshot, revision: 0n, exportedRevision: null };
    const spaceRepository = new MemorySpaceRepository([stored], SPACE_ID);
    const loadSpace = vi.spyOn(spaceRepository, 'loadSpace');
    const { host } = await startHost(createSpaceHost(spaceRepository), (_request, response) => {
      response.setHeader('Content-Type', 'text/html');
      response.end('<main>Vite fallback</main>');
    });

    const posted = await fetch(`${host.url}/spaces/${encodeCompactUuid(SPACE_ID)}`, {
      method: 'POST',
    });
    expect(posted.status).toBe(405);
    expect(posted.headers.get('allow')).toBe('GET, HEAD');
    // Answered on the address alone: whether the Space exists cannot change it.
    expect(loadSpace).not.toHaveBeenCalled();

    const root = await fetch(`${host.url}/`, { method: 'DELETE' });
    expect(root.status).toBe(405);

    const malformed = await fetch(`${host.url}/spaces/not-canonical`, { method: 'POST' });
    expect(malformed.status).toBe(400);

    const outside = await fetch(`${host.url}/index.html`, { method: 'POST' });
    expect(outside.status).toBe(200);
    await expect(outside.text()).resolves.toBe('<main>Vite fallback</main>');
  });

  it('serves the API from the built runtime and leaves the rest to preview static assets', async () => {
    const { host, createApp } = await startHost(
      createSpaceHttpApp(repository()),
      (_request, response) => {
        response.setHeader('Content-Type', 'text/html');
        response.end('<main>Built application</main>');
      },
      'preview',
    );

    await expect(
      fetch(`${host.url}/api/spaces`).then((response) => response.json()),
    ).resolves.toEqual([]);
    await expect(fetch(`${host.url}/index.html`).then((response) => response.text())).resolves.toBe(
      '<main>Built application</main>',
    );
    expect(createApp).toHaveBeenCalledOnce();
  });

  /*
   * The accepted media path, which no other socket-level test reaches: every
   * other request here is rejected before a body is read.
   *
   * `application/json ; charset=utf-8` is legal under RFC 9110 and rejected by
   * Hono's narrower json regex, so serving it at all depends on
   * `requireSupportedRequestMedia` rebuilding the request with a canonical
   * header. That rebuild calls the *global* `Request` constructor on whatever
   * request object the host handed in — and `getRequestListener` replaces
   * `globalThis.Request`/`Response` with its own lightweight classes, so the
   * native constructor would be handed a foreign instance. Passing
   * `overrideGlobalObjects: false` therefore breaks every real commit while
   * leaving all the rejection paths above green.
   */
  it('commits through a rewritten media type over a real socket', async () => {
    const commit = vi.fn(() =>
      Promise.resolve({
        kind: 'committed' as const,
        revisions: [{ spaceId: SPACE_ID, revision: 3n }],
        deletedSpaceIds: [],
      }),
    );
    const { host } = await startHost(createSpaceHttpApp({ ...repository(), commit }));

    const response = await send(
      host.url,
      '/api/spaces',
      JSON.stringify(encodeCommitRequest(updateCommit)),
      { 'content-type': 'application/json ; charset=utf-8' },
      'POST',
    );

    expect(response.status).toBe(200);
    expect(JSON.parse(response.body)).toEqual({
      revisions: [{ spaceId: SPACE_ID, revision: '3' }],
      deletedSpaceIds: [],
    });
    expect(commit).toHaveBeenCalledWith(updateCommit);
  });

  it('drains an oversized chunked body and reuses the connection', async () => {
    const { host, connections } = await startHost(createSpaceHttpApp(repository()));
    const agent = new Agent({ keepAlive: true, maxSockets: 1 });
    try {
      const rejected = await send(
        host.url,
        '/api/spaces',
        `{"padding":"${'x'.repeat(MAX_COMMIT_BODY_BYTES)}"}`,
        { 'content-type': 'application/json', 'transfer-encoding': 'chunked' },
        'POST',
        agent,
      );
      expect(rejected.status).toBe(413);

      const accepted = await send(host.url, '/api/spaces', '', {}, 'GET', agent);
      expect(accepted.status).toBe(200);
      expect(connections).toHaveLength(2);
      expect(connections[1]).toBe(connections[0]);
    } finally {
      agent.destroy();
    }
  });

  it.each([
    { framing: 'declared length', headers: { 'content-type': 'application/json' } },
    {
      framing: 'chunked',
      headers: { 'content-type': 'application/json', 'transfer-encoding': 'chunked' },
    },
  ])(
    'reuses the connection after rejecting a body far over the limit ($framing)',
    async ({ headers }) => {
      const { host, connections } = await startHost(createSpaceHttpApp(repository()));
      const agent = new Agent({ keepAlive: true, maxSockets: 1 });
      try {
        const rejected = await send(
          host.url,
          '/api/spaces',
          `{"padding":"${'x'.repeat(MAX_COMMIT_BODY_BYTES * 4)}"}`,
          headers,
          'POST',
          agent,
        );
        expect(rejected.status).toBe(413);

        const accepted = await send(host.url, '/api/spaces', '', {}, 'GET', agent);
        expect(accepted.status).toBe(200);
        expect(connections).toHaveLength(2);
        expect(connections[1]).toBe(connections[0]);
      } finally {
        agent.destroy();
      }
    },
  );

  // The other half of the drain policy. Below the allowance an oversized body is
  // read to its end and the connection survives its own 413, as above; past the
  // allowance the drain stops, the body is left unconsumed and the socket cannot
  // be reused — a client that never stops sending loses its connection rather
  // than costing us the drain. Only the reuse half was pinned before.
  it('drops the connection when a body outruns the drain allowance', async () => {
    const { host, connections } = await startHost(createSpaceHttpApp(repository()));
    const agent = new Agent({ keepAlive: true, maxSockets: 1 });
    try {
      // The host answers 413 and stops reading, so the client's write may finish
      // or be reset part-way through — the reset is the policy working, not a
      // failure. But a swallowed rejection would also swallow a 500 or a crash,
      // leaving the connection assertions below true for the wrong reason, so
      // whichever outcome the client saw is checked: a response that arrived at
      // all has to be the 413.
      const overflow = await send(
        host.url,
        '/api/spaces',
        `{"padding":"${'x'.repeat(MAX_DRAINED_BODY_BYTES * 2)}"}`,
        { 'content-type': 'application/json' },
        'POST',
        agent,
      ).then(
        (response) => response,
        () => undefined,
      );
      if (overflow !== undefined) expect(overflow.status).toBe(413);

      // Waited for rather than assumed. A keep-alive agent holding one socket
      // will re-dispatch onto a connection the host has decided to drop but not
      // yet closed, and the follow-up then fails for a reason that is not the
      // policy under test — the CI-only flake this test would otherwise carry.
      const doomed = connections[0];
      await vi.waitFor(() => expect(doomed?.destroyed).toBe(true));

      const accepted = await send(host.url, '/api/spaces', '', {}, 'GET', agent);
      expect(accepted.status).toBe(200);
      expect(connections).toHaveLength(2);
      expect(connections[1]).not.toBe(connections[0]);
    } finally {
      agent.destroy();
    }
  });

  it('reuses the connection after every early request rejection', async () => {
    const { host, connections } = await startHost(createSpaceHttpApp(repository()));
    const agent = new Agent({ keepAlive: true, maxSockets: 1 });
    const resource = '/api/spaces/00000000-0000-4000-8000-000000000001';
    const rejectedRequests = [
      {
        // Body-carrying, as it was before the aggregate endpoint replaced the
        // Space resource. It does not drain — no route matches, so `notFound`
        // answers it before `requireBoundedCommitBody` is reached — and at two
        // bytes there is nothing to drain anyway. What it holds is the graph:
        // the not-found answer must leave the connection as reusable as the
        // middleware rejections beside it, which a bodyless GET would show
        // whether or not the request carried a body at all.
        name: 'invalid path identity',
        path: '/api/spaces/not-a-uuid',
        body: '{}',
        headers: { 'content-type': 'application/json' },
        method: 'POST',
        status: 400,
      },
      {
        name: 'method rejection',
        path: resource,
        body: '{}',
        headers: { 'content-type': 'application/json' },
        method: 'POST',
        status: 405,
      },
      {
        name: 'unsupported media type',
        path: '/api/spaces',
        body: '{}',
        headers: { 'content-type': 'text/plain' },
        method: 'POST',
        status: 415,
      },
      {
        name: 'unsupported charset',
        path: '/api/spaces',
        body: '{}',
        headers: { 'content-type': 'application/json; charset=utf-16' },
        method: 'POST',
        status: 415,
      },
      {
        name: 'unsupported content encoding',
        path: '/api/spaces',
        body: '{}',
        headers: { 'content-type': 'application/json', 'content-encoding': 'gzip' },
        method: 'POST',
        status: 415,
      },
    ] as const;
    try {
      for (const rejectedRequest of rejectedRequests) {
        const before = connections.length;
        const rejected = await send(
          host.url,
          rejectedRequest.path,
          rejectedRequest.body,
          rejectedRequest.headers,
          rejectedRequest.method,
          agent,
        );
        expect(rejected.status, rejectedRequest.name).toBe(rejectedRequest.status);

        const accepted = await send(host.url, '/api/spaces', '', {}, 'GET', agent);
        expect(accepted.status, `${rejectedRequest.name} follow-up`).toBe(200);
        expect(connections[before + 1], `${rejectedRequest.name} socket`).toBe(connections[before]);
      }
    } finally {
      agent.destroy();
    }
  });

  it('leaves a request target the URL parser rejects to the next middleware', async () => {
    const { host } = await startHost(createSpaceHttpApp(repository()), (_request, response) => {
      response.setHeader('Content-Type', 'text/html');
      response.end('<main>Vite application</main>');
    });

    // Node accepts `//[` as a request target; `new URL('//[', base)` throws on
    // the empty IPv6 host. It is not an API path, so it belongs to Vite.
    await expect(sendRequestLine(host.url, '//[')).resolves.toBe('HTTP/1.1 200 OK');
  });

  it('survives a client abort while reading a request body', async () => {
    // Counted, because surviving is only half of it: a half-sent body is the one
    // path where nothing further arrives to end the stream, and a commit built
    // from the bytes that did arrive would be a write the client never asked
    // for. The client is already gone and will never see a response, so the
    // repository is the only place the outcome is observable.
    let commitAttempts = 0;
    const { host } = await startHost(
      createSpaceHttpApp(
        {
          ...repository(),
          commit: () => {
            commitAttempts += 1;
            return Promise.resolve({
              kind: 'rejected' as const,
              code: 'invalid-commit' as const,
              message: 'missing',
            });
          },
        },
        { logError: () => undefined },
      ),
    );

    await abortChunkedRequest(host.url, '/api/spaces');

    // The next request completing is the ordering barrier: the host answered it
    // on the same server the abort was handed to, so that handling has run.
    await expect(fetch(`${host.url}/api/spaces`).then((response) => response.status)).resolves.toBe(
      200,
    );
    expect(commitAttempts).toBe(0);
  });
});
