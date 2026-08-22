import type { GraphId, UUID } from '@project/core';

/**
 * Hand out a named sequence once each, then refuse.
 *
 * The shared body of the two minters below. They stay two named operations
 * because they are supplied at two different seams and a test says which one it
 * means; what they share is only that a test names the identities it is about
 * to assert on, and that running out is a failure rather than a wrap-around.
 */
const mintingFrom = <Id extends UUID>(
  ids: readonly [Id, ...Id[]],
  exhausted: string,
): (() => Id) => {
  let next = 0;
  return () => {
    const id = ids[next++];
    if (id === undefined) throw new Error(exhausted);
    return id;
  };
};

/**
 * The ids a completed Edit mints, in the order it mints them.
 *
 * The replacement for `vi.spyOn(crypto, 'randomUUID')`, which controlled the
 * ambient generator rather than the module that mints from it. ADR 0016 rejected
 * that for `loadSpace` and the grounds carry over unchanged: a constant collides
 * across a property test's cases so it needs a counter, at which point a
 * generator exists anyway; `randomUUID` is an unseedable CSPRNG, so controlling
 * it means owning it; and a global mock stops working in silence the day the
 * implementation moves to v7 and reads the clock as well as the entropy pool.
 * `SpaceAuthoring` takes its minter when it is composed, so a test names the ids
 * it is about to assert on.
 *
 * Exhaustion throws: every completed Edit must name every identity it expects
 * to mint. That makes an accidental extra mint observable at the public
 * operation instead of silently reusing an identity and failing later at
 * snapshot intake.
 */
export const mintingIds = (...ids: readonly [UUID, ...UUID[]]): (() => UUID) =>
  mintingFrom(ids, 'The completed Edit minted more identities than expected.');

/**
 * The Graph identities a composition's conversions mint, in the order it mints
 * them.
 *
 * The other half of the ADR 0016 seam, and separate because the two are minted
 * in two places: the Card and Layout ids of a completed Edit come from
 * `newId`, which Space Authoring took when it was composed, while a converted
 * Graph's identity is minted inside the conversion boundary the *resolver*
 * closes over (ADR 0045). A composition therefore names both, and a test that
 * asserts on a converted Graph's id says which one it expects here.
 *
 * A fresh sequence per composition, because a Space converted twice needs two
 * identities and the boundary refuses a repeat outright.
 *
 * Exhaustion throws, exactly as {@link mintingIds} does: a conversion that
 * mints more Graphs than the test named is a change in what conversion does,
 * and it should fail at the operation rather than at snapshot intake.
 */
export const mintingGraphIds = (...ids: readonly [GraphId, ...GraphId[]]): (() => GraphId) =>
  mintingFrom(ids, 'The conversion minted more Graphs than expected.');
