import { useState } from 'react';
import { titleName, type Thing } from '@project/core';
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
import { failureMessage } from '../failure-message';

/**
 * What deleting a Thing destroys, said before it happens.
 *
 * **A Thing's deletion is the one command on the canvas that asks first**, and it
 * asks because it cannot be taken back: V1 has no undo, and a Space Thing owns
 * its target's lifetime together with every other reference to it, so the same
 * gesture can reach work in Spaces that are not even on screen (ADR 0074).
 *
 * It stands at the App root rather than in the rail's menu that armed it. The
 * menu closes on the press and would take the question with it — and a Thing that
 * has just been deleted takes its rail, so a dialog mounted there would be
 * unmounting itself as it reported.
 *
 * The description is exhaustive over the kinds rather than a default plus one
 * exception, so a fourth kind has to decide what its deletion destroys before it
 * compiles.
 */
const DELETES_THE_THING =
  'This removes the Thing from the Space, every Diagram that contains it, and every Edge connected to it.';

const DELETION_DESCRIPTIONS = {
  markdown: DELETES_THE_THING,
  alias: DELETES_THE_THING,
  space: `${DELETES_THE_THING} If it is the last reference to its Space, that Space is deleted with it, along with every Space below it that nothing else references.`,
} satisfies Record<Thing['kind'], string>;

export function DeleteThingConfirmation({
  thing,
  onDelete,
  onDismiss,
  onRefused,
}: {
  readonly thing: Thing;
  readonly onDelete: () => string | null | Promise<string | null>;
  readonly onDismiss: () => void;
  readonly onRefused: (refusal: string) => void;
}) {
  const [deleting, setDeleting] = useState(false);

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
          {/* The Thing's **name**, which is how a control names a Thing: the
              ladder below the name is drawn on the Thing front and nowhere else
              (ADR 0083). */}
          <AlertDialogTitle>Delete Thing {titleName(thing.title)}?</AlertDialogTitle>
          <AlertDialogDescription>{DELETION_DESCRIPTIONS[thing.kind]}</AlertDialogDescription>
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
              // `defaultPrevented`. One Thing kind answers a promise, and the
              // primitive would close the dialog long before a refusal arrived.
              event.preventBaseUIHandler();
              setDeleting(true);
              // An async body runs synchronously to its first `await`, so
              // `onDelete` is still called on this click while one `catch`
              // covers a throw and a rejection alike. Both reach it: `complete`
              // throws for a Space that has stopped loading, and the coordinated
              // Edit a Space Thing runs can reject. An event handler is not
              // something a React error boundary catches.
              void (async () => {
                try {
                  const refusal = await onDelete();
                  setDeleting(false);
                  if (refusal !== null) onRefused(refusal);
                } catch (failure) {
                  // Not a refusal, and deliberately not translated into one: a
                  // refusal code is a stable domain identity (ADR 0057) and
                  // nothing here answers to one.
                  setDeleting(false);
                  onRefused(failureMessage(failure));
                }
                // The Thing is gone or the reason is in the standing notice;
                // either way the question has been answered.
                onDismiss();
              })();
            }}
          >
            Delete Thing
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
