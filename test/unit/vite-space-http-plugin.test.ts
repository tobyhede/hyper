import type { IncomingMessage, ServerResponse } from 'node:http';
import { describe, expect, it, vi } from 'vitest';
import { spaceHttpPlugin } from '../../packages/app/vite-space-http-plugin';

type Middleware = (
  request: IncomingMessage,
  response: ServerResponse,
  next: (error?: unknown) => void,
) => void;

const request = { url: '/api/spaces' } as IncomingMessage;
const response = {} as ServerResponse;

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
      const configureServer = plugin.configureServer;
      if (typeof configureServer !== 'function') throw new Error('Expected configureServer hook');
      void configureServer.call(
        {} as never,
        {
          ssrLoadModule: () => Promise.reject(failure),
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

  it('names the module when a runtime exposes no createApp', async () => {
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

  it('forwards runtime failures on API requests', async () => {
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
    const loadPreviewModule = vi.fn(() =>
      Promise.resolve({ createApp: () => ({ fetch: () => new Response() }) }),
    );
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

    await vi.waitFor(() => expect(loadPreviewModule).toHaveBeenCalledWith('/preview-runtime.js'));
  });
});
