import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { EDGE_TITLE_CEILING, EdgeTitle, EdgeToolbar, type EdgeTitleProps } from '../src/index';

const STROKE = { color: '#2a6fb0', width: 3 } as const;

const renderTitle = (props: Partial<EdgeTitleProps> = {}) =>
  render(
    <EdgeTitle
      title="depends on"
      name="depends on"
      hidden={false}
      revealed={false}
      room={{ kind: 'fitted', width: 120 }}
      stroke={STROKE}
      onBeginEdit={() => undefined}
      {...props}
    />,
  );

/** At rest, revealed or being written: the mounting Edge picks the state; this draws it. */
describe('EdgeTitle', () => {
  it('draws a titled Edge at rest as a box fitted to its room, whole in its tooltip', () => {
    const { container } = renderTitle();

    const box = screen.getByTitle('depends on');
    expect(box).toHaveTextContent('depends on');
    expect(box.style.maxWidth).toBe('120px');
    // The Edge's own stroke, handed to the stylesheet that draws the border.
    expect(box.style.getPropertyValue('--edge-title-stroke')).toBe('#2a6fb0');
    expect(box.style.getPropertyValue('--edge-title-stroke-width')).toBe('3');
    expect(container.querySelector('button')).toBeNull();
  });

  it.each([
    ['an untitled Edge', { title: null }],
    ['a hidden Title', { hidden: true }],
    ['an Edge too short to hold one', { room: { kind: 'none' } as const }],
  ] as const)('draws nothing at rest for %s', (_name, props) => {
    const { container } = renderTitle(props);

    expect(container).toBeEmptyDOMElement();
  });

  it('becomes the control that writes it while revealed, whole and dimmed when hidden', () => {
    const onBeginEdit = vi.fn();
    renderTitle({ revealed: true, hidden: true, room: { kind: 'none' }, onBeginEdit });

    const control = screen.getByRole('button', { name: 'Edit Title depends on' });
    expect(control).toHaveAttribute('data-hidden', 'true');
    // Whole: no room applied, the ceiling is the stylesheet's.
    expect(control.style.maxWidth).toBe('');
    fireEvent.click(control);
    expect(onBeginEdit).toHaveBeenCalledOnce();
  });

  it('swaps in the edge field while written, and leaves its reason to the region named', () => {
    renderTitle({
      editor: {
        onComplete: () => 'An Edge title must be one line.',
        onCancel: () => undefined,
        onReturnFocus: () => undefined,
        errorShownBy: 'edge-refusal',
      },
    });

    const field = screen.getByRole('textbox', { name: 'Edge Title' });
    expect(field).toHaveValue('depends on');
    expect(field).toHaveClass('inline-title-editor__edge-field');
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(field).toHaveAttribute('aria-describedby', 'edge-refusal');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('draws its ceiling at the width the fitting rule reckons with', () => {
    const sheet = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '../src/edge-title.css'),
      'utf8',
    );

    expect(sheet).toContain(`--edge-title-ceiling: ${EDGE_TITLE_CEILING}px;`);
  });
});

describe('EdgeToolbar', () => {
  const renderToolbar = (title: 'none' | 'shown' | 'hidden', writingTitle = false) => {
    const handlers = { onEdit: vi.fn(), onToggleTitle: vi.fn(), onDelete: vi.fn() };
    render(<EdgeToolbar name="A → B" title={title} writingTitle={writingTitle} {...handlers} />);
    return handlers;
  };

  it('is one toolbar named for the Edge, with its commands in one named group', () => {
    renderToolbar('shown');

    const toolbar = screen.getByRole('toolbar', { name: 'Edge A → B' });
    expect(toolbar).toContainElement(screen.getByRole('group', { name: 'Edge commands' }));
    expect(
      screen.getAllByRole('button').map((button) => button.getAttribute('aria-label')),
    ).toEqual(['Edit Edge A → B', 'Hide Title A → B', 'Delete Edge A → B']);
  });

  it('names the eye for what pressing it does, and runs each command', () => {
    const handlers = renderToolbar('hidden');

    fireEvent.click(screen.getByRole('button', { name: 'Edit Edge A → B' }));
    fireEvent.click(screen.getByRole('button', { name: 'Show Title A → B' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete Edge A → B' }));

    expect(handlers.onEdit).toHaveBeenCalledOnce();
    expect(handlers.onToggleTitle).toHaveBeenCalledOnce();
    expect(handlers.onDelete).toHaveBeenCalledOnce();
  });

  /** The eye reads the projected Title, not the draft, so it could hide a Title the draft is clearing. */
  it('keeps the eye in place, disabled, while the Title is being written', () => {
    const handlers = renderToolbar('shown', true);

    const eye = screen.getByRole('button', { name: 'Hide Title A → B' });
    expect(eye).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(eye);
    expect(handlers.onToggleTitle).not.toHaveBeenCalled();
  });

  it('keeps the eye in place, disabled, when the Edge has no Title', () => {
    const handlers = renderToolbar('none');

    const eye = screen.getByRole('button', { name: 'Hide Title A → B' });
    expect(eye).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(eye);
    expect(handlers.onToggleTitle).not.toHaveBeenCalled();
  });
});
