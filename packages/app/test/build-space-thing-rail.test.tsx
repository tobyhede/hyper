import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { uuidSchema, type ThingDocument } from '@project/core';
import { ThingRailActions } from '@project/ui';
import { buildSpaceThingRail } from '../src/build-space-thing-rail';
import type { SpaceThingTarget } from '../src/space-thing-lifecycle';

beforeAll(() => {
  HTMLElement.prototype.hasPointerCapture = () => false;
  HTMLElement.prototype.setPointerCapture = () => undefined;
  HTMLElement.prototype.releasePointerCapture = () => undefined;
});

const TARGET_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000020');
const FIRST_DIAGRAM_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000022');
const FIRST_GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000023');
const SECOND_GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000024');
const SECOND_DIAGRAM_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000025');
const THIRD_GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000026');
const THIRD_DIAGRAM_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000027');
const FOURTH_GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000028');
const FIFTH_GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000029');

const target: SpaceThingTarget = {
  id: TARGET_ID,
  title: 'Architecture',
  diagrams: [
    {
      id: FIRST_DIAGRAM_ID,
      title: 'Collection 1',
      graphs: [
        { id: FIRST_GRAPH_ID, title: 'Overview' },
        { id: SECOND_GRAPH_ID, title: 'Detail' },
      ],
    },
    {
      id: SECOND_DIAGRAM_ID,
      title: 'Collection 2',
      graphs: [{ id: THIRD_GRAPH_ID, title: 'Second pass' }],
    },
    {
      id: THIRD_DIAGRAM_ID,
      title: 'Collection 3',
      graphs: [
        { id: FOURTH_GRAPH_ID, title: 'Draft' },
        { id: FIFTH_GRAPH_ID, title: 'Current' },
      ],
      activeGraph: FIFTH_GRAPH_ID,
    },
  ],
};

const documentOf = (
  diagram: typeof FIRST_DIAGRAM_ID,
  graph: typeof FIRST_GRAPH_ID,
): Extract<ThingDocument, { kind: 'space' }> => ({
  title: 'Elsewhere',
  kind: 'space',
  spaceId: TARGET_ID,
  diagram,
  graph,
});

const mountRail = (rail: ReturnType<typeof buildSpaceThingRail>) =>
  render(<ThingRailActions aria-label="Thing rail">{rail}</ThingRailActions>);

describe('buildSpaceThingRail', () => {
  it('seeds both selectors from the Thing’s stored selection', () => {
    mountRail(
      buildSpaceThingRail({
        target,
        document: documentOf(FIRST_DIAGRAM_ID, FIRST_GRAPH_ID),
        disabled: false,
        complete: () => null,
        onReport: () => undefined,
        context: undefined,
      }),
    );

    expect(screen.getByRole('button', { name: 'Diagram: Collection 1' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Graph: Overview' })).toBeEnabled();
  });

  /**
   * Choosing a Diagram re-seeds the Graph from that Diagram's Active Graph,
   * falling back to the head of its list. Leaving the previous Diagram's Graph
   * in place is a Thing the aggregate refuses.
   */
  it('completes a chosen Diagram with that Diagram’s Active Graph', () => {
    const complete = vi.fn(() => null);
    mountRail(
      buildSpaceThingRail({
        target,
        document: documentOf(FIRST_DIAGRAM_ID, FIRST_GRAPH_ID),
        disabled: false,
        complete,
        onReport: () => undefined,
        context: undefined,
      }),
    );

    fireEvent.click(screen.getByTestId('space-thing-diagram'));
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Collection 3' }));

    expect(complete).toHaveBeenCalledWith(
      expect.objectContaining({ id: THIRD_DIAGRAM_ID }),
      FIFTH_GRAPH_ID,
    );
  });

  it('draws a selection the target no longer holds as unavailable', () => {
    mountRail(
      buildSpaceThingRail({
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

    expect(screen.getByTestId('space-thing-diagram')).toHaveTextContent('No Diagram');
    expect(screen.getByTestId('space-thing-graph')).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByTestId('space-thing-graph')).toHaveTextContent('No Graph');
  });
});
