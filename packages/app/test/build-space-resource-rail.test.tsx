import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { uuidSchema, type ResourceDocument } from '@project/core';
import { ResourceRailActions } from '@project/ui';
import { buildSpaceResourceRail } from '../src/build-space-resource-rail';
import type { SpaceResourceTarget } from '../src/space-resource-lifecycle';

beforeAll(() => {
  HTMLElement.prototype.hasPointerCapture = () => false;
  HTMLElement.prototype.setPointerCapture = () => undefined;
  HTMLElement.prototype.releasePointerCapture = () => undefined;
});

const TARGET_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000020');
const FIRST_MAP_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000022');
const FIRST_GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000023');
const SECOND_GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000024');
const SECOND_MAP_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000025');
const THIRD_GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000026');
const THIRD_MAP_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000027');
const FOURTH_GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000028');
const FIFTH_GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000029');

const target: SpaceResourceTarget = {
  id: TARGET_ID,
  title: 'Architecture',
  maps: [
    {
      id: FIRST_MAP_ID,
      title: 'Collection 1',
      graphs: [
        { id: FIRST_GRAPH_ID, title: 'Overview', color: '#1f77b4', headShape: 'arrow' },
        { id: SECOND_GRAPH_ID, title: 'Detail', color: '#ff7f0e', headShape: 'dot' },
      ],
    },
    {
      id: SECOND_MAP_ID,
      title: 'Collection 2',
      graphs: [{ id: THIRD_GRAPH_ID, title: 'Second pass', color: '#2ca02c', headShape: 'arrow' }],
    },
    {
      id: THIRD_MAP_ID,
      title: 'Collection 3',
      graphs: [
        { id: FOURTH_GRAPH_ID, title: 'Draft', color: '#d62728', headShape: 'vee' },
        { id: FIFTH_GRAPH_ID, title: 'Current', color: '#9467bd', headShape: 'diamond' },
      ],
      activeGraph: FIFTH_GRAPH_ID,
    },
  ],
};

const documentOf = (
  map: typeof FIRST_MAP_ID,
  graph: typeof FIRST_GRAPH_ID,
): Extract<ResourceDocument, { kind: 'space' }> => ({
  title: 'Elsewhere',
  kind: 'space',
  spaceId: TARGET_ID,
  map,
  graph,
});

const mountRail = (rail: ReturnType<typeof buildSpaceResourceRail>) =>
  render(<ResourceRailActions aria-label="Resource rail">{rail}</ResourceRailActions>);

describe('buildSpaceResourceRail', () => {
  it('seeds both selectors from the Resource’s stored selection', () => {
    mountRail(
      buildSpaceResourceRail({
        target,
        document: documentOf(FIRST_MAP_ID, FIRST_GRAPH_ID),
        disabled: false,
        complete: () => null,
        onReport: () => undefined,
        context: undefined,
      }),
    );

    expect(screen.getByRole('button', { name: 'Map: Collection 1' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Graph: Overview' })).toBeEnabled();
  });

  /**
   * The Graph list marks each row with the colour the target draws that Graph
   * in, which is the colour the target resolved rather than one derived here.
   */
  it('marks each Graph row with the colour the target draws it in', () => {
    mountRail(
      buildSpaceResourceRail({
        target,
        document: documentOf(FIRST_MAP_ID, FIRST_GRAPH_ID),
        disabled: false,
        complete: () => null,
        onReport: () => undefined,
        context: undefined,
      }),
    );

    fireEvent.click(screen.getByTestId('space-resource-graph'));
    const marks = screen
      .getAllByRole('menuitemradio')
      .map((row) => row.querySelector('[data-slot="graph-legend-mark"]'));

    expect(marks).toHaveLength(2);
    expect(marks[0]?.querySelector('[data-slot="graph-legend-mark-line"]')).toHaveAttribute(
      'stroke',
      '#1f77b4',
    );
    expect(marks[0]).toHaveAttribute('data-head-shape', 'arrow');
    expect(marks[1]?.querySelector('[data-slot="graph-legend-mark-line"]')).toHaveAttribute(
      'stroke',
      '#ff7f0e',
    );
    expect(marks[1]).toHaveAttribute('data-head-shape', 'dot');
  });

  /**
   * Choosing a Map re-seeds the Graph from that Map's Active Graph,
   * falling back to the head of its list. Leaving the previous Map's Graph
   * in place is a Resource the aggregate refuses.
   */
  it('completes a chosen Map with that Map’s Active Graph', () => {
    const complete = vi.fn(() => null);
    mountRail(
      buildSpaceResourceRail({
        target,
        document: documentOf(FIRST_MAP_ID, FIRST_GRAPH_ID),
        disabled: false,
        complete,
        onReport: () => undefined,
        context: undefined,
      }),
    );

    fireEvent.click(screen.getByTestId('space-resource-map'));
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Collection 3' }));

    expect(complete).toHaveBeenCalledWith(
      expect.objectContaining({ id: THIRD_MAP_ID }),
      FIFTH_GRAPH_ID,
    );
  });

  it('draws a selection the target no longer holds as unavailable', () => {
    mountRail(
      buildSpaceResourceRail({
        target,
        document: documentOf(
          uuidSchema.parse('00000000-0000-4000-8000-000000000099'),
          uuidSchema.parse('00000000-0000-4000-8000-00000000009a'),
        ),
        disabled: false,
        complete: () => null,
        onReport: () => undefined,
        context: undefined,
      }),
    );

    expect(screen.getByTestId('space-resource-map')).toHaveTextContent('No Map');
    expect(screen.getByTestId('space-resource-graph')).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByTestId('space-resource-graph')).toHaveTextContent('No Graph');
  });
});
