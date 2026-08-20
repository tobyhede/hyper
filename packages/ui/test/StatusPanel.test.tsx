import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StatusBusy, StatusFailure } from '../src/index';

describe('StatusFailure', () => {
  it('announces the framing title separately from the raw diagnostic detail', () => {
    render(
      <StatusFailure
        title="Unable to open this space"
        detail="The backend could not load space 00000000-0000-4000-8000-000000000001"
        detailLabel="Workspace failure detail"
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
        detailLabel="Workspace failure detail"
        testId="workspace-failure"
      />,
    );

    expect(screen.getByTestId('workspace-failure')).toHaveAttribute('role', 'alert');
  });
});

describe('StatusBusy', () => {
  it('announces its label through a status region', () => {
    render(<StatusBusy label="Arranging…" />);

    expect(screen.getByRole('status')).toHaveTextContent('Arranging…');
  });
});
