import { createRef, useEffect } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  Sidebar,
  SidebarMenuAction,
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

  /**
   * The shortcut is a *window* listener, and every open Space keeps its shell
   * mounted (`OpenSpaces` panels are `keepMounted`), so one press reaches every
   * provider in the session. Toggling the hidden ones changes chrome the reader
   * is not looking at — the same rule the presenting keys already hold, where
   * an inactive Space keeps its traversal mounted without receiving global keys.
   */
  it('withholds the global Cmd/Ctrl+B from a provider that is not the active surface', () => {
    const activeReport = vi.fn();
    const hiddenReport = vi.fn();

    render(
      <>
        <SidebarProvider defaultOpen>
          <StateProbe report={activeReport} />
        </SidebarProvider>
        <SidebarProvider defaultOpen active={false}>
          <StateProbe report={hiddenReport} />
        </SidebarProvider>
      </>,
    );

    fireEvent.keyDown(document.body, { key: 'b', ctrlKey: true });

    expect(activeReport).toHaveBeenLastCalledWith(false);
    expect(hiddenReport).toHaveBeenLastCalledWith(true);
  });

  it('forwards mobile sidebar props to the Sheet DOM and exposes a close button', async () => {
    stubViewport(true);
    render(
      <SidebarProvider>
        <Sidebar data-testid="sidebar-under-test">Commands</Sidebar>
        <SidebarTrigger />
      </SidebarProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Toggle Sidebar' }));

    const mobileSidebar = await screen.findByTestId('sidebar-under-test');
    expect(mobileSidebar).toBeVisible();
    expect(mobileSidebar).not.toHaveClass('[&>button]:hidden');
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByTestId('sidebar-under-test')).not.toBeInTheDocument());
  });

  /**
   * `toolbar.tsx` states the rule this holds the registry Sidebar to: a Base UI
   * prop type includes `ref`, so a plain function component under React 18
   * advertises one and then drops it — silently, and at the call site that
   * needed it most. A dropped ref here leaves `Menu.Trigger` with no trigger
   * element, and the menu it opens is dismissed by the same press that opened
   * it. `fireEvent.click` never reproduces that, because it fires `click`
   * alone and never the pointerdown/mouseup pair a real press does; the ref is
   * the fact underneath, so the ref is what this asserts.
   */
  it('forwards a ref to the DOM control, as a Base UI trigger render prop requires', () => {
    const ref = createRef<HTMLButtonElement>();
    render(<SidebarMenuAction ref={ref} aria-label="Row actions" />);

    expect(ref.current).toBe(screen.getByRole('button', { name: 'Row actions' }));
  });

  it('takes skeleton width from its composer instead of generating it during render', () => {
    render(<SidebarMenuSkeleton width="63%" />);

    expect(document.querySelector('[data-sidebar="menu-skeleton-text"]')).toHaveStyle({
      '--skeleton-width': '63%',
    });
  });
});
