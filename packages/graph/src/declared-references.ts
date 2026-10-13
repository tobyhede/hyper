import {
  lifetimeSpaceReferences,
  mayBeTarget,
  resourceReferences,
  spaceReferences,
  type KindId,
  type KindedResource,
  type UUID,
} from '@project/core';

/**
 * Every rule about the references a kind declares (ADR 0128), read in one
 * place: intake, an Edit, the aggregate and the Space Resource lifecycle each
 * ask here rather than walking the declarations themselves. A refusal names the
 * rule, never the kind that declared the reference, so one rule has one code
 * whichever door it is met at.
 */

/** Why a Resource reference a kind declares does not hold: referencing is a single hop (ADR 0070, ADR 0113). */
export type ResourceReferenceProblem =
  | { readonly code: 'reference-targets-self'; readonly targetId: UUID }
  | { readonly code: 'reference-target-missing'; readonly targetId: UUID }
  | { readonly code: 'reference-target-not-targetable'; readonly targetId: UUID };

/**
 * The problems of each Resource reference `resource` declares, in declared
 * order. `kindOf` answers the kind of a Resource the Space holds, or
 * `undefined` for one it does not.
 */
export const resourceReferenceProblems = (
  resourceId: UUID,
  resource: KindedResource,
  kindOf: (id: UUID) => KindId | undefined,
): ResourceReferenceProblem[] =>
  resourceReferences(resource).flatMap((targetId): ResourceReferenceProblem[] => {
    if (targetId === resourceId) return [{ code: 'reference-targets-self', targetId }];
    const kind = kindOf(targetId);
    if (kind === undefined) return [{ code: 'reference-target-missing', targetId }];
    return mayBeTarget(kind) ? [] : [{ code: 'reference-target-not-targetable', targetId }];
  });

/** Whether `resource` declares a Resource reference to `targetId`. */
export const referencesResource = (resource: KindedResource, targetId: UUID): boolean =>
  resourceReferences(resource).includes(targetId);

/** A Space as the Space reference rules read it: its id, and each Resource's id and declarations. */
export interface ReferencingSpace {
  readonly id: UUID;
  readonly resources: readonly { readonly id: UUID; readonly document: KindedResource }[];
}

/** One Space reference a Resource declares. */
export interface SpaceReference {
  readonly spaceId: UUID;
  readonly resourceId: UUID;
  readonly targetSpaceId: UUID;
  /** Whether the reference holds the target's lifetime (ADR 0074): its kind owns the Spaces it references. */
  readonly lifetime: boolean;
}

/** Every Space reference across some Spaces, built once and read by each rule below. */
export interface SpaceReferences {
  /** The Spaces read, in the order given. */
  readonly spaceIds: readonly UUID[];
  /** Every declared Space reference, by Space, then Resource, then declared order. */
  readonly references: readonly SpaceReference[];
}

/** Read every Space reference the Resources of `spaces` declare. */
export const declaredSpaceReferences = (spaces: readonly ReferencingSpace[]): SpaceReferences => ({
  spaceIds: spaces.map(({ id }) => id),
  references: spaces.flatMap((space) =>
    space.resources.flatMap(({ id, document }) => {
      const held = lifetimeSpaceReferences(document);
      return spaceReferences(document).map((targetSpaceId) => ({
        spaceId: space.id,
        resourceId: id,
        targetSpaceId,
        lifetime: held.includes(targetSpaceId),
      }));
    }),
  ),
});

/** The references whose target is none of the Spaces read. */
export const missingSpaceReferences = ({
  spaceIds,
  references,
}: SpaceReferences): SpaceReference[] => {
  const read = new Set(spaceIds);
  return references.filter(({ targetSpaceId }) => !read.has(targetSpaceId));
};

/**
 * The references that close a cycle, one per back edge of a depth-first walk
 * that starts from each Space in the order read. A Space that references itself
 * closes a cycle of one. A reference to a Space not read is not followed.
 */
export const spaceReferenceCycles = ({
  spaceIds,
  references,
}: SpaceReferences): SpaceReference[] => {
  const outgoing = new Map<UUID, SpaceReference[]>(spaceIds.map((id) => [id, []]));
  for (const reference of references) outgoing.get(reference.spaceId)?.push(reference);
  const cycles: SpaceReference[] = [];
  const visitState = new Map<UUID, 'visiting' | 'visited'>();
  const visit = (spaceId: UUID): void => {
    visitState.set(spaceId, 'visiting');
    for (const reference of outgoing.get(spaceId) ?? []) {
      if (!outgoing.has(reference.targetSpaceId)) continue;
      const state = visitState.get(reference.targetSpaceId);
      if (state === 'visiting') cycles.push(reference);
      else if (state === undefined) visit(reference.targetSpaceId);
    }
    visitState.set(spaceId, 'visited');
  };
  for (const spaceId of spaceIds) if (!visitState.has(spaceId)) visit(spaceId);
  return cycles;
};

/**
 * The Spaces read, other than the Meta Space, whose lifetime no reference
 * holds. Each one is unreachable from the Meta Space through lifetime
 * references, but not every unreachable Space is one: a Space held only by an
 * unrooted Space is held. So with no cycles, an empty answer means every Space
 * is reachable from the Meta Space (ADR 0074).
 */
export const unrootedSpaces = (
  { spaceIds, references }: SpaceReferences,
  metaSpaceId: UUID,
): UUID[] => {
  const held = new Set(
    references.filter(({ lifetime }) => lifetime).map(({ targetSpaceId }) => targetSpaceId),
  );
  return spaceIds.filter((id) => id !== metaSpaceId && !held.has(id));
};

/**
 * The Spaces that go when `released` lose a lifetime reference that has
 * already been removed from `references`: each one nothing else holds, then
 * each Space only those held, in deletion order. Never the Meta Space.
 */
export const releasedSpaces = (
  { spaceIds, references }: SpaceReferences,
  released: readonly UUID[],
  metaSpaceId: UUID,
): UUID[] => {
  const held = new Map<UUID, UUID[]>(spaceIds.map((id) => [id, []]));
  const inbound = new Map<UUID, number>(spaceIds.map((id) => [id, 0]));
  for (const { spaceId, targetSpaceId, lifetime } of references) {
    if (!lifetime) continue;
    held.get(spaceId)?.push(targetSpaceId);
    inbound.set(targetSpaceId, (inbound.get(targetSpaceId) ?? 0) + 1);
  }
  const pending = released.filter((id) => id !== metaSpaceId && (inbound.get(id) ?? 0) === 0);
  const deleted: UUID[] = [];
  for (const id of pending) {
    if (deleted.includes(id)) continue;
    const children = held.get(id);
    if (children === undefined) continue;
    deleted.push(id);
    for (const childSpaceId of children) {
      const count = (inbound.get(childSpaceId) ?? 0) - 1;
      inbound.set(childSpaceId, count);
      if (childSpaceId !== metaSpaceId && count === 0) pending.push(childSpaceId);
    }
  }
  return deleted;
};
