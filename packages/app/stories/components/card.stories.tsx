import { useState } from 'react';
import type { Story } from '@ladle/react';
import { CanvasCard, type CanvasCardFront, type CanvasCardState } from '@project/ui';
import { cardSizeVars, snapCardSizeToClose } from '#src/card';
import { CanvasCardSpecimen } from '../support/CanvasCardSpecimen';
import { CatalogueSection, Specimen } from '../support/Catalogue';
import { CanvasCardNodeSpecimen } from '../support/ReactFlowCanvas';
import { cardIds, GRAPH_PALETTE } from '../support/fixture';
import '../support/inventory.css';

export default { title: 'Components/Card' };

export const States: Story = () => (
  <div className="inv inv-sheet" style={cardSizeVars}>
    <CatalogueSection
      title="Card states"
      note="The shared CanvasCard presentation contract, drawn statically for rest, selected and dragging. Hover and keyboard reveal are proven live in Hover actions, and title editing in Title editing."
    >
      <div className="inv-row">
        <Specimen label="card · rest">
          <CanvasCardSpecimen title="Strategies" />
        </Specimen>
        <Specimen label="card · selected">
          <CanvasCardSpecimen title="Strategies" state="selected" />
        </Specimen>
        <Specimen label="card · dragging">
          <CanvasCardSpecimen title="Strategies" state="dragging" />
        </Specimen>
        <Specimen label="alias · rest">
          <CanvasCardSpecimen title="Opening, again" kind="alias" />
        </Specimen>
        <Specimen label="alias · selected">
          <CanvasCardSpecimen title="Opening, again" kind="alias" state="selected" />
        </Specimen>
        <Specimen label="alias · dragging">
          <CanvasCardSpecimen title="Opening, again" kind="alias" state="dragging" />
        </Specimen>
      </div>
    </CatalogueSection>
  </div>
);

/**
 * The one Title with no break in it: the ordinary case, and the Title Hyper has
 * always drawn.
 */
const ONE_LINE_TITLE = 'Strategies';

/**
 * Three Title Lines the author typed — `title`, `subtitle`, `caption` (ADR
 * 0083). Each is short enough to draw on one visual line, so what the ladder
 * does to type is legible without any line also wrapping.
 */
const THREE_LINE_TITLE = 'Strategies\nno strategy is privileged\nelkjs is one member of a set';

/**
 * One Title Line, long enough that the box breaks it. A break the box chose is
 * not a rung: every visual line of this is still the `title` role.
 */
const WRAPPING_TITLE = 'Why authored placement beats a layout engine that reshuffles on every edit';

/**
 * Every front `CanvasCard` declares, with the label each specimen carries.
 *
 * The creation ghost is in the list and is not a Card: it is what the canvas
 * draws while a new Card is being placed, and it takes the Markdown treatment
 * without content or authored open state. Leaving it out would make this story
 * "every front but one", which is the shape this story exists to stop.
 */
const FRONTS = [
  { kind: 'markdown', label: 'markdown' },
  { kind: 'alias', label: 'alias' },
  { kind: 'space', label: 'space' },
  { kind: 'preview', label: 'creation ghost' },
] as const satisfies readonly { kind: CanvasCardFront['kind']; label: string }[];

/**
 * The whole of a Card front, at rest, for every front the component draws.
 *
 * This story exists because no other one showed a front entire: `States`,
 * `Kinds`, `Hover`, `Colours`, `Open and close`, `Open Alias` and `Resize
 * control` are each a slice, and two undecided elements lived on the front for
 * months because the slice that drew them was not the slice anyone reviewed.
 *
 * What every specimen below draws, and all it draws: the kind glyph at the
 * leading edge of the rail, the Card's border — dotted for an Alias, solid for
 * every other front — and the Card's Title, as one `.canvas-card__title-line`
 * per Title Line. Nothing is drawn beneath the Title: a closed Card's whole
 * content is the Title its author wrote. No specimen is handed an authoring
 * callback, so no rail actions are drawn either; `Hover` and `Actions` are
 * where those live.
 */
export const Front: Story = () => (
  <div className="inv inv-sheet" style={cardSizeVars}>
    <CatalogueSection
      title="Card front"
      note="Every front CanvasCard draws, at rest and at the one authored Closed Size, each with a one-line Title beside a three-line one. A front draws its kind glyph, its border — dotted only for an Alias — and its Title Lines, and beneath the Title it draws nothing."
    >
      <div className="inv-row">
        {FRONTS.map((front) => (
          <Specimen key={front.label} label={`${front.label} · one line`}>
            <CanvasCardSpecimen kind={front.kind} title={ONE_LINE_TITLE} />
          </Specimen>
        ))}
      </div>
      <div className="inv-row">
        {FRONTS.map((front) => (
          <Specimen key={front.label} label={`${front.label} · three lines`}>
            <CanvasCardSpecimen kind={front.kind} title={THREE_LINE_TITLE} />
          </Specimen>
        ))}
      </div>
    </CatalogueSection>
    <CatalogueSection
      title="An authored break is not a wrapped break"
      note="Left: one Title Line the box breaks over several visual lines — all of it the title role, at one size and one weight. Right: three Title Lines the author typed — title, then subtitle, then caption, descending in size and weight. Same component, same width; only the ladder tells them apart."
    >
      <div className="inv-row">
        <Specimen label="one Title Line, wrapped">
          <CanvasCardSpecimen title={WRAPPING_TITLE} />
        </Specimen>
        <Specimen label="three Title Lines, authored">
          <CanvasCardSpecimen title={THREE_LINE_TITLE} />
        </Specimen>
      </div>
    </CatalogueSection>
  </div>
);
Front.storyName = 'Front';

