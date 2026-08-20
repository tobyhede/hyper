import type { SpaceSnapshot, UUID } from '@project/core';
import {
  CANONICAL_DECIMAL,
  decodeCommittedRevision,
  decodeProblemDetails,
  decodeSpaceSummaries,
  decodeLoadedSpace,
  encodeCommitRequest,
  problemCodeForType,
  type CommitResult,
  type LoadedSpace,
  type ProblemDetails,
  type SpaceBackend,
  type SpaceSummary,
} from '@project/persistence';
import { parse as parseContentType } from 'content-type';
import { hc } from 'hono/client';
import type { SpaceHttpApp } from './index';
import { hasValidUniqueMediaTypeParameters } from './media-type';

type SpaceHttpClient = ReturnType<typeof hc<SpaceHttpApp>>;

const protocolFailure = (message: string): CommitResult => ({
  kind: 'permanent-failure',
  code: 'protocol',
  message,
});

/** Media-type essence match, so a charset or other parameter doesn't fail an otherwise-valid response. */
const hasProblemDetailsMediaType = (response: Response): boolean => {
  const contentType = response.headers.get('Content-Type');
  if (contentType === null || !hasValidUniqueMediaTypeParameters(contentType)) return false;
  return parseContentType(contentType).type === 'application/problem+json';
};

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
            if (!hasProblemDetailsMediaType(response)) {
              return protocolFailure('Error response must use application/problem+json');
            }
            const problem = decodeProblemDetails(await response.json());
            if (problem.status !== response.status) {
              return protocolFailure('Problem status does not match the HTTP status');
            }
            return commitFailureForProblem(problem, response);
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

const retryAfterMilliseconds = (response: Response): number | undefined => {
  const value = response.headers.get('Retry-After');
  if (value === null || !CANONICAL_DECIMAL.test(value)) return undefined;
  const seconds = BigInt(value);
  if (seconds > BigInt(Number.MAX_SAFE_INTEGER) / 1000n) return undefined;
  return Number(seconds) * 1000;
};

const commitFailureForProblem = (problem: ProblemDetails, response: Response): CommitResult => {
  const code = problemCodeForType(problem.type);
  switch (code) {
    case 'request-timeout':
      return { kind: 'retryable-failure', code: 'timeout', message: problem.detail };
    case 'rate-limited': {
      const retryAfterMs = retryAfterMilliseconds(response);
      return {
        kind: 'retryable-failure',
        code: 'rate-limited',
        message: problem.detail,
        ...(retryAfterMs === undefined ? {} : { retryAfterMs }),
      };
    }
    case 'persistence-unavailable':
    case 'internal-error': {
      const retryAfterMs = retryAfterMilliseconds(response);
      return {
        kind: 'retryable-failure',
        code: 'unavailable',
        message: problem.detail,
        ...(retryAfterMs === undefined ? {} : { retryAfterMs }),
      };
    }
    case 'unauthorized':
    case 'forbidden':
      return { kind: 'permanent-failure', code: 'forbidden', message: problem.detail };
    case 'not-found':
      return { kind: 'permanent-failure', code: 'not-found', message: problem.detail };
    case 'invalid-snapshot':
      return { kind: 'permanent-failure', code: 'invalid-snapshot', message: problem.detail };
    case 'invalid-request':
    case 'invalid-space-id':
    case 'unsupported-media-type':
    case 'payload-too-large':
    case 'method-not-allowed':
      return protocolFailure(problem.detail);
    default:
      return assertNever(code);
  }
};

const assertNever = (value: never): never => {
  throw new Error(`Unmapped problem code: ${String(value)}`);
};
