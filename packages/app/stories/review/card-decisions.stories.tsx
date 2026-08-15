import type { Story } from '@ladle/react';
import { Alert, AlertDescription, AlertTitle } from '@project/ui';
import { CatalogueSection, Specimen } from '../support/Catalogue';
import { CanvasCardNodeSpecimen } from '../support/ReactFlowCanvas';

export default { title: 'Review/Card Decisions' };

export const EditingExitSemantics: Story = () => (
  <div className="inv-sheet">
    <CatalogueSection title="Card Front editing">
      <div className="inv-row">
        <Specimen label="editing">
          <CanvasCardNodeSpecimen editingTitle />
        </Specimen>
      </div>
    </CatalogueSection>
    <CatalogueSection title="Decision context">
      <Alert>
        <AlertTitle>Escape has surface-specific semantics</AlertTitle>
        <AlertDescription>
          On the Card Front, ADR 0048 makes Escape revert the title and dismiss the editor, while
          blur commits. The delegated pane keeps its separate explicit Done or Cancel contract.
        </AlertDescription>
      </Alert>
    </CatalogueSection>
  </div>
);
EditingExitSemantics.storyName = 'Editing exit semantics';

export const RailActionComponent: Story = () => (
  <div className="inv-sheet">
    <CatalogueSection title="Rail actions">
      <div className="inv-row">
        <Specimen label="hover · specialized actions">
          <CanvasCardNodeSpecimen />
        </Specimen>
      </div>
    </CatalogueSection>
    <CatalogueSection title="Open component decision">
      <Alert>
        <AlertTitle>Keep the rail treatment specialized for now</AlertTitle>
        <AlertDescription>
          Its square geometry, two-pixel border, and graph-colour hover treatment do not match the
          shared Button variants. This inventory mirrors CardNode; a public RailButton should be
          introduced only when product code owns that reusable seam.
        </AlertDescription>
      </Alert>
    </CatalogueSection>
  </div>
);
RailActionComponent.storyName = 'Rail action component';
