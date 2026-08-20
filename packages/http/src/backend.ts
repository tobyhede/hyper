import type { SpaceSnapshot, UUID } from '@project/core';
import {
  CANONICAL_DECIMAL,
  decodeCommittedRevision,
  decodeErrorMessage,
  decodeSpaceSummaries,
  decodeLoadedSpace,
  encodeCommitRequest,
  type CommitResult,
  type LoadedSpace,
  type SpaceBackend,
  type SpaceSummary,
} from '@project/persistence';
import { hc } from 'hono/client';
import type { SpaceHttpApp } from './index';

type SpaceHttpClient = ReturnType<typeof hc<SpaceHttpApp>>;

const protocolFailure = (message: string): CommitResult => ({
  kind: 'permanent-failure',
  code: 'protocol',
  message,
});

export interface HttpSpaceBackendOptions {
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
}

export class HttpSpaceBackend implements SpaceBackend {
  readonly #baseUrl: string;
  readonly #fetch: typeof globalThis.fetch;
  readonly #timeoutMs: number;

  constructor(baseUrl = '/', options: HttpSpaceBackendOptions = {}) {
    this.#baseUrl = baseUrl;
    this.#fetch = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.#timeoutMs = options.timeoutMs ?? 10_000;
  }

  /** Keep the timeout armed until the untrusted response body is decoded. */
  async #timedRequest<T>(
    request: (client: SpaceHttpClient) => Promise<Response>,
    consume: (response: Response, signal: AbortSignal) => Promise<T>,
  ): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.#timeoutMs);
    try {
      const client = hc<SpaceHttpApp>(this.#baseUrl, {
        fetch: (input: RequestInfo | URL, init?: RequestInit) =>
          this.#fetch(input, { ...init, signal: controller.signal }),
      });
      return await consume(await request(client), controller.signal);
    } catch (error) {
      if (controller.signal.aborted) throw new HttpTimeoutError();
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  listSpaces(): Promise<readonly SpaceSummary[]> {
    return this.#timedRequest(
      (client) => client.api.spaces.$get(),
      async (response) => {
        if (!response.ok) throw new Error(`Unable to list spaces: HTTP ${response.status}`);
        return decodeSpaceSummaries(await response.json());
      },
    );
  }

  loadSpace(id: UUID): Promise<LoadedSpace | undefined> {
    return this.#timedRequest(
      (client) => client.api.spaces[':id'].$get({ param: { id } }),
      async (response) => {
        if (response.status === 404) return undefined;
        if (!response.ok) throw new Error(`Unable to load space: HTTP ${response.status}`);
        return decodeLoadedSpace(await response.json());
      },
    );
  }

  async commitSpace(snapshot: SpaceSnapshot, expectedRevision: bigint): Promise<CommitResult> {
    try {
      return await this.#timedRequest(
        (client) =>
          client.api.spaces[':id'].$put({
            param: { id: snapshot.id },
            json: encodeCommitRequest(snapshot, expectedRevision),
          }),
        async (response, signal): Promise<CommitResult> => {
          const retryable = await retryableForStatus(response, signal);
          if (retryable !== undefined) return retryable;
          try {
            if (response.status === 200) {
              return {
                kind: 'committed',
                revision: decodeCommittedRevision(await response.json()),
              };
            }
            if (response.status === 409) {
              return { kind: 'conflict', current: decodeLoadedSpace(await response.json()) };
            }
            const message = decodeErrorMessage(await response.json());
            if (response.status === 401 || response.status === 403) {
              return { kind: 'permanent-failure', code: 'forbidden', message };
            }
            if (response.status === 404) {
              return { kind: 'permanent-failure', code: 'not-found', message };
            }
            if (response.status === 422) {
              return { kind: 'permanent-failure', code: 'invalid-snapshot', message };
            }
            return protocolFailure(message);
          } catch (error) {
            if (signal.aborted) throw error;
            return protocolFailure(error instanceof Error ? error.message : 'Malformed response');
          }
        },
      );
    } catch (error) {
      if (error instanceof HttpTimeoutError) {
        return { kind: 'retryable-failure', code: 'timeout', message: 'Request timed out' };
      }
      return {
        kind: 'retryable-failure',
        code: 'network',
        message: error instanceof Error ? error.message : 'Network request failed',
      };
    }
  }
}

class HttpTimeoutError extends Error {
  constructor() {
    super('Request timed out');
  }
}

const optionalErrorMessage = async (response: Response): Promise<string | undefined> => {
  try {
    return decodeErrorMessage(JSON.parse(await response.text()) as unknown);
  } catch {
    return undefined;
  }
};

const retryAfterMilliseconds = (response: Response): number | undefined => {
  const value = response.headers.get('Retry-After');
  if (value === null || !CANONICAL_DECIMAL.test(value)) return undefined;
  const seconds = BigInt(value);
  if (seconds > BigInt(Number.MAX_SAFE_INTEGER) / 1000n) return undefined;
  return Number(seconds) * 1000;
};

const retryableForStatus = async (
  response: Response,
  signal: AbortSignal,
): Promise<CommitResult | undefined> => {
  let code: 'timeout' | 'rate-limited' | 'unavailable';
  let fallback: string;
  let honoursRetryAfter = true;
  if (response.status === 408) {
    code = 'timeout';
    fallback = 'Request timed out';
    honoursRetryAfter = false;
  } else if (response.status === 429) {
    code = 'rate-limited';
    fallback = 'Rate limited';
  } else if (response.status >= 500) {
    code = 'unavailable';
    fallback = 'Persistence service unavailable';
  } else {
    return undefined;
  }
  const retryAfterMs = honoursRetryAfter ? retryAfterMilliseconds(response) : undefined;
  const message = await optionalErrorMessage(response);
  if (signal.aborted) throw new HttpTimeoutError();
  const result: CommitResult = { kind: 'retryable-failure', code, message: message ?? fallback };
  if (retryAfterMs !== undefined) result.retryAfterMs = retryAfterMs;
  return result;
};
