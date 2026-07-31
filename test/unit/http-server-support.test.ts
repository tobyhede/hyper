import { describe, expect, it, vi } from 'vitest';
import { startHttpServer } from '../support/http-server';

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
    const server = await startHttpServer(() => Promise.reject(new Error('handler exploded')));
    try {
      const response = await fetch(`${server.url}/api/spaces`);
      expect(response.status).toBe(500);
      expect(surfaced).toHaveLength(1);
      expect(String(surfaced[0])).toContain('handler exploded');
    } finally {
      logged.mockRestore();
      await server.close();
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
});
