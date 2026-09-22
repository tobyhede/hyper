import { createServer, type Server } from 'node:net';

export interface RefusingPostgresServer {
  readonly url: string;
  readonly close: () => Promise<void>;
}

/**
 * Binds `server` to `port` (0 for an OS-assigned free port) on loopback,
 * resolving once it is listening and rejecting on a listen error. Shared so a
 * caller minting its own loopback server (a port finder, a connection-counting
 * listener) gets the same promise/error-handling shape this module uses.
 */
export const listenOnLoopback = (server: Server, port = 0): Promise<void> =>
  new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });

/**
 * The TCP port a `server` listening on loopback is bound to. Node types
 * `Server.address()` as `AddressInfo | string | null` for the pipe/Unix-socket
 * cases neither this module nor its callers ever hit on loopback.
 */
export const loopbackPort = (server: Server): number => {
  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('The server has no TCP address');
  }
  return address.port;
};

/** `server.close` as a Promise, rejecting with whatever error `close` passes. */
export const closeServer = (server: Server): Promise<void> =>
  new Promise<void>((resolve, reject) =>
    server.close((error) => (error === undefined ? resolve() : reject(error))),
  );

/**
 * One PostgreSQL wire-protocol `ErrorResponse` message: a type byte, a length
 * counting itself, each field as a type byte and a NUL-terminated string, and a
 * final NUL.
 */
const errorResponse = (sqlState: string, message: string): Buffer => {
  const fields = Buffer.concat(
    [
      ['S', 'FATAL'],
      ['V', 'FATAL'],
      ['C', sqlState],
      ['M', message],
    ].map(([type, value]) => Buffer.from(`${type}${value}\0`, 'utf8')),
  );
  const body = Buffer.concat([fields, Buffer.from([0])]);
  const length = Buffer.alloc(4);
  length.writeInt32BE(body.length + 4);
  return Buffer.concat([Buffer.from('E', 'utf8'), length, body]);
};

/**
 * A loopback server that answers every connection's startup message the way
 * PostgreSQL answers a client it refuses at the handshake — a FATAL
 * `ErrorResponse` carrying `sqlState` — and hangs up. So `pg` raises the same
 * `DatabaseError` from `pool.connect()` that a real server's refusal produces,
 * through the real driver, without a database: a wrong password is `28P01`,
 * a missing database `3D000`, too many connections `53300`.
 */
export const startRefusingPostgresServer = async (
  sqlState: string,
  message: string,
): Promise<RefusingPostgresServer> => {
  const server: Server = createServer((socket) => {
    socket.once('data', () => {
      socket.end(errorResponse(sqlState, message));
    });
    socket.on('error', () => undefined);
  });
  await listenOnLoopback(server);
  return {
    url: `postgres://hyper:wrong@127.0.0.1:${loopbackPort(server)}/hyper`,
    close: () => closeServer(server),
  };
};
