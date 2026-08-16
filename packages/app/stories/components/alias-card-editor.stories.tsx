import type { Story, StoryDefault } from '@ladle/react';
import { CatalogueSection } from '../support/Catalogue';
import { AliasCardEditorDemo, OpenAliasCardEditorReference } from '../support/CardEditorDemo';

export default {
  title: 'Components/Alias Card Editor',
  meta: { iframed: true },
} satisfies StoryDefault;

export const AliasCard: Story = () => (
  <div className="inv-sheet">
    <CatalogueSection
      title="Alias Card editor"
      note="Hover the Alias Card and choose Edit Card. The production Target combobox is populated with example Card titles without adding those Cards to the specimen."
    >
      <AliasCardEditorDemo />
    </CatalogueSection>
  </div>
);
AliasCard.storyName = 'Alias Card';

export const OpenDialog: Story = () => (
  <div style={{ minHeight: 620 }}>
    <OpenAliasCardEditorReference />
  </div>
);
OpenDialog.storyName = 'Open dialog';
