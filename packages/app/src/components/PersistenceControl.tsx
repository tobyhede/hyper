import { useState } from 'react';
import type { SpaceSessionState } from '@project/persistence';
import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertIcon,
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertTitle,
  Button,
  PersistenceIndicator,
} from '@project/ui';
import {
  describeAggregateRefusal,
  describeConflictRecovery,
  describePersistenceFailure,
  describeStoredSpaceRefusal,
  type ConflictRecovery,
} from '../authoring-refusal';
import type { StoredSpaceRefusal } from '../space-authoring';

export interface PersistenceControlProps {
  readonly active?: boolean;
  readonly persistence: SpaceSessionState['persistence'];
  readonly onAcceptRemote: () => StoredSpaceRefusal | null;
  readonly onKeepLocal: () => void;
}

type Persistence = SpaceSessionState['persistence'];
type Rejection = Extract<Persistence, { kind: 'rejected' }>;
type Conflict = Extract<Persistence, { kind: 'conflicted' }>;

const conflictRecovery = ({ current, baseline }: Conflict): ConflictRecovery =>
  current !== undefined ? 'reload' : baseline !== undefined ? 'revert' : 'none';

const rejectionDescription = ({ failure }: Rejection): string =>
  failure.kind === 'aggregate-refused'
    ? describeAggregateRefusal(failure.errors)
    : describePersistenceFailure(failure);

/**
 * Production persistence feedback and recovery at the application boundary.
 *
 * A retryable failure is deliberately absent here: it reports as a red dot
 * through the indicator and explains itself in `PersistenceNotice`, which the
 * shell pins under the toolbar. Swapping the indicator for a Retry button — as
 * this did — moved every control beside it and left the reason in a `title`
 * attribute that touch never shows.
 */
export function PersistenceControl({
  active = true,
  persistence,
  onAcceptRemote,
  onKeepLocal,
}: PersistenceControlProps) {
  const rejection = persistence.kind === 'rejected' ? persistence : null;
  /*
   * The acknowledgement lives here rather than in `RejectionControl` because
   * `active` is what Open Spaces moves, and a dismissal is spent by the
   * next failure rather than by looking away. Every managed Space stays mounted
   * (`OpenSpacesApplication.tsx`), so this component survives the switch that
   * unmounts everything it returns.
   */
  const [acknowledged, setAcknowledged] = useState<Rejection['failure'] | null>(null);
  // Derived from a prop during render rather than in an effect, the way
  // `PersistenceIndicator`'s own cue is: the dialog is right on the first
  // render of a new failure instead of flashing dismissed and correcting.
  if (acknowledged !== null && acknowledged !== rejection?.failure) setAcknowledged(null);

  if (!active) return null;
  if (persistence.kind === 'conflicted') {
    return (
      <ConflictControl
        conflict={persistence}
        onAcceptRemote={onAcceptRemote}
        onKeepLocal={onKeepLocal}
      />
    );
  }

  if (rejection !== null) {
    if (acknowledged !== null) return <PersistenceIndicator state="rejected" />;
    return (
      <RejectionControl
        persistence={rejection}
        onAcknowledge={() => {
          setAcknowledged(rejection.failure);
        }}
      />
    );
  }

  return <PersistenceIndicator state={persistence.kind} />;
}

export interface PersistenceNoticeProps {
  readonly persistence: SpaceSessionState['persistence'];
  readonly onRetry: () => void;
}

/**
 * The standing explanation behind the toolbar's red dot, for the one
 * persistence state that is neither fine nor final.
 *
 * It is not a dialog on purpose. A retryable failure leaves the local work
 * intact and the canvas fully usable — the author can keep editing, and the
 * next commit may succeed on its own — so blocking the canvas would overstate
 * it. Contrast the two dialogs above: a conflict has no safe dismissal and a
 * rejection needs acknowledging.
 *
 * `role="alert"` is the shared `Alert`'s, so the reason is announced when it
 * arrives rather than sitting in a `title` attribute nothing reads aloud.
 */
export function PersistenceNotice({ persistence, onRetry }: PersistenceNoticeProps) {
  if (persistence.kind !== 'failed') return null;

  return (
    <Alert variant="destructive" data-testid="persistence-failure">
      <AlertIcon />
      <AlertTitle>Changes not saved</AlertTitle>
      <AlertDescription>{describePersistenceFailure(persistence.failure)}</AlertDescription>
      <AlertAction>
        <Button
          variant="secondary"
          size="compact"
          data-testid="persistence-retry"
          onClick={onRetry}
        >
          Retry
        </Button>
      </AlertAction>
    </Alert>
  );
}

