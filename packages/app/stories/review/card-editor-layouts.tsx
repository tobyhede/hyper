import {
  Suspense,
  useCallback,
  useEffect,
  useState,
  type CSSProperties,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import type { Card } from '@project/core';
import {
  Button,
  CardRail,
  CloseIcon,
  Dialog,
  DialogBackdrop,
  DialogPopup,
  DialogPortal,
  DialogTitle,
  DialogViewport,
  Field,
  FieldGroup,
  FieldLabel,
  Input,
  cn,
} from '@project/ui';
import { MarkdownSourceEditor } from '#src/components/markdown-source-editor-lazy';
import './card-editor-layouts.css';

/**
 * Prototype scaffolding for the opened-Card dialog's layout question — under
 * `stories/review` because the question is unresolved (`shadcn-first-ui`, the
 * prototype boundary).
 *
 * What is real here: `MarkdownSourceEditor` behind the same lazy split
 * production uses, `CardRail`, `Button`, `Input`, `Field` and the Base UI
 * Dialog parts, all from `@project/ui`, and the `--card-editor-*` palette
 * `tailwind.css` publishes. What is prototype: the composition, and only the
 * composition. Nothing here is imported by the application, and the classes are
 * `proto-`-prefixed so none of it can be mistaken for the shipped treatment in
 * `packages/app/src/components/card-editor.css`.
 *
 * The finding these exist to settle is recorded in
 * `.scratch/card-editor-dialog-layout/findings.md`: shadcn has no resizable
 * dialog. `@shadcn/resizable` is `react-resizable-panels`, a split-pane group
 * inside a container, and Base UI's Dialog has no resize of its own. The
 * platform does — `resize: both` on an element whose `overflow` is not
 * `visible` — so the drag is the browser's, not a hand-rolled pointer loop.
 */

const GRAPH_COLOR = '#7aa2ff';

/**
 * The Base UI dialog wiring, parameterised by the class its panel is drawn
 * with — which is exactly what `CardPane` does not offer, and exactly what
 * varies between these five.
 *
 * The mount marker resolving the portal container is `CardPane`'s and is here
 * for its reason: Ladle mounts a story into an iframe through a React portal,
 * so Base UI's default container escapes the story and puts the modal over the
 * catalogue shell.
 */
function PrototypePane({
  ariaLabel,
  variant,
  panelClassName,
  panelStyle,
  onDismiss,
  children,
}: {
  readonly ariaLabel: string;
  readonly variant: string;
  readonly panelClassName: string;
  readonly panelStyle?: CSSProperties;
  readonly onDismiss: () => void;
  readonly children: ReactNode;
}) {
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(null);
  const captureOwnerDocument = useCallback((node: HTMLSpanElement | null) => {
    setPortalContainer(node?.ownerDocument.body ?? null);
  }, []);

  return (
    <Dialog open disablePointerDismissal onOpenChange={(open) => !open && onDismiss()}>
      <span ref={captureOwnerDocument} hidden />
      {portalContainer !== null && (
        <DialogPortal container={portalContainer}>
          <DialogViewport className="proto-pane" data-variant={variant}>
            <DialogBackdrop className="proto-pane__backdrop" />
            <DialogPopup className={cn('proto-panel', panelClassName)} style={panelStyle}>
              <DialogTitle className="sr-only">{ariaLabel}</DialogTitle>
              {children}
            </DialogPopup>
          </DialogViewport>
        </DialogPortal>
      )}
    </Dialog>
  );
}

/** The one draft every variation authors, so the layouts differ and nothing else does. */
function useDraft(card: Extract<Card, { kind: 'markdown' }>) {
  const [title, setTitle] = useState(card.title);
  const [body, setBody] = useState(card.body);
  return { title, setTitle, body, setBody };
}

/** `Mod-Enter` commits, the way the production pane does (ADR 0048). */
const commitShortcut = (event: KeyboardEvent<HTMLFormElement>): void => {
  if (event.key !== 'Enter' || (!event.metaKey && !event.ctrlKey)) return;
  event.preventDefault();
  event.currentTarget.requestSubmit();
};

function SourceField({
  value,
  onChange,
}: {
  readonly value: string;
  readonly onChange: (next: string) => void;
}) {
  return (
    <Field className="proto-editor__body">
      <Suspense fallback={<div className="proto-editor__markdown" aria-hidden="true" />}>
        <MarkdownSourceEditor
          className="proto-editor__markdown"
          value={value}
          ariaLabel="Markdown source"
          onValueChange={onChange}
        />
      </Suspense>
    </Field>
  );
}

function TitleField({
  value,
  onChange,
  bare = false,
}: {
  readonly value: string;
  readonly onChange: (next: string) => void;
  readonly bare?: boolean;
}) {
  return (
    <Field className="proto-editor__title-field">
      {!bare && (
        <FieldLabel className="proto-editor__label" htmlFor="proto-title">
          Title
        </FieldLabel>
      )}
      <Input
        id="proto-title"
        className={cn('proto-editor__title', bare && 'proto-editor__title--bare')}
        value={value}
        aria-label={bare ? 'Title' : undefined}
        onChange={(event) => onChange(event.currentTarget.value)}
      />
    </Field>
  );
}

function Actions({
  className,
  compact = false,
  onCancel,
}: {
  readonly className: string;
  readonly compact?: boolean;
  readonly onCancel: () => void;
}) {
  return (
    <div className={className}>
      <Button
        type="button"
        variant="ghost"
        className={cn('proto-editor__cancel', compact && 'proto-editor__cancel--compact')}
        onClick={onCancel}
      >
        Cancel
      </Button>
      <Button
        type="submit"
        variant="commit"
        className={cn('proto-editor__commit', compact && 'proto-editor__commit--compact')}
      >
        Done
      </Button>
    </div>
  );
}

function CloseButton({ onCancel }: { readonly onCancel: () => void }) {
  return (
    <Button
      type="button"
      variant="secondary"
      size="icon"
      className="proto-editor__close"
      aria-label="Close Card editor"
      onClick={onCancel}
    >
      <CloseIcon />
    </Button>
  );
}

/* Built as the intersection it actually is rather than asserted into
   `CSSProperties`, which does not type custom properties — the same shape
   `CardRail` publishes `--card-rail-graph` through (ADR 0062). */
type GraphStyle = CSSProperties & { readonly '--proto-graph': string };

const graphStyle: GraphStyle = { '--proto-graph': GRAPH_COLOR };

export interface LayoutProps {
  readonly card: Extract<Card, { kind: 'markdown' }>;
  readonly onComplete: (title: string, body: string) => void;
  readonly onCancel: () => void;
}

/**
 * A — Drag corner. Today's stack, at a working default size, with the panel
 * made `resize: both`.
 *
 * The panel is anchored top-left rather than centred by the flex viewport: a
 * centred box grows equally in both directions, so the corner runs away from
 * the pointer at half speed. `left: max(1.5rem, calc(50% - 360px))` puts it
 * where centring would have, then leaves it there while the box grows right and
 * down from a fixed origin.
 *
 * The whole flex chain below already resolves a definite height —
 * `.proto-editor` -> fields -> body -> `.markdown-source-editor` at `height:
 * 100%` -> CodeMirror's own `&{height:100%}` theme rule — so the editor follows
 * the drag with no measurement, no `ResizeObserver` and no JavaScript at all.
 */
export function DragCornerLayout({ card, onComplete, onCancel }: LayoutProps) {
  const draft = useDraft(card);
  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    onComplete(draft.title, draft.body);
  };

  return (
    <PrototypePane
      ariaLabel={card.title}
      variant="drag-corner"
      panelClassName="proto-panel--drag-corner"
      onDismiss={onCancel}
    >
      <form
        className="proto-editor"
        style={graphStyle}
        onSubmit={submit}
        onKeyDown={commitShortcut}
      >
        <CardRail kind="markdown" graphColor={GRAPH_COLOR} className="proto-editor__rail">
          <CloseButton onCancel={onCancel} />
        </CardRail>
        <FieldGroup className="proto-editor__fields">
          <TitleField value={draft.title} onChange={draft.setTitle} />
          <SourceField value={draft.body} onChange={draft.setBody} />
        </FieldGroup>
        <footer className="proto-editor__footer">
          <Actions className="proto-editor__actions" onCancel={onCancel} />
        </footer>
        <span className="proto-panel__grip" aria-hidden="true" />
      </form>
    </PrototypePane>
  );
}

