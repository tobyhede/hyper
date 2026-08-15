import type { Story } from '@ladle/react';
import { StaticCanvas } from '../support/StaticCanvas';
import { cardIds, graphIds } from '../support/fixture';

export default { title: 'Surfaces/Canvas' };

/** Every Graph remains visible, with the Active Graph emphasised. */
export const Overview: Story = () => (
  <div style={{ overflow: 'auto', height: 620 }}>
    <StaticCanvas activeGraphId={graphIds.long} />
  </div>
);

export const InteractionStates: Story = () => (
  <div style={{ overflow: 'auto', height: 620 }}>
    <StaticCanvas
      activeGraphId={graphIds.short}
      cardStates={{
        [cardIds.strategies]: 'hover',
        [cardIds.opening]: 'selected',
        [cardIds.problem]: 'dragging',
      }}
    />
  </div>
);
InteractionStates.storyName = 'Interaction states';
