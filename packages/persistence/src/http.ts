import type { SpaceSnapshot, UUID } from '@project/core';
import type { CommitResult, LoadedSpace, SpaceBackend, SpaceSummary } from './backend';
import {
  decodeCommittedRevision,
  decodeErrorMessage,
  decodeLoadedSpace,
  decodeSpaceSummaries,
  encodeCommitRequest,
} from './http-protocol';

export interface HttpSpaceBackendOptions {
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
}

const protocolFailure = (message: string): CommitResult => ({
  kind: 'permanent-failure',
  code: 'protocol',
  message,
});

const responseJson = async (response: Response): Promise<unknown> => response.json();

export class HttpSpaceBackend implements SpaceBackend {
  readonly #baseUrl: string;
  readonly #fetch: typeof globalThis.fetch;
  readonly #timeoutMs: number;

  constructor(baseUrl = '/api/spaces', options: HttpSpaceBackendOptions = {}) {
    this.#baseUrl = baseUrl.replace(/\/$/, '');
    this.#fetch = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.#timeoutMs = options.timeoutMs ?? 10_000;
  }

  /**
   * Headers arriving is not the request completing. The timer stays armed until
   * `consume` has decoded the body, because a peer that sends a prompt status
   * line and then stalls the stream would otherwise hang the read forever — the
   * abort has to be able to reach the response stream, not just the handshake.
   */
  async #timedFetch<T>(
    input: RequestInfo | URL,
    init: RequestInit | undefined,
    consume: (response: Response, signal: AbortSignal) => Promise<T>,
  ): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
    }, this.#timeoutMs);
    try {
      const response = await this.#fetch(input, { ...init, signal: controller.signal });
      return await consume(response, controller.signal);
    } catch (error) {
      if (controller.signal.aborted) throw new HttpTimeoutError();
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  listSpaces(): Promise<readonly SpaceSummary[]> {
    return this.#timedFetch(this.#baseUrl, undefined, async (response) => {
      if (!response.ok) throw new Error(`Unable to list spaces: HTTP ${response.status}`);
      return decodeSpaceSummaries(await responseJson(response));
    });
  }

  loadSpace(id: UUID): Promise<LoadedSpace | undefined> {
    return this.#timedFetch(`${this.#baseUrl}/${id}`, undefined, async (response) => {
      if (response.status === 404) return undefined;
      if (!response.ok) throw new Error(`Unable to load space: HTTP ${response.status}`);
      return decodeLoadedSpace(await responseJson(response));
    });
  }

  async commitSpace(snapshot: SpaceSnapshot, expectedRevision: bigint): Promise<CommitResult> {
    try {
      return await this.#timedFetch(
        `${this.#baseUrl}/${snapshot.id}`,
        {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(encodeCommitRequest(snapshot, expectedRevision)),
        },
        async (response, signal): Promise<CommitResult> => {
          const retryable = await retryableForStatus(response);
          if (retryable !== undefined) return retryable;
          try {
            if (response.status === 200) {
              return {
                kind: 'committed',
                revision: decodeCommittedRevision(await responseJson(response)),
              };
            }
            if (response.status === 409) {
              return { kind: 'conflict', current: decodeLoadedSpace(await responseJson(response)) };
            }
            const message = decodeErrorMessage(await responseJson(response));
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
            // A stalled body aborts mid-decode. That is the timeout, not a
            // malformed payload, so it has to reach the mapping below rather
            // than be reported as a protocol failure the session never retries.
            if (signal.aborted) throw error;
            return protocolFailure(error instanceof Error ? error.message : 'Malformed response');
          }
        },
      );
    } catch (error) {
      if (error instanceof HttpTimeoutError) {
        return { kind: 'retryable-failure', code: 'timeout', message: error.message };
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
  if (value === null || !/^(0|[1-9]\d*)$/.test(value)) return undefined;
  const seconds = BigInt(value);
  if (seconds > BigInt(Number.MAX_SAFE_INTEGER) / 1000n) return undefined;
  return Number(seconds) * 1000;
};

const retryableForStatus = async (response: Response): Promise<CommitResult | undefined> => {
  let code: 'timeout' | 'rate-limited' | 'unavailable';
  let fallback: string;
  // RFC 9110 defines Retry-After for 429 and 503; a 408 does not carry one.
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
  return {
    kind: 'retryable-failure',
    code,
    message: (await optionalErrorMessage(response)) ?? fallback,
    ...(retryAfterMs === undefined ? {} : { retryAfterMs }),
  };
};
