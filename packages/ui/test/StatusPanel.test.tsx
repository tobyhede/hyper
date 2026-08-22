import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StatusBusy, StatusFailure } from '../src/index';

describe('StatusFailure', () => {
  it('announces the framing title separately from the raw diagnostic detail', () => {
    render(
      <StatusFailure
        title="Unable to open this space"
        detail="The backend could not load space 00000000-0000-4000-8000-000000000001"
        detailLabel="Space app failure detail"
      />,
    );

    const alert = screen.getByRole('alert');
    expect(within(alert).getByText('Unable to open this space')).toBeVisible();
    expect(alert).toHaveTextContent(
      'The backend could not load space 00000000-0000-4000-8000-000000000001',
    );
  });

  it('includes an optional description alongside the title', () => {
    render(
      <StatusFailure
        title="Application could not start"
        description="The space could not be opened."
        detail="boom"
        detailLabel="Startup failure detail"
      />,
    );

    expect(screen.getByText('The space could not be opened.')).toBeVisible();
  });

  it('gives the bounded detail a tab stop and a name to reach it by', () => {
    render(
      <StatusFailure
        title="Unable to arrange this view"
        detail="No position for Card A"
        detailLabel="Placement failure detail"
      />,
    );

    const detail = screen.getByRole('region', { name: 'Placement failure detail' });
    detail.focus();

    expect(detail).toHaveFocus();
    expect(detail).toHaveTextContent('No position for Card A');
  });

  it('exposes an optional test id on the announced alert', () => {
    render(
      <StatusFailure
        title="Unable to open this space"
        detail="boom"
        detailLabel="Space app failure detail"
        testId="space-app-failure"
      />,
    );

    expect(screen.getByTestId('space-app-failure')).toHaveAttribute('role', 'alert');
  });

  it('exposes the title as a heading, so it is reachable by heading navigation', () => {
    render(
      <StatusFailure
        title="Application could not start"
        detail="boom"
        detailLabel="Startup failure detail"
      />,
    );

    expect(screen.getByRole('heading', { name: 'Application could not start' })).toBeVisible();
  });

  it('leaves the detail unbounded by default', () => {
    render(
      <StatusFailure
        title="Application could not start"
        detail="boom"
        detailLabel="Startup failure detail"
      />,
    );

    expect(screen.getByRole('region', { name: 'Startup failure detail' }).className).not.toMatch(
      /max-h-/,
    );
  });

  it('bounds the detail to a scrolling region when the caller opts in', () => {
    render(
      <StatusFailure
        title="Unable to arrange this view"
        detail="No position for Card A"
        detailLabel="Placement failure detail"
        boundedDetail
      />,
    );

    expect(screen.getByRole('region', { name: 'Placement failure detail' }).className).toMatch(
      /max-h-\[40vh\]/,
    );
  });

  it('defaults the panel to a standard width', () => {
    render(
      <StatusFailure
        title="Unable to open this space"
        detail="boom"
        detailLabel="Space app failure detail"
      />,
    );

    expect(screen.getByRole('alert').className).toMatch(/max-w-2xl/);
  });

  it('lets a caller override the panel width', () => {
    render(
      <StatusFailure
        title="Application could not start"
        detail="boom"
        detailLabel="Startup failure detail"
        panelClassName="max-w-3xl"
      />,
    );

    const alert = screen.getByRole('alert');
    expect(alert.className).toMatch(/max-w-3xl/);
    expect(alert.className).not.toMatch(/max-w-2xl\b/);
  });
});

describe('StatusBusy', () => {
  it('announces its label through a status region', () => {
    render(<StatusBusy label="Arranging…" />);

    expect(screen.getByRole('status')).toHaveTextContent('Arranging…');
  });

  it('does not give its decorative spinner its own competing status role', () => {
    const { container } = render(<StatusBusy label="Arranging…" />);

    const spinner = container.querySelector('[data-slot="spinner"]');
    expect(spinner).not.toBeNull();
    expect(spinner).not.toHaveAttribute('role');
    expect(spinner).not.toHaveAttribute('aria-label');
    expect(spinner).toHaveAttribute('aria-hidden', 'true');
  });
});
