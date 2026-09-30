import { shortTitle, type Resource } from '@project/core';
import { deletionReach, type DeletionReach, type Space } from '@project/graph';
import type { CommandOutcomes } from './command-outcomes';
import type {
  DeleteConfirmation,
  DeleteQuestion,
  DeleteQuestionWords,
  FocusFallback,
} from './delete-confirmation';
import type { SpaceAuthoring } from './space-authoring';
import type { SpaceResourceAuthoring } from './space-resource-lifecycle';

/**
 * Delete from Space: a Resource as the subject of the delete confirmation.
 *
 * The rail and the Resources list arm it with a Resource; this module supplies
 * what the confirmation says about that Resource and the kind-specific deletion
 * it runs, and the confirmation owns the rest of the interaction.
 *
 * **What a deletion leaves behind is not this module's.** It runs each deletion
 * through command outcomes' `resource-delete` channel, which owns the notice,
 * its words and its staleness.
 */

const DELETES_THE_RESOURCE = 'Permanently deletes the Resource from the Space.';

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
  space: `${DELETES_THE_RESOURCE} If it is the last reference to its Space, that Space is deleted with it, along with every Space below it that nothing else references.`,
} satisfies Record<Resource['kind'], string>;

/**
 * What Delete from Space asks about a Resource. The short Title names it on one
 * line and marks a Title written on several as shortened rather than presenting
 * its first line as the whole of it.
 *
 * Under the description it lists what the deletion reaches — the Maps that
 * place the Resource and the Graphs holding an Edge connected to it — each by
 * its short name. A Graph's name is unique only within its Map, so a Graph is
 * named with its Map once more than one Map is listed.
 */
export const resourceDeletionWords = (
  resource: Resource,
  reach: DeletionReach,
): DeleteQuestionWords => {
  const withMap = reach.maps.length > 1;
  return {
    subject: { kind: 'resource', name: shortTitle(resource.title) },
    from: 'Space',
    description: DELETION_DESCRIPTIONS[resource.kind],
    lists: [
      { heading: 'Removed from Maps', names: reach.maps.map((m) => shortTitle(m.title)) },
      {
        heading: 'Edges deleted from Graphs',
        names: reach.graphs.map(({ map: m, graph }) =>
          withMap
            ? `${shortTitle(graph.title)} in ${shortTitle(m.title)}`
            : shortTitle(graph.title),
        ),
      },
    ],
  };
};

export interface ResourceDeletionState {
  /** The Resource a confirmation is standing over, or `null` when none is. */
  readonly pending: Resource | null;
  /** The armed question's focus fallback, or `null` when it names none. */
  readonly focusFallback: FocusFallback | null;
  /** Whether the armed confirmation is running its deletion. */
  readonly deleting: boolean;
}

export interface ResourceDeletion {
  readonly getState: () => ResourceDeletionState;
  readonly subscribe: (listener: () => void) => () => void;
  /** Arm the confirmation without deleting anything. Replaces any prior question. */
  readonly arm: (resource: Resource, focusFallback?: FocusFallback) => void;
  /** Dismiss the question without producing an Edit. */
  readonly cancel: () => void;
  /** Start deletion once for the armed Resource. */
  readonly confirm: () => void;
  readonly dispose: () => void;
}

export interface ResourceDeletionDependencies {
  readonly authoring: SpaceAuthoring;
  /** The Space the deletion runs in, read at arming for what it reaches. */
  readonly currentSpace: () => Pick<Space, 'id' | 'maps'>;
  /** The one confirmation every delete command asks through. */
  readonly deleteConfirmation: DeleteConfirmation;
  /** Where each deletion runs, and where its outcome is told. */
  readonly commandOutcomes: CommandOutcomes;
  readonly spaceResources?: SpaceResourceAuthoring | undefined;
}

const NONE: ResourceDeletionState = { pending: null, focusFallback: null, deleting: false };

export function createResourceDeletion({
  authoring,
  currentSpace,
  deleteConfirmation,
  commandOutcomes,
  spaceResources,
}: ResourceDeletionDependencies): ResourceDeletion {
  /** The Resource behind each question this module armed. */
  const armed = new WeakMap<DeleteQuestion, Resource>();

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
      authoring.complete({ kind: 'deleted-resource', resourceId: resource.id }),
    );
  };

  // The confirmation's state, read as the Resource it stands over. Derived once
  // per published state, so a reader comparing snapshots sees one value for it.
  let seen: ReturnType<DeleteConfirmation['getState']> | null = null;
  let view: ResourceDeletionState = NONE;
  let disposed = false;
  const getState = (): ResourceDeletionState => {
    if (disposed) return view;
    const state = deleteConfirmation.getState();
    if (state === seen) return view;
    seen = state;
    const resource = state.pending === null ? undefined : armed.get(state.pending);
    view =
      state.pending === null || resource === undefined
        ? NONE
        : {
            pending: resource,
            focusFallback: state.pending.focusFallback,
            deleting: state.deleting,
          };
    return view;
  };

  return {
    getState,
    subscribe: deleteConfirmation.subscribe,
    arm: (resource, focusFallback) => {
      const question = {
        ...resourceDeletionWords(resource, deletionReach(currentSpace().maps, resource.id)),
        run: () => execute(resource),
        focusFallback: focusFallback ?? null,
      };
      armed.set(question, resource);
      deleteConfirmation.arm(question);
    },
    cancel: deleteConfirmation.cancel,
    confirm: deleteConfirmation.confirm,
    dispose: () => {
      getState();
      disposed = true;
    },
  };
}
