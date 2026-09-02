import type { SpaceSnapshot, UUID } from '@project/core';
import type { LoadedAggregate } from '@project/persistence';
import type { AggregateInput, InitializeAggregateResult } from './space-repository';

const ascendingById = (left: { readonly id: UUID }, right: { readonly id: UUID }): number => {
  if (left.id === right.id) return 0;
  return left.id < right.id ? -1 : 1;
};

export const canonicalAuthoredAggregate = (input: {
  readonly metaSpaceId: UUID;
  readonly spaces: readonly SpaceSnapshot[];
}): string =>
  JSON.stringify({
    metaSpaceId: input.metaSpaceId,
    spaces: [...input.spaces]
      .sort(ascendingById)
      .map((snapshot) => ({ ...snapshot, cards: [...snapshot.cards].sort(ascendingById) })),
  });

export const classifyInitializedAggregate = (
  input: AggregateInput,
  existing: LoadedAggregate,
): InitializeAggregateResult =>
  canonicalAuthoredAggregate({
    metaSpaceId: existing.metaSpaceId,
    spaces: existing.spaces.map(({ snapshot }) => snapshot),
  }) === canonicalAuthoredAggregate(input)
    ? { kind: 'existing', aggregate: existing }
    : { kind: 'already-initialized', aggregate: existing };
