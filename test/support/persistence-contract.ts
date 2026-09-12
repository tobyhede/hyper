import { expect } from 'vitest';

/**
 * What a stored value may be asserted about: every key of it optional, and no key
 * it does not have.
 *
 * Primitives are passed through before the object arm, which is what keeps a
 * branded id — `string & { __brand }`, an intersection the object arm would
 * otherwise map over — assignable from the plain value a fixture writes. Arrays
 * recurse element-wise, so a Diagram named inside a Space's `diagrams` is held
 * to the same rule the Space is.
 */
type PersistenceContract<T> = T extends
  string | number | bigint | boolean | symbol | null | undefined | Date
  ? T
  : T extends readonly (infer Element)[]
    ? readonly PersistenceContract<Element>[]
    : T extends object
      ? { readonly [Key in keyof T]?: PersistenceContract<T[Key]> }
      : T;

/**
 * `toMatchObject`, bound to the type of the value it is asserting about.
 *
 * **The matcher's own typing is why this exists.** `expect(x).toMatchObject(y)`
 * types `y` loosely enough that a key the received type no longer has is not an
 * error: ticket `13` removed `initialization` from `LoadedSpace` end to end,
 * `pnpm verify` passed with the compiler looking straight at the stale field,
 * and CI's `postgres` job was the first thing to say so half an hour later. The
 * suite is inside the root program — `tsc` read the file — so another command to
 * remember would not have closed it. Binding the expectation to the received
 * type does, because the received type is then what decides which keys the
 * expected object may name.
 *
 * Scoped to the assertions whose whole point is that a stored shape has not
 * drifted. `toMatchObject` stays the right matcher in plenty of other places and
 * this is not a campaign against it.
 *
 * `NonNullable` because an expectation describes an object: a reader asserting
 * against `LoadedSpace | undefined` is asserting the loaded arm, and the
 * `undefined` one is what `toBeUndefined` is for.
 */
export const expectPersisted = <Received>(received: Received) => ({
  toMatchObject: (expected: PersistenceContract<NonNullable<Received>> & object): void => {
    expect(received).toMatchObject(expected);
  },
});
