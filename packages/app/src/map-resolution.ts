import type { Resource, Map, MapId } from '@project/core';
import { Placement, type ResolvedMap, type Space } from '@project/graph';

/**
 * A Map that cannot be resolved: either the Space names no opening Map,
 * or an id names none. One error, because both mean the canvas context is unavailable — the canvas
 * has nothing to draw and the caller asked for something that is not there.
 *
 * There is no reason field. A `reason` union whose second arm has no thrower is
 * a shape a reader has to eliminate before they can trust the first.
 */
export class MapNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MapNotFoundError';
  }
}

/**
 * The durable opening selection (ADR 0079). Working-space intake guarantees a
 * stored Space has one, so a Space without one is a bug rather than a state to
 * present, and this throws.
 *
 * Named so it does not shadow the persisted `defaultMap` field it reads —
 * `space-authoring.ts` reads both within a few lines — and so the name says it
 * throws.
 */
export function requireDefaultMap(space: Space): MapId {
  if (space.defaultMap === undefined) {
    throw new MapNotFoundError('The Space has no default Map.');
  }
  return space.defaultMap;
}

/**
 * The Map an id names, falling back to the Space's opening selection.
 *
 * Answers `@project/graph`'s own `ResolvedMap` rather than wrapping it.
 * There is no second kind of Map here, so there is no second value type:
 * what this adds to the index's answer is the fallback and the refusal, and
 * `mapResources` below is the one derivation a caller may want beside it.
 */
export function resolveMap(space: Space, mapId?: MapId): ResolvedMap {
  const selection = mapId ?? requireDefaultMap(space);
  const resolved = space.lookup.map(selection);
  if (resolved === undefined) {
    throw new MapNotFoundError(`The selected Map ${selection} does not exist.`);
  }
  return resolved;
}

/**
 * The Resources a Map places: the Space's own `Resource` objects, for that Map's
 * members only, in `space.resources` order.
 *
 * Under ADR 0040 a Map's position keys *are* its Resource membership, so this is
 * a filter and never a manufactured position. One named operation, so two call
 * sites cannot derive membership differently.
 */
export function mapResources(space: Space, map: Map): readonly Resource[] {
  const members = Placement.fromMap(map);
  return space.resources.filter((resource) => members.has(resource.id));
}
