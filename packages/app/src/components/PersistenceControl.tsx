import { useState } from 'react';
import type { UUID } from '@project/core';
import { canRetry, type RetryablePersistence, type SpaceSessionState } from '@project/persistence';
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
  describeSaveBlock,
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
/**
 * A permanent rejection and an aggregate refusal draw the same dialog.
 *
 * They are distinct `SpaceSessionState['persistence']` kinds (`v1-release/17`
 * criterion 2) with distinct recoveries in the session — an aggregate refusal
 * never offers Retry, and neither offers it here either — but nothing on this
 * surface needs to tell them apart: both are "the server declined this,
 * continue editing to correct it," and `rejectionDescription` below is what
 * already carries the one difference an author reads, the sentence.
 */
type Rejection = Extract<Persistence, { kind: 'rejected' } | { kind: 'refused' }>;
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
  const rejection: Rejection | null =
    persistence.kind === 'rejected' || persistence.kind === 'refused' ? persistence : null;
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

  if (persistence.kind === 'rejected' || persistence.kind === 'refused') {
    // A blocked recovery is explained and retried by `PersistenceNotice`, which
    // leaves the canvas free to reach the Space that blocks it.
    if (acknowledged !== null || canRetry(persistence)) {
      return <PersistenceIndicator state="rejected" />;
    }
    return (
      <RejectionControl
        persistence={persistence}
        onAcknowledge={() => {
          setAcknowledged(persistence.failure);
        }}
      />
    );
  }

  return <PersistenceIndicator state={persistence.kind} />;
}

export interface PersistenceNoticeProps {
  readonly persistence: SpaceSessionState['persistence'];
  readonly onRetry: () => void;
  /** Go to the Space whose recovery blocks this save, when there is a way to. */
  readonly onOpenSpace?: ((spaceId: UUID, title: string) => void) | null;
}

/**
 * The standing explanation behind the toolbar's red dot, for every persistence
 * state that is neither fine nor final: the ones `canRetry` admits.
 *
 * It is not a dialog on purpose. A retryable failure or a blocked recovery
 * leaves the local work intact and the canvas fully usable — the author can
 * keep editing, go to the Space that blocks the save, and come back to Retry —
 * so blocking the canvas would overstate it. Contrast the two dialogs above: a
 * conflict has no safe dismissal and a rejection needs acknowledging.
 *
 * The reason is the latest attempt's: a blocked recovery says what blocked it
 * rather than the failure it was recovering from.
 *
 * `role="alert"` is the shared `Alert`'s, so the reason is announced when it
 * arrives rather than sitting in a `title` attribute nothing reads aloud.
 */
export function PersistenceNotice({ persistence, onRetry, onOpenSpace }: PersistenceNoticeProps) {
  if (!canRetry(persistence)) return null;
  const { blocked } = persistence;
  const blocking = blocked?.code === 'persistence-recovery-required' ? blocked : null;

  return (
    <Alert variant="destructive" data-testid="persistence-failure">
      <AlertIcon />
      <AlertTitle>Changes not saved</AlertTitle>
      <AlertDescription>{noticeReason(persistence)}</AlertDescription>
      {blocking === null || onOpenSpace === undefined || onOpenSpace === null ? null : (
        <div className="mt-1.5 group-has-[>svg]/alert:col-start-2">
          <Button
            variant="secondary"
            size="compact"
            data-testid="persistence-open-blocking-space"
            onClick={() => {
              onOpenSpace(blocking.spaceId, blocking.title);
            }}
          >
            Open {blocking.title}
          </Button>
        </div>
      )}
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

/** The latest attempt's reason: what blocked a recovery, else the failure itself. */
const noticeReason = (persistence: RetryablePersistence): string => {
  if (persistence.kind !== 'failed') return describeSaveBlock(persistence.blocked);
  return persistence.blocked === undefined
    ? describePersistenceFailure(persistence.failure)
    : describeSaveBlock(persistence.blocked);
};

/** A refused recovery, and the conflict it was refused under. */
interface RefusedRecovery {
  readonly conflict: Conflict;
  readonly refusal: StoredSpaceRefusal;
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
  const [refused, setRefused] = useState<RefusedRecovery | null>(null);

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
        {conflict.blocked === undefined ? null : (
          <Alert variant="destructive" data-testid="persistence-keep-local-blocked">
            <AlertTitle>Unable to keep local</AlertTitle>
            <AlertDescription>{describeSaveBlock(conflict.blocked)}</AlertDescription>
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
 * that they are different publications rather than anything they say: a
 * failure carries its code and no prose (ADR 0057), so two `invalid-commit`
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
