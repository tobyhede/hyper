import type { Story, StoryDefault } from '@ladle/react';
import { CatalogueSection } from '../support/Catalogue';
import { CardEditorDemo, OpenCardEditorReference } from '../support/CardEditorDemo';

export default {
  title: 'Components/Card Editor',
  meta: { iframed: true },
} satisfies StoryDefault;

export const Card: Story = () => (
  <div className="inv-sheet">
    <CatalogueSection
      title="Card editor"
      note="Hover the Card and choose Edit Card. The story composes the production React Flow Card node with the production Card editor through their normal callback seam."
    >
      <CardEditorDemo />
    </CatalogueSection>
  </div>
);
Card.storyName = 'Card';

export const OpenDialog: Story = () => (
  <div style={{ minHeight: 620 }}>
    <OpenCardEditorReference />
  </div>
);
OpenDialog.storyName = 'Open dialog';
