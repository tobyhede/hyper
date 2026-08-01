import type { IncomingMessage, ServerResponse } from 'node:http';
import { pathToFileURL } from 'node:url';
import { getRequestListener } from '@hono/node-server';
import type { Plugin } from 'vite';

interface FetchApplication {
  fetch(request: Request, env?: unknown): Response | Promise<Response>;
}

interface SpaceHttpRuntime {
  createApp(options?: unknown): Promise<FetchApplication> | FetchApplication;
}

export interface SpaceHttpPluginOptions {
  developmentModule: string;
  previewModule: string;
  runtimeOptions?: unknown;
  /** System boundary injection used only by the plugin's Node-level tests. */
  loadPreviewModule?: (modulePath: string) => Promise<unknown>;
}

// `previewModule` is a filesystem path, and `import()` takes a module specifier.
// The two only coincide for tame POSIX paths: a `#` would start a URL fragment
// and a Windows drive letter reads as a scheme, so the conversion is explicit.
const defaultPreviewLoader = async (modulePath: string): Promise<unknown> =>
  import(pathToFileURL(modulePath).href);

type Next = (error?: unknown) => void;

/**
 * Node's parser is more permissive than the URL parser: it accepts request
 * targets that are not valid URL references — `//[` among them, an empty IPv6
 * host — and hands them to middleware verbatim. `new URL` throws on those, and
 * this runs synchronously inside the request handler, so the throw escapes the
 * middleware entirely; the host never answers and the socket hangs. A target we
 * cannot parse is certainly not one of our API paths, so it belongs to Vite.
 */
const isApiRequest = (request: IncomingMessage): boolean => {
  const pathname = URL.parse(request.url ?? '/', 'http://hyper.invalid')?.pathname;
  return pathname === '/api' || (pathname?.startsWith('/api/') ?? false);
};

const asRuntime = (loaded: unknown, modulePath: string): SpaceHttpRuntime => {
  if (
    typeof loaded !== 'object' ||
    loaded === null ||
    typeof (loaded as SpaceHttpRuntime).createApp !== 'function'
  ) {
    throw new Error(`${modulePath} does not export a createApp function`);
  }
  return loaded as SpaceHttpRuntime;
};

const installMiddleware = (
  register: (
    middleware: (request: IncomingMessage, response: ServerResponse, next: Next) => void,
  ) => void,
  runtime: Promise<unknown>,
  modulePath: string,
  runtimeOptions: unknown,
): void => {
  const listener = runtime.then(async (loaded) => {
    const application = await asRuntime(loaded, modulePath).createApp(runtimeOptions);
    return getRequestListener((request, env) => application.fetch(request, env));
  });
  // A runtime that fails to load rejects once, here, and nothing is waiting on
  // it until the first request arrives — Node calls that an unhandled rejection
  // and takes the server down with it. Marking it handled costs nothing: the
  // same settled promise still delivers the real error to `next` per request.
  listener.catch(() => undefined);
  register((request, response, next) => {
    if (!isApiRequest(request)) {
      next();
      return;
    }
    void listener.then((handle) => handle(request, response)).catch(next);
  });
};

/** Host the fixed server-side persistence runtime without importing it at config time. */
export function spaceHttpPlugin(options: SpaceHttpPluginOptions): Plugin {
  return {
    name: 'space-http-persistence',
    configureServer(server) {
      installMiddleware(
        (middleware) => server.middlewares.use(middleware),
        server.ssrLoadModule(options.developmentModule),
        options.developmentModule,
        options.runtimeOptions,
      );
    },
    configurePreviewServer(server) {
      const load = options.loadPreviewModule ?? defaultPreviewLoader;
      installMiddleware(
        (middleware) => server.middlewares.use(middleware),
        load(options.previewModule),
        options.previewModule,
        options.runtimeOptions,
      );
    },
  };
}
