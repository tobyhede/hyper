import type { UUID } from '@project/core';

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
 * The last id repeats, which is what the `.mockReturnValueOnce(…)` chains ending
 * in `.mockReturnValue(…)` used to say. A test whose subject *is* minting names
 * every id instead of leaning on that.
 */
export const mintingIds = (...ids: readonly [UUID, ...UUID[]]): (() => UUID) => {
  let next = 0;
  return () => ids[Math.min(next++, ids.length - 1)]!;
};
