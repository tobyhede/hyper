import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';

export interface TestHttpServer {
  url: string;
  close(): Promise<void>;
}

export const startHttpServer = async (
  handler: (request: IncomingMessage, response: ServerResponse) => Promise<boolean>,
): Promise<TestHttpServer> => {
  const server = createServer((request, response) => {
    void handler(request, response)
      .then((handled) => {
        if (!handled) {
          response.statusCode = 404;
          response.end();
        }
      })
      .catch((error: unknown) => {
        // Close the response, or a broken handler reads as a hung request and
        // the suite that depends on it times out instead of failing.
        console.error('Test HTTP handler failed', error);
        if (!response.headersSent) response.statusCode = 500;
        response.end();
      });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('Expected TCP address');
  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
        // `close` stops accepting and then waits for every open socket. A
        // keep-alive agent holds one open by design, so without this the test
        // that used one hangs teardown until its own timeout.
        server.closeAllConnections();
      }),
  };
};
