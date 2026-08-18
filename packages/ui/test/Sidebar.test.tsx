import { useEffect } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  Sidebar,
  SidebarMenuSkeleton,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from '../src/components/sidebar';

const stubViewport = (mobile: boolean): void => {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: mobile,
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  }));
};

function StateProbe({ report }: { readonly report: (open: boolean) => void }) {
  const { open } = useSidebar();
  useEffect(() => report(open), [open, report]);
  return null;
}

describe('Sidebar', () => {
  beforeEach(() => {
    document.cookie = 'sidebar_state=; max-age=0; path=/';
    stubViewport(false);
  });

  afterEach(() => vi.unstubAllGlobals());

  it('restores the remembered desktop open state', () => {
    document.cookie = 'sidebar_state=false; path=/';
    const report = vi.fn();

    render(
      <SidebarProvider>
        <StateProbe report={report} />
      </SidebarProvider>,
    );

    expect(report).toHaveBeenLastCalledWith(false);
  });

  it('does not treat Cmd/Ctrl+B typed in an editable control as a sidebar command', () => {
    const report = vi.fn();
    render(
      <SidebarProvider defaultOpen>
        <textarea aria-label="Markdown source" />
        <StateProbe report={report} />
      </SidebarProvider>,
    );

    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Markdown source' }), {
      key: 'b',
      ctrlKey: true,
    });

    expect(report).toHaveBeenLastCalledWith(true);
  });

  it('forwards mobile sidebar props to the Sheet DOM and exposes a close button', async () => {
    stubViewport(true);
    render(
      <SidebarProvider>
        <Sidebar data-testid="workspace-sidebar">Commands</Sidebar>
        <SidebarTrigger />
      </SidebarProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Toggle Sidebar' }));

    const mobileSidebar = await screen.findByTestId('workspace-sidebar');
    expect(mobileSidebar).toBeVisible();
    expect(mobileSidebar).not.toHaveClass('[&>button]:hidden');
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByTestId('workspace-sidebar')).not.toBeInTheDocument());
  });

  it('takes skeleton width from its composer instead of generating it during render', () => {
    render(<SidebarMenuSkeleton width="63%" />);

    expect(document.querySelector('[data-sidebar="menu-skeleton-text"]')).toHaveStyle({
      '--skeleton-width': '63%',
    });
  });
});
