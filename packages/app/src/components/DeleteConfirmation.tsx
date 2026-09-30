import { useId, useState, useSyncExternalStore } from 'react';
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
import type {
  DeleteConfirmation as DeleteConfirmationInteraction,
  DeleteQuestionList,
  DeleteQuestionWords,
  FocusFallback,
} from '../delete-confirmation';

/**
 * What a deletion destroys, said before it happens, for any kind of subject.
 *
 * **A deletion asks first because it cannot be taken back**: V1 has no undo.
 *
 * It stands at the App root rather than in the surface that armed it. A menu
 * closes on the press and would take the question with it — and a subject that
 * has just been deleted can take its surface, so a dialog mounted there would
 * be unmounting itself as it reported.
 *
 * The words are the arming command's: the subject's name, what it is deleted
 * from, the one line of what goes and any lists of what else it reaches. The
 * dialog adds only the question's shape and its two answers.
 *
 * **Closing returns the caret to the control that armed it while that control
 * is still in the document**, whichever answer closed it. A completed deletion
 * can take that control away with its subject, so then the caret goes to the
 * focus fallback the arming surface named, and without one the primitive's own
 * return rule stands. `ResourcesPopover.test.tsx` holds both halves for the
 * Resources list.
 */
export function DeleteConfirmation({
  subject,
  from,
  description,
  lists = [],
  deleting,
  focusFallback = null,
  onConfirm,
  onDismiss,
}: DeleteQuestionWords & {
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
    return (active instanceof HTMLElement || active instanceof SVGElement) &&
      active !== document.body
      ? active
      : null;
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
        finalFocus={() => returnFocusTo(opener?.isConnected ? opener : (focusFallback?.() ?? null))}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>
            Delete {subject.name}
            {from === null ? null : ` From ${from}`}?
          </AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {lists.map((list) =>
          list.names.length === 0 ? null : <ReachedList key={list.heading} list={list} />,
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={deleting}
            onClick={(event) => {
              // `preventBaseUIHandler`, not `preventDefault`: Base UI's
              // `mergeProps` runs the primitive's own close handler unless the
              // consumer sets `baseUIHandlerPrevented`, and it never reads
              // `defaultPrevented`. A deletion may answer a promise, and the
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

/** One list of what the deletion reaches, named by its heading. */
function ReachedList({ list }: { readonly list: DeleteQuestionList }) {
  const headingId = useId();
  return (
    <div className="grid gap-1 text-sm">
      <p id={headingId} className="font-medium">
        {list.heading}
      </p>
      <ul aria-labelledby={headingId} className="list-disc pl-5 text-muted-foreground">
        {list.names.map((name, index) => (
          // A name is unique only within its owner, so the position keys it.
          <li key={index}>{name}</li>
        ))}
      </ul>
    </div>
  );
}

/**
 * The dialog primitive's final focus for a return target. The primitive
 * focuses an HTML element itself; an SVG element — an Edge, which is drawn and
 * focused as one — is focused here and the primitive told to leave it, and no
 * target leaves the choice to the primitive.
 */
const returnFocusTo = (target: HTMLElement | SVGElement | null): HTMLElement | boolean => {
  if (target === null) return true;
  if (target instanceof HTMLElement) return target;
  target.focus();
  return false;
};

/** The confirmation standing over whatever a delete command has armed, if anything. */
export function ArmedDeleteConfirmation({
  deleteConfirmation,
}: {
  readonly deleteConfirmation: Pick<
    DeleteConfirmationInteraction,
    'getState' | 'subscribe' | 'confirm' | 'cancel'
  >;
}) {
  const { pending, deleting } = useSyncExternalStore(
    deleteConfirmation.subscribe,
    deleteConfirmation.getState,
  );
  return pending === null ? null : (
    <DeleteConfirmation
      subject={pending.subject}
      from={pending.from}
      description={pending.description}
      lists={pending.lists ?? []}
      deleting={deleting}
      focusFallback={pending.focusFallback}
      onConfirm={deleteConfirmation.confirm}
      onDismiss={deleteConfirmation.cancel}
    />
  );
}
