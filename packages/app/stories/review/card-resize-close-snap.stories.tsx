import { useState } from 'react';
import type { Story } from '@ladle/react';
import { CARD_CLOSE_SNAP_DISTANCE, CARD_SIZE, cardSizeVars, snapCardSizeToClose } from '#src/card';
import { CatalogueSection, Specimen } from '../support/Catalogue';
import { CanvasCardNodeSpecimen } from '../support/ReactFlowCanvas';
import '../support/inventory.css';

export default { title: 'Review/Card Resize Close Snap' };

interface Proposal {
  readonly width: number;
  readonly height: number;
}

function SnapSpecimen({
  label,
  initialProposal,
  zoom,
}: {
  readonly label: string;
  readonly initialProposal: Proposal;
  readonly zoom: number;
}) {
  const [proposal, setProposal] = useState(initialProposal);
  const snapped = snapCardSizeToClose(proposal);
  return (
    <Specimen label={`${label} · raw ${proposal.width}×${proposal.height}`}>
      <CanvasCardNodeSpecimen
        expanded
        selected
        nodeSize={snapped}
        onResize={setProposal}
        stageClassName="inv-card-node-stage--large"
        zoom={zoom}
      />
    </Specimen>
  );
}

const proposals = [
  {
    label: 'outside · no snap',
    size: {
      width: CARD_SIZE.width + CARD_CLOSE_SNAP_DISTANCE + 1,
      height: CARD_SIZE.height + CARD_CLOSE_SNAP_DISTANCE + 1,
    },
  },
  {
    label: 'entering · exact boundary',
    size: {
      width: CARD_SIZE.width + CARD_CLOSE_SNAP_DISTANCE,
      height: CARD_SIZE.height + CARD_CLOSE_SNAP_DISTANCE,
    },
  },
  {
    label: 'inside · snapped',
    size: {
      width: CARD_SIZE.width + CARD_CLOSE_SNAP_DISTANCE / 2,
      height: CARD_SIZE.height + CARD_CLOSE_SNAP_DISTANCE / 2,
    },
  },
] as const;

/**
 * Review-only tuning surface for the application-owned magnetic distance.
 * Each row feeds the same three canvas-coordinate proposals through the same
 * production snap function at a different viewport zoom. The boundary and
 * inside proposals therefore draw the exact Closed rect while the one-unit
 * outside proposal remains Open-sized.
 */
export const MagneticRange: Story = () => (
  <div className="inv inv-sheet" style={cardSizeVars}>
    {[0.5, 1, 2].map((zoom) => (
      <CatalogueSection
        key={zoom}
        title={`${zoom}× viewport zoom`}
        note={`${CARD_CLOSE_SNAP_DISTANCE} canvas units; drag any real production control across the boundary to tune it.`}
      >
        <div className="inv-row">
          {proposals.map(({ label, size }) => (
            <SnapSpecimen key={label} label={label} initialProposal={size} zoom={zoom} />
          ))}
        </div>
      </CatalogueSection>
    ))}
  </div>
);
MagneticRange.meta = { iframed: true };