/**
 * A refusal belongs to the conflict that raised it.
 *
 * The conflict object the session published is what separates two, for the same
 * reason it separates two rejections above: a coordinated conflict carries no
 * stored revision to key on, so two of them are equal by value, and the
 * coordinated path installs its states without notifying (`session.ts`) — the
 * render that would otherwise unmount this control between them is not
 * guaranteed to happen. Keyed on a revision, both were `'coordinated'` and the
 * first refusal stayed on screen over the second conflict.
 */
function ConflictControl({
  conflict,
  onAcceptRemote,
  onKeepLocal,
}: {
  readonly conflict: Conflict;
  readonly onAcceptRemote: () => StoredSpaceRefusal | null;
  readonly onKeepLocal: () => void;
}) {
  const recovery = conflictRecovery(conflict);
  const [refused, setRefused] = useState<{
    readonly conflict: Conflict;
    readonly refusal: StoredSpaceRefusal;
  } | null>(null);

  if (refused !== null && refused.conflict !== conflict) setRefused(null);
  const remoteRefusal = refused !== null && refused.conflict === conflict ? refused.refusal : null;

  return (
    // A conflict has no safe dismissal: the revision conflict doesn't resolve
    // itself, so every close reason (Escape included — AlertDialog's
    // `disablePointerDismissal` only blocks outside-press) is ignored until
    // Reload or Keep local and retry is chosen. Contrast RejectionControl below, which honors
    // onOpenChange because rejection returns to an unchanged, safe Space.
    <AlertDialog open onOpenChange={() => undefined}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Changes conflict</AlertDialogTitle>
          <AlertDialogDescription>{describeConflictRecovery(recovery)}</AlertDialogDescription>
        </AlertDialogHeader>
        {remoteRefusal === null ? null : (
          <Alert variant="destructive" data-testid="persistence-remote-refused">
            <AlertTitle>Unable to reload</AlertTitle>
            <AlertDescription>{describeStoredSpaceRefusal(remoteRefusal)}</AlertDescription>
          </Alert>
        )}
        <AlertDialogFooter>
          <Button
            variant="secondary"
            data-testid="persistence-accept-remote"
            onClick={() => {
              const refusal = onAcceptRemote();
              setRefused(refusal === null ? null : { conflict, refusal });
            }}
          >
            Reload
          </Button>
          <Button variant="default" data-testid="persistence-keep-local" onClick={onKeepLocal}>
            Keep local and retry
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/**
 * Two rejections of one code are two rejections.
 *
 * Dismissing this dialog acknowledges the failure in front of the author, not
 * every failure after it, so the next one draws again. What separates two is
 * that they are different publications rather than anything they say: the
 * transport's `message` is unread now (ADR 0057), so two `invalid-commit`
 * rejections are equal by value and a key derived from the failure cannot tell
 * them apart. The acknowledgement therefore records *which failure* was
 * dismissed and is spent the moment the session hands over another.
 *
 * That makes a fresh failure per publication load-bearing rather than
 * incidental, so it is pinned where it is produced rather than assumed here:
 * `http-backend.test.ts`'s 'mints a distinct failure for each rejected commit'.
 * A sequence number would have to be minted by the session and carried on
 * `SpaceSessionState`, which is a persistence contract widened to hold one
 * component's bookkeeping.
 *
 * This is not a remount, deliberately. The control used to rely on being
 * unmounted between rejections by the `pending` state in between, and the
 * coordinated path does not guarantee one: `prepareCoordinatedCommit` installs
 * `pending` without notifying (`session.ts`), so the render that resets local
 * state may never happen.
 *
 * The acknowledgement itself is `PersistenceControl`'s, one level up, because
 * that is the component Open Spaces leaves mounted — see the note
 * beside it.
 */
function RejectionControl({
  persistence,
  onAcknowledge,
}: {
  readonly persistence: Rejection;
  readonly onAcknowledge: () => void;
}) {
  return (
    <AlertDialog
      open
      onOpenChange={(next: boolean) => {
        if (!next) onAcknowledge();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Changes couldn’t be saved</AlertDialogTitle>
          <AlertDialogDescription>
            The server rejected these changes. Continue editing to correct the problem.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <Alert variant="destructive">
          <AlertTitle>Reason</AlertTitle>
          <AlertDescription>{rejectionDescription(persistence)}</AlertDescription>
        </Alert>
        <AlertDialogFooter>
          <AlertDialogAction data-testid="persistence-rejection-continue">
            Continue editing
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
