import type { Story } from '@ladle/react';
import { CanvasCardSpecimen } from '../support/CanvasCardSpecimen';
import { CatalogueSection, Specimen } from '../support/Catalogue';
import { CanvasCardNodeSpecimen } from '../support/ReactFlowCanvas';
import { TitleEditingDemo } from '../support/TitleEditingDemo';
import { GRAPH_PALETTE } from '../support/fixture';

export default { title: 'Components/Canvas Card' };

export const States: Story = () => (
  <div className="inv-sheet">
    <CatalogueSection
      title="Card states"
      note="The shared CanvasCard presentation contract. React Flow interaction states and handles remain real pointer behavior in Hover actions."
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
          <CanvasCardSpecimen title="Opening" kind="alias" />
        </Specimen>
        <Specimen label="alias · selected">
          <CanvasCardSpecimen title="Opening" kind="alias" state="selected" />
        </Specimen>
        <Specimen label="alias · dragging">
          <CanvasCardSpecimen title="Opening" kind="alias" state="dragging" />
        </Specimen>
      </div>
    </CatalogueSection>
  </div>
);

export const Kinds: Story = () => (
  <div className="inv-sheet">
    <CatalogueSection
      title="Card kinds"
      note="Kind changes the icon and resting frame without adding a textual kind label. This story exercises CanvasCard's presentation interface directly."
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
  <div className="inv-sheet">
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

export const Editing: Story = () => (
  <div className="inv-sheet">
    <CatalogueSection
      title="Title editing lifecycle"
      note="Double-click a Card title to edit it. Enter saves the title; Escape cancels the current draft. This is the complete application composition over an isolated memory-backed fixture."
    >
      <TitleEditingDemo />
    </CatalogueSection>
  </div>
);

export const HoverActions: Story = () => (
  <div className="inv-sheet">
    <CatalogueSection
      title="Hover actions"
      note="Move the pointer over either real React Flow node to reveal its Edge handles and rail actions. The selected Card becomes selected + hover; selection alone keeps only its thick frame and coloured rail."
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
