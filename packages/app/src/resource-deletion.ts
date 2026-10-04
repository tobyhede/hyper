import { shortTitle, type Resource } from '@project/core';
import {
  deletionReach,
  graphColorsByGraphId,
  type DeletionReach,
  type Space,
} from '@project/graph';
import { graphAppearance } from '@project/ui';
import type { CommandOutcomes } from './command-outcomes';
import type { DeleteConfirmation, DeleteQuestionWords, FocusFallback } from './delete-confirmation';
import { CANVAS, type SpaceAuthoring } from './space-authoring';
import type { SpaceResourceAuthoring } from './space-resource-lifecycle';

/**
 * Delete from Space: a Resource as the subject of the delete confirmation.
 *
 * The rail and the Resources list ask it about a Resource; this module supplies
 * what the confirmation says about that Resource and the kind-specific deletion
 * it runs, and the confirmation owns the interaction's lifetime.
 *
 * **What a deletion leaves behind is not this module's.** It runs each deletion
 * through command outcomes' `resource-delete` channel, which owns the notice,
 * its words and its staleness.
 */

const DELETES_THE_RESOURCE =
  'Permanently deletes the Resource from the Space and all Maps and Graphs.';

/**
 * Exhaustive over the kinds rather than a default plus one exception, so a new
 * kind has to decide what its deletion destroys before it compiles. A Space
 * Resource owns its target's lifetime together with every other reference to
 * it, so its deletion can reach Spaces that are not on screen (ADR 0074).
 */
const DELETION_DESCRIPTIONS = {
  markdown: DELETES_THE_RESOURCE,
  reference: DELETES_THE_RESOURCE,
  image: DELETES_THE_RESOURCE,
  ur: DELETES_THE_RESOURCE,
  space: `${DELETES_THE_RESOURCE} If it is the last reference to its Space, that Space is deleted with it, along with every Space below it that nothing else references.`,
} satisfies Record<Resource['kind'], string>;

/**
 * What Delete from Space asks about a Resource. The short Title names it on one
 * line and marks a Title written on several as shortened rather than presenting
 * its first line as the whole of it.
 *
 * Under the description it names what the deletion reaches: each Map that
 * places the Resource, with the Graphs it owns that hold an Edge connected to
 * it beneath, each by its short name and each Graph in its colour and head
 * shape. Every reached Graph sits under a listed Map, because an Edge connects
 * two Resources its Graph's Map places (CONTEXT.md, Graph).
 */
export const resourceDeletionWords = (
  resource: Resource,
  reach: DeletionReach,
  colorByGraphId: Readonly<Record<string, string>>,
): DeleteQuestionWords => ({
  subject: { kind: 'resource', name: shortTitle(resource.title) },
  from: 'Space',
  description: DELETION_DESCRIPTIONS[resource.kind],
  reach: reach.maps.map((m) => ({
    key: m.id,
    title: shortTitle(m.title),
    graphs: reach.graphs
      .filter((reached) => reached.map.id === m.id)
      .map(({ graph }) => ({
        key: graph.id,
        title: shortTitle(graph.title),
        appearance: graphAppearance(graph, colorByGraphId),
      })),
  })),
});

export interface ResourceDeletion {
  /**
   * Ask the delete confirmation about `resource`, with what its deletion reaches
   * in the current Space, without deleting anything. Replaces any prior question.
   */
  readonly askToDelete: (resource: Resource, focusFallback: FocusFallback) => void;
}

export interface ResourceDeletionDependencies {
  readonly authoring: SpaceAuthoring;
  /** The Space the deletion runs in, read at asking for what it reaches. */
  readonly currentSpace: () => Space;
  /** The one confirmation every delete command asks through. */
  readonly deleteConfirmation: Pick<DeleteConfirmation, 'arm'>;
  /** Where each deletion runs, and where its outcome is told. */
  readonly commandOutcomes: CommandOutcomes;
  readonly spaceResources?: SpaceResourceAuthoring | undefined;
}

export function createResourceDeletion({
  authoring,
  currentSpace,
  deleteConfirmation,
  commandOutcomes,
  spaceResources,
}: ResourceDeletionDependencies): ResourceDeletion {
  const execute = async (resource: Resource): Promise<void> => {
    if (resource.kind === 'space') {
      await commandOutcomes.run('space-resource-delete', async () => {
        if (spaceResources === undefined) {
          throw new Error('Space Resource deletion requires Space Resource authoring');
        }
        return spaceResources.delete({
          containingSpaceId: currentSpace().id,
          resourceId: resource.id,
        });
      });
      return;
    }
    commandOutcomes.run('resource-delete', () =>
      authoring.complete(CANVAS, { kind: 'deleted-resource', resourceId: resource.id }),
    );
  };

  return {
    askToDelete: (resource, focusFallback) => {
      const space = currentSpace();
      deleteConfirmation.arm({
        ...resourceDeletionWords(
          resource,
          deletionReach(space.maps, resource.id),
          graphColorsByGraphId(space),
        ),
        run: () => execute(resource),
        focusFallback,
      });
    },
  };
}
