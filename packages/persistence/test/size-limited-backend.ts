import type { CommitResult, SpaceCommit } from '../src/backend';
import { encodeCommitRequest } from '../src/http-protocol';
import { MemorySpaceBackend } from '../src/memory';

/** The encoded size of a commit request, measured as the HTTP transport sends it. */
export const commitRequestBytes = (request: SpaceCommit): number =>
  new TextEncoder().encode(JSON.stringify(encodeCommitRequest(request))).byteLength;

/**
 * A memory backend that refuses any request whose encoded body is over
 * `limit` bytes, the way the HTTP application answers one over its own limit:
 * `payload-too-large`, with nothing stored. The limit is on the whole request,
 * so a coordinated save counts every Space it carries together.
 *
 * `requests` records every request, refused or not, so a test can read what
 * each attempt carried.
 */
export class SizeLimitedBackend extends MemorySpaceBackend {
  limit = Number.POSITIVE_INFINITY;
  readonly requests: SpaceCommit[] = [];

  override commit(request: SpaceCommit): Promise<CommitResult> {
    this.requests.push(structuredClone(request));
    if (commitRequestBytes(request) > this.limit) {
      return Promise.resolve({ kind: 'permanent-failure', code: 'payload-too-large' });
    }
    return super.commit(request);
  }
}
