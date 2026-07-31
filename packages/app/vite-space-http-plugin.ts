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
  loadPreviewModule?: (modulePath: string) => Promise<SpaceHttpRuntime>;
}

const defaultPreviewLoader = async (modulePath: string): Promise<SpaceHttpRuntime> =>
  import(modulePath) as Promise<SpaceHttpRuntime>;

type Next = (error?: unknown) => void;

const installMiddleware = (
  register: (
    middleware: (request: IncomingMessage, response: ServerResponse, next: Next) => void,
  ) => void,
  runtime: Promise<SpaceHttpRuntime>,
  runtimeOptions: unknown,
): void => {
  const handler = runtime.then((loaded) => loaded.createHandler(runtimeOptions));
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
        server.ssrLoadModule(options.developmentModule) as Promise<SpaceHttpRuntime>,
        options.runtimeOptions,
      );
    },
    configurePreviewServer(server) {
      const load = options.loadPreviewModule ?? defaultPreviewLoader;
      installMiddleware(
        (middleware) => server.middlewares.use(middleware),
        load(options.previewModule),
        options.runtimeOptions,
      );
    },
  };
}