/**
 * B — Fill frame. No resize affordance at all; the dialog is simply sized as a
 * proportion of the viewport it opens over.
 *
 * The variation worth putting beside the resizable ones because it asks whether
 * resizing was ever the requirement: if one large frame is right on every
 * screen, a drag handle is a control the author has to use to get what they
 * should have been given.
 */
export function FillFrameLayout({ card, onComplete, onCancel }: LayoutProps) {
  const draft = useDraft(card);
  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    onComplete(draft.title, draft.body);
  };

  return (
    <PrototypePane
      ariaLabel={card.title}
      variant="fill-frame"
      panelClassName="proto-panel--fill-frame"
      onDismiss={onCancel}
    >
      <form
        className="proto-editor"
        style={graphStyle}
        onSubmit={submit}
        onKeyDown={commitShortcut}
      >
        <CardRail kind="markdown" graphColor={GRAPH_COLOR} className="proto-editor__rail">
          <CloseButton onCancel={onCancel} />
        </CardRail>
        <FieldGroup className="proto-editor__fields">
          <TitleField value={draft.title} onChange={draft.setTitle} />
          <SourceField value={draft.body} onChange={draft.setBody} />
        </FieldGroup>
        <footer className="proto-editor__footer">
          <Actions className="proto-editor__actions" onCancel={onCancel} />
        </footer>
      </form>
    </PrototypePane>
  );
}

