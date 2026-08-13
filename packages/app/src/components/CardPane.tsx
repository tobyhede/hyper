import {
  useCallback,
  useEffect,
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from 'react';
import { PANE_INITIAL_FOCUS } from './pane-focus';

/**
 * Exactly the three element kinds a pane contains, all of them always enabled
 * and always tabbable. Links, explicit `tabindex` and a `disabled` filter would
 * each guard a state no editor here can reach; add them back alongside whatever
 * introduces one.
 *
 * One selector, because the two things it answers have to agree: what `Tab`
 * cycles through, and what a mousedown is allowed to move focus onto. A control
 * missing from one list and present in the other is either unreachable by
 * keyboard or a way out of the pane by pointer.
 *
 * A Command list's items are deliberately absent, and that is not an omission:
 * cmdk keeps the caret in its input and moves an active item with the arrow
 * keys, so the items are not tab stops and the input is the one that is.
 */
const PANE_FOCUSABLE = 'input, textarea, button';

/**
 * Everything inside the pane a `Tab` can land on, in document order.
 *
 * Queried on each `Tab` rather than cached: an editor grows and loses field
 * errors as an author types, and a cached list would send focus to a node that
 * has since been unmounted.
 */
const focusableWithin = (root: HTMLElement): readonly HTMLElement[] => [
  ...root.querySelectorAll<HTMLElement>(PANE_FOCUSABLE),
];

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
  readonly children: ReactNode;
}

/**
 * The surface a Card is authored on, over the graph — the frame, and the focus
 * containment that makes it a surface rather than an overlay.
 *
 * A modal dialog, because it covers the graph and the graph stays focusable:
 * React Flow measures its nodes and keeps them in the tab order, so `inert` is
 * not available and the containment is this component's own.
 *
 * Shared by the opened-Card editor and the Alias creation state, which are the
 * same pane at two moments — one authoring a Card that exists, one gathering
 * what the Space needs before a Card can. Everything below is about keeping
 * focus inside a covering surface and says nothing about either.
 */
export function CardPane({ ariaLabel, testId, children }: CardPaneProps) {
  const panel = useRef<HTMLDivElement>(null);

  /**
   * The pane takes focus while it is open. Where focus goes when it *closes* is
   * not this component's to decide — see `App`, which returns it to the Card or
   * to the control that opened the pane.
   *
   * Restoring from here was tried and is wrong twice over. The obvious capture,
   * `document.activeElement` on mount, is the control that opened the Card — and
   * the app unmounts that control while a Card is open, since `titleEditingEnabled`
   * goes false and the affordance goes with it, so by closing time the captured
   * element is detached and focus lands on `<body>`. Worse, a cleanup that only
   * restores is not idempotent, which `StrictMode` requires rather than prefers:
   * React double-invokes effects as mount → cleanup → mount, so the restore ran
   * *immediately* after opening, moved focus to a control about to be removed,
   * and left the pane with no focus at all — `containTab` never fired, because it
   * is bound to the panel.
   *
   * Focus is taken here rather than by `autoFocus` on the field for that same
   * reason: `autoFocus` fires once, on the real mount, so it cannot answer a
   * simulated cleanup that follows it. Taking focus in the setup half can.
   */
  useEffect(() => {
    const pane = panel.current;
    if (pane === null) return;
    const declared = pane.querySelector<HTMLElement>(PANE_INITIAL_FOCUS);
    (declared ?? focusableWithin(pane)[0])?.focus();
  }, []);

  /**
   * Keep `Tab` inside the pane.
   *
   * The graph behind is not `inert` — React Flow needs its nodes measurable, and
   * a node keeps `tabIndex=0` outside presenting — so without this, `Tab` steps
   * out of the editor onto Cards that answer `Enter` by opening themselves.
   * Wrapping at both ends is the whole of it; the pane's controls are few and
   * always present.
   */
  const containTab = useCallback((event: ReactKeyboardEvent<HTMLDivElement>): void => {
    if (event.key !== 'Tab' || panel.current === null) return;
    const focusable = focusableWithin(panel.current);
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (first === undefined || last === undefined) return;
    // The handler sits on the panel, so the active element is always inside it.
    const active = document.activeElement;
    if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }, []);

  /**
   * Keep the pointer from putting focus where `containTab` cannot see it.
   *
   * `containTab` is bound to the panel, so it only ever answers a `Tab` pressed
   * while focus is already inside — and a mousedown on anything unfocusable
   * moves focus to `<body>`, where it never fires at all. `Tab` then starts again at the
   * top of the document, into the toolbar and on to the Card nodes the pane
   * covers, which is the escape the containment exists to close. Two surfaces
   * reach it: the backdrop, always visible because the panel letterboxes inside
   * it, and the panel's own padding and gaps.
   *
   * Preventing the default leaves focus where it already was, which is the one
   * answer that needs no opinion about where it should go instead. It is
   * prevented only where the default would take focus *out* of the pane: a
   * mousedown on a control keeps its default, or clicking a field would not put
   * the caret in it. A label's text is not a control and is prevented, and the
   * field still focuses — a label focuses what it names on `click`, which this
   * does not cancel. The cost is that the pane's static text no longer
   * drag-selects; it is two spans of banner and three field labels.
   *
   * A Command item is not in `PANE_FOCUSABLE` and is deliberately exempt: cmdk
   * selects an item on `pointerdown`-then-click while focus stays in the input,
   * so preventing the default here changes nothing about where focus is.
   */
  const containFocus = useCallback((event: ReactMouseEvent<HTMLDivElement>): void => {
    const target = event.target;
    if (target instanceof Element && target.closest(PANE_FOCUSABLE) !== null) return;
    event.preventDefault();
  }, []);

  return (
    <div className="card-pane" data-testid={testId} onMouseDown={containFocus}>
      <div
        ref={panel}
        className="card-pane__panel"
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        onKeyDown={containTab}
      >
        {children}
      </div>
    </div>
  );
}
