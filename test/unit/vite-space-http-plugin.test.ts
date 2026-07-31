import type { IncomingMessage, ServerResponse } from 'node:http';
import { describe, expect, it, vi } from 'vitest';
import { spaceHttpPlugin } from '../../packages/app/vite-space-http-plugin';

type Middleware = (
  request: IncomingMessage,
  response: ServerResponse,
  next: (error?: unknown) => void,
) => void;

const request = {} as IncomingMessage;
const response = {} as ServerResponse;

describe('spaceHttpPlugin', () => {
  it('loads the development runtime once and lets its handler own API requests', async () => {
    const handler = vi.fn(() => Promise.resolve(true));
    const ssrLoadModule = vi.fn(() => Promise.resolve({ createHandler: () => handler }));
    let middleware: Middleware | undefined;
    const plugin = spaceHttpPlugin({
      developmentModule: '/development-runtime.ts',
      previewModule: '/preview-runtime.js',
      runtimeOptions: { catalog: 'fixture' },
    });

    const configureServer = plugin.configureServer;
    if (typeof configureServer !== 'function') throw new Error('Expected configureServer hook');
    void configureServer.call(
      {} as never,
      {
        ssrLoadModule,
        middlewares: { use: (installed: Middleware) => (middleware = installed) },
      } as never,
    );
    if (middleware === undefined) throw new Error('Expected HTTP middleware');

    const next = vi.fn();
    middleware(request, response, next);
    await vi.waitFor(() => expect(handler).toHaveBeenCalledWith(request, response));

    expect(ssrLoadModule).toHaveBeenCalledOnce();
    expect(ssrLoadModule).toHaveBeenCalledWith('/development-runtime.ts');
    expect(next).not.toHaveBeenCalled();

    const secondNext = vi.fn();
    middleware(request, response, secondNext);
    await vi.waitFor(() => expect(handler).toHaveBeenCalledTimes(2));
    expect(ssrLoadModule).toHaveBeenCalledOnce();
    expect(secondNext).not.toHaveBeenCalled();
  });

  it('does not leave a failed runtime load unhandled before any request arrives', async () => {
    const rejections: unknown[] = [];
    const record = (reason: unknown): void => {
      rejections.push(reason);
    };
    process.on('unhandledRejection', record);
    try {
      const plugin = spaceHttpPlugin({
        developmentModule: '/failed-runtime.ts',
        previewModule: '/preview-runtime.js',
      });
      const configureServer = plugin.configureServer;
      if (typeof configureServer !== 'function') throw new Error('Expected configureServer hook');
      void configureServer.call(
        {} as never,
        {
          ssrLoadModule: () => Promise.reject(new Error('runtime failed')),
          middlewares: { use: () => undefined },
        } as never,
      );
      // Node classifies a rejection as unhandled at the end of the turn, so the
      // assertion has to outlive one. No request is ever made: that is the point.
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(rejections).toEqual([]);
    } finally {
      process.off('unhandledRejection', record);
    }
  });

  it('names the module when a runtime exposes no createHandler', async () => {
    let middleware: Middleware | undefined;
    const plugin = spaceHttpPlugin({
      developmentModule: '/development-runtime.ts',
      previewModule: '/preview-runtime.js',
    });
    const configureServer = plugin.configureServer;
    if (typeof configureServer !== 'function') throw new Error('Expected configureServer hook');
    void configureServer.call(
      {} as never,
      {
        ssrLoadModule: () => Promise.resolve({ notAHandlerFactory: true }),
        middlewares: { use: (installed: Middleware) => (middleware = installed) },
      } as never,
    );
    if (middleware === undefined) throw new Error('Expected HTTP middleware');

    const next = vi.fn();
    middleware(request, response, next);
    await vi.waitFor(() => expect(next).toHaveBeenCalled());
    expect(String(next.mock.calls[0]?.[0])).toContain('/development-runtime.ts');
  });

  it('falls through unhandled assets and forwards runtime failures', async () => {
    const unhandled = vi.fn(() => Promise.resolve(false));
    let middleware: Middleware | undefined;
    const plugin = spaceHttpPlugin({
      developmentModule: '/development-runtime.ts',
      previewModule: '/preview-runtime.js',
    });
    const configureServer = plugin.configureServer;
    if (typeof configureServer !== 'function') throw new Error('Expected configureServer hook');
    void configureServer.call(
      {} as never,
      {
        ssrLoadModule: () => Promise.resolve({ createHandler: () => unhandled }),
        middlewares: { use: (installed: Middleware) => (middleware = installed) },
      } as never,
    );
    if (middleware === undefined) throw new Error('Expected HTTP middleware');

    const next = vi.fn();
    middleware(request, response, next);
    await vi.waitFor(() => expect(next).toHaveBeenCalledWith());

    const failure = new Error('runtime failed');
    const failedPlugin = spaceHttpPlugin({
      developmentModule: '/failed-runtime.ts',
      previewModule: '/preview-runtime.js',
    });
    let failedMiddleware: Middleware | undefined;
    const failedConfigureServer = failedPlugin.configureServer;
    if (typeof failedConfigureServer !== 'function')
      throw new Error('Expected configureServer hook');
    void failedConfigureServer.call(
      {} as never,
      {
        ssrLoadModule: () => Promise.reject(failure),
        middlewares: { use: (installed: Middleware) => (failedMiddleware = installed) },
      } as never,
    );
    if (failedMiddleware === undefined) throw new Error('Expected failed HTTP middleware');
    const failedNext = vi.fn();
    failedMiddleware(request, response, failedNext);
    await vi.waitFor(() => expect(failedNext).toHaveBeenCalledWith(failure));
  });

  it('loads the built runtime for preview', async () => {
    const handler = vi.fn(() => Promise.resolve(true));
    const loadPreviewModule = vi.fn(() => Promise.resolve({ createHandler: () => handler }));
    let middleware: Middleware | undefined;
    const plugin = spaceHttpPlugin({
      developmentModule: '/development-runtime.ts',
      previewModule: '/preview-runtime.js',
      loadPreviewModule,
    });
    const configurePreviewServer = plugin.configurePreviewServer;
    if (typeof configurePreviewServer !== 'function') {
      throw new Error('Expected configurePreviewServer hook');
    }
    void configurePreviewServer.call(
      {} as never,
      {
        middlewares: { use: (installed: Middleware) => (middleware = installed) },
      } as never,
    );
    if (middleware === undefined) throw new Error('Expected preview HTTP middleware');

    const next = vi.fn();
    middleware(request, response, next);
    await vi.waitFor(() => expect(handler).toHaveBeenCalled());
    expect(loadPreviewModule).toHaveBeenCalledWith('/preview-runtime.js');
  });
});
