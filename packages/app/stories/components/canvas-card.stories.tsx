import { useRef, useState } from 'react';
import type { Story } from '@ladle/react';
import { CanvasCard, type CanvasCardState } from '@project/ui';
import { cardSizeVars } from '#src/card';
import { CanvasCardSpecimen } from '../support/CanvasCardSpecimen';
import { CatalogueSection, Specimen } from '../support/Catalogue';
import { CanvasCardNodeSpecimen } from '../support/ReactFlowCanvas';
import { GRAPH_PALETTE } from '../support/fixture';
import '../support/inventory.css';

export default { title: 'Components/Canvas Card' };

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

export const HoverActions: Story = () => (
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
HoverActions.storyName = 'Hover actions';

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
  const [connected, setConnected] = useState(false);
  const front =
    aliasOf === undefined ? ({ kind: 'markdown' } as const) : { kind: 'alias' as const, aliasOf };
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
        <CanvasCard
          front={front}
          state={state}
          title={title}
          graphColor="#ffc53d"
          onConnect={() => setConnected(true)}
        />
      </div>
      <label className="flex items-center gap-1 text-xs text-muted-foreground">
        <input
          type="checkbox"
          checked={dragging}
          onChange={(event) => setDragging(event.target.checked)}
        />
        Dragging
      </label>
      <p className="text-xs text-muted-foreground" data-testid="connect-report">
        {connected ? `Connected from ${title}.` : 'Not connected.'}
      </p>
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
export const Interaction: Story = () => (
  <div className="flex flex-wrap gap-8 p-8" style={cardSizeVars}>
    <Instance initialTitle="Strategies" />
    <Instance initialTitle="Opening, again" aliasOf="Opening" />
  </div>
);

/**
 * The Card's own title editor, entirely private to this component: begins from
 * the Title's native control, keeps a refused draft local with a field-local `role="alert"`
 * error, completes and exits on a valid Enter, cancels on Escape, and asks its
 * caller to hand focus back once either keyboard path ends — proven here by
 * focusing the surrounding group the same way `CardNode` focuses the React
 * Flow node around it.
 */
export const TitleEditing: Story = () => {
  const [title, setTitle] = useState('Draft entry');
  const [editing, setEditing] = useState(false);
  const group = useRef<HTMLDivElement>(null);

  return (
    <div style={cardSizeVars}>
      <div
        role="group"
        aria-label={`${title} on the canvas`}
        tabIndex={-1}
        ref={group}
        data-testid="card-group"
      >
        {editing ? (
          <CanvasCard
            front={{ kind: 'markdown' }}
            state="editing"
            title={title}
            graphColor="#ffc53d"
            onCompleteTitleEdit={(draft) => {
              if (draft.trim().length === 0) return 'A Card title is required.';
              setTitle(draft);
              setEditing(false);
              return null;
            }}
            onCancelTitleEdit={() => setEditing(false)}
            onReturnFocus={() => group.current?.focus()}
          />
        ) : (
          <CanvasCard
            front={{ kind: 'markdown' }}
            state="rest"
            title={title}
            graphColor="#ffc53d"
            onBeginTitleEdit={() => setEditing(true)}
          />
        )}
      </div>
    </div>
  );
};
