import type { Resource, UUID } from '@project/core';
import {
  createObservableState,
  type ObserverErrorReporter,
  type ObservableState,
} from '@project/persistence';
import type { CommandOutcomes } from './command-outcomes';
import type { SpaceAuthoring } from './space-authoring';
import type { SpaceResourceAuthoring } from './space-resource-lifecycle';

/**
 * Delete Resource: the whole confirmation interaction, in one module.
 *
 * The menu arms a question and the dialog answers it, but neither surface owns
 * the interaction's lifetime. This module does: arming, cancellation, busy
 * state and kind-specific execution stay together, and the Edit owners stay
 * where they are.
 *
 * **What a deletion leaves behind is not this module's.** It runs each deletion
 * through command outcomes' `resource-delete` channel, which owns the notice,
 * its words and its staleness; this module keeps only the interaction.
 */

export interface ResourceDeletionState {
  /** The Resource a confirmation is standing over, or `null` when none is. */
  readonly pending: Resource | null;
  /** Whether the armed confirmation is running its deletion. */
  readonly deleting: boolean;
}

export interface ResourceDeletion {
  readonly getState: () => ResourceDeletionState;
  readonly subscribe: (listener: () => void) => () => void;
  /** Arm the confirmation without deleting anything. Replaces any prior question. */
  readonly arm: (resource: Resource) => void;
  /** Dismiss the question without producing an Edit. */
  readonly cancel: () => void;
  /** Start deletion once for the armed Resource. */
  readonly confirm: () => void;
  readonly dispose: () => void;
}

export interface ResourceDeletionDependencies {
  readonly authoring: SpaceAuthoring;
  readonly currentSpace: () => { readonly id: UUID };
  /** Where each deletion runs, and where its outcome is told. */
  readonly commandOutcomes: CommandOutcomes;
  readonly spaceResources?: SpaceResourceAuthoring | undefined;
  readonly reportObserverError?: ObserverErrorReporter | undefined;
}

const NONE: ResourceDeletionState = { pending: null, deleting: false };

export function createResourceDeletion({
  authoring,
  currentSpace,
  commandOutcomes,
  spaceResources,
  reportObserverError = (error) => console.error('Resource deletion observer failed', error),
}: ResourceDeletionDependencies): ResourceDeletion {
  const observable: ObservableState<ResourceDeletionState> = createObservableState(
    NONE,
    reportObserverError,
  );
  let disposed = false;
  /** Bumped when the interaction is discarded or superseded. */
  let interactionEpoch = 0;

  const publish = (state: ResourceDeletionState): void => {
    if (!disposed) observable.publish(state);
  };

  const discard = (): void => {
    interactionEpoch += 1;
    const { pending, deleting } = observable.getState();
    if (pending !== null || deleting) publish(NONE);
  };

  let replacementEpoch = authoring.getState().replacementEpoch;
  const unsubscribeAuthoring = authoring.subscribe(() => {
    const state = authoring.getState();
    if (state.replacementEpoch !== replacementEpoch) {
      replacementEpoch = state.replacementEpoch;
      discard();
    }
  });

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

  return {
    getState: observable.getState,
    subscribe: observable.subscribe,
    arm: (resource) => {
      interactionEpoch += 1;
      publish({ pending: resource, deleting: false });
    },
    cancel: () => {
      if (observable.getState().deleting) return;
      interactionEpoch += 1;
      publish(NONE);
    },
    confirm: () => {
      const { pending, deleting } = observable.getState();
      if (pending === null || deleting) return;
      const resource = pending;
      const atConfirm = interactionEpoch;
      publish({ pending: resource, deleting: true });
      // Command outcomes answers rather than rejects: a throw has already
      // reached its reporter and its channel by the time this settles.
      void execute(resource).then(() => {
        if (disposed || atConfirm !== interactionEpoch) return;
        publish(NONE);
      });
    },
    dispose: () => {
      disposed = true;
      interactionEpoch += 1;
      unsubscribeAuthoring();
      observable.clearSubscribers();
    },
  };
}
