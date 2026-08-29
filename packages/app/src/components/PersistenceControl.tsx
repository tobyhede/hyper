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

export interface PersistenceControlProps {
  readonly persistence: SpaceSessionState['persistence'];
  readonly onAcceptRemote: () => string | null;
  readonly onKeepLocal: () => void;
}

type Persistence = SpaceSessionState['persistence'];
type Rejection = Extract<Persistence, { kind: 'rejected' }>;

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
  persistence,
  onAcceptRemote,
  onKeepLocal,
}: PersistenceControlProps) {
  if (persistence.kind === 'conflicted') {
    return (
      <ConflictControl
        key={persistence.current.revision.toString()}
        onAcceptRemote={onAcceptRemote}
        onKeepLocal={onKeepLocal}
      />
    );
  }

  if (persistence.kind === 'rejected') {
    const rejectionKey = `${persistence.failure.code}:${persistence.failure.message}`;
    return <RejectionControl key={rejectionKey} persistence={persistence} />;
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
      <AlertDescription>{persistence.failure.message}</AlertDescription>
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

function ConflictControl({
  onAcceptRemote,
  onKeepLocal,
}: {
  readonly onAcceptRemote: () => string | null;
  readonly onKeepLocal: () => void;
}) {
  const [remoteRefusal, setRemoteRefusal] = useState<string | null>(null);

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
          <AlertDialogDescription>
            A newer version of this space is available. Reload discards your local changes; keeping
            your local version tries to save it again.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {remoteRefusal === null ? null : (
          <Alert variant="destructive" data-testid="persistence-remote-refused">
            <AlertTitle>Unable to reload</AlertTitle>
            <AlertDescription>{remoteRefusal}</AlertDescription>
          </Alert>
        )}
        <AlertDialogFooter>
          <Button
            variant="secondary"
            data-testid="persistence-accept-remote"
            onClick={() => setRemoteRefusal(onAcceptRemote())}
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

function RejectionControl({ persistence }: { readonly persistence: Rejection }) {
  const [open, setOpen] = useState(true);

  if (!open) return <PersistenceIndicator state="rejected" />;

  return (
    <AlertDialog open onOpenChange={setOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Changes couldn’t be saved</AlertDialogTitle>
          <AlertDialogDescription>
            The server rejected these changes. Continue editing to correct the problem.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <Alert variant="destructive">
          <AlertTitle>Reason</AlertTitle>
          <AlertDescription>{persistence.failure.message}</AlertDescription>
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
