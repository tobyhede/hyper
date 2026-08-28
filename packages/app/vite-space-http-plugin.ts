import type { IncomingMessage, ServerResponse } from 'node:http';
import { pathToFileURL } from 'node:url';
import { getRequestListener } from '@hono/node-server';
import type { Plugin } from 'vite';
// Relative, and by rule: Vite loads this config in Node and externalizes bare
// specifiers, so `@project/http` would hand Node the package's TypeScript
// source and the dev server would not start at all. Type-only, so nothing of
// the package reaches the bundle either way — what it buys is that the seam
// this host writes is the one the runtime composes, rather than a second copy
// of it here, which is what the two had already become.
import type { ProductRequestResolver, ProductResponse } from '../http/src/index';

interface FetchApplication extends ProductRequestResolver {
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

const pathname = (request: IncomingMessage): string | undefined =>
  URL.parse(request.url ?? '/', 'http://hyper.invalid')?.pathname ?? undefined;

const writeProductResponse = (
  response: ServerResponse,
  product: ProductResponse,
  includeBody: boolean,
): void => {
  response.statusCode = product.status;
  for (const [name, value] of Object.entries(product.headers ?? {})) {
    response.setHeader(name, value);
  }
  response.end(includeBody ? product.body : undefined);
};

const asRuntime = (loaded: unknown, modulePath: string): SpaceHttpRuntime => {
  if (
    typeof loaded !== 'object' ||
    loaded === null ||
    // SAFETY: this probe is the shape check itself — a non-function `createApp`
    // (including a missing one) fails it and throws below before the widened
    // return can be reached.
    typeof (loaded as SpaceHttpRuntime).createApp !== 'function'
  ) {
    throw new Error(`${modulePath} does not export a createApp function`);
  }
  // SAFETY: the guard above confirmed `loaded` is a non-null object whose
  // `createApp` is a function — the one member `SpaceHttpRuntime` declares.
  // What that application then *answers* is checked where it is created: this
  // sees the module, and `resolveProductRequest` is on what `createApp` returns.
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
  const host = runtime.then(async (loaded) => {
    const created = await asRuntime(loaded, modulePath).createApp(runtimeOptions);
    // The module probe above sees `createApp`; this is the application it
    // answers, and the two are different objects. A runtime that hands back a
    // bare Hono app satisfies both the probe and this file's declared type, then
    // fails on the first request off the API tree with `created
    // .resolveProductRequest is not a function` — once per request, naming
    // nothing that locates the runtime. Startup is the last place the module can
    // still be named, so it is where the disagreement is reported.
    if (typeof created.resolveProductRequest !== 'function') {
      throw new Error(`${modulePath}'s createApp returns no resolveProductRequest`);
    }
    // `getRequestListener` replaces `globalThis.Request`/`Response` with its own
    // lightweight classes unless `overrideGlobalObjects: false` is passed, and
    // it defines them non-writable and non-configurable, so the swap is
    // process-wide and permanent. Leave it enabled: the application rebuilds a
    // request to canonicalise its media type, and that calls the *global*
    // `Request` constructor on an instance this adapter made. Disabling the
    // override answers 500 to every commit; `vite-hono-host.test.ts` pins both
    // the accepted and the oversized path against exactly that change.
    return {
      created,
      handle: getRequestListener((request, env) => created.fetch(request, env)),
    };
  });
  // A runtime that fails to load rejects once, here, and nothing is waiting on
  // it until the first request arrives — Node calls that an unhandled rejection
  // and takes the server down with it. Marking it handled costs nothing: the
  // same settled promise still delivers the real error to `next` per request.
  host.catch(() => undefined);
  register((request, response, next) => {
    if (isApiRequest(request)) {
      void host.then(({ handle }) => handle(request, response)).catch(next);
      return;
    }

    const productPath = pathname(request);
    if (productPath === undefined) {
      next();
      return;
    }
    // Every method, not only the ones a product address serves: which methods
    // those are is the application's answer to give, and gating here returned
    // the SPA fallback's 200 for a request the application had a status for.
    // A `HEAD` response carries no body; nothing else is elided, so a rejection
    // can still say why.
    void host
      .then(async ({ created }) => {
        const product = await created.resolveProductRequest(
          productPath,
          request.method ?? '',
          request.headers.accept,
        );
        if (product === undefined) next();
        else writeProductResponse(response, product, request.method !== 'HEAD');
      })
      .catch(next);
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
