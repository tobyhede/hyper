import { useState, type ReactNode } from 'react';
import type { Story } from '@ladle/react';
import { uuidSchema, type Card } from '@project/core';
import {
  DragCornerLayout,
  FillFrameLayout,
  FullBleedLayout,
  PanelSizeReadout,
  RailActionsLayout,
  SizePresetLayout,
  type LayoutProps,
} from './card-editor-layouts';
import { CatalogueSection } from '../support/Catalogue';
import '../support/inventory.css';

/**
 * Five candidate layouts for the opened Markdown Card's dialog, drawn so they
 * can be compared side by side and thrown away.
 *
 * Review-only, deliberately: the question they exist to settle is unresolved,
 * and `shadcn-first-ui`'s prototype boundary puts an unresolved visual
 * experiment here rather than under `stories/components`. Whichever wins is
 * reimplemented through `OpenCard` and the production workflow; none of this
 * module is imported by the application.
 *
 * They vary two things independently:
 *
 *  - **How the box gets its size.** A and C drag, D picks from three names, B
 *    and E take a proportion of the viewport and offer no control at all.
 *  - **Where the chrome goes.** A, B and D keep today's title-over-body stack
 *    with a footer; C moves Cancel and Done onto the rail and drops the footer;
 *    E drops the frame around the title too.
 *
 * The editor follows the box in all five for the same reason and with no code:
 * the flex chain from the panel down to `.markdown-source-editor` may grow and
 * shrink at every step, and CodeMirror's theme sets `height: 100%` on its own
 * root. A definite panel height is the only thing that was missing — today's
 * `max-height: min(420px, …)` on an auto-height panel never supplies one.
 */

export default { title: 'Review/Card Editor Layouts' };

const MARKDOWN_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000101');

const markdown: Extract<Card, { kind: 'markdown' }> = {
  id: MARKDOWN_ID,
  title: 'Architecture notes',
  kind: 'markdown',
  body: `## Placement

Placement is authored, not computed. A Layout owns an explicitly positioned
subset of the Space's Cards, and the Graphs authored across them.

## Strategies

No strategy is privileged. Grid, sorts, trees, clusters and ELK are choices
over one contract, and elkjs is a member of that set rather than the thing
"layout" means.

## Presentation

Opening a Card authors it in place. Presenting traverses the Active Graph, and
is the one place a Card is drawn rendered rather than as source.

## Why this dialog is being redrawn

The writing surface is the reason the pane exists, and at a 420px cap it is the
smallest thing in it. Eight lines of a document that runs to forty is a preview,
not a place to write. Every layout below is an answer to that.`,
};

/**
 * The ground each pane is shown on: the same `inv-sheet` panel the Card stories
 * use, filling the frame because a pane is modal and the sheet is what shows
 * through its backdrop.
 */
function Stage({
  title,
  note,
  children,
}: {
  readonly title: string;
  readonly note: string;
  readonly children: ReactNode;
}) {
  return (
    <div className="inv inv-sheet inv-sheet--viewport">
      <CatalogueSection title={title} note={note}>
        {children}
      </CatalogueSection>
    </div>
  );
}

/** Mounts one candidate and reports what it settled on, so a comparison is repeatable. */
function Candidate({
  title,
  note,
  variant,
  layout: Layout,
  readout = false,
}: {
  readonly title: string;
  readonly note: string;
  readonly variant: string;
  readonly layout: (props: LayoutProps) => ReactNode;
  readonly readout?: boolean;
}) {
  const [open, setOpen] = useState(true);
  const [message, setMessage] = useState('Open. Nothing completed yet.');

  return (
    <Stage title={title} note={note}>
      {readout && <PanelSizeReadout variant={variant} />}
      {open ? (
        <Layout
          card={markdown}
          onComplete={(completed) => setMessage(`Completed “${completed}”.`)}
          onCancel={() => setOpen(false)}
        />
      ) : (
        <p>{message}</p>
      )}
    </Stage>
  );
}

