import type { Resource, UUID } from '@project/core';
import {
  createObservableState,
  type ObserverErrorReporter,
  type ObservableState,
} from '@project/persistence';
import { describeAuthoringRefusal, describeSpaceResourceRefusal } from './authoring-refusal';
import { failureMessage } from './failure-message';
import type { SpaceAuthoring } from './space-authoring';
import type { SpaceResourceAuthoring } from './space-resource-lifecycle';

/**
 * Delete Resource: the whole confirmation interaction, in one module.
 *
 * The menu arms a question, the dialog answers it, and the standing notice
 * carries a refusal — but none of those surfaces owns the interaction's
 * lifetime. This module does: arming, cancellation, busy state, kind-specific
 * execution and outcome delivery stay together, and the Edit owners stay where
 * they are (ADR 0035, ADR 0074, ADR 0076).
 */

export interface ResourceDeletionState {
  /** The Resource a confirmation is standing over, or `null` when none is. */
  readonly pending: Resource | null;
  /** Whether the armed confirmation is running its deletion. */
  readonly deleting: boolean;
  /** Why the last deletion did not run, or `null`. */
  readonly refusal: string | null;
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
  /** Clear the standing refusal notice. */
  readonly dismissRefusal: () => void;
  /** Report a refusal from an immediate removal gesture that shares the notice. */
  readonly reportRefusal: (refusal: string) => void;
  readonly dispose: () => void;
}

export interface ResourceDeletionDependencies {
  readonly authoring: SpaceAuthoring;
  readonly currentSpace: () => { readonly id: UUID };
  readonly spaceResources?: SpaceResourceAuthoring | undefined;
  readonly reportObserverError?: ObserverErrorReporter | undefined;
}

const NONE: ResourceDeletionState = { pending: null, deleting: false, refusal: null };

export function createResourceDeletion({
  authoring,
  currentSpace,
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
    const { pending, deleting, refusal } = observable.getState();
    if (pending !== null || deleting || refusal !== null) {
      publish({ pending: null, deleting: false, refusal: null });
    }
  };

  let replacementEpoch = authoring.getState().replacementEpoch;
  const unsubscribeAuthoring = authoring.subscribe(() => {
    const state = authoring.getState();
    if (state.replacementEpoch !== replacementEpoch) {
      replacementEpoch = state.replacementEpoch;
      discard();
    }
  });

  const execute = async (resource: Resource): Promise<string | null> => {
    try {
      if (resource.kind === 'space') {
        if (spaceResources === undefined) {
          throw new Error('Space Resource deletion requires Space Resource authoring');
        }
        const result = await spaceResources.delete({
          containingSpaceId: currentSpace().id,
          resourceId: resource.id,
        });
        return result.kind === 'refused' ? describeSpaceResourceRefusal(result.refusal) : null;
      }
      const result = authoring.complete({ kind: 'deleted-resource', resourceId: resource.id });
      return result.kind === 'refused' ? describeAuthoringRefusal(result.refusal) : null;
    } catch (failure) {
      // `failureMessage` is the one sentence surface for a throw; a refusal code
      // is a stable domain identity and nothing caught here answers to one.
      return failureMessage(failure);
    }
  };

  return {
    getState: observable.getState,
    subscribe: observable.subscribe,
    arm: (resource) => {
      interactionEpoch += 1;
      publish({ pending: resource, deleting: false, refusal: null });
    },
    cancel: () => {
      const { deleting, refusal } = observable.getState();
      if (deleting) return;
      interactionEpoch += 1;
      publish({ pending: null, deleting: false, refusal });
    },
    confirm: () => {
      const { pending, deleting } = observable.getState();
      if (pending === null || deleting) return;
      const resource = pending;
      const atConfirm = interactionEpoch;
      publish({ pending: resource, deleting: true, refusal: null });
      void execute(resource).then((refusal) => {
        if (disposed || atConfirm !== interactionEpoch) return;
        publish({ pending: null, deleting: false, refusal });
      });
    },
    dismissRefusal: () => {
      const state = observable.getState();
      if (state.refusal === null) return;
      publish({ ...state, refusal: null });
    },
    reportRefusal: (refusal) => {
      publish({ pending: null, deleting: false, refusal });
    },
    dispose: () => {
      disposed = true;
      interactionEpoch += 1;
      unsubscribeAuthoring();
      observable.clearSubscribers();
    },
  };
}
