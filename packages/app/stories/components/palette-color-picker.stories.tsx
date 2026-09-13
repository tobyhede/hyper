import type { Story } from '@ladle/react';
import { useState } from 'react';
import { PaletteColorPicker } from '@project/ui';
import { GRAPH_PALETTE_ENTRIES } from '../support/fixture';
import { CatalogueSection, Specimen } from '../support/Catalogue';
import '../support/inventory.css';

export default { title: 'Components/Palette colour picker' };

/** The closed-palette swatch grid used for Graph recolour and similar commands. */
export const Default: Story = () => {
  const [color, setColor] = useState<string>(GRAPH_PALETTE_ENTRIES[0]?.color ?? '#1f77b4');

  return (
    <div className="inv inv-sheet">
      <CatalogueSection
        title="Palette colour picker"
        note="A caller-supplied closed palette opens in a popover swatch grid. The chosen swatch is visibly selected and choosing one closes the popover."
      >
        <Specimen label={color}>
          <PaletteColorPicker
            entries={GRAPH_PALETTE_ENTRIES}
            value={color}
            onValueChange={setColor}
            trigger={`Colour: ${GRAPH_PALETTE_ENTRIES.find((entry) => entry.color === color)?.label ?? color}`}
            aria-label="Graph colour"
          />
        </Specimen>
      </CatalogueSection>
    </div>
  );
};
Default.storyName = 'Default';
Default.meta = { iframed: true };
