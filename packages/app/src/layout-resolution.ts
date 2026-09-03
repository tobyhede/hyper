import type { Card, Layout, LayoutId } from '@project/core';
import { Placement, type ResolvedLayout, type Space } from '@project/graph';

/**
 * A Layout that cannot be resolved: either the Space names no opening Layout,
 * or an id names none. One error, because both mean the same thing — the canvas
 * has nothing to draw and the caller asked for something that is not there.
 *
 * There is no reason field. A `reason` union whose second arm has no thrower is
 * a shape a reader has to eliminate before they can trust the first.
 */
export class LayoutNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LayoutNotFoundError';
  }
}

/**
 * The durable opening selection (ADR 0079). Working-space intake guarantees a
 * stored Space has one, so a Space without one is a bug rather than a state to
 * present, and this throws.
 *
 * Named so it does not shadow the persisted `defaultLayout` field it reads —
 * `space-authoring.ts` reads both within a few lines — and so the name says it
 * throws.
 */
export function requireDefaultLayout(space: Space): LayoutId {
  if (space.defaultLayout === undefined) {
    throw new LayoutNotFoundError('The Space has no default Layout.');
  }
  return space.defaultLayout;
}

/**
 * The Layout an id names, falling back to the Space's opening selection.
 *
 * Answers `@project/graph`'s own `ResolvedLayout` rather than wrapping it.
 * There is no second kind of Layout here, so there is no second value type:
 * what this adds to the index's answer is the fallback and the refusal, and
 * `layoutCards` below is the one derivation a caller may want beside it.
 */
export function resolveLayout(space: Space, layoutId?: LayoutId): ResolvedLayout {
  const selection = layoutId ?? requireDefaultLayout(space);
  const resolved = space.lookup.layout(selection);
  if (resolved === undefined) {
    throw new LayoutNotFoundError(`The selected Layout ${selection} does not exist.`);
  }
  return resolved;
}

/**
 * The Cards a Layout places: the Space's own `Card` objects, for that Layout's
 * members only, in `space.cards` order.
 *
 * Under ADR 0040 a Layout's position keys *are* its Card membership, so this is
 * a filter and never a manufactured position. One named operation, so two call
 * sites cannot derive membership differently.
 */
export function layoutCards(space: Space, layout: Layout): readonly Card[] {
  const members = Placement.fromLayout(layout);
  return space.cards.filter((card) => members.has(card.id));
}
