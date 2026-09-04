import { type ButtonHTMLAttributes, type HTMLAttributes, type ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

/**
 * Keep the primitive boundary observable without testing Base UI's own menu
 * implementation. The shared DropdownMenu facade must still compose the
 * installed Base UI Menu rather than reproduce its behavior.
 */
vi.mock('@base-ui/react/menu', () => ({
  Menu: {
    Root: ({ children }: { children: ReactNode }) => (
      <div data-testid="base-ui-menu-root">{children}</div>
    ),
    Trigger: ({ children, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) => (
      <button {...props}>{children}</button>
    ),
    Portal: ({ children }: { children: ReactNode }) => <>{children}</>,
    Positioner: ({
      children,
      sideOffset: _sideOffset,
      alignOffset: _alignOffset,
      side: _side,
      align: _align,
      ...props
    }: HTMLAttributes<HTMLDivElement> & {
      readonly sideOffset?: number;
      readonly alignOffset?: number;
      readonly side?: string;
      readonly align?: string;
    }) => <div {...props}>{children}</div>,
    Popup: ({
      children,
      finalFocus: _finalFocus,
      ...props
    }: HTMLAttributes<HTMLDivElement> & { readonly finalFocus?: unknown }) => (
      <div {...props}>{children}</div>
    ),
    Group: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    Item: ({ children, ...props }: HTMLAttributes<HTMLDivElement>) => (
      <div {...props}>{children}</div>
    ),
  },
}));

import { AddCardControl } from '../src/AddCardControl';

describe('AddCardControl menu boundary', () => {
  it('composes the shared DropdownMenu through the Base UI Menu primitive', () => {
    render(
      <AddCardControl
        onAddCard={() => undefined}
        onAddAlias={() => undefined}
        onAddSpaceCard={() => undefined}
      />,
    );

    expect(screen.getByTestId('base-ui-menu-root')).toBeInTheDocument();
  });
});