export const Kinds: Story = () => (
  <div className="inv inv-sheet" style={cardSizeVars}>
    <CatalogueSection
      title="Card kinds"
      note="Kind changes the icon and the border treatment (an Alias's dotted border) without adding a textual kind label. This story exercises CanvasCard's presentation interface directly."
    >
      <div className="inv-row">
        <Specimen label="markdown">
          <CanvasCardSpecimen title="Strategies" kind="markdown" />
        </Specimen>
        <Specimen label="markdown · long title">
          <CanvasCardSpecimen title="Why authored placement beats a layout engine that reshuffles on every edit" />
        </Specimen>
        <Specimen label="alias">
          <CanvasCardSpecimen title="Opening, again" kind="alias" />
        </Specimen>
      </div>
    </CatalogueSection>
  </div>
);

export const Colours: Story = () => (
  <div className="inv inv-sheet" style={cardSizeVars}>
    <CatalogueSection
      title="Card colours"
      note="The selected presentation state carries the Active Graph colour across its rail. These are the complete catalogue palette examples."
    >
      <div className="inv-row">
        {GRAPH_PALETTE.map((color) => (
          <Specimen key={color} label={color}>
            <CanvasCardSpecimen title="Strategies" state="selected" graphColor={color} />
          </Specimen>
        ))}
      </div>
    </CatalogueSection>
  </div>
);
Colours.storyName = 'Colours';

export const Hover: Story = () => (
  <div className="inv inv-sheet" style={cardSizeVars}>
    <CatalogueSection
      title="Hover actions"
      note="Move the pointer over the real React Flow node to reveal its rail actions and Edge handles together — CanvasCard's own hover CSS drawn alongside the adapter-owned geometry it shares the node with."
    >
      <div className="inv-row">
        <Specimen label="hover to show actions and Edge handles">
          <CanvasCardNodeSpecimen />
        </Specimen>
        <Specimen label="selected · hover for combined state">
          <CanvasCardNodeSpecimen selected />
        </Specimen>
        <Specimen label="read-only · no authoring affordances">
          <CanvasCardNodeSpecimen readOnly selected />
        </Specimen>
      </div>
    </CatalogueSection>
  </div>
);
Hover.meta = { iframed: true };

/** A specimen that keeps its own size in state, so a real drag on the real
 *  production control actually grows the real node — the round trip
 *  `SpaceCanvas` makes through Space Authoring, condensed to local state. */
function ResizableOpenSpecimen({ selected = false }: { readonly selected?: boolean }) {
  const [size, setSize] = useState({ width: 480, height: 360 });
  return (
    <CanvasCardNodeSpecimen
      expanded
      selected={selected}
      nodeSize={size}
      onResize={(proposal) => setSize(snapCardSizeToClose(proposal))}
      stageClassName="inv-card-node-stage--large"
    />
  );
}

/**
 * Every Open Card exposes one bottom-right resize control, revealed by hover,
 * Selection or focus; a Closed Card exposes none (ADR 0066). Both specimens
 * mount the real production `CardNode` through the real `nodeTypes`, so what
 * is proved here is the shared Card control rather than a facsimile of it.
 */
export const ResizeControl: Story = () => (
  <div className="inv inv-sheet" style={cardSizeVars}>
    <CatalogueSection
      title="Resize control"
      note="Hover, select or focus the Open Card to reveal its bottom-right control, then drag it. The Closed Card beside it offers none."
    >
      <div className="inv-row">
        <Specimen label="Open · resizable">
          <section aria-label="Open Card">
            <ResizableOpenSpecimen />
          </section>
        </Specimen>
        <Specimen label="Open · Selected">
          <section aria-label="Selected Card">
            <ResizableOpenSpecimen selected />
          </section>
        </Specimen>
        <Specimen label="Closed · no control">
          <section aria-label="Closed Card">
            <CanvasCardNodeSpecimen />
          </section>
        </Specimen>
      </div>
    </CatalogueSection>
  </div>
);
ResizeControl.storyName = 'Resize control';
ResizeControl.meta = { iframed: true };

