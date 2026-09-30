import {
  createObservableState,
  type ObserverErrorReporter,
  type ObservableState,
} from '@project/persistence';

/**
 * The delete confirmation: one question, asked before any deletion runs.
 *
 * A delete command arms it by naming what it deletes and handing over the
 * deletion to run; the dialog at the App root answers it. This module owns the
 * interaction's lifetime — arming, cancellation and the busy state — and knows
 * nothing about any kind of subject: what is deleted, what the question says
 * about it and where its outcome is reported are all the arming command's.
 */

/**
 * Where the caret goes when the confirmation closes and the control that armed
 * it is no longer in the document. Named by the arming surface; `null` from it,
 * or no fallback at all, leaves the choice to the dialog primitive.
 */
export type FocusFallback = () => HTMLElement | SVGElement | null;

/** What the question is about: its kind, and the short Title or name it is asked by. */
export interface DeleteSubject {
  readonly kind: string;
  readonly name: string;
}

/** A named list of what else the deletion reaches, drawn under the description. */
export interface DeleteQuestionList {
  /** What the list is, which also names it to assistive technology. */
  readonly heading: string;
  /** Each entry by its short name, in the order the question gives them. */
  readonly names: readonly string[];
}

/** Everything the confirmation says: `Delete {name} From {from}?` and one line under it. */
export interface DeleteQuestionWords {
  readonly subject: DeleteSubject;
  /** What the subject is deleted from, or `null` to ask `Delete {name}?`. */
  readonly from: string | null;
  /** What is permanently deleted, in one line. */
  readonly description: string;
  /** What else the deletion reaches, list by list; an empty list is not drawn. */
  readonly lists?: readonly DeleteQuestionList[];
}

export interface DeleteQuestion extends DeleteQuestionWords {
  /**
   * The deletion Delete runs. It reports its own outcome — a refusal reaches
   * the author through the channel the command already tells them on — and the
   * confirmation stands until what it answers settles.
   */
  readonly run: () => void | Promise<void>;
  /** The arming surface's focus fallback, or `null` when it names none. */
  readonly focusFallback: FocusFallback | null;
}

export interface DeleteConfirmationState {
  /** The question standing, or `null` when none is. */
  readonly pending: DeleteQuestion | null;
  /** Whether the standing question is running its deletion. */
  readonly deleting: boolean;
}

export interface DeleteConfirmation {
  readonly getState: () => DeleteConfirmationState;
  readonly subscribe: (listener: () => void) => () => void;
  /** Ask the question without deleting anything. Replaces any prior question. */
  readonly arm: (question: DeleteQuestion) => void;
  /** Dismiss the question without running its deletion. Withheld while it runs. */
  readonly cancel: () => void;
  /** Run the standing question's deletion, once. */
  readonly confirm: () => void;
  readonly dispose: () => void;
}

export interface DeleteConfirmationDependencies {
  /** Space Authoring, read for the moment the stored Space replaces the working one. */
  readonly authoring: {
    readonly getState: () => { readonly replacementEpoch: number };
    readonly subscribe: (listener: () => void) => () => void;
  };
  readonly reportObserverError?: ObserverErrorReporter | undefined;
}

const NONE: DeleteConfirmationState = { pending: null, deleting: false };

export function createDeleteConfirmation({
  authoring,
  reportObserverError = (error) => console.error('Delete confirmation observer failed', error),
}: DeleteConfirmationDependencies): DeleteConfirmation {
  const observable: ObservableState<DeleteConfirmationState> = createObservableState(
    NONE,
    reportObserverError,
  );
  let disposed = false;
  /** Bumped when the interaction is discarded or superseded. */
  let interactionEpoch = 0;

  const publish = (state: DeleteConfirmationState): void => {
    if (!disposed) observable.publish(state);
  };

  // A question is about the Space it was asked over: when the stored Space
  // replaces the working one, the question and any late answer are discarded.
  let replacementEpoch = authoring.getState().replacementEpoch;
  const unsubscribeAuthoring = authoring.subscribe(() => {
    const state = authoring.getState();
    if (state.replacementEpoch === replacementEpoch) return;
    replacementEpoch = state.replacementEpoch;
    interactionEpoch += 1;
    if (observable.getState() !== NONE) publish(NONE);
  });

  // An async function runs to its first `await` within the call, so the
  // deletion starts within the press, and a synchronous throw still arrives as
  // a rejection.
  const settle = async (run: DeleteQuestion['run']): Promise<void> => {
    await run();
  };

  return {
    getState: observable.getState,
    subscribe: observable.subscribe,
    arm: (question) => {
      interactionEpoch += 1;
      publish({ pending: question, deleting: false });
    },
    cancel: () => {
      if (observable.getState().deleting) return;
      interactionEpoch += 1;
      publish(NONE);
    },
    confirm: () => {
      const { pending, deleting } = observable.getState();
      if (pending === null || deleting) return;
      const atConfirm = interactionEpoch;
      publish({ pending, deleting: true });
      const stand = (): void => {
        if (disposed || atConfirm !== interactionEpoch) return;
        publish(NONE);
      };
      void settle(pending.run).catch(reportObserverError).then(stand);
    },
    dispose: () => {
      disposed = true;
      interactionEpoch += 1;
      unsubscribeAuthoring();
      observable.clearSubscribers();
    },
  };
}
