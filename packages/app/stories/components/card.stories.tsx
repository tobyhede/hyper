import { useState } from 'react';
import type { Story } from '@ladle/react';
import { CanvasCard, type CanvasCardFront, type CanvasCardState } from '@project/ui';
import { cardSizeVars } from '#src/card';
import { CanvasCardSpecimen } from '../support/CanvasCardSpecimen';
import { CatalogueSection, Specimen } from '../support/Catalogue';
import { CanvasCardNodeSpecimen } from '../support/ReactFlowCanvas';
import { GRAPH_PALETTE } from '../support/fixture';
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
          <CanvasCardSpecimen title="Opening, again" kind="alias" aliasOf="Opening" />
        </Specimen>
        <Specimen label="alias · selected">
          <CanvasCardSpecimen
            title="Opening, again"
            kind="alias"
            aliasOf="Opening"
            state="selected"
          />
        </Specimen>
        <Specimen label="alias · dragging">
          <CanvasCardSpecimen
            title="Opening, again"
            kind="alias"
            aliasOf="Opening"
            state="dragging"
          />
        </Specimen>
      </div>
    </CatalogueSection>
  </div>
);

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
          <CanvasCardSpecimen title="Opening, again" kind="alias" aliasOf="Opening" />
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
      </div>
    </CatalogueSection>
  </div>
);

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
      onResize={setSize}
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

/**
 * One instance wired the way `CardNode` wires the production component: real
 * selection and dragging toggles standing in for React Flow's own, a real
 * Connect operation, and a visible record of when it fired — so the story
 * proves the same exposure the production graph does, not a facsimile of it.
 */
function Instance({
  initialTitle,
  aliasOf,
}: {
  readonly initialTitle: string;
  readonly aliasOf?: string;
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
    aliasOf === undefined
      ? open
        ? { kind: 'markdown', source: 'Markdown content', open: true, onOpenChange: changeOpen }
        : { kind: 'markdown', source: 'Markdown content', open: false, onOpenChange: changeOpen }
      : { kind: 'alias', aliasOf };
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
    <Instance initialTitle="Opening, again" aliasOf="Opening" />
  </div>
);

const closedFrame = { width: 240, height: 135 };
const openFrame = { width: 480, height: 360 };

const openMarkdown = `## Placement is authored

A **Layout** owns explicit Card rects. The strategy only supplies a computed View.

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
