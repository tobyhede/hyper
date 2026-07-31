import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';

type SpaceHttpHandler = (request: IncomingMessage, response: ServerResponse) => Promise<boolean>;

interface SpaceHttpRuntime {
  createHandler(options?: unknown): Promise<SpaceHttpHandler> | SpaceHttpHandler;
}

export interface SpaceHttpPluginOptions {
  developmentModule: string;
  previewModule: string;
  runtimeOptions?: unknown;
  /** System boundary injection used only by the plugin's Node-level tests. */
  loadPreviewModule?: (modulePath: string) => Promise<unknown>;
}

const defaultPreviewLoader = async (modulePath: string): Promise<unknown> => import(modulePath);

type Next = (error?: unknown) => void;

const asRuntime = (loaded: unknown, modulePath: string): SpaceHttpRuntime => {
  if (
    typeof loaded !== 'object' ||
    loaded === null ||
    typeof (loaded as SpaceHttpRuntime).createHandler !== 'function'
  ) {
    throw new Error(`${modulePath} does not export a createHandler function`);
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
  const handler = runtime.then((loaded) =>
    asRuntime(loaded, modulePath).createHandler(runtimeOptions),
  );
  // A runtime that fails to load rejects once, here, and nothing is waiting on
  // it until the first request arrives — Node calls that an unhandled rejection
  // and takes the server down with it. Marking it handled costs nothing: the
  // same settled promise still delivers the real error to `next` per request.
  handler.catch(() => undefined);
  register((request, response, next) => {
    void handler
      .then((handle) => handle(request, response))
      .then((handled) => {
        if (!handled) next();
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
