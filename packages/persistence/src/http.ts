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

  async #timedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
    }, this.#timeoutMs);
    try {
      return await this.#fetch(input, { ...init, signal: controller.signal });
    } catch (error) {
      if (controller.signal.aborted) throw new HttpTimeoutError();
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  async listSpaces(): Promise<readonly SpaceSummary[]> {
    const response = await this.#timedFetch(this.#baseUrl);
    if (!response.ok) throw new Error(`Unable to list spaces: HTTP ${response.status}`);
    return decodeSpaceSummaries(await responseJson(response));
  }

  async loadSpace(id: UUID): Promise<LoadedSpace | undefined> {
    const response = await this.#timedFetch(`${this.#baseUrl}/${id}`);
    if (response.status === 404) return undefined;
    if (!response.ok) throw new Error(`Unable to load space: HTTP ${response.status}`);
    return decodeLoadedSpace(await responseJson(response));
  }

  async commitSpace(snapshot: SpaceSnapshot, expectedRevision: bigint): Promise<CommitResult> {
    let response: Response;
    try {
      response = await this.#timedFetch(`${this.#baseUrl}/${snapshot.id}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(encodeCommitRequest(snapshot, expectedRevision)),
      });
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
      if (response.status === 404) return { kind: 'permanent-failure', code: 'not-found', message };
      if (response.status === 422) {
        return { kind: 'permanent-failure', code: 'invalid-snapshot', message };
      }
      return protocolFailure(message);
    } catch (error) {
      return protocolFailure(error instanceof Error ? error.message : 'Malformed response');
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
