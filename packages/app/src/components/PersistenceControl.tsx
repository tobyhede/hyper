import { useState } from 'react';
import type { SpaceAggregateError } from '@project/graph';
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
type Conflict = Extract<Persistence, { kind: 'conflicted' }>;

/**
 * What accepting the stored side would do here, which is not one thing.
 *
 * `reload` is the ordinary case: the repository answered with a newer Space.
 * `revert` is a participant the conflict never named — the coordinated edit did
 * not commit, so what is stored for this Space is the baseline it held before
 * the edit, and accepting it discards the edit's effect here. `none` is the
 * Space with no stored snapshot. Accepting the stored side still coordinates
 * recovery across every participant, while keeping local work re-commits this
 * Space as a create.
 */
type ConflictRecovery = 'reload' | 'revert' | 'none';

const conflictRecovery = ({ current, baseline }: Conflict): ConflictRecovery =>
  current !== undefined ? 'reload' : baseline !== undefined ? 'revert' : 'none';

const CONFLICT_DESCRIPTIONS = {
  reload:
    'A newer version of this space is available. Reload discards your local changes; keeping your local version tries to save it again.',
  revert:
    'A related space changed while this coordinated edit was saving. Reload returns this space to how it was before the edit; keeping your local version tries to save it again.',
  none: 'There is no stored version of this space. Keep your local version to restore it.',
} satisfies Record<ConflictRecovery, string>;

/**
 * What each refusal means, in the author's terms rather than the repository's.
 *
 * A refusal code is a stable domain identity (ADR 0057), which is exactly why
 * it is the wrong thing to show: `space-card-target-missing` names the fact for
 * a caller matching on it, and says nothing to the person who has just been
 * told their work would not save. The identity stays on the wire; only this
 * translation is user-facing.
 *
 * Deliberately without ids. Every one of these carries at least a Space id and
 * some carry three, and a dialog reciting UUIDs is less legible than one
 * sentence about what is wrong — the author is about to be returned to the
 * canvas where the offending Card is the one they were editing.
 */
const AGGREGATE_REFUSAL_REASONS = {
  'invalid-space-snapshot': 'A space in this edit is not valid.',
  'duplicate-space-id': 'Two spaces in this edit share one identity.',
  'duplicate-card-id': 'Two spaces in this edit claim the same card.',
  'meta-space-missing': 'The repository’s Meta Space is missing.',
  'space-card-target-missing': 'A space card points at a space that no longer exists.',
  'space-card-reference-cycle': 'A space card would make a space contain itself.',
  'ordinary-space-unreferenced': 'A space would be left with nothing pointing at it.',
  'space-card-layout-missing': 'A space card points at a Layout that no longer exists.',
  'space-card-graph-missing': 'A space card points at a graph that no longer exists.',
  'space-card-graph-outside-layout': 'A space card names a Graph that its Layout does not own.',
  // `satisfies` rather than an annotation: it still fails the moment a refusal
  // kind is added without a sentence, and it keeps each value's literal type
  // instead of widening the map to an open dictionary.
} satisfies Record<SpaceAggregateError['kind'], string>;

const rejectionDescription = ({ failure }: Rejection): string =>
  failure.kind === 'aggregate-refused'
    ? // One refusal commonly repeats across several Spaces, and the same
      // sentence three times reads as three problems rather than one.
      [...new Set(failure.errors.map((error) => AGGREGATE_REFUSAL_REASONS[error.kind]))].join(' ')
    : failure.message;

const rejectionIdentity = ({ failure }: Rejection): string =>
  failure.kind === 'aggregate-refused'
    ? JSON.stringify(failure.errors)
    : `${failure.code}:${failure.message}`;

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
        key={persistence.current?.revision.toString() ?? 'coordinated'}
        recovery={conflictRecovery(persistence)}
        onAcceptRemote={onAcceptRemote}
        onKeepLocal={onKeepLocal}
      />
    );
  }

  if (persistence.kind === 'rejected') {
    return <RejectionControl key={rejectionIdentity(persistence)} persistence={persistence} />;
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
  recovery,
  onAcceptRemote,
  onKeepLocal,
}: {
  readonly recovery: ConflictRecovery;
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
          <AlertDialogDescription>{CONFLICT_DESCRIPTIONS[recovery]}</AlertDialogDescription>
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