/**
 * One instance wired the way `CardNode` wires the production component: real
 * selection and dragging toggles standing in for React Flow's own, a real
 * Connect operation, and a visible record of when it fired — so the story
 * proves the same exposure the production graph does, not a facsimile of it.
 */
function Instance({
  initialTitle,
  kind = 'markdown',
}: {
  readonly initialTitle: string;
  readonly kind?: 'markdown' | 'alias';
}) {
  const [title] = useState(initialTitle);
  const [selected, setSelected] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [open, setOpen] = useState(false);
  const changeOpen = (next: boolean) => {
    setOpen(next);
    return 'completed' as const;
  };
  const front: CanvasCardFront =
    kind === 'alias'
      ? { kind: 'alias', source: '', open: false }
      : open
        ? { kind: 'markdown', source: 'Markdown content', open: true, onOpenChange: changeOpen }
        : { kind: 'markdown', source: 'Markdown content', open: false, onOpenChange: changeOpen };
  const state: Exclude<CanvasCardState, 'editing'> = dragging
    ? 'dragging'
    : selected
      ? 'selected'
      : 'rest';
  return (
    <div className="flex flex-col items-start gap-2">
      <div
        role="group"
        aria-label={`${title} on the canvas`}
        tabIndex={-1}
        onClick={() => setSelected(true)}
      >
        <CanvasCard front={front} state={state} title={title} graphColor="#ffc53d" />
      </div>
      <label className="flex items-center gap-1 text-xs text-muted-foreground">
        <input
          type="checkbox"
          checked={dragging}
          onChange={(event) => setDragging(event.target.checked)}
        />
        Dragging
      </label>
      {front.kind === 'markdown' && (
        <p className="text-xs text-muted-foreground" data-testid="open-report">
          {open ? `${title} is open.` : `${title} is closed.`}
        </p>
      )}
    </div>
  );
}

/**
 * The production component's keyboard, pointer and callback behaviour: real
 * hover, click-to-select, a dragging toggle standing in for React Flow's own,
 * and keyboard-focusable Card actions. `States` above is the visual reference;
 * this is its behaviour proof.
 */
export const Actions: Story = () => (
  <div className="flex flex-wrap gap-8 p-8" style={cardSizeVars}>
    <Instance initialTitle="Strategies" />
    <Instance initialTitle="Opening, again" kind="alias" />
  </div>
);

const closedFrame = { width: 240, height: 135 };
const openFrame = { width: 480, height: 360 };

const openMarkdown = `## Placement is authored

A **Layout** owns explicit Card rects. A strategy only computes placement.

- Open in place
- Edit the source
- Keep the canvas beneath it`;

/** The Card's actual Open and Close operation, including its change in authored size. */
export const OpenAndClose: Story = () => {
  const [open, setOpen] = useState(false);
  const [longOpen, setLongOpen] = useState(true);
  const changeOpen = (next: boolean) => {
    setOpen(next);
    return 'completed' as const;
  };
  const changeLongOpen = (next: boolean) => {
    setLongOpen(next);
    return 'completed' as const;
  };

  return (
    <div className="flex flex-wrap items-start gap-8 p-8">
      <section aria-label="Interactive Card" className="flex flex-col gap-2">
        <p className="text-xs text-muted-foreground">{open ? 'Open' : 'Closed'}</p>
        <CanvasCardNodeSpecimen
          expanded={open}
          onOpenChange={changeOpen}
          body={openMarkdown}
          nodeSize={open ? openFrame : closedFrame}
          stageClassName="inv-card-node-stage--large"
        />
      </section>
      <section aria-label="Long Markdown Card" className="flex flex-col gap-2">
        <p className="text-xs text-muted-foreground">
          {longOpen ? 'Open' : 'Closed'} · long Markdown
        </p>
        <CanvasCardNodeSpecimen
          expanded={longOpen}
          onOpenChange={changeLongOpen}
          title="Long Markdown"
          body={`${openMarkdown}\n\n### A deliberately long section\n\n${openMarkdown}\n\n${openMarkdown}`}
          nodeSize={longOpen ? openFrame : closedFrame}
          stageClassName="inv-card-node-stage--large"
        />
      </section>
    </div>
  );
};
OpenAndClose.meta = { iframed: true };

export const OpenAlias: Story = () => {
  const [open, setOpen] = useState(true);
  const changeOpen = (next: boolean) => {
    setOpen(next);
    return 'completed' as const;
  };
  return (
    <div className="p-8">
      <CanvasCardNodeSpecimen
        cardId={cardIds.openingAlias}
        expanded={open}
        onOpenChange={changeOpen}
        cardEditingEnabled
        body={'## Strategies\n\nNo strategy is privileged.'}
        nodeSize={open ? openFrame : closedFrame}
        stageClassName="inv-card-node-stage--large"
      />
    </div>
  );
};
OpenAlias.storyName = 'Open Alias';
OpenAlias.meta = { iframed: true };
