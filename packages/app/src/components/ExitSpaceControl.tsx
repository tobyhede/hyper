import { useState } from 'react';
import type { UUID } from '@project/core';
import {
  Alert,
  AlertDescription,
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
  Button,
} from '@project/ui';
import { useOpenSpaces } from '../open-spaces-context';

/** Exit belongs to the Space whose Sidebar carries persistence recovery. */
export function ExitSpaceControl({ spaceId }: { readonly spaceId: UUID }) {
  const spaces = useOpenSpaces();
  const [failure, setFailure] = useState<string | null>(null);
  const [warning, setWarning] = useState(false);
  const [closing, setClosing] = useState(false);
  const exit = async (confirmed = false) => {
    if (spaces === null) return;
    setClosing(true);
    try {
      const result = await spaces.close(
        spaceId,
        confirmed ? { warning: 'persistence-rejected' } : undefined,
      );
      if (result.kind === 'warning') setWarning(true);
      if (result.kind === 'refused') {
        setFailure(
          result.refusal.code === 'meta-space-permanent'
            ? 'Meta cannot be closed.'
            : result.refusal.recovery === 'retry'
              ? 'Retry saving this Space before exiting.'
              : 'Resolve this Space’s save conflict before exiting.',
        );
      }
    } catch (error) {
      setFailure(error instanceof Error ? error.message : String(error));
    } finally {
      setClosing(false);
    }
  };
  if (spaces === null || spaces.metaSpaceId === spaceId) return null;
  return (
    <>
      <Button
        variant="ghost"
        disabled={closing}
        onClick={() => {
          void exit();
        }}
      >
        Exit Space
      </Button>
      {failure === null ? null : (
        <Alert variant="destructive">
          <AlertDescription>{failure}</AlertDescription>
        </Alert>
      )}
      <AlertDialog open={warning} onOpenChange={setWarning}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Exit without saving?</AlertDialogTitle>
            <AlertDialogDescription>
              This Space’s latest changes were rejected and have not been saved.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep open</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                void exit(true);
              }}
            >
              Exit Space
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