/**
 * A — Drag corner. `resize: both` on the panel; the drag is the browser's.
 *
 * shadcn has nothing for this. `@shadcn/resizable` is `react-resizable-panels`,
 * which splits a container into panes along one axis — it never sizes the
 * container — and Base UI's Dialog has no resize of its own. The platform does,
 * and it costs one declaration and no dependency.
 *
 * The panel is anchored rather than centred, because a centred box grows in
 * both directions at once and the corner leaves the pointer behind at half
 * speed. `left: max(1.5rem, calc(50% - 360px))` puts it where centring would
 * have and then holds it while the box grows right and down.
 */
export const DragCorner: Story = () => (
  <Candidate
    title="A — Drag corner"
    note="resize: both on the panel, anchored so the corner tracks the pointer 1:1. Drag from the bottom-right; the source editor follows with no JavaScript. Min 420x300, capped at the viewport."
    variant="drag-corner"
    layout={DragCornerLayout}
    readout
  />
);
DragCorner.meta = { iframed: true };

/**
 * B — Fill frame. No resize affordance; the dialog is a proportion of the
 * viewport it opens over.
 *
 * Here to ask whether resizing was the requirement or the symptom. If one large
 * frame is right on every screen, a drag handle is a control the author has to
 * find and use to get the size they should have been handed.
 */
export const FillFrame: Story = () => (
  <Candidate
    title="B — Fill frame"
    note="No handle and no presets: min(1040px, 100% − 4rem) by min(760px, 100% − 4rem), centred. The question it asks is whether the size was ever the author's decision to make."
    variant="fill-frame"
    layout={FillFrameLayout}
  />
);
FillFrame.meta = { iframed: true };

/**
 * C — Rail actions. Cancel and Done move onto the rail beside the close button
 * and the footer goes, giving the writing surface the ~56px the footer and its
 * 3px rule were holding, and putting every control of the pane on one band.
 *
 * Resizable as well, because the two questions are independent — this is the
 * cheapest layout gain paired with the drag from A.
 */
export const RailActions: Story = () => (
  <Candidate
    title="C — Rail actions"
    note="Every control on the Graph band: close, Cancel, Done. The footer and its rule are gone, and the source runs to the paper's bottom edge. Resizable like A."
    variant="rail-actions"
    layout={RailActionsLayout}
    readout
  />
);
RailActions.meta = { iframed: true };

/**
 * D — Size presets. Three named sizes on the rail instead of a drag.
 *
 * For it: a drag corner is pointer-only, invisible until found, and lands on
 * whatever pixel the author released at, which no test can name and no session
 * remembers. Three sizes are keyboard-reachable, nameable, and reproducible.
 * Against: the author gets the nearest of three rather than the one they wanted.
 */
export const SizePresets: Story = () => (
  <Candidate
    title="D — Size presets"
    note="Compact, Comfortable, Full on the rail, the current one inverted. Keyboard-reachable and nameable in a test, which a drag corner is not — at the cost of the size the author actually wanted."
    variant="size-preset"
    layout={SizePresetLayout}
  />
);
SizePresets.meta = { iframed: true };

/**
 * E — Full-bleed sheet. The pane fills the viewport bar a 2rem margin, the
 * title is a bare line rather than a boxed field, and the source runs from the
 * gutter to the paper's edge.
 *
 * The one candidate that stops presenting the opened Card as a card, which
 * makes it the honest test of ADR 0051's "the opened Card is that Card
 * expanded": at this size the silhouette no longer carries the resemblance and
 * only the paper, ink and rail do. If that still reads as the same object, the
 * ADR holds without the 16:9 frame; if it does not, that is the finding.
 */
export const FullBleed: Story = () => (
  <Candidate
    title="E — Full-bleed sheet"
    note="inset: 2rem, a bare underlined title instead of a labelled field, and a thin footer rule. Reads as the document being authored rather than as a card — which is the ADR 0051 question worth answering deliberately."
    variant="full-bleed"
    layout={FullBleedLayout}
  />
);
FullBleed.meta = { iframed: true };
