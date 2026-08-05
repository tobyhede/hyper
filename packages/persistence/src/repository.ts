import type { SpaceSnapshot, UUID } from '@project/core';
import type { LoadedSpace, SpaceSummary } from './backend';

/**
 * The stored side of the seam, and the narrowest form of it.
 *
 * A `SpaceBackend` is what the browser holds — one already-open workspace behind
 * a transport that can fail in transport-shaped ways. A repository is what sits
 * on the other side of that transport: it either commits, loses a revision race,
 * or refuses the snapshot outright. There is no `retryable-failure` here because
 * there is nothing between the caller and the store to be flaky; a repository
 * that cannot answer throws, and the HTTP application turns that into a 503.
 *
 * This lives in `@project/persistence` rather than in `@project/http` or beside
 * the PostgreSQL adapter because it is the only home both sides can reach. ADR
 * 0034 keeps `@project/http` browser-safe — its `paths` do not resolve the
 * server tree and lint blocks the relative escape — while server code imports
 * workspace packages by name like everything else.
 */
export type RepositoryCommitResult =
  | { kind: 'committed'; revision: bigint }
  | { kind: 'conflict'; current: LoadedSpace }
  | {
      kind: 'rejected';
      code: 'invalid-snapshot' | 'not-found';
      message: string;
    };

/**
 * What the HTTP application consumes, and no more. Import and export capability
 * belongs to the CLI, so the resources under `/api/spaces` never see it — the
 * browser cannot name a filesystem path (ADR 0030), and a seam that declared
 * those members would let it try.
 */
export interface SpaceResourceRepository {
  listSpaces(): Promise<readonly SpaceSummary[]>;
  loadSpace(id: UUID): Promise<LoadedSpace | undefined>;
  commitSpace(snapshot: SpaceSnapshot, expectedRevision: bigint): Promise<RepositoryCommitResult>;
}
