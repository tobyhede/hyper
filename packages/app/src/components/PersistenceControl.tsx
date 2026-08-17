import { useState } from 'react';
import type { SpaceSessionState } from '@project/persistence';
import {
  Alert,
  AlertDescription,
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
  readonly onRetry: () => void;
  readonly onAcceptRemote: () => string | null;
  readonly onKeepLocal: () => void;
}

/** Production persistence feedback and recovery at the application boundary. */
export function PersistenceControl({
  persistence,
  onRetry,
  onAcceptRemote,
  onKeepLocal,
}: PersistenceControlProps) {
  const episode =
    persistence.kind === 'conflicted'
      ? `conflicted:${persistence.current.revision.toString()}`
      : persistence.kind === 'rejected'
        ? `rejected:${persistence.failure.code}:${persistence.failure.message}`
        : persistence.kind;

  return (
    <PersistenceEpisode
      key={episode}
      persistence={persistence}
      onRetry={onRetry}
      onAcceptRemote={onAcceptRemote}
      onKeepLocal={onKeepLocal}
    />
  );
}

function PersistenceEpisode({
  persistence,
  onRetry,
  onAcceptRemote,
  onKeepLocal,
}: PersistenceControlProps) {
  // A refusal explains one remote snapshot. Key it by revision so a later
  // conflict never inherits a stale explanation from an earlier remote.
  const [refusal, setRefusal] = useState<{ revision: bigint; message: string } | null>(null);
  // A permanent rejection remains session state after its explanation is
  // acknowledged. Remember only which failure the author dismissed.
  const [dismissedRejection, setDismissedRejection] = useState<string | null>(null);
  const conflictRevision = persistence.kind === 'conflicted' ? persistence.current.revision : null;
  const remoteRefusal =
    refusal !== null && refusal.revision === conflictRevision ? refusal.message : null;
  const rejection = persistence.kind === 'rejected' ? persistence.failure : null;
  const rejectionKey = rejection === null ? null : `${rejection.code}:${rejection.message}`;
  const rejectionOpen = rejectionKey !== null && dismissedRejection !== rejectionKey;

  if (persistence.kind === 'failed') {
    return (
      <Button
        variant="default"
        size="toolbar"
        data-testid="persistence-retry"
        onClick={onRetry}
        title={persistence.failure.message}
      >
        Retry persistence
      </Button>
    );
  }

  if (persistence.kind === 'conflicted') {
    return (
      <AlertDialog open onOpenChange={() => undefined}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Changes conflict</AlertDialogTitle>
            <AlertDialogDescription>
              A newer version of this space is available. Reload discards your local changes; Save
              keeps them and tries again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {remoteRefusal === null ? null : (
            <Alert variant="destructive" data-testid="persistence-remote-refused">
              <AlertTitle>Unable to reload</AlertTitle>
              <AlertDescription>{remoteRefusal}</AlertDescription>
            </Alert>
          )}
          <AlertDialogFooter>
            <AlertDialogAction
              variant="secondary"
              data-testid="persistence-accept-remote"
              onClick={() => {
                const message = onAcceptRemote();
                setRefusal(
                  message === null || conflictRevision === null
                    ? null
                    : { revision: conflictRevision, message },
                );
              }}
            >
              Reload
            </AlertDialogAction>
            <AlertDialogAction data-testid="persistence-keep-local" onClick={onKeepLocal}>
              Save
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );
  }

  if (persistence.kind === 'rejected' && rejectionOpen) {
    return (
      <AlertDialog
        open
        onOpenChange={(open) => {
          if (!open) setDismissedRejection(rejectionKey);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Changes couldn’t be saved</AlertDialogTitle>
            <AlertDialogDescription>
              The server rejected these changes. Continue editing to correct the problem.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {rejection === null ? null : (
            <Alert variant="destructive">
              <AlertTitle>Reason</AlertTitle>
              <AlertDescription>{rejection.message}</AlertDescription>
            </Alert>
          )}
          <AlertDialogFooter>
            <AlertDialogAction
              data-testid="persistence-rejection-continue"
              onClick={() => setDismissedRejection(rejectionKey)}
            >
              Continue editing
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );
  }

  return <PersistenceIndicator state={persistence.kind} />;
}
