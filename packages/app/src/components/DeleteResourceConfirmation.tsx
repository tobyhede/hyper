import { useSyncExternalStore } from 'react';
import { titleName, type Resource } from '@project/core';
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
import type { ResourceDeletion } from '../resource-deletion';

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
 */
const DELETES_THE_RESOURCE =
  'This removes the Resource from the Space, every Map that contains it, and every Edge connected to it.';

const DELETION_DESCRIPTIONS = {
  markdown: DELETES_THE_RESOURCE,
  reference: DELETES_THE_RESOURCE,
  space: `${DELETES_THE_RESOURCE} If it is the last reference to its Space, that Space is deleted with it, along with every Space below it that nothing else references.`,
} satisfies Record<Resource['kind'], string>;

export function DeleteResourceConfirmation({
  resource,
  deleting,
  onConfirm,
  onDismiss,
}: {
  readonly resource: Resource;
  readonly deleting: boolean;
  readonly onConfirm: () => void;
  readonly onDismiss: () => void;
}) {
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
      <AlertDialogContent>
        <AlertDialogHeader>
          {/* The Resource's **name**, which is how a control names a Resource: the
              ladder below the name is drawn on the Resource front and nowhere else
              (ADR 0083). */}
          <AlertDialogTitle>Delete from Space {titleName(resource.title)}?</AlertDialogTitle>
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
            Delete from Space
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** The confirmation standing over the Resource a rail has armed for deletion, if any. */
export function ArmedResourceDeletion({
  resourceDeletion,
}: {
  readonly resourceDeletion: Pick<
    ResourceDeletion,
    'getState' | 'subscribe' | 'confirm' | 'cancel'
  >;
}) {
  const { pending, deleting } = useSyncExternalStore(
    resourceDeletion.subscribe,
    resourceDeletion.getState,
  );
  return pending === null ? null : (
    <DeleteResourceConfirmation
      resource={pending}
      deleting={deleting}
      onConfirm={resourceDeletion.confirm}
      onDismiss={resourceDeletion.cancel}
    />
  );
}