/**
 * C — Rail actions. Cancel and Done move up into the rail beside the close
 * button and the bottom footer goes, giving the writing surface the ~56px the
 * footer and its rule were holding, and putting every control on one band.
 *
 * Resizable, like A — the two questions are independent, and this pairs the
 * cheapest layout gain with the drag.
 */
export function RailActionsLayout({ card, onComplete, onCancel }: LayoutProps) {
  const draft = useDraft(card);
  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    onComplete(draft.title, draft.body);
  };

  return (
    <PrototypePane
      ariaLabel={card.title}
      variant="rail-actions"
      panelClassName="proto-panel--rail-actions"
      onDismiss={onCancel}
    >
      <form
        className="proto-editor"
        style={graphStyle}
        onSubmit={submit}
        onKeyDown={commitShortcut}
      >
        <CardRail kind="markdown" graphColor={GRAPH_COLOR} className="proto-editor__rail">
          <div className="proto-editor__rail-actions">
            <Actions className="proto-editor__actions--compact" compact onCancel={onCancel} />
            <CloseButton onCancel={onCancel} />
          </div>
        </CardRail>
        <FieldGroup className="proto-editor__fields proto-editor__fields--flush">
          <TitleField value={draft.title} onChange={draft.setTitle} />
          <SourceField value={draft.body} onChange={draft.setBody} />
        </FieldGroup>
        <span className="proto-panel__grip" aria-hidden="true" />
      </form>
    </PrototypePane>
  );
}

const SIZES = ['compact', 'comfortable', 'full'] as const;
type Size = (typeof SIZES)[number];
const SIZE_LABEL = {
  compact: 'Compact',
  comfortable: 'Comfortable',
  full: 'Full',
} satisfies Record<Size, string>;

/**
 * D — Size presets. Three named sizes on the rail instead of a drag.
 *
 * The argument for it over A: a drag corner is pointer-only, lands on whatever
 * pixel the author let go at, and is invisible until found. Three named sizes
 * are keyboard-reachable, nameable in a test, and reproducible between
 * sessions. The argument against: the author cannot have the size they wanted,
 * only the nearest of three.
 */
export function SizePresetLayout({ card, onComplete, onCancel }: LayoutProps) {
  const draft = useDraft(card);
  const [size, setSize] = useState<Size>('comfortable');
  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    onComplete(draft.title, draft.body);
  };

  return (
    <PrototypePane
      ariaLabel={card.title}
      variant="size-preset"
      panelClassName="proto-panel--size-preset"
      onDismiss={onCancel}
    >
      <form
        className="proto-editor"
        style={graphStyle}
        data-size={size}
        onSubmit={submit}
        onKeyDown={commitShortcut}
      >
        <CardRail kind="markdown" graphColor={GRAPH_COLOR} className="proto-editor__rail">
          <div className="proto-editor__sizes" role="group" aria-label="Editor size">
            {SIZES.map((candidate) => (
              <Button
                key={candidate}
                type="button"
                variant="secondary"
                className="proto-editor__size"
                aria-pressed={size === candidate}
                onClick={() => setSize(candidate)}
              >
                {SIZE_LABEL[candidate]}
              </Button>
            ))}
            <CloseButton onCancel={onCancel} />
          </div>
        </CardRail>
        <FieldGroup className="proto-editor__fields">
          <TitleField value={draft.title} onChange={draft.setTitle} />
          <SourceField value={draft.body} onChange={draft.setBody} />
        </FieldGroup>
        <footer className="proto-editor__footer">
          <Actions className="proto-editor__actions" onCancel={onCancel} />
        </footer>
      </form>
    </PrototypePane>
  );
}

