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
