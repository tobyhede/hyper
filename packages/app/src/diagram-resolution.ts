import type { Thing, Diagram, DiagramId } from '@project/core';
import { Placement, type ResolvedDiagram, type Space } from '@project/graph';

/**
 * A Diagram that cannot be resolved: either the Space names no opening Diagram,
 * or an id names none. One error, because both mean the same thing — the canvas
 * has nothing to draw and the caller asked for something that is not there.
 *
 * There is no reason field. A `reason` union whose second arm has no thrower is
 * a shape a reader has to eliminate before they can trust the first.
 */
export class DiagramNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DiagramNotFoundError';
  }
}

/**
 * The durable opening selection (ADR 0079). Working-space intake guarantees a
 * stored Space has one, so a Space without one is a bug rather than a state to
 * present, and this throws.
 *
 * Named so it does not shadow the persisted `defaultDiagram` field it reads —
 * `space-authoring.ts` reads both within a few lines — and so the name says it
 * throws.
 */
export function requireDefaultDiagram(space: Space): DiagramId {
  if (space.defaultDiagram === undefined) {
    throw new DiagramNotFoundError('The Space has no default Diagram.');
  }
  return space.defaultDiagram;
}

/**
 * The Diagram an id names, falling back to the Space's opening selection.
 *
 * Answers `@project/graph`'s own `ResolvedDiagram` rather than wrapping it.
 * There is no second kind of Diagram here, so there is no second value type:
 * what this adds to the index's answer is the fallback and the refusal, and
 * `diagramThings` below is the one derivation a caller may want beside it.
 */
export function resolveDiagram(space: Space, diagramId?: DiagramId): ResolvedDiagram {
  const selection = diagramId ?? requireDefaultDiagram(space);
  const resolved = space.lookup.diagram(selection);
  if (resolved === undefined) {
    throw new DiagramNotFoundError(`The selected Diagram ${selection} does not exist.`);
  }
  return resolved;
}

/**
 * The Things a Diagram places: the Space's own `Thing` objects, for that Diagram's
 * members only, in `space.things` order.
 *
 * Under ADR 0040 a Diagram's position keys *are* its Thing membership, so this is
 * a filter and never a manufactured position. One named operation, so two call
 * sites cannot derive membership differently.
 */
export function diagramThings(space: Space, diagram: Diagram): readonly Thing[] {
  const members = Placement.fromDiagram(diagram);
  return space.things.filter((thing) => members.has(thing.id));
}
