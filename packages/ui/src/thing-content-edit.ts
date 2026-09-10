import { createContext, useContext } from 'react';

/**
 * The two ends of an edit running inside a Thing's kind-owned content slot.
 *
 * Neither carries a value. What is being committed is the draft, and the draft
 * belongs to the component holding the caret — `MarkdownThingBody` owns its own,
 * along with the remount that makes an abandon exact. These are the same two
 * exits its `Escape` and `Mod-Enter` keys already take, offered as operations so
 * the Thing can draw them.
 */
export interface ThingContentEdit {
  /** Commit the draft, exactly as `Mod-Enter` does. */
  readonly onSave: () => void;
  /** Abandon it, exactly as `Escape` does. */
  readonly onCancel: () => void;
}

/**
 * How content mounted in a Thing's slot tells the Thing an edit is running, and
 * `null` when it stops.
 *
 * A context rather than a prop because the Thing's rail and its content are on
 * opposite sides of an opaque `ReactNode`: the composition hands `CanvasThing` a
 * node it cannot look inside, and the caret lives in state the composition does
 * not hold. The alternative — hoisting the draft to whoever renders the slot —
 * would move `MarkdownThingBody`'s document handling into the adapter and every
 * story that mounts one.
 *
 * The direction is deliberate: the *content* publishes, the *Thing* draws. A Thing
 * that never mounts editable content sees nothing and draws its ordinary rail;
 * content mounted with no Thing around it publishes into `null` and simply keeps
 * its keys, which is what the standalone component stories do.
 */
export type PublishThingContentEdit = (edit: ThingContentEdit | null) => void;

const ThingContentEditContext = createContext<PublishThingContentEdit | null>(null);

export const ThingContentEditProvider = ThingContentEditContext.Provider;

/** The publisher the surrounding Thing supplied, or `null` outside one. */
export const usePublishThingContentEdit = (): PublishThingContentEdit | null =>
  useContext(ThingContentEditContext);
