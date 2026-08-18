import { useState } from 'react';
import type { SpaceSessionState } from '@project/persistence';
import {
  Alert,
  AlertDescription,
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
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

type Persistence = SpaceSessionState['persistence'];
type Rejection = Extract<Persistence, { kind: 'rejected' }>;

/** Production persistence feedback and recovery at the application boundary. */
export function PersistenceControl({
  persistence,
  onRetry,
  onAcceptRemote,
  onKeepLocal,
}: PersistenceControlProps) {
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

function ConflictControl({
  onAcceptRemote,
  onKeepLocal,
}: {
  readonly onAcceptRemote: () => string | null;
  readonly onKeepLocal: () => void;
}) {
  const [open, setOpen] = useState(true);
  const [remoteRefusal, setRemoteRefusal] = useState<string | null>(null);

  if (!open) {
    return (
      <Button variant="secondary" size="toolbar" onClick={() => setOpen(true)}>
        Resolve conflict
      </Button>
    );
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
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
          <AlertDialogCancel>Back</AlertDialogCancel>
          <Button
            variant="secondary"
            data-testid="persistence-accept-remote"
            onClick={() => setRemoteRefusal(onAcceptRemote())}
          >
            Reload
          </Button>
          <Button variant="default" data-testid="persistence-keep-local" onClick={onKeepLocal}>
            Save
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
