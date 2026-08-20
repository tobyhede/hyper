import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  cn,
  Dialog,
  DialogBackdrop,
  DialogPopup,
  DialogPortal,
  DialogTitle,
  DialogViewport,
} from '@project/ui';
import { PANE_INITIAL_FOCUS } from './pane-focus';

export interface CardPaneProps {
  readonly ariaLabel: string;
  readonly testId: string;
  readonly variant?: 'default' | 'card-editor';
  /** Cancel and Escape both discard this surface's draft (ADR 0048). */
  readonly onDismiss: () => void;
  readonly children: ReactNode;
}

/**
 * A modal surface shared by opening a Card and creating an Alias. Base UI owns
 * containment, Escape and accessible dialog semantics; App owns focus return.
 */
export function CardPane({
  ariaLabel,
  testId,
  variant = 'default',
  onDismiss,
  children,
}: CardPaneProps) {
  const popup = useRef<HTMLDivElement>(null);
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(null);
  const captureOwnerDocument = useCallback((node: HTMLSpanElement | null) => {
    setPortalContainer(node?.ownerDocument.body ?? null);
  }, []);

  // Base UI supplies the focus trap; this only selects the product's declared
  // starting field (Target for an Alias, otherwise the first field).
  useEffect(() => {
    if (portalContainer === null) return;
    const timer = window.setTimeout(() => {
      const destination =
        popup.current?.querySelector<HTMLElement>(PANE_INITIAL_FOCUS) ??
        popup.current?.querySelector<HTMLElement>('input, textarea, button');
      destination?.focus();
    });
    return () => window.clearTimeout(timer);
  }, [portalContainer]);

  return (
    <Dialog open disablePointerDismissal onOpenChange={(open) => !open && onDismiss()}>
      {/* Base UI otherwise portals through the JavaScript realm's global
          document. Ladle mounts stories into an iframe with a React portal, so
          that default escapes the story and makes its modal own the catalogue
          shell. The mount marker supplies the document this component actually
          belongs to; in the application it resolves to the ordinary body. */}
      <span ref={captureOwnerDocument} hidden />
      {portalContainer !== null && (
        <DialogPortal container={portalContainer}>
          <DialogViewport className="card-pane" data-variant={variant} data-testid={testId}>
            <DialogBackdrop className="card-pane__backdrop" />
            <DialogPopup
              ref={popup}
              className={cn(
                'card-pane__panel',
                variant === 'card-editor' && 'card-pane__panel--card-editor',
              )}
              // The primitive still owns modality; the effect above supplies the
              // declared field instead of its generic first-tabbable default.
              initialFocus={false}
              finalFocus={false}
            >
              <DialogTitle className="sr-only">{ariaLabel}</DialogTitle>
              {children}
            </DialogPopup>
          </DialogViewport>
        </DialogPortal>
      )}
    </Dialog>
  );
}
