import type { ReactNode } from 'react';
import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertIcon,
  AlertTitle,
  Button,
  CloseIcon,
} from '@project/ui';

/**
 * One standing report over the canvas, and the way to put it away.
 *
 * **A report that cannot be dismissed can become an obstacle.** The slot is
 * pinned to the top end of the canvas at `z-index: 22` — above the Command
 * Dock, deliberately, because a report drawn behind the furniture it reports
 * for is not a report (`styles.css`) — and the Dock moves between twelve slots,
 * so at every top slot the two share a corner and the notice wins hit testing.
 * Four of these clear themselves on the next corresponding command and one,
 * the Space command break, clears only when the next Space switch or exit is
 * attempted: through the Space menu, on the bar underneath it. So the reader
 * could be left pressing a control the report about the last press is sitting
 * on.
 *
 * The dismissal is `AlertAction`, which the shared `Alert` already reserves its
 * right padding for and which `PersistenceNotice` already spends on Retry — a
 * report's own commands belong inside it. It is **acknowledgement and nothing
 * else**: dismissing changes no state the report is about, so a Diagram that was
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
}: {
  readonly title: string;
  readonly onDismiss: () => void;
  readonly children: ReactNode;
}) {
  return (
    <Alert variant="destructive">
      <AlertIcon />
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
