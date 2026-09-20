import type { SpaceSnapshot, UUID } from '@project/core';
import type { SpaceAggregateError } from '@project/graph';

/**
 * Say what an aggregate refusal was about, in the identities the author can act
 * on.
 *
 * A refusal arrives as structured `SpaceAggregateError`s and every one of them
 * names the entities involved. Printing only `error.kind` throws all of that
 * away: `invalid-space-snapshot` becomes a single word for a fault that could be
 * any of a Space's Resources, and the colliding ids in `duplicate-resource-id` — the
 * only part an operator can search a directory for — never reach the terminal.
 * So the structure survives as far as here and is rendered once, at the edge.
 *
 * `@project/app`'s `authoring-refusal.ts` renders the same union and
 * deliberately does not do this: it writes one short sentence for a person
 * looking at the canvas the fault is already visible on. A CLI author is
 * looking at a directory instead, so the id *is* the useful part. Two audiences,
 * two renderings, and neither is the other's to reuse — `app` is browser-side
 * and `src/` could not import it in any case.
 *
 * `snapshotIndex` is resolved against the Spaces that were read, because the
 * index is an artifact of how intake walked them and means nothing to someone
 * holding a directory. Where it cannot be resolved the index is printed rather
 * than hidden, so a message never silently loses its subject.
 */
export const describeAggregateRefusal = (
  errors: readonly SpaceAggregateError[],
  spaces: readonly SpaceSnapshot[],
): readonly string[] => {
  const spaceAt = (index: number): string => {
    const snapshot = spaces[index];
    return snapshot === undefined ? `the space at position ${index}` : `Space ${snapshot.id}`;
  };
  const spaceResource = (error: { readonly spaceId: UUID; readonly resourceId: UUID }): string =>
    `Space Resource ${error.resourceId} in Space ${error.spaceId}`;

  return errors.map((error) => {
    switch (error.kind) {
      case 'invalid-space-snapshot':
        return `${spaceAt(error.snapshotIndex)} did not load:\n  ${error.errors
          .map(({ message }) => message)
          .join('\n  ')}`;
      case 'duplicate-space-id':
        return `Space ${error.spaceId} is declared ${error.snapshotIndexes.length} times`;
      case 'duplicate-resource-id':
        return `Resource ${error.resourceId} is claimed by more than one Space: ${error.spaceIds.join(', ')}`;
      case 'meta-space-missing':
        return `The aggregate names Meta Space ${error.metaSpaceId}, which it does not contain`;
      case 'ordinary-space-unreferenced':
        return `Space ${error.spaceId} is not the Meta Space and no Space Resource points at it`;
      case 'space-resource-target-missing':
        return `${spaceResource(error)} points at Space ${error.targetSpaceId}, which the aggregate does not contain`;
      case 'space-resource-reference-cycle':
        return `${spaceResource(error)} closes a reference cycle through Space ${error.targetSpaceId}`;
      case 'space-resource-map-missing':
        return `${spaceResource(error)} selects Map ${error.mapId}, which Space ${error.targetSpaceId} does not have`;
      case 'space-resource-graph-missing':
        return `${spaceResource(error)} selects Graph ${error.graphId}, which Space ${error.targetSpaceId} does not have`;
      case 'space-resource-graph-outside-map':
        return `${spaceResource(error)} selects Graph ${error.graphId}, which Space ${error.targetSpaceId} has but Map ${error.mapId} does not own`;
    }
  });
};
