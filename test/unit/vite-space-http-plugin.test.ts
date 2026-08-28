import type { IncomingMessage, ServerResponse } from 'node:http';
import { describe, expect, it, vi } from 'vitest';
import type { Plugin } from 'vite';
import { spaceHttpPlugin } from '../../packages/app/vite-space-http-plugin';

type Middleware = (
  request: IncomingMessage,
  response: ServerResponse,
  next: (error?: unknown) => void,
) => void;

// SAFETY: `spaceHttpPlugin`'s middleware only ever reads `request.url` and
// `request.method`, and writes through `response`'s ServerResponse methods it's
// given below — neither stub needs to implement the rest of Node's interfaces.
const request = { url: '/api/spaces', method: 'GET' } as IncomingMessage;
// SAFETY: unused beyond being passed through to the middleware under test.
const response = {} as ServerResponse;

/**
 * Drive one of the plugin's two server hooks over a fake server, and hand back
 * the middleware it installed.
 *
 * One helper rather than the same fake written out per test: both arguments are
 * narrowing assertions, and writing them once is what keeps one SAFETY comment
 * true for every caller instead of four comments that can drift apart.
 */
const install = <Loaded>(
  plugin: Plugin,
  hook: 'configureServer' | 'configurePreviewServer',
  // Whatever the double exports, kept as the caller wrote it: this hands the
  // module straight to the plugin, whose own probe is what these tests are
  // about, so a double exporting the wrong thing has to stay expressible.
  ssrLoadModule: () => Promise<Loaded> = () => Promise.reject(new Error('Unexpected load')),
): Middleware | undefined => {
  const configure = plugin[hook];
  if (typeof configure !== 'function') throw new Error(`Expected ${hook} hook`);
  let middleware: Middleware | undefined;
  // SAFETY: `this` is unused by either hook's implementation, and the fake
  // server exposes exactly the members they read (`ssrLoadModule` for the
  // development hook, `middlewares.use` for both) — not Vite's `ViteDevServer`
  // or `PreviewServer` interface.
  void configure.call(
    {} as never,
    {
      ssrLoadModule,
      middlewares: { use: (installed: Middleware) => (middleware = installed) },
    } as never,
  );
  return middleware;
};

describe('spaceHttpPlugin', () => {
  it('does not leave a failed runtime load unhandled before any request arrives', async () => {
    const rejections: unknown[] = [];
    const failure = new Error('runtime failed');
    // Only this rejection. The listener is process-wide, so anything else in
    // flight elsewhere in the run would otherwise fail this test for it.
    const record = (reason: unknown): void => {
      if (reason === failure) rejections.push(reason);
    };
    process.on('unhandledRejection', record);
    try {
      const plugin = spaceHttpPlugin({
        developmentModule: '/failed-runtime.ts',
        previewModule: '/preview-runtime.js',
      });
      install(plugin, 'configureServer', () => Promise.reject(failure));
      // Node classifies a rejection as unhandled at the end of the turn, so the
      // assertion has to outlive one. No request is ever made: that is the point.
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(rejections).toEqual([]);
    } finally {
      process.off('unhandledRejection', record);
    }
  });

  it('names the module when a runtime exposes no createApp', async () => {
    const plugin = spaceHttpPlugin({
      developmentModule: '/development-runtime.ts',
      previewModule: '/preview-runtime.js',
    });
    const middleware = install(plugin, 'configureServer', () =>
      Promise.resolve({ notAHandlerFactory: true }),
    );
    if (middleware === undefined) throw new Error('Expected HTTP middleware');

    const next = vi.fn();
    middleware(request, response, next);
    await vi.waitFor(() => expect(next).toHaveBeenCalled());
    expect(String(next.mock.calls[0]?.[0])).toContain('/development-runtime.ts');
  });

  /**
   * A module that exports `createApp` passes the probe over the module and then
   * answers a bare Fetch application. Left unchecked, the first non-API GET
   * fails with `created.resolveProductRequest is not a function` and every one
   * after it fails the same way, naming nothing that would locate the runtime.
   * Startup is where the module can still be named, so it is where it is said.
   */
  it('names the module when a runtime creates an application that resolves no product requests', async () => {
    const plugin = spaceHttpPlugin({
      developmentModule: '/bare-runtime.ts',
      previewModule: '/preview-runtime.js',
    });
    const middleware = install(plugin, 'configureServer', () =>
      Promise.resolve({ createApp: () => ({ fetch: () => new Response() }) }),
    );
    if (middleware === undefined) throw new Error('Expected HTTP middleware');

    const next = vi.fn();
    middleware(request, response, next);
    await vi.waitFor(() => expect(next).toHaveBeenCalled());
    expect(String(next.mock.calls[0]?.[0])).toContain('/bare-runtime.ts');
    expect(String(next.mock.calls[0]?.[0])).toContain('resolveProductRequest');
  });

  it('forwards runtime failures on API requests', async () => {
    const failure = new Error('runtime failed');
    const failedPlugin = spaceHttpPlugin({
      developmentModule: '/failed-runtime.ts',
      previewModule: '/preview-runtime.js',
    });
    const failedMiddleware = install(failedPlugin, 'configureServer', () =>
      Promise.reject(failure),
    );
    if (failedMiddleware === undefined) throw new Error('Expected failed HTTP middleware');
    const failedNext = vi.fn();
    failedMiddleware(request, response, failedNext);
    await vi.waitFor(() => expect(failedNext).toHaveBeenCalledWith(failure));
  });

  it('loads the built runtime for preview', async () => {
    const loadPreviewModule = vi.fn(() =>
      Promise.resolve({
        createApp: () => ({
          fetch: () => new Response(),
          resolveProductRequest: () => Promise.resolve(undefined),
        }),
      }),
    );
    const plugin = spaceHttpPlugin({
      developmentModule: '/development-runtime.ts',
      previewModule: '/preview-runtime.js',
      loadPreviewModule,
    });
    const middleware = install(plugin, 'configurePreviewServer');
    if (middleware === undefined) throw new Error('Expected preview HTTP middleware');

    await vi.waitFor(() => expect(loadPreviewModule).toHaveBeenCalledWith('/preview-runtime.js'));
  });
});
