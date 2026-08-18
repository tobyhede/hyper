import { fireEvent, render, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { uuidSchema, type Graph } from '@project/core';
import { GraphSelector } from '../src/index';

beforeAll(() => {
  HTMLElement.prototype.hasPointerCapture = () => false;
  HTMLElement.prototype.setPointerCapture = () => undefined;
  HTMLElement.prototype.releasePointerCapture = () => undefined;
  HTMLElement.prototype.scrollIntoView = () => undefined;
});

const CARD_A = uuidSchema.parse('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
const CARD_B = uuidSchema.parse('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');

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
  it('stays controlled when the first conversion mints a Space its Graph', () => {
    // A Space with no Layout owns no Graph either (ADR 0040), so Base UI's
    // controlled value starts null and conversion mints the Graph it becomes.
    const warnings: string[] = [];
    vi.spyOn(console, 'warn').mockImplementation((first: unknown) => {
      warnings.push(String(first));
    });

    const { rerender } = render(
      <GraphSelector graphs={[]} colorByGraphId={{}} activeGraphId={null} onActivate={vi.fn()} />,
    );
    rerender(
      <GraphSelector
        graphs={graphs}
        colorByGraphId={{ [graphs[0]!.id]: '#6ea8fe' }}
        activeGraphId={graphs[0]!.id}
        onActivate={vi.fn()}
      />,
    );

    expect(warnings).toEqual([]);
    expect(screen.getByRole('combobox', { name: 'Active Graph' })).toHaveTextContent('Long graph');
  });

  it('uses the resolved Graph colours shared with the canvas', () => {
    render(
      <GraphSelector
        graphs={graphs}
        colorByGraphId={{ [graphs[0]!.id]: '#112233', [graphs[1]!.id]: '#445566' }}
        activeGraphId={graphs[1]?.id ?? null}
        onActivate={() => undefined}
      />,
    );

    const trigger = screen.getByRole('combobox', { name: 'Active Graph' });
    expect(trigger).toHaveAttribute('title', 'Active Graph · Short graph');
    expect(trigger.querySelector('svg')).toHaveAttribute('stroke', '#445566');

    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
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
      />,
    );

    const trigger = screen.getByRole('combobox', { name: 'Active Graph' });
    expect(trigger.querySelector('svg')).toHaveAttribute('stroke', '#f4a259');

    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    const options = screen.getAllByRole('option');
    expect(options[1]?.querySelector('[aria-hidden="true"]')).toHaveStyle({
      background: '#f4a259',
    });
  });

  it('names no Graph when a Space has none, and reserves no live-Layout dot', () => {
    render(
      <GraphSelector graphs={[]} colorByGraphId={{}} activeGraphId={null} onActivate={vi.fn()} />,
    );

    expect(screen.getByRole('combobox', { name: 'Active Graph' })).toHaveTextContent('None');
    expect(screen.queryByTestId('layout-live-indicator')).not.toBeInTheDocument();
  });

  it('activates the chosen Graph', () => {
    const onActivate = vi.fn();
    render(
      <GraphSelector
        graphs={graphs}
        colorByGraphId={{}}
        activeGraphId={graphs[1]?.id ?? null}
        onActivate={onActivate}
      />,
    );

    fireEvent.keyDown(screen.getByRole('combobox', { name: 'Active Graph' }), { key: 'ArrowDown' });
    const graph = screen.getByRole('option', { name: /Long graph/ });
    fireEvent.pointerDown(graph, { pointerType: 'mouse' });
    fireEvent.click(graph);

    expect(onActivate).toHaveBeenCalledOnce();
    expect(onActivate).toHaveBeenCalledWith(graphs[0]?.id);
  });
});
