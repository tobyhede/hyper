import type { Story } from '@ladle/react';
import { CatalogueSection } from '../support/Catalogue';
import { TitleEditingDemo } from '../support/TitleEditingDemo';

export default { title: 'Components/Card Editor' };

export const EditingDialog: Story = () => (
  <div className="inv-sheet">
    <CatalogueSection
      title="Card editing dialog"
      note="Hover the Card and choose Edit Card. This is the production dialog composition: title in the graph-colour rail, Markdown in one multiline field, and no Description field."
    >
      <TitleEditingDemo />
    </CatalogueSection>
  </div>
);
EditingDialog.storyName = 'Editing dialog';

export const AliasEditingDialog: Story = () => (
  <div className="inv-sheet">
    <CatalogueSection
      title="Alias editing dialog"
      note="Hover Strategy overview and choose Edit Card. The production Alias variant shares the Card editor shell, replaces Markdown with the searchable Target Card combobox, and renders each result with its Card-kind icon."
    >
      <TitleEditingDemo />
    </CatalogueSection>
  </div>
);
AliasEditingDialog.storyName = 'Alias editing dialog';
