import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PersistenceControl } from '../src/components/PersistenceControl';

describe('PersistenceControl', () => {
  it('does not offer an unavailable remote snapshot for a coordinated conflict', () => {
    render(
      <PersistenceControl
        persistence={{ kind: 'conflicted', current: undefined }}
        onAcceptRemote={vi.fn(() => null)}
        onKeepLocal={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Reload' })).toBeDisabled();
    expect(screen.getByText(/related space changed/i)).toBeVisible();
  });
});
