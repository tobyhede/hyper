import { createServer as createSocketServer } from 'node:net';
import { describe, expect, it } from 'vitest';
import { send } from '../support/raw-http-request';

/**
 * `node:http` reports a connection lost mid-body on the *response* stream, not
 * the request: the request has already been answered, so `request.on('error')`
 * never fires. Without a listener on the response the promise stays pending and
 * the test that awaited it reads as a timeout somewhere else entirely.
 */
describe('raw HTTP request helper', () => {
  it('rejects when the response fails after its headers have arrived', async () => {
    // A raw socket, because the truncation has to be graceful. A destroyed
    // socket resets the connection and `node:http` reports *that* on the
    // request, which is already handled; a FIN part-way through a declared body
    // is reported only on the response.
    // `once`, because the first chunk is the whole trigger: a request head is
    // free to arrive split, and answering a later chunk would be writing to a
    // socket this handler has already ended.
    const server = createSocketServer((socket) => {
      socket.once('data', () => {
        socket.write('HTTP/1.1 200 OK\r\nContent-Length: 64\r\n\r\npartial');
        socket.end();
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (address === null || typeof address === 'string') throw new Error('Expected TCP address');
    try {
      await expect(
        send(`http://127.0.0.1:${address.port}`, '/api/spaces', '', {}, undefined, 'GET'),
      ).rejects.toThrow();
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  }, 5000);
});
