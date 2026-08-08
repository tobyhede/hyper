import { fireEvent, render, screen } from '@testing-library/react';
import { beforeAll, describe, expect, expectTypeOf, it, vi } from 'vitest';
import { uuidSchema, type Graph } from '@project/core';
import { GraphSelector, type GraphSelectorProps } from '../src/index';

beforeAll(() => {
  HTMLElement.prototype.hasPointerCapture = () => false;
  HTMLElement.prototype.setPointerCapture = () => undefined;
  HTMLElement.prototype.releasePointerCapture = () => undefined;
  HTMLElement.prototype.scrollIntoView = () => undefined;
});

const graphs: readonly Graph[] = [
  {
    id: uuidSchema.parse('11111111-1111-4111-8111-111111111111'),
    title: 'Long graph',
    color: '#6ea8fe',
    edges: [],
  },
  {
    id: uuidSchema.parse('22222222-2222-4222-8222-222222222222'),
    title: 'Short graph',
    color: '#f4a259',
    edges: [],
  },
];

describe('GraphSelector', () => {
  it('requires an exit action for every presenting state', () => {
    expectTypeOf<GraphSelectorProps['onExitPresenting']>().toEqualTypeOf<() => void>();
  });

  it('joins the active Graph selector to the graph-coloured Present action', () => {
    const onPresent = vi.fn();
    render(
      <GraphSelector
        graphs={graphs}
        activeGraphId={graphs[1]?.id ?? null}
        onActivate={() => undefined}
        onPresent={onPresent}
        onExitPresenting={() => undefined}
      />,
    );

    const group = screen.getByRole('group', { name: 'Graph controls' });
    const trigger = screen.getByRole('combobox', { name: 'Active Graph' });
    const present = screen.getByRole('button', { name: 'Present this Graph' });

    expect(group).toContainElement(trigger);
    expect(group).toContainElement(present);
    expect(trigger).toHaveAttribute('title', 'Active Graph');
    expect(trigger).toHaveTextContent('Short graph');
    expect(trigger.querySelector('svg')).toHaveAttribute('stroke', '#f4a259');
    expect(present).toHaveAttribute('title', 'Present this Graph');
    expect(present.querySelector('svg')).toHaveAttribute('fill', '#f4a259');

    fireEvent.click(present);
    expect(onPresent).toHaveBeenCalledOnce();
  });

  it('disables Present when there is no active Graph', () => {
    render(
      <GraphSelector
        graphs={graphs}
        activeGraphId={null}
        onActivate={() => undefined}
        onPresent={() => undefined}
        onExitPresenting={() => undefined}
      />,
    );

    expect(screen.getByRole('combobox', { name: 'Active Graph' })).toHaveTextContent('None');
    expect(screen.getByRole('button', { name: 'Present this Graph' })).toBeDisabled();
  });

  it('activates the chosen Graph', () => {
    const onActivate = vi.fn();
    render(
      <GraphSelector
        graphs={graphs}
        activeGraphId={graphs[1]?.id ?? null}
        onActivate={onActivate}
        onPresent={() => undefined}
        onExitPresenting={() => undefined}
      />,
    );

    fireEvent.keyDown(screen.getByRole('combobox', { name: 'Active Graph' }), { key: 'ArrowDown' });
    fireEvent.click(screen.getByRole('option', { name: /Long graph/ }));

    expect(onActivate).toHaveBeenCalledOnce();
    expect(onActivate).toHaveBeenCalledWith(graphs[0]?.id);
  });

  it('exits presenting through the Overview action', () => {
    const onExitPresenting = vi.fn();
    const onPresent = vi.fn();
    render(
      <GraphSelector
        graphs={graphs}
        activeGraphId={graphs[1]?.id ?? null}
        onActivate={() => undefined}
        onPresent={onPresent}
        presenting
        onExitPresenting={onExitPresenting}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Return to overview' }));

    expect(onExitPresenting).toHaveBeenCalledOnce();
    expect(onPresent).not.toHaveBeenCalled();
  });
});
