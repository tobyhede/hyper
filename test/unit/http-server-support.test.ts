import { describe, expect, it, vi } from 'vitest';
import { startHttpServer, type TestHttpServer } from '../support/http-server';

/**
 * The e2e and durability suites drive their handler through this helper. A
 * handler that rejects used to leave the response open, so a broken handler
 * read as a hung request rather than a failing one — the slowest possible way
 * to learn a test is broken, and one that looks like flake.
 */
describe('test HTTP server', () => {
  it('answers a rejecting handler with 500 rather than leaving the request open', async () => {
    const surfaced: unknown[][] = [];
    const logged = vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      surfaced.push(args);
    });
    // Startup is inside the guard: a rejection there must still restore the
    // console spy, or every later test in the run loses its own error output.
    let server: TestHttpServer | undefined;
    try {
      server = await startHttpServer(() => Promise.reject(new Error('handler exploded')));
      const response = await fetch(`${server.url}/api/spaces`);
      expect(response.status).toBe(500);
      expect(surfaced).toHaveLength(1);
      expect(String(surfaced[0])).toContain('handler exploded');
    } finally {
      logged.mockRestore();
      await server?.close();
    }
  }, 5000);

  it('answers an unhandled path with 404', async () => {
    const server = await startHttpServer(() => Promise.resolve(false));
    try {
      expect((await fetch(`${server.url}/elsewhere`)).status).toBe(404);
    } finally {
      await server.close();
    }
  }, 5000);

  /**
   * `fetch` keeps its socket alive, and a bare `server.close()` only stops new
   * connections — it waits for the idle ones to expire on the client's
   * keep-alive timeout. Every suite closes a server per test, so that wait is
   * paid over and over and reads as unexplained slowness rather than a bug.
   */
  it('closes while a keep-alive connection from a completed request is still open', async () => {
    const server = await startHttpServer((_request, response) => {
      response.statusCode = 204;
      response.end();
      return Promise.resolve(true);
    });
    // Closing in `finally` keeps a failed request from leaking a listening
    // server into the rest of the run, and the duration is asserted afterwards
    // so a slow close cannot mask whatever failed above it.
    let closeMilliseconds: number | undefined;
    try {
      expect((await fetch(`${server.url}/api/spaces`)).status).toBe(204);
    } finally {
      const startedAt = performance.now();
      await server.close();
      closeMilliseconds = performance.now() - startedAt;
    }
    expect(closeMilliseconds).toBeLessThan(1000);
  }, 10000);
});
