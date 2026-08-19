import { Dialog as DialogPrimitive } from '@base-ui/react/dialog';

/**
 * The shared Base UI dialog vocabulary. Consumers compose the parts they need;
 * presentation remains with the owning feature.
 */
export const Dialog = DialogPrimitive.Root;
export const DialogBackdrop = DialogPrimitive.Backdrop;
export const DialogPopup = DialogPrimitive.Popup;
export const DialogPortal = DialogPrimitive.Portal;
export const DialogTitle = DialogPrimitive.Title;
export const DialogViewport = DialogPrimitive.Viewport;
