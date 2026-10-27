import * as React from 'react';
import { Dialog as DialogPrimitive } from '@base-ui/react/dialog';
import { X } from 'lucide-react';

import { Button } from '../Button';
import { cn } from '#lib/utils';

/*
 * shadcn's `base-nova` Dialog, written from the registry's shape because the
 * registry cannot be reached from where it was added. Hyper's extension is
 * `AlertDialogContent`'s: the portal follows the document the content renders
 * in, so a Ladle story's iframe keeps its dialog and focus trap.
 */

function Dialog(props: DialogPrimitive.Root.Props) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />;
}

function DialogTrigger(props: DialogPrimitive.Trigger.Props) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />;
}

function DialogPortal(props: DialogPrimitive.Portal.Props) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />;
}

function DialogClose(props: DialogPrimitive.Close.Props) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />;
}

function DialogOverlay({ className, ...props }: DialogPrimitive.Backdrop.Props) {
  return (
    <DialogPrimitive.Backdrop
      data-slot="dialog-overlay"
      className={cn(
        'data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0 fixed inset-0 isolate z-50 bg-foreground/10 duration-100 supports-backdrop-filter:backdrop-blur-xs',
        className,
      )}
      {...props}
    />
  );
}

function DialogContent({
  className,
  children,
  showCloseButton = true,
  ...props
}: DialogPrimitive.Popup.Props & { readonly showCloseButton?: boolean }) {
  const ownerDocumentBody = React.useRef<HTMLElement | null>(null);

  return (
    <>
      <span
        ref={(element) => {
          ownerDocumentBody.current = element?.ownerDocument.body ?? null;
        }}
        hidden
        aria-hidden="true"
      />
      <DialogPortal container={ownerDocumentBody}>
        <DialogOverlay />
        <DialogPrimitive.Popup
          data-slot="dialog-content"
          className={cn(
            'data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 fixed top-1/2 left-1/2 z-50 grid w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 gap-4 rounded-xl bg-popover p-4 text-sm text-popover-foreground shadow-lg ring-1 ring-foreground/10 duration-100 outline-none sm:max-w-sm',
            className,
          )}
          {...props}
        >
          {children}
          {showCloseButton && (
            <DialogPrimitive.Close
              data-slot="dialog-close"
              render={<Button variant="ghost" size="icon" className="absolute top-2 right-2" />}
            >
              <X />
              <span className="sr-only">Close</span>
            </DialogPrimitive.Close>
          )}
        </DialogPrimitive.Popup>
      </DialogPortal>
    </>
  );
}

function DialogHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div data-slot="dialog-header" className={cn('flex flex-col gap-2', className)} {...props} />
  );
}

function DialogTitle({ className, ...props }: DialogPrimitive.Title.Props) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn('text-base leading-none font-medium', className)}
      {...props}
    />
  );
}

function DialogDescription({ className, ...props }: DialogPrimitive.Description.Props) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn('text-sm text-muted-foreground', className)}
      {...props}
    />
  );
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
};
