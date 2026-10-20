import type { SpaceSnapshot, UUID } from '@project/core';
import type { LoadedAggregate } from '@project/persistence';
import type { AggregateInput, InitializeAggregateResult } from './space-repository';

const ascendingById = (left: { readonly id: UUID }, right: { readonly id: UUID }): number => {
  if (left.id === right.id) return 0;
  return left.id < right.id ? -1 : 1;
};

/**
 * Authored data: what a schema parsed from JSON, so a JSON value, with an
 * optional key that may be held as `undefined`.
 */
type AuthoredValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | readonly AuthoredValue[]
  | { readonly [key: string]: AuthoredValue };

type AuthoredRecord = Readonly<Record<string, AuthoredValue>>;

const isAuthoredList = (value: AuthoredValue): value is readonly AuthoredValue[] =>
  Array.isArray(value);

const isAuthoredRecord = (value: AuthoredValue): value is AuthoredRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Whether two values of authored data are equal, as `node:util`'s
 * `isDeepStrictEqual` answers for them: primitives by `Object.is`, lists item
 * by item in order, and records by the same own enumerable keys, a key held as
 * `undefined` included, with equal values under each.
 */
const isEqualAuthoredData = (left: AuthoredValue, right: AuthoredValue): boolean => {
  if (Object.is(left, right)) return true;
  if (isAuthoredList(left) || isAuthoredList(right)) {
    return (
      isAuthoredList(left) &&
      isAuthoredList(right) &&
      left.length === right.length &&
      left.every((item, index) => isEqualAuthoredData(item, right[index]))
    );
  }
  if (!isAuthoredRecord(left) || !isAuthoredRecord(right)) return false;
  const leftEntries = Object.entries(left);
  const rightValues = new Map(Object.entries(right));
  return (
    leftEntries.length === rightValues.size &&
    leftEntries.every(
      ([key, value]) => rightValues.has(key) && isEqualAuthoredData(value, rightValues.get(key)),
    )
  );
};

const canonicalAuthoredAggregate = (input: {
  readonly metaSpaceId: UUID;
  readonly spaces: readonly SpaceSnapshot[];
}) => ({
  metaSpaceId: input.metaSpaceId,
  spaces: [...input.spaces]
    .sort(ascendingById)
    .map((snapshot) => ({ ...snapshot, resources: [...snapshot.resources].sort(ascendingById) })),
});

export const classifyInitializedAggregate = (
  input: AggregateInput,
  existing: LoadedAggregate,
): InitializeAggregateResult =>
  isEqualAuthoredData(
    canonicalAuthoredAggregate({
      metaSpaceId: existing.metaSpaceId,
      spaces: existing.spaces.map(({ snapshot }) => snapshot),
    }),
    canonicalAuthoredAggregate(input),
  )
    ? { kind: 'existing', aggregate: existing }
    : { kind: 'already-initialized', aggregate: existing };
