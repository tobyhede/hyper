import type { Story } from '@ladle/react';
import { ReactFlowCanvas } from '../support/ReactFlowCanvas';
import { cardIds, graphIds } from '../support/fixture';

export default { title: 'Surfaces/Canvas' };

/** Every Graph remains visible, with the Active Graph emphasised. */
export const Overview: Story = () => (
  <div style={{ overflow: 'auto', height: 620 }}>
    <ReactFlowCanvas activeGraphId={graphIds.long} />
  </div>
);

export const SelectedCard: Story = () => (
  <div style={{ overflow: 'auto', height: 620 }}>
    <ReactFlowCanvas activeGraphId={graphIds.short} selectedCardId={cardIds.opening} />
  </div>
);
SelectedCard.storyName = 'Selected Card';
