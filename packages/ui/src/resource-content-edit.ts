import { createContext, useContext } from 'react';

/**
 * The two ends of an edit running inside a Resource's kind-owned content slot.
 *
 * Neither carries a value. What is being committed is the draft, and the draft
 * belongs to the component holding the caret — `MarkdownResourceBody` owns its own,
 * along with the remount that makes an abandon exact. These are the same two
 * exits its `Escape` and `Mod-Enter` keys already take, offered as operations so
 * the Resource can draw them.
 */
export interface ResourceContentEdit {
  /** Commit the draft, exactly as `Mod-Enter` does. */
  readonly onSave: () => void;
  /** Abandon it, exactly as `Escape` does. */
  readonly onCancel: () => void;
}

/**
 * How content mounted in a Resource's slot tells the Resource an edit is running, and
 * `null` when it stops.
 *
 * A context rather than a prop because the Resource's rail and its content are on
 * opposite sides of an opaque `ReactNode`: the composition hands `CanvasResource` a
 * node it cannot look inside, and the caret lives in state the composition does
 * not hold. The alternative — hoisting the draft to whoever renders the slot —
 * would move `MarkdownResourceBody`'s document handling into the adapter and every
 * story that mounts one.
 *
 * The direction is deliberate: the *content* publishes, the *Resource* draws. A Resource
 * that never mounts editable content sees nothing and draws its ordinary rail;
 * content mounted with no Resource around it publishes into `null` and simply keeps
 * its keys, which is what the standalone component stories do.
 */
export type PublishResourceContentEdit = (edit: ResourceContentEdit | null) => void;

const ResourceContentEditContext = createContext<PublishResourceContentEdit | null>(null);

export const ResourceContentEditProvider = ResourceContentEditContext.Provider;

/** The publisher the surrounding Resource supplied, or `null` outside one. */
export const usePublishResourceContentEdit = (): PublishResourceContentEdit | null =>
  useContext(ResourceContentEditContext);
