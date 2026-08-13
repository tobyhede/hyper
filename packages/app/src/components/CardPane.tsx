import { useRef, type ReactNode } from 'react';
import { Dialog, DialogContent, DialogOverlay } from '@project/ui';
import { PANE_INITIAL_FOCUS } from './pane-focus';

export interface CardPaneProps {
  /**
   * What the dialog is called. A Card's own title where the pane authors one
   * Card; both names where it was reached through an occurrence.
   */
  readonly ariaLabel: string;
  /**
   * What this pane is, for a test to find it by — `open-card`, `new-alias`.
   *
   * **The pane's own name, not this component's, and the split is deliberate.**
   * The chrome is `card-pane`: the class on the element below, the block in
   * `styles.css`, the prefix on every field class inside. What that chrome is
   * holding is one of two panes, and a selector saying `card-pane` could not
   * tell them apart — which is the whole job of a test id. The same rule puts
   * `open-card-title-error` on an error span whose class is
   * `card-pane__field-error`: `OpenCard` and `NewAlias` each prefix their own
   * ids with their own name, and both are current vocabulary. An `open-card`
   * here is not a `card-pane` rename left half-finished.
   */
  readonly testId: string;
  /**
   * Leave the pane without committing — which is exactly what `Cancel` means,
   * and Escape is its alias (ADR 0048). Handed to the primitive rather than
   * bound to a key here: `Dialog` closes on Escape by itself, and this is where
   * that arrives.
   */
  readonly onDismiss: () => void;
  readonly children: ReactNode;
}

/**
 * The surface a Card is authored on, over the graph.
 *
 * A Radix Dialog (ADR 0047). The focus trap, the initial focus, the Escape
 * dismissal, `role="dialog"`, `aria-modal` and hiding the graph behind it from
 * assistive technology are all the primitive's; this component is the frame, the
 * accessible name, and the three places the app deliberately differs. It was 175
 * lines of hand-rolled containment before, declined on the grounds that React
 * Flow keeps its nodes in the tab order so `inert` is unavailable — true about
 * the platform, and irrelevant to Radix, which traps by pulling focus back and
 * never wanted `inert`.
 *
 * Shared by the opened-Card editor and the Alias creation state, which are the
 * same pane at two moments — one authoring a Card that exists, one gathering
 * what the Space needs before a Card can.
 *
 * `Content` is nested inside `Overlay`, which is Radix's own recipe for an
 * overlay that lays its content out: the panel letterboxes inside the backdrop
 * and `styles.css` centres it there, which two siblings could not do.
 */
export function CardPane({ ariaLabel, testId, onDismiss, children }: CardPaneProps) {
  const panel = useRef<HTMLDivElement>(null);

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onDismiss();
      }}
    >
      <DialogOverlay className="card-pane" data-testid={testId}>
        <DialogContent
          ref={panel}
          className="card-pane__panel"
          // Rather than a `Dialog.Title`, which would put a second copy of the
          // name on screen or a visually hidden heading in the frame. The
          // primitive accepts either: it sets `aria-labelledby` only when a
          // `Title` is mounted, and 1.1.23 dropped the warning that used to
          // insist on one.
          aria-label={ariaLabel}
          /**
           * Where focus lands on open, when the primitive's answer is the wrong
           * one. Radix focuses the first tabbable inside the content, which is
           * right for the opened-Card editor and wrong for the Alias creation
           * state — that surface opens *on* its Target picker (ADR 0009's Frame
           * 1), which the storyboard draws below the title it is more urgent
           * than. A field declares itself through `pane-focus`, and preventing
           * the default is what makes this the answer instead of a second focus
           * moved on top of the primitive's.
           */
          onOpenAutoFocus={(event) => {
            const declared = panel.current?.querySelector<HTMLElement>(PANE_INITIAL_FOCUS);
            if (declared === null || declared === undefined) return;
            event.preventDefault();
            declared.focus();
          }}
          /**
           * Where focus goes when the pane *closes* is not this component's to
           * decide, and Radix's default is the capture that was already tried
           * and is already known to be wrong here — the element focused at mount
           * is the control that opened the Card, and the app unmounts that
           * control while a Card is open (`titleEditingEnabled` goes false), so
           * by closing time it is detached and focus lands on `<body>`. `App`
           * returns focus to the Card, or to the menu the Alias pane was opened
           * from, and this is what stops the primitive fighting it.
           */
          onCloseAutoFocus={(event) => event.preventDefault()}
          /**
           * A click on the backdrop does not dismiss, which is the one place
           * this pane declines a documented default outright.
           *
           * ADR 0048 gives the pane exactly one exit that does not commit — the
           * button labelled `Cancel` — and one alias for it, Escape. Outside
           * dismissal would be a third, discarding four pending fields and a
           * Markdown draft with no undo anywhere in this app, from a gesture the
           * author never named. That is the same unlabelled second copy of
           * Cancel the ADR removed, in the destructive direction.
           *
           * `onInteractOutside` rather than `onPointerDownOutside`, because it
           * is the one hook both the pointer path and the focus path pass
           * through before `onDismiss`.
           */
          onInteractOutside={(event) => event.preventDefault()}
        >
          {children}
        </DialogContent>
      </DialogOverlay>
    </Dialog>
  );
}
