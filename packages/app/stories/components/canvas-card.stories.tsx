import type { Story } from '@ladle/react';
import type { CanvasCardState } from '@project/ui';
import { CanvasCardSpecimen } from '../support/CanvasCardSpecimen';
import { CatalogueSection, Specimen } from '../support/Catalogue';

export default { title: 'Components/Canvas Card' };

const states: readonly CanvasCardState[] = [
  'rest',
  'hover',
  'selected',
  'selected-hover',
  'dragging',
  'editing',
];

export const States: Story = () => (
  <div className="inv-sheet">
    <CatalogueSection
      title="Card states"
      note="Every visual state is shown for both a Markdown Card and an Alias."
    >
      <div className="inv-row">
        {states.map((state) => (
          <Specimen key={`card-${state}`} label={`card · ${state}`}>
            <CanvasCardSpecimen title="Strategies" state={state} showActions />
          </Specimen>
        ))}
        {states.map((state) => (
          <Specimen key={`alias-${state}`} label={`alias · ${state}`}>
            <CanvasCardSpecimen title="Opening" kind="alias" state={state} showActions />
          </Specimen>
        ))}
      </div>
    </CatalogueSection>
  </div>
);

export const Kinds: Story = () => (
  <div className="inv-sheet">
    <CatalogueSection
      title="Card kinds"
      note="Kind changes the icon and resting frame without adding a textual kind label."
    >
      <div className="inv-row">
        <Specimen label="markdown">
          <CanvasCardSpecimen title="Strategies" kind="markdown" />
        </Specimen>
        <Specimen label="markdown · long title">
          <CanvasCardSpecimen title="Why authored placement beats a layout engine that reshuffles on every edit" />
        </Specimen>
        <Specimen label="alias">
          <CanvasCardSpecimen title="Opening" kind="alias" />
        </Specimen>
      </div>
    </CatalogueSection>
  </div>
);

export const Editing: Story = () => (
  <div className="inv-sheet">
    <CatalogueSection
      title="In-place title editing"
      note="The field occupies the title's position and the rail carries the editing hint."
    >
      <div className="inv-row">
        <Specimen label="editing">
          <CanvasCardSpecimen title="Strategies" state="editing" />
        </Specimen>
        <Specimen label="editing · long title">
          <CanvasCardSpecimen
            title="Why authored placement beats a layout engine that reshuffles"
            state="editing"
          />
        </Specimen>
      </div>
    </CatalogueSection>
  </div>
);

export const HoverActions: Story = () => (
  <div className="inv-sheet">
    <CatalogueSection
      title="Hover actions"
      note="The story supplies the same specialized action slots as CardNode; selected Cards keep them hidden."
    >
      <div className="inv-row">
        <Specimen label="hover · actions visible">
          <CanvasCardSpecimen title="Strategies" state="hover" showActions />
        </Specimen>
        <Specimen label="selected · actions hidden">
          <CanvasCardSpecimen title="Strategies" state="selected" showActions />
        </Specimen>
      </div>
    </CatalogueSection>
  </div>
);
HoverActions.storyName = 'Hover actions';

export const AuthoringHandles: Story = () => (
  <div className="inv-sheet">
    <CatalogueSection
      title="Authoring handle integration"
      note="These controls come from the React Flow adapter through CanvasCard's handles slot."
    >
      <div className="inv-row">
        <Specimen label="adapter handles · hover">
          <CanvasCardSpecimen title="Strategies" state="hover" showHandles />
        </Specimen>
      </div>
    </CatalogueSection>
  </div>
);
AuthoringHandles.storyName = 'Authoring handles';

export const Playground: Story<{
  title: string;
  graphColor: string;
  state: CanvasCardState;
}> = ({ title, graphColor, state }) => (
  <div className="inv-sheet">
    <div className="inv-specimen__stage">
      <CanvasCardSpecimen title={title} graphColor={graphColor} state={state} showActions />
    </div>
  </div>
);
Playground.args = {
  title: 'Why authored placement beats a layout engine that reshuffles on every edit',
  graphColor: '#ffc53d',
  state: 'hover',
};
Playground.argTypes = {
  graphColor: { control: { type: 'color' } },
  state: {
    options: states,
    control: { type: 'inline-radio' },
  },
};
