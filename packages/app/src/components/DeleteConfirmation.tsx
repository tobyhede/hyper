import { useRef, useState, useSyncExternalStore } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  cn,
  MapGraphList,
} from '@project/ui';
import type {
  DeleteConfirmation as DeleteConfirmationInteraction,
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
 * from, what goes, a line at a time, and the Maps and Graphs it reaches. The
 * dialog adds only the question's shape and its two answers.
 *
 * **The question never outgrows the screen.** It stops at 32rem, or at the
 * viewport less its own padding where that is less; the title and the two
 * answers keep their height and the reach scrolls in what is left. The reach is
 * focusable so a keyboard reader can scroll it, which would make it where the
 * dialog opens — so the caret opens on Cancel. `DeleteResourceConfirmation.test.tsx`
 * holds the opening caret, and `ladle-e2e/delete-confirmation.spec.ts` the
 * scrolling.
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
  reach = [],
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
  const reachRegion = useRef<HTMLElement>(null);
  const reaches = reach.length > 0;
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
        className={cn(
          'max-h-[min(32rem,calc(100dvh-2*var(--alert-dialog-spacing)))]',
          reaches && 'grid-rows-[auto_minmax(0,1fr)_auto]',
        )}
        initialFocus={() =>
          reachRegion.current
            ?.closest('[data-slot=alert-dialog-content]')
            ?.querySelector<HTMLElement>('[data-slot=alert-dialog-cancel]') ?? true
        }
        finalFocus={() => returnFocusTo(opener?.isConnected ? opener : (focusFallback?.() ?? null))}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>
            Delete {subject.name}
            {from === null ? null : ` From ${from}`}?
          </AlertDialogTitle>
          <AlertDialogDescription className="whitespace-pre-line">
            {description}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {reaches ? (
          <section
            ref={reachRegion}
            aria-label="What the deletion reaches"
            tabIndex={0}
            className="min-h-0 overflow-y-auto rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <MapGraphList label="Maps and Graphs" maps={reach} />
          </section>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={deleting}
            onClick={(event) => {
              // The dialog stays open until the deletion settles, which may be
              // a promise answering a refusal. Base UI's `mergeProps` skips the
              // primitive's own close handler only when the consumer sets
              // `baseUIHandlerPrevented`, which `preventBaseUIHandler` does.
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

/**
 * The dialog primitive's final focus for a return target: focused here and the
 * primitive told to leave it, and no target leaves the choice to the primitive.
 *
 * Focused here rather than handed back, for two kinds of target. An SVG element
 * — an Edge, which is drawn and focused as one — is not one the primitive
 * focuses. And a Delete that ran disables the button that held the caret, which
 * drops it on `body`; the primitive then returns focus to nothing, so an HTML
 * element handed back is left unfocused. `resource-rail-actions.test.tsx` and
 * the rail's e2e case hold the second.
 */
const returnFocusTo = (target: HTMLElement | SVGElement | null): boolean => {
  if (target === null) return true;
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
      reach={pending.reach ?? []}
      deleting={deleting}
      focusFallback={pending.focusFallback}
      onConfirm={deleteConfirmation.confirm}
      onDismiss={deleteConfirmation.cancel}
    />
  );
}
