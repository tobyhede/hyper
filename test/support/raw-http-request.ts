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
 */
export const send = (
  baseUrl: string,
  path: string,
  body: string,
  headers: Record<string, string>,
  agent?: Agent,
  method = 'PUT',
): Promise<RawResponse> =>
  new Promise((resolve, reject) => {
    const request = httpRequest(new URL(path, baseUrl), { method, headers, agent }, (response) => {
      const chunks: Buffer[] = [];
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
