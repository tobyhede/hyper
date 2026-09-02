import { request as httpRequest, type Agent, type IncomingHttpHeaders } from 'node:http';

export interface RawResponse {
  status: number;
  headers: IncomingHttpHeaders;
  body: string;
}

/**
 * A request the Fetch client cannot express. These tests drive the host over a
 * real socket to reach what `app.request()` normalises away — an understated
 * `Content-Length`, a malformed media type, a connection reused across a
 * rejection — so the request is built with `node:http` rather than `fetch`.
 *
 * `agent` is optional because only the connection-reuse tests care which socket
 * carries the request; passing one pins several requests to the same one.
 *
 * `method` is required and deliberately has no default. It carried `'PUT'` long
 * after the contract retired that method, and survived because every caller
 * passes one — an unreachable default cannot go visibly stale. Requiring it
 * makes the next contract change a compile error rather than dead prose.
 */
export const send = (
  baseUrl: string,
  path: string,
  body: string,
  headers: Record<string, string>,
  method: string,
  agent?: Agent,
): Promise<RawResponse> =>
  new Promise((resolve, reject) => {
    const request = httpRequest(new URL(path, baseUrl), { method, headers, agent }, (response) => {
      const chunks: Buffer[] = [];
      // A connection lost part-way through the body is reported here and not on
      // the request, which has already been answered. Without this the promise
      // would stay pending and the awaiting test would read as a timeout with
      // no cause attached to it.
      response.once('error', reject);
      response.on('data', (chunk: Uint8Array) => chunks.push(Buffer.from(chunk)));
      response.on('end', () =>
        resolve({
          status: response.statusCode ?? 0,
          headers: response.headers,
          body: Buffer.concat(chunks).toString('utf8'),
        }),
      );
    });
    request.on('error', reject);
    request.end(body);
  });
