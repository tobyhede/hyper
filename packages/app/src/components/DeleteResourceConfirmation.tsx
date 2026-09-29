import { useState, useSyncExternalStore } from 'react';
import { shortTitle, type Resource } from '@project/core';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@project/ui';
import type { FocusFallback, ResourceDeletion } from '../resource-deletion';

/**
 * What deleting a Resource destroys, said before it happens.
 *
 * **A Resource's deletion is the one command on the canvas that asks first**, and it
 * asks because it cannot be taken back: V1 has no undo, and a Space Resource owns
 * its target's lifetime together with every other reference to it, so the same
 * gesture can reach work in Spaces that are not even on screen (ADR 0074).
 *
 * It stands at the App root rather than in the rail's menu that armed it. The
 * menu closes on the press and would take the question with it — and a Resource that
 * has just been deleted takes its rail, so a dialog mounted there would be
 * unmounting itself as it reported.
 *
 * The description is exhaustive over the kinds rather than a default plus one
 * exception, so a fourth kind has to decide what its deletion destroys before it
 * compiles.
 *
 * **Closing returns the caret to the control that armed it while that control
 * is still in the document**, whichever answer closed it. A completed deletion
 * can take that control away with its Resource, so then the caret goes to the
 * focus fallback the arming surface named, and without one the primitive's own
 * return rule stands — the rail names none. `ResourcesPopover.test.tsx` holds
 * both halves for the Resources list.
 */
const DELETES_THE_RESOURCE = 'Permanently deletes the Resource from the Space.';

const DELETION_DESCRIPTIONS = {
  markdown: DELETES_THE_RESOURCE,
  reference: DELETES_THE_RESOURCE,
  image: DELETES_THE_RESOURCE,
  space: `${DELETES_THE_RESOURCE} If it is the last reference to its Space, that Space is deleted with it, along with every Space below it that nothing else references.`,
} satisfies Record<Resource['kind'], string>;

export function DeleteResourceConfirmation({
  resource,
  deleting,
  focusFallback = null,
  onConfirm,
  onDismiss,
}: {
  readonly resource: Resource;
  readonly deleting: boolean;
  readonly focusFallback?: FocusFallback | null;
  readonly onConfirm: () => void;
  readonly onDismiss: () => void;
}) {
  // Read on the first render, before the dialog moves focus into itself: the
  // confirmation has no trigger, so what held focus as it opened is the control
  // that armed it.
  const [opener] = useState(() => {
    const active = document.activeElement;
    return active instanceof HTMLElement && active !== document.body ? active : null;
  });
  return (
    <AlertDialog
      open
      onOpenChange={(next) => {
        // Escape is an exit, and both exits are withheld while a Delete runs —
        // the two buttons are disabled but Base UI closes on Escape whatever
        // they are doing. Left alone it would answer into a dialog that had gone.
        if (!next && !deleting) onDismiss();
      }}
    >
      <AlertDialogContent
        finalFocus={() => (opener?.isConnected ? opener : (focusFallback?.() ?? true))}
      >
        <AlertDialogHeader>
          {/* The short Title: a question names the Resource on one line, and marks
              a Title written on several as shortened rather than presenting its
              first line as the whole of it. */}
          <AlertDialogTitle>Delete {shortTitle(resource.title)} From Space?</AlertDialogTitle>
          <AlertDialogDescription>{DELETION_DESCRIPTIONS[resource.kind]}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={deleting}
            onClick={(event) => {
              // `preventBaseUIHandler`, not `preventDefault`: Base UI's
              // `mergeProps` runs the primitive's own close handler unless the
              // consumer sets `baseUIHandlerPrevented`, and it never reads
              // `defaultPrevented`. One Resource kind answers a promise, and the
              // primitive would close the dialog long before a refusal arrived.
              event.preventBaseUIHandler();
              onConfirm();
            }}
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** The confirmation standing over the Resource a surface has armed for deletion, if any. */
export function ArmedResourceDeletion({
  resourceDeletion,
}: {
  readonly resourceDeletion: Pick<
    ResourceDeletion,
    'getState' | 'subscribe' | 'confirm' | 'cancel'
  >;
}) {
  const { pending, focusFallback, deleting } = useSyncExternalStore(
    resourceDeletion.subscribe,
    resourceDeletion.getState,
  );
  return pending === null ? null : (
    <DeleteResourceConfirmation
      resource={pending}
      deleting={deleting}
      focusFallback={focusFallback}
      onConfirm={resourceDeletion.confirm}
      onDismiss={resourceDeletion.cancel}
    />
  );
}
