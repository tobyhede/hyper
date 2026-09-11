import { useState } from 'react';
import type { Story } from '@ladle/react';
import {
  THING_CLOSE_SNAP_DISTANCE,
  THING_SIZE,
  thingSizeVars,
  snapThingSizeToClose,
} from '#src/thing';
import { CatalogueSection, Specimen } from '../support/Catalogue';
import { CanvasThingNodeSpecimen } from '../support/ReactFlowCanvas';
import '../support/inventory.css';

export default { title: 'Review/Thing Resize Close Snap' };

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
  const snapped = snapThingSizeToClose(proposal);
  return (
    <Specimen label={`${label} · raw ${proposal.width}×${proposal.height}`}>
      <CanvasThingNodeSpecimen
        expanded
        selected
        nodeSize={snapped}
        onResize={setProposal}
        stageClassName="inv-thing-node-stage--large"
        zoom={zoom}
      />
    </Specimen>
  );
}

const proposals = [
  {
    label: 'outside · no snap',
    size: {
      width: THING_SIZE.width + THING_CLOSE_SNAP_DISTANCE + 1,
      height: THING_SIZE.height + THING_CLOSE_SNAP_DISTANCE + 1,
    },
  },
  {
    label: 'entering · exact boundary',
    size: {
      width: THING_SIZE.width + THING_CLOSE_SNAP_DISTANCE,
      height: THING_SIZE.height + THING_CLOSE_SNAP_DISTANCE,
    },
  },
  {
    label: 'inside · snapped',
    size: {
      width: THING_SIZE.width + THING_CLOSE_SNAP_DISTANCE / 2,
      height: THING_SIZE.height + THING_CLOSE_SNAP_DISTANCE / 2,
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
  <div className="inv inv-sheet" style={thingSizeVars}>
    {[0.5, 1, 2].map((zoom) => (
      <CatalogueSection
        key={zoom}
        title={`${zoom}× viewport zoom`}
        note={`${THING_CLOSE_SNAP_DISTANCE} canvas units; drag any real production control across the boundary to tune it.`}
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
