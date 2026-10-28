import { useSyncExternalStore, type ReactNode } from 'react';
import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertIcon,
  AlertTitle,
  Button,
  CloseIcon,
  UnsavedIcon,
} from '@project/ui';
import { COMMAND_CHANNELS, type CommandOutcomes } from '../command-outcomes';
import type { OpenSpace } from '../open-spaces';

/**
 * One standing report over the canvas, and the way to put it away.
 *
 * **A report that cannot be dismissed can become an obstacle.** The slot is
 * pinned to the top end of the canvas at `z-index: 22` — above the Command
 * Dock, deliberately, because a report drawn behind the furniture it reports
 * for is not a report (`styles.css`) — and the Dock moves between twelve slots,
 * so at every top slot the two share a corner and the notice wins hit testing.
 * A notice clears itself on the next corresponding command, and the Space
 * command break clears only when the next Space switch or exit is attempted:
 * through the Space menu, on the bar underneath it. So without a dismissal the
 * reader could be left pressing a control the report about the last press is
 * sitting on.
 *
 * The dismissal is `AlertAction`, which the shared `Alert` already reserves its
 * right padding for and which `PersistenceNotice` already spends on Retry — a
 * report's own commands belong inside it. It is **acknowledgement and nothing
 * else**: dismissing changes no state the report is about, so a Map that was
 * not created is still not created and the next attempt reports again. That is
 * why the retryable persistence failure is not one of these — it is drawn
 * beside the Dock rather than here, it carries Retry, and it stands for a state
 * rather than for a press that is over.
 *
 * The caret is not sent anywhere afterwards. Nothing opened this, so there is
 * no control it was opened from to give the caret back to, and the reports
 * beside it are still readable where they stand.
 */
export function ShellNotice({
  title,
  onDismiss,
  children,
  tone = 'refusal',
}: {
  readonly title: string;
  readonly onDismiss: () => void;
  readonly children: ReactNode;
  /**
   * What the report is. A `refusal` is a press that did not do what it asked,
   * drawn destructive and announced assertively. A `fact` is what a press did
   * that the reader may not expect, such as where a mounted session keeps its
   * Edits: drawn neutral, with the glyph for that fact, and announced politely,
   * because it confirms the reader's own gesture rather than interrupting it.
   */
  readonly tone?: 'refusal' | { readonly fact: ReactNode };
}) {
  const refusal = tone === 'refusal';
  return (
    <Alert variant={refusal ? 'destructive' : 'default'} role={refusal ? 'alert' : 'status'}>
      {refusal ? <AlertIcon /> : tone.fact}
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{children}</AlertDescription>
      <AlertAction>
        {/* Named for the report it puts away, because several can stand at
            once and a row of identical `Dismiss` controls names none of them. */}
        <Button variant="ghost" size="icon" aria-label={`Dismiss: ${title}`} onClick={onDismiss}>
          <CloseIcon />
        </Button>
      </AlertAction>
    </Alert>
  );
}

/**
 * That a mounted session's Edits are kept in this page only (ADR 0131): drawn
 * once the reader has made one, because nothing can be lost before then, and
 * never in the Command Dock, which holds commands rather than facts.
 */
export function MountedEditsNotice({ onDismiss }: { readonly onDismiss: () => void }) {
  return (
    <ShellNotice
      title="Edits kept in this page only"
      onDismiss={onDismiss}
      tone={{ fact: <UnsavedIcon /> }}
    >
      Reloading or closing this page discards them. Nothing is written to GitHub.
    </ShellNotice>
  );
}

/** The standing notice on each command channel that has one, in channel order. */
export function CommandNotices({
  commandOutcomes,
  spaceTitle,
}: {
  readonly commandOutcomes: Pick<CommandOutcomes, 'getState' | 'subscribe' | 'dismiss'>;
  readonly spaceTitle?: string;
}) {
  const { notices } = useSyncExternalStore(commandOutcomes.subscribe, commandOutcomes.getState);
  return (
    <>
      {COMMAND_CHANNELS.map((channel) => {
        const notice = notices.get(channel);
        return notice === undefined ? null : (
          <ShellNotice
            key={channel}
            title={spaceTitle === undefined ? notice.title : `${spaceTitle}: ${notice.title}`}
            onDismiss={() => commandOutcomes.dismiss(channel)}
          >
            {notice.message}
          </ShellNotice>
        );
      })}
    </>
  );
}

/** Reports from a drawn Space keep that Space's live name and their own lifetime. */
export function DrawnSpaceNotices({ entry }: { readonly entry: OpenSpace }) {
  const { working } = useSyncExternalStore(entry.session.subscribe, entry.session.getState);
  return (
    <CommandNotices
      commandOutcomes={entry.app.commandOutcomes}
      spaceTitle={working.document.title}
    />
  );
}
