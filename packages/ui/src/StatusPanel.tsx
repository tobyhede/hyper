import type { ReactNode } from 'react';
import { Alert, AlertDescription, AlertTitle } from './components/alert';
import { Spinner } from './components/spinner';
import { AlertIcon } from './icons';
import { cn } from './lib/utils';

function Center({
  className,
  children,
}: {
  readonly className?: string | undefined;
  readonly children: ReactNode;
}) {
  return <div className={cn('grid place-items-center p-8', className)}>{children}</div>;
}

export interface StatusFailureProps {
  readonly title: string;
  readonly description?: string;
  readonly detail: string;
  readonly detailLabel: string;
  readonly testId?: string;
  readonly className?: string;
  /** Overrides the panel's default width (`max-w-2xl`). */
  readonly panelClassName?: string;
  /**
   * Bounds the detail region to a scrolling 40vh instead of growing with the
   * page. Set this where the panel shares the screen with other chrome a long
   * detail could push out of view; leave it unset where the panel already owns
   * the whole viewport and the page can simply scroll.
   */
  readonly boundedDetail?: boolean;
}

/**
 * Common accessible framing for a startup, workspace-render or placement
 * failure: an announced Alert holding the diagnostic detail in a bounded,
 * focusable region.
 *
 * The detail is bounded and scrolls, so it needs to take focus or a
 * keyboard-only reader cannot reach a long failure. Focusable scroll regions
 * need a name — and `pre` maps to `generic`, which ARIA forbids naming, so
 * `role="region"` is the role that both accepts the name and says what the
 * tab stop leads into.
 */
export function StatusFailure({
  title,
  description,
  detail,
  detailLabel,
  testId,
  className,
  panelClassName,
  boundedDetail,
}: StatusFailureProps) {
  return (
    <Center className={className}>
      <Alert
        variant="destructive"
        className={cn('w-full max-w-2xl', panelClassName)}
        data-testid={testId}
      >
        <AlertIcon />
        <AlertTitle>{title}</AlertTitle>
        <AlertDescription>
          {description === undefined ? null : <p>{description}</p>}
          <pre
            role="region"
            tabIndex={0}
            aria-label={detailLabel}
            className={cn(
              'mt-2 font-mono text-xs whitespace-pre-wrap',
              boundedDetail === true && 'max-h-[40vh] overflow-auto',
            )}
          >
            {detail}
          </pre>
        </AlertDescription>
      </Alert>
    </Center>
  );
}

export interface StatusBusyProps {
  readonly label: string;
  readonly className?: string;
}

/**
 * Common accessible framing for an in-progress operational state.
 *
 * The outer `role="status"` is the one live region; the decorative `Spinner`
 * icon's own default `role="status"`/`aria-label="Loading"` would otherwise
 * duplicate it on a second, `aria-hidden` node, so both are cleared here.
 */
export function StatusBusy({ label, className }: StatusBusyProps) {
  return (
    <Center className={className}>
      <div role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
        <Spinner role={undefined} aria-label={undefined} aria-hidden="true" />
        <span>{label}</span>
      </div>
    </Center>
  );
}