/**
 * E — Full-bleed sheet. The pane fills the viewport bar a 2rem margin, the
 * title is a bare line rather than a boxed field, and the source runs from the
 * gutter to the paper's edge.
 *
 * The one variation that stops presenting the opened Card as a card. It reads
 * as a document, which is the thing being authored — and it is the honest test
 * of ADR 0051's "the opened Card is that Card expanded", because at this size
 * the silhouette stops carrying the resemblance and only the paper does.
 */
export function FullBleedLayout({ card, onComplete, onCancel }: LayoutProps) {
  const draft = useDraft(card);
  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    onComplete(draft.title, draft.body);
  };

  return (
    <PrototypePane
      ariaLabel={card.title}
      variant="full-bleed"
      panelClassName="proto-panel--full-bleed"
      onDismiss={onCancel}
    >
      <form
        className="proto-editor"
        style={graphStyle}
        onSubmit={submit}
        onKeyDown={commitShortcut}
      >
        <CardRail kind="markdown" graphColor={GRAPH_COLOR} className="proto-editor__rail">
          <CloseButton onCancel={onCancel} />
        </CardRail>
        <FieldGroup className="proto-editor__fields proto-editor__fields--bleed">
          <TitleField value={draft.title} onChange={draft.setTitle} bare />
          <SourceField value={draft.body} onChange={draft.setBody} />
        </FieldGroup>
        <footer className="proto-editor__footer proto-editor__footer--bleed">
          <Actions className="proto-editor__actions" onCancel={onCancel} />
        </footer>
      </form>
    </PrototypePane>
  );
}

/**
 * Reports the panel's live box back to the catalogue, so a drag can be read as
 * numbers rather than eyeballed — the point being to choose a default size from
 * evidence rather than from taste.
 *
 * The document is taken from this component's own node, for `CardPane`'s
 * reason: Ladle renders a story into an iframe through a React portal, so the
 * JavaScript realm's global `document` is the *catalogue's*, not the story's,
 * and a bare `document.querySelector` here searches the wrong tree and always
 * finds nothing. `ownerDocument` is the only handle on the document this
 * component is actually in — the same handle `PrototypePane` portals with.
 *
 * A frame poll rather than a `ResizeObserver`, because the pane portals on a
 * later commit than this one and the panel is reliably absent when an observer
 * would want to attach. Reading the rect each frame and setting state only when
 * it changes is simpler and immune to the ordering. Prototype instrumentation;
 * nothing here ships.
 */
export function PanelSizeReadout({ variant }: { readonly variant: string }) {
  const [box, setBox] = useState<{ width: number; height: number } | null>(null);
  const [ownerDocument, setOwnerDocument] = useState<Document | null>(null);
  const captureOwnerDocument = useCallback((node: HTMLParagraphElement | null) => {
    setOwnerDocument(node?.ownerDocument ?? null);
  }, []);

  useEffect(() => {
    if (ownerDocument === null) return;
    let frame = 0;
    const read = (): void => {
      frame = requestAnimationFrame(read);
      const panel = ownerDocument.querySelector<HTMLElement>(
        `.proto-pane[data-variant='${variant}'] .proto-panel`,
      );
      if (panel === null) return;
      const { width, height } = panel.getBoundingClientRect();
      const next = { width: Math.round(width), height: Math.round(height) };
      setBox((current) =>
        current !== null && current.width === next.width && current.height === next.height
          ? current
          : next,
      );
    };
    read();
    return () => cancelAnimationFrame(frame);
  }, [ownerDocument, variant]);

  return (
    <p ref={captureOwnerDocument} className="proto-readout inv-mono">
      {box === null ? 'panel not mounted' : `panel ${box.width} x ${box.height}`}
    </p>
  );
}
