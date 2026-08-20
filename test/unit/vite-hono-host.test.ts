import {
  Agent,
  createServer,
  request as httpRequest,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http';
import { connect } from 'node:net';
import { uuidSchema, type SpaceSnapshot } from '@project/core';
import { createSpaceHttpApp, MAX_COMMIT_BODY_BYTES } from '@project/http';
import { encodeCommitRequest, type SpaceResourceRepository } from '@project/persistence';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { spaceHttpPlugin } from '../../packages/app/vite-space-http-plugin';
import { send } from '../support/raw-http-request';

const SPACE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000001');
const CARD_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000002');
const snapshot: SpaceSnapshot = {
  id: SPACE_ID,
  document: { version: 1, title: 'One' },
  cards: [{ id: CARD_ID, document: { title: 'A', kind: 'markdown', body: '' } }],
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
  commitSpace: () => Promise.resolve({ kind: 'rejected', code: 'not-found', message: 'missing' }),
});

const startHost = async (
  application: ReturnType<typeof createSpaceHttpApp>,
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
  const createApp = vi.fn(() => application);
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
      method: 'PUT',
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
    const commitSpace = vi.fn(() => Promise.resolve({ kind: 'committed' as const, revision: 3n }));
    const { host } = await startHost(createSpaceHttpApp({ ...repository(), commitSpace }));

    const response = await send(
      host.url,
      `/api/spaces/${SPACE_ID}`,
      JSON.stringify(encodeCommitRequest(snapshot, 2n)),
      { 'content-type': 'application/json ; charset=utf-8' },
    );

    expect(response.status).toBe(200);
    expect(JSON.parse(response.body)).toEqual({ revision: '3' });
    expect(commitSpace).toHaveBeenCalledWith(snapshot, 2n);
  });

  it('drains an oversized chunked body and reuses the connection', async () => {
    const { host, connections } = await startHost(createSpaceHttpApp(repository()));
    const agent = new Agent({ keepAlive: true, maxSockets: 1 });
    try {
      const rejected = await send(
        host.url,
        '/api/spaces/00000000-0000-4000-8000-000000000001',
        `{"padding":"${'x'.repeat(MAX_COMMIT_BODY_BYTES)}"}`,
        { 'content-type': 'application/json', 'transfer-encoding': 'chunked' },
        agent,
      );
      expect(rejected.status).toBe(413);

      const accepted = await send(host.url, '/api/spaces', '', {}, agent, 'GET');
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
          '/api/spaces/00000000-0000-4000-8000-000000000001',
          `{"padding":"${'x'.repeat(MAX_COMMIT_BODY_BYTES * 4)}"}`,
          headers,
          agent,
        );
        expect(rejected.status).toBe(413);

        const accepted = await send(host.url, '/api/spaces', '', {}, agent, 'GET');
        expect(accepted.status).toBe(200);
        expect(connections).toHaveLength(2);
        expect(connections[1]).toBe(connections[0]);
      } finally {
        agent.destroy();
      }
    },
  );

  it('reuses the connection after every early request rejection', async () => {
    const { host, connections } = await startHost(createSpaceHttpApp(repository()));
    const agent = new Agent({ keepAlive: true, maxSockets: 1 });
    const resource = '/api/spaces/00000000-0000-4000-8000-000000000001';
    const rejectedRequests = [
      {
        name: 'invalid path identity',
        path: '/api/spaces/not-a-uuid',
        body: '{}',
        headers: { 'content-type': 'application/json' },
        method: 'PUT',
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
        path: resource,
        body: '{}',
        headers: { 'content-type': 'text/plain' },
        method: 'PUT',
        status: 415,
      },
      {
        name: 'unsupported charset',
        path: resource,
        body: '{}',
        headers: { 'content-type': 'application/json; charset=utf-16' },
        method: 'PUT',
        status: 415,
      },
      {
        name: 'unsupported content encoding',
        path: resource,
        body: '{}',
        headers: { 'content-type': 'application/json', 'content-encoding': 'gzip' },
        method: 'PUT',
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
          agent,
          rejectedRequest.method,
        );
        expect(rejected.status, rejectedRequest.name).toBe(rejectedRequest.status);

        const accepted = await send(host.url, '/api/spaces', '', {}, agent, 'GET');
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
          commitSpace: () => {
            commitAttempts += 1;
            return Promise.resolve({
              kind: 'rejected' as const,
              code: 'not-found' as const,
              message: 'missing',
            });
          },
        },
        { logError: () => undefined },
      ),
    );

    await abortChunkedRequest(host.url, '/api/spaces/00000000-0000-4000-8000-000000000001');

    // The next request completing is the ordering barrier: the host answered it
    // on the same server the abort was handed to, so that handling has run.
    await expect(fetch(`${host.url}/api/spaces`).then((response) => response.status)).resolves.toBe(
      200,
    );
    expect(commitAttempts).toBe(0);
  });
});
