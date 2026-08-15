import type { Story } from '@ladle/react';
import { CanvasCardSpecimen } from '../support/CanvasCardSpecimen';
import { CatalogueSection, Specimen } from '../support/Catalogue';
import { CanvasCardNodeSpecimen } from '../support/ReactFlowCanvas';
import { cardIds, GRAPH_PALETTE } from '../support/fixture';

export default { title: 'Components/Canvas Card' };

export const States: Story = () => (
  <div className="inv-sheet">
    <CatalogueSection
      title="Card states"
      note="React Flow supplies selection and dragging; CardNode translates those states into the shared Canvas Card presentation. Hover combinations remain real pointer interactions in Hover actions."
    >
      <div className="inv-row">
        <Specimen label="card · rest">
          <CanvasCardNodeSpecimen />
        </Specimen>
        <Specimen label="card · selected">
          <CanvasCardNodeSpecimen selected />
        </Specimen>
        <Specimen label="card · dragging">
          <CanvasCardNodeSpecimen dragging />
        </Specimen>
        <Specimen label="card · editing">
          <CanvasCardNodeSpecimen editingTitle />
        </Specimen>
        <Specimen label="alias · rest">
          <CanvasCardNodeSpecimen cardId={cardIds.openingAlias} />
        </Specimen>
        <Specimen label="alias · selected">
          <CanvasCardNodeSpecimen cardId={cardIds.openingAlias} selected />
        </Specimen>
        <Specimen label="alias · dragging">
          <CanvasCardNodeSpecimen cardId={cardIds.openingAlias} dragging />
        </Specimen>
        <Specimen label="alias · editing">
          <CanvasCardNodeSpecimen cardId={cardIds.openingAlias} editingTitle />
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
      title="In-place title editing"
      note="The production CardNode editor occupies the title's position, keeps the kind icon stable, and carries the editing hint in the rail."
    >
      <div className="inv-row">
        <Specimen label="editing">
          <CanvasCardNodeSpecimen editingTitle />
        </Specimen>
        <Specimen label="editing · long title">
          <CanvasCardNodeSpecimen cardId={cardIds.problem} editingTitle />
        </Specimen>
      </div>
    </CatalogueSection>
  </div>
);

export const HoverActions: Story = () => (
  <div className="inv-sheet">
    <CatalogueSection
      title="Hover actions"
      note="Move the pointer over either real React Flow node to reveal its Edge handles and rail actions. The selected Card becomes selected + hover; selection alone keeps actions keyboard-reachable after hover ends."
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
