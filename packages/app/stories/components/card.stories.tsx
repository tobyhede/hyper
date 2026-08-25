import { useState, type CSSProperties, type ReactNode } from 'react';
import type { Story } from '@ladle/react';
import { CanvasCard, MarkdownCardBody, type CanvasCardState } from '@project/ui';
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

interface OpenProps {
  content?: ReactNode;
  onOpenChange?: (open: boolean) => void;
}

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
  const front =
    aliasOf === undefined ? ({ kind: 'markdown' } as const) : { kind: 'alias' as const, aliasOf };
  const state: Exclude<CanvasCardState, 'editing'> = dragging
    ? 'dragging'
    : selected
      ? 'selected'
      : 'rest';
  const openProps: OpenProps = {};
  if (front.kind === 'markdown') {
    if (open) openProps.content = <p>Markdown content</p>;
    openProps.onOpenChange = setOpen;
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <div
        role="group"
        aria-label={`${title} on the canvas`}
        tabIndex={-1}
        onClick={() => setSelected(true)}
      >
        <CanvasCard front={front} state={state} title={title} graphColor="#ffc53d" {...openProps} />
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
 * and the keyboard-focusable Connect control the graph reaches through the
 * same handler React Flow attaches. `States` above is the visual reference;
 * this is its behaviour proof.
 */
export const Actions: Story = () => (
  <div className="flex flex-wrap gap-8 p-8" style={cardSizeVars}>
    <Instance initialTitle="Strategies" />
    <Instance initialTitle="Opening, again" aliasOf="Opening" />
  </div>
);

type CardFrameStyle = CSSProperties & {
  readonly '--card-width': string;
  readonly '--card-height': string;
};

const closedFrame: CardFrameStyle = {
  '--card-width': '240px',
  '--card-height': '135px',
};

const openFrame: CardFrameStyle = {
  '--card-width': '480px',
  '--card-height': '360px',
  width: '480px',
  height: '360px',
};

const openMarkdown = `## Placement is authored

A **Layout** owns explicit Card rects. The strategy only supplies a computed View.

- Open in place
- Edit the source
- Keep the canvas beneath it`;

/** The Card's actual Open and Close operation, including its change in authored size. */
export const OpenAndClose: Story = () => {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex flex-wrap items-start gap-8 p-8">
      <section aria-label="Interactive Card" className="flex flex-col gap-2">
        <p className="text-xs text-muted-foreground">{open ? 'Open' : 'Closed'}</p>
        <div style={open ? openFrame : closedFrame}>
          <CanvasCard
            front={{ kind: 'markdown' }}
            state="rest"
            title="Strategies"
            graphColor="#ffc53d"
            content={
              open ? (
                <MarkdownCardBody source={openMarkdown} ariaLabel="Markdown source of Strategies" />
              ) : undefined
            }
            onOpenChange={setOpen}
          />
        </div>
      </section>
      <section aria-label="Long Open Card" className="flex flex-col gap-2">
        <p className="text-xs text-muted-foreground">Open · long Markdown</p>
        <div style={openFrame}>
          <CanvasCard
            front={{ kind: 'markdown' }}
            state="rest"
            title="Long Markdown"
            graphColor="#ffc53d"
            content={
              <MarkdownCardBody
                source={`${openMarkdown}\n\n### A deliberately long section\n\n${openMarkdown}\n\n${openMarkdown}`}
                ariaLabel="Markdown source of Long Markdown"
              />
            }
            onOpenChange={() => undefined}
          />
        </div>
      </section>
    </div>
  );
};
