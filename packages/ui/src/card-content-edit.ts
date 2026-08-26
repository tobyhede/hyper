import { createContext, useContext } from 'react';

/**
 * The two ends of an edit running inside a Card's kind-owned content slot.
 *
 * Neither carries a value. What is being committed is the draft, and the draft
 * belongs to the component holding the caret — `MarkdownCardBody` owns its own,
 * along with the remount that makes an abandon exact. These are the same two
 * exits its `Escape` and `Mod-Enter` keys already take, offered as operations so
 * the Card can draw them.
 */
export interface CardContentEdit {
  /** Commit the draft, exactly as `Mod-Enter` does. */
  readonly onSave: () => void;
  /** Abandon it, exactly as `Escape` does. */
  readonly onCancel: () => void;
}

/**
 * How content mounted in a Card's slot tells the Card an edit is running, and
 * `null` when it stops.
 *
 * A context rather than a prop because the Card's rail and its content are on
 * opposite sides of an opaque `ReactNode`: the composition hands `CanvasCard` a
 * node it cannot look inside, and the caret lives in state the composition does
 * not hold. The alternative — hoisting the draft to whoever renders the slot —
 * would move `MarkdownCardBody`'s document handling into the adapter and every
 * story that mounts one.
 *
 * The direction is deliberate: the *content* publishes, the *Card* draws. A Card
 * that never mounts editable content sees nothing and draws its ordinary rail;
 * content mounted with no Card around it publishes into `null` and simply keeps
 * its keys, which is what the standalone component stories do.
 */
export type PublishCardContentEdit = (edit: CardContentEdit | null) => void;

const CardContentEditContext = createContext<PublishCardContentEdit | null>(null);

export const CardContentEditProvider = CardContentEditContext.Provider;

/** The publisher the surrounding Card supplied, or `null` outside one. */
export const usePublishCardContentEdit = (): PublishCardContentEdit | null =>
  useContext(CardContentEditContext);
