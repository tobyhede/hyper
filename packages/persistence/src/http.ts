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

  constructor(baseUrl = '/api/spaces', options: HttpSpaceBackendOptions = {}) {
    this.#baseUrl = baseUrl.replace(/\/$/, '');
    this.#fetch = options.fetch ?? globalThis.fetch;
  }

  async listSpaces(): Promise<readonly SpaceSummary[]> {
    const response = await this.#fetch(this.#baseUrl);
    if (!response.ok) throw new Error(`Unable to list spaces: HTTP ${response.status}`);
    return decodeSpaceSummaries(await responseJson(response));
  }

  async loadSpace(id: UUID): Promise<LoadedSpace | undefined> {
    const response = await this.#fetch(`${this.#baseUrl}/${id}`);
    if (response.status === 404) return undefined;
    if (!response.ok) throw new Error(`Unable to load space: HTTP ${response.status}`);
    return decodeLoadedSpace(await responseJson(response));
  }

  async commitSpace(snapshot: SpaceSnapshot, expectedRevision: bigint): Promise<CommitResult> {
    let response: Response;
    try {
      response = await this.#fetch(`${this.#baseUrl}/${snapshot.id}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(encodeCommitRequest(snapshot, expectedRevision)),
      });
    } catch (error) {
      return {
        kind: 'retryable-failure',
        code: 'network',
        message: error instanceof Error ? error.message : 'Network request failed',
      };
    }
    try {
      if (response.status === 200) {
        return { kind: 'committed', revision: decodeCommittedRevision(await responseJson(response)) };
      }
      if (response.status === 409) {
        return { kind: 'conflict', current: decodeLoadedSpace(await responseJson(response)) };
      }
      const message = decodeErrorMessage(await responseJson(response));
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
