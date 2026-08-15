import type { Story } from '@ladle/react';
import { Alert, AlertDescription, AlertTitle, GraphLegend } from '@project/ui';
import { CanvasCardSpecimen } from '../support/CanvasCardSpecimen';
import { CatalogueSection, Specimen } from '../support/Catalogue';
import { EDGE_COLOR, GRAPH_PALETTE, colorByGraphId, graphIds, graphs } from '../support/fixture';

export default { title: 'Review/Graph Decisions' };

export const Colours: Story = () => (
  <div className="inv-sheet">
    <CatalogueSection
      title="Graph colours"
      note="The Card takes the Graph colour flat; the Edge takes a darker relative for contrast."
    >
      <div className="inv-row">
        {GRAPH_PALETTE.map((color) => (
          <Specimen key={color} label={`${color} · edge ${EDGE_COLOR[color] ?? '—'}`}>
            <CanvasCardSpecimen title="Strategies" state="hover" graphColor={color} />
            <svg width={260} height={18} style={{ marginTop: 12 }} aria-hidden="true">
              <path
                d="M 8 9 L 252 9"
                stroke={EDGE_COLOR[color] ?? color}
                strokeWidth={3}
                strokeLinecap="round"
                fill="none"
              />
            </svg>
          </Specimen>
        ))}
      </div>
    </CatalogueSection>
    <CatalogueSection title="Open palette decision">
      <Alert>
        <AlertTitle>Three Edge colours remain derived guesses</AlertTitle>
        <AlertDescription>
          Amber and teal have approved darker pairs. Blue, violet, and coral currently preserve a
          similar lightness step but still need visual approval; the source also disagrees whether
          the rotation contains five or six colours.
        </AlertDescription>
      </Alert>
    </CatalogueSection>
  </div>
);

export const MultiGraphMembership: Story = () => (
  <div className="inv-sheet">
    <CatalogueSection
      title="Multi-Graph membership"
      note="The first Card belongs to both fixture Graphs; the second belongs to one."
    >
      <div className="inv-row">
        <Specimen label="Strategies · two Graphs">
          <CanvasCardSpecimen title="Strategies" state="hover" graphColor={GRAPH_PALETTE[0]} />
        </Specimen>
        <Specimen label="Traversal · one Graph">
          <CanvasCardSpecimen title="Traversal" state="hover" graphColor={GRAPH_PALETTE[0]} />
        </Specimen>
        <GraphLegend
          graphs={graphs}
          colorByGraphId={colorByGraphId}
          activeGraphId={graphIds.long}
        />
      </div>
    </CatalogueSection>
    <CatalogueSection title="Open membership decision">
      <Alert>
        <AlertTitle>Do not invent a Card-level membership treatment</AlertTitle>
        <AlertDescription>
          The current legend identifies available Graphs, not which Graphs contain a Card. A
          per-Graph colour bar was rejected; the remaining options require an explicit product
          decision.
        </AlertDescription>
      </Alert>
    </CatalogueSection>
  </div>
);
MultiGraphMembership.storyName = 'Multiple Graph membership';
