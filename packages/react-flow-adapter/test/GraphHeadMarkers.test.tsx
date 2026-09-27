import '@testing-library/jest-dom/vitest';
import { render } from '@testing-library/react';
import { ReactFlowProvider } from '@xyflow/react';
import { describe, expect, it } from 'vitest';
import { GraphHeadMarkers, projectGraphEdges } from '../src/index';
import { uuid } from './uuid';

/**
 * A canvas's head markers, drawn once for the canvas from the Edges in its
 * React Flow store. The provider stands in for `<ReactFlow>`: what the markers
 * read is the store, and seeding it with Edges is what a canvas does.
 */
const [A, B, C] = ['a', 'b', 'c'].map((id) => uuid(`00000000-0000-4000-8000-00000000010${id}`));
const RED = uuid('00000000-0000-4000-8000-000000000201');
const BLUE = uuid('00000000-0000-4000-8000-000000000202');
const edge = (graphId: typeof RED, source: string, target: string) => ({
  id: `${graphId}::${source}::${target}`,
  graphId,
  source: uuid(source),
  target: uuid(target),
});
// Red has two Edges, Blue one.
const drawn = [edge(RED, A!, B!), edge(RED, B!, C!), edge(BLUE, A!, B!)];
const colors = { [RED]: '#d62728', [BLUE]: '#1f77b4' };

const canvas = () => {
  const edges = projectGraphEdges(drawn, colors, { headShapes: { [RED]: 'dot' } });
  return (
    <ReactFlowProvider initialEdges={edges}>
      <GraphHeadMarkers />
    </ReactFlowProvider>
  );
};

const markersIn = (container: HTMLElement) =>
  [...container.querySelectorAll('marker')].map((marker) => {
    const glyph = marker.querySelector('[data-slot="graph-head-shape"]');
    return {
      id: marker.id,
      headShape: glyph?.getAttribute('data-head-shape'),
      fill: glyph?.getAttribute('fill'),
    };
  });

describe('GraphHeadMarkers', () => {
  it('draws one marker per Graph, in its head shape and colour, under the id its Edges name', () => {
    const { container } = render(canvas());

    expect(markersIn(container)).toEqual([
      { id: `graph-head-${RED}`, headShape: 'dot', fill: '#d62728' },
      { id: `graph-head-${BLUE}`, headShape: 'arrow', fill: '#1f77b4' },
    ]);
    // All in one hidden `<defs>`, as React Flow draws its own markers.
    expect(container.querySelectorAll('defs')).toHaveLength(1);
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });
});
