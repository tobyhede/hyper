import { useEffect, useRef, type ReactNode } from 'react';
import { Dialog, DialogBackdrop, DialogPopup, DialogPortal, DialogViewport } from '@project/ui';
import { PANE_INITIAL_FOCUS } from './pane-focus';

export interface CardPaneProps {
  readonly ariaLabel: string;
  readonly testId: string;
  /** Cancel and Escape both discard this surface's draft (ADR 0048). */
  readonly onDismiss: () => void;
  readonly children: ReactNode;
}

/**
 * A modal surface shared by opening a Card and creating an Alias. Base UI owns
 * containment, Escape and accessible dialog semantics; App owns focus return.
 */
export function CardPane({ ariaLabel, testId, onDismiss, children }: CardPaneProps) {
  const popup = useRef<HTMLDivElement>(null);
  const ownerDocumentBody = useRef<HTMLElement | null>(null);

  // Base UI supplies the focus trap; this only selects the product's declared
  // starting field (Target for a new Alias, otherwise the first field).
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const destination =
        popup.current?.querySelector<HTMLElement>(PANE_INITIAL_FOCUS) ??
        popup.current?.querySelector<HTMLElement>('input, textarea, button');
      destination?.focus();
    });
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <Dialog open disablePointerDismissal onOpenChange={(open) => !open && onDismiss()}>
      {/* Base UI otherwise portals to the global document. Resolve the body
          from content rendered beside the portal so an iframed Ladle story
          keeps both the dialog and its focus trap inside its own document. */}
      <span
        ref={(element) => {
          ownerDocumentBody.current = element?.ownerDocument.body ?? null;
        }}
        hidden
        aria-hidden="true"
      />
      <DialogPortal container={ownerDocumentBody}>
        <DialogViewport className="card-pane" data-testid={testId}>
          <DialogBackdrop className="card-pane__backdrop" />
          <DialogPopup
            ref={popup}
            className="card-pane__panel"
            aria-label={ariaLabel}
            // The primitive still owns modality; the effect above supplies the
            // declared field instead of its generic first-tabbable default.
            initialFocus={false}
            finalFocus={false}
          >
            {children}
          </DialogPopup>
        </DialogViewport>
      </DialogPortal>
    </Dialog>
  );
}
