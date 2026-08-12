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

const CARD_A = uuidSchema.parse('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
const CARD_B = uuidSchema.parse('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');

/**
 * Two Graphs that hold an Edge each, so both can be presented. Emptiness is what
 * the Present control is dead on, so a fixture that was empty everywhere could
 * not tell the enabled case from the disabled one.
 */
const graphs: readonly Graph[] = [
  {
    id: uuidSchema.parse('11111111-1111-4111-8111-111111111111'),
    title: 'Long graph',
    color: '#6ea8fe',
    edges: [{ from: CARD_A, to: CARD_B }],
  },
  {
    id: uuidSchema.parse('22222222-2222-4222-8222-222222222222'),
    title: 'Short graph',
    color: '#f4a259',
    edges: [{ from: CARD_B, to: CARD_A }],
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
        colorByGraphId={{
          [graphs[0]!.id]: '#6ea8fe',
          [graphs[1]!.id]: '#f4a259',
        }}
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

  it('uses the resolved Graph colours shared with the canvas', () => {
    render(
      <GraphSelector
        graphs={graphs}
        colorByGraphId={{
          [graphs[0]!.id]: '#112233',
          [graphs[1]!.id]: '#445566',
        }}
        activeGraphId={graphs[1]?.id ?? null}
        onActivate={() => undefined}
        onPresent={() => undefined}
        onExitPresenting={() => undefined}
      />,
    );

    expect(
      screen.getByRole('combobox', { name: 'Active Graph' }).querySelector('svg'),
    ).toHaveAttribute('stroke', '#445566');
    expect(
      screen.getByRole('button', { name: 'Present this Graph' }).querySelector('svg'),
    ).toHaveAttribute('fill', '#445566');

    fireEvent.keyDown(screen.getByRole('combobox', { name: 'Active Graph' }), { key: 'ArrowDown' });
    const options = screen.getAllByRole('option');
    expect(options[0]?.querySelector('[aria-hidden="true"]')).toHaveStyle({
      background: '#112233',
    });
    expect(options[1]?.querySelector('[aria-hidden="true"]')).toHaveStyle({
      background: '#445566',
    });
  });

  it('falls back to authored colours when the resolved map is partial', () => {
    render(
      <GraphSelector
        graphs={graphs}
        colorByGraphId={{ [graphs[0]!.id]: '#112233' }}
        activeGraphId={graphs[1]?.id ?? null}
        onActivate={() => undefined}
        onPresent={() => undefined}
        onExitPresenting={() => undefined}
      />,
    );

    expect(
      screen.getByRole('combobox', { name: 'Active Graph' }).querySelector('svg'),
    ).toHaveAttribute('stroke', '#f4a259');
    expect(
      screen.getByRole('button', { name: 'Present this Graph' }).querySelector('svg'),
    ).toHaveAttribute('fill', '#f4a259');

    fireEvent.keyDown(screen.getByRole('combobox', { name: 'Active Graph' }), { key: 'ArrowDown' });
    const options = screen.getAllByRole('option');
    expect(options[0]?.querySelector('[aria-hidden="true"]')).toHaveStyle({
      background: '#112233',
    });
    expect(options[1]?.querySelector('[aria-hidden="true"]')).toHaveStyle({
      background: '#f4a259',
    });
  });

  it('disables Present when there is no active Graph', () => {
    render(
      <GraphSelector
        graphs={graphs}
        colorByGraphId={{}}
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
        colorByGraphId={{}}
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

  /**
   * A Layout is created with its initial Active Graph empty (ADR 0040), so this
   * is the state every conversion out of an Algorithmic View leaves behind until
   * the author draws an Edge. `graphStartCard` has no answer for it, so
   * `present()` would return having changed nothing — the control must say so
   * rather than accept a click and do nothing.
   */
  it('cannot present an active Graph that holds no Edges', () => {
    const empty: Graph = {
      id: uuidSchema.parse('33333333-3333-4333-8333-333333333333'),
      title: 'Graph 1',
      edges: [],
    };
    const onPresent = vi.fn();
    render(
      <GraphSelector
        graphs={[empty]}
        colorByGraphId={{}}
        activeGraphId={empty.id}
        onActivate={() => undefined}
        onPresent={onPresent}
        onExitPresenting={() => undefined}
      />,
    );

    const present = screen.getByRole('button', { name: 'Present this Graph' });
    expect(present).toBeDisabled();
    fireEvent.click(present);
    expect(onPresent).not.toHaveBeenCalled();
  });

  it('exits presenting through the Overview action', () => {
    const onExitPresenting = vi.fn();
    const onPresent = vi.fn();
    render(
      <GraphSelector
        graphs={graphs}
        colorByGraphId={{}}
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
