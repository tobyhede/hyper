import { expect } from 'vitest';

/**
 * What a stored value may be asserted about: every key of it optional, and no key
 * it does not have.
 *
 * Primitives are passed through before the object arm, which is what keeps a
 * branded id — `string & { __brand }`, an intersection the object arm would
 * otherwise map over — assignable from the plain value a fixture writes. Arrays
 * recurse element-wise, so a Map named inside a Space's `maps` is held
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
 * types `y` loosely enough that a key the received type does not have is not an
 * error, so a stale field in an expectation typechecks and fails only when the
 * suite runs against a database. Binding the expectation to the received
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
