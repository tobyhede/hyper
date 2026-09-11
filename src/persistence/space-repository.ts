import type { SpaceSnapshot, UUID } from '@project/core';
import type { LoadedAggregate, SpaceResourceRepository } from '@project/persistence';
import type { SpaceAggregateError } from '@project/graph';

export interface AggregateInput {
  metaSpaceId: UUID;
  spaces: readonly SpaceSnapshot[];
}

export type InitializeAggregateResult =
  | { kind: 'initialized'; aggregate: LoadedAggregate }
  | { kind: 'existing'; aggregate: LoadedAggregate }
  | { kind: 'already-initialized'; aggregate: LoadedAggregate }
  | { kind: 'aggregate-refused'; errors: readonly SpaceAggregateError[] };

export type ReplaceAggregateResult =
  | { kind: 'replaced'; aggregate: LoadedAggregate }
  | { kind: 'uninitialized' }
  | { kind: 'conflict'; currentMetaSpaceId: UUID }
  | { kind: 'aggregate-refused'; errors: readonly SpaceAggregateError[] };

/**
 * The server-side seam: everything the HTTP application consumes, plus the
 * members only the CLI reaches for.
 *
 * Extension, not a second declaration. `listSpaces`, `loadSpace`,
 * `loadAggregate` and `commit` are `SpaceResourceRepository`'s, so a change to any of them
 * cannot leave the two sides disagreeing — and the browser still cannot name
 * the aggregate lifecycle or export, because the seam the Fetch application
 * takes does not declare them.
 *
 * **Two lifecycle doors, and no mode parameter on either** (ADR 0078).
 * `initializeAggregate` establishes first state and leaves an initialized
 * repository exactly as it is; `replaceAggregate` destroys and rewrites, and
 * takes the Meta identity it expects to be replacing so a stale caller is told
 * rather than obeyed. The order-sensitive `importSpaces(input, 'insert' |
 * 'truncate')` that used to sit beside them is gone: it inferred Meta from
 * array position, and a destructive choice hidden in a mode parameter is
 * exactly what the two named operations exist to prevent. Seeds, fixtures and
 * tests go through these same two.
 */
export interface SpaceRepository extends SpaceResourceRepository {
  initializeAggregate(input: AggregateInput): Promise<InitializeAggregateResult>;
  replaceAggregate(
    input: AggregateInput,
    expectedMetaSpaceId: UUID,
  ): Promise<ReplaceAggregateResult>;
  /** Records the revision projected by a completed external export. */
  markExported(id: UUID, revision: bigint): Promise<void>;
}
