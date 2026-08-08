import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { uuidSchema, type Graph } from '@project/core';
import { GraphSelector } from '../src/index';

const graph: Graph = {
  id: uuidSchema.parse('00000000-0000-4000-8000-000000000001'),
  title: 'Main Graph',
  edges: [],
};

describe('Graph product vocabulary', () => {
  it('names Graph controls and presentation through the public UI component', () => {
    render(
      <GraphSelector
        graphs={[graph]}
        colorByGraphId={{}}
        activeGraphId={graph.id}
        onActivate={() => undefined}
        onPresent={() => undefined}
        onExitPresenting={() => undefined}
      />,
    );

    expect(screen.getByRole('group', { name: 'Graph controls' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Active Graph' })).toHaveTextContent('Main Graph');
    expect(screen.getByRole('button', { name: 'Present this Graph' })).toBeEnabled();
  });
});
