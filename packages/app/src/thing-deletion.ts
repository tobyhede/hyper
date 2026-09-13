import type { Thing, UUID } from '@project/core';
import {
  createObservableState,
  type ObserverErrorReporter,
  type ObservableState,
} from '@project/persistence';
import { describeAuthoringRefusal, describeSpaceThingRefusal } from './authoring-refusal';
import { failureMessage } from './failure-message';
import type { SpaceAuthoring } from './space-authoring';
import type { SpaceThingAuthoring } from './space-thing-lifecycle';

/**
 * Delete Thing: the whole confirmation interaction, in one module.
 *
 * The menu arms a question, the dialog answers it, and the standing notice
 * carries a refusal — but none of those surfaces owns the interaction's
 * lifetime. This module does: arming, cancellation, busy state, kind-specific
 * execution and outcome delivery stay together, and the Edit owners stay where
 * they are (ADR 0035, ADR 0074, ADR 0076).
 */

export interface ThingDeletionState {
  /** The Thing a confirmation is standing over, or `null` when none is. */
  readonly pending: Thing | null;
  /** Whether the armed confirmation is running its deletion. */
  readonly deleting: boolean;
  /** Why the last deletion did not run, or `null`. */
  readonly refusal: string | null;
}

export interface ThingDeletion {
  readonly getState: () => ThingDeletionState;
  readonly subscribe: (listener: () => void) => () => void;
  /** Arm the confirmation without deleting anything. Replaces any prior question. */
  readonly arm: (thing: Thing) => void;
  /** Dismiss the question without producing an Edit. */
  readonly cancel: () => void;
  /** Start deletion once for the armed Thing. */
  readonly confirm: () => void;
  /** Clear the standing refusal notice. */
  readonly dismissRefusal: () => void;
  /** Report a refusal from an immediate removal gesture that shares the notice. */
  readonly reportRefusal: (refusal: string) => void;
  readonly dispose: () => void;
}

export interface ThingDeletionDependencies {
  readonly authoring: SpaceAuthoring;
  readonly currentSpace: () => { readonly id: UUID };
  readonly spaceThings?: SpaceThingAuthoring | undefined;
  readonly reportObserverError?: ObserverErrorReporter | undefined;
}

const NONE: ThingDeletionState = { pending: null, deleting: false, refusal: null };

export function createThingDeletion({
  authoring,
  currentSpace,
  spaceThings,
  reportObserverError = (error) => console.error('Thing deletion observer failed', error),
}: ThingDeletionDependencies): ThingDeletion {
  const observable: ObservableState<ThingDeletionState> = createObservableState(
    NONE,
    reportObserverError,
  );
  let disposed = false;
  /** Bumped when the interaction is discarded or superseded. */
  let interactionEpoch = 0;

  const publish = (state: ThingDeletionState): void => {
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

  const execute = async (thing: Thing): Promise<string | null> => {
    try {
      if (thing.kind === 'space') {
        if (spaceThings === undefined) {
          throw new Error('Space Thing deletion requires Space Thing authoring');
        }
        const result = await spaceThings.delete({
          containingSpaceId: currentSpace().id,
          thingId: thing.id,
        });
        return result.kind === 'refused' ? describeSpaceThingRefusal(result.refusal) : null;
      }
      const result = authoring.complete({ kind: 'deleted-thing', thingId: thing.id });
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
    arm: (thing) => {
      interactionEpoch += 1;
      publish({ pending: thing, deleting: false, refusal: null });
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
      const thing = pending;
      const atConfirm = interactionEpoch;
      publish({ pending: thing, deleting: true, refusal: null });
      void execute(thing).then((refusal) => {
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
