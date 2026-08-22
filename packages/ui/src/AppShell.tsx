import type { ReactNode } from 'react';
import { SidebarInset, SidebarProvider, SidebarTrigger } from './components/sidebar';

export interface AppShellProps {
  /** The application's own `Sidebar`: the persistent command surface (ADR 0053). */
  sidebar: ReactNode;
  /** What the canvas header says beside the sidebar trigger — the current canvas. */
  header?: ReactNode;
  /**
   * Standing chrome pinned to the top right of the main area, directly under
   * the canvas header. For a condition the canvas stays usable through — one
   * the chrome can only point at, and a dialog would overstate by blocking the
   * work that caused it.
   */
  notice?: ReactNode;
  children: ReactNode;
}

/**
 * The app frame: a persistent sidebar beside a full-bleed canvas.
 *
 * The header is the inset's, not the page's, so it survives the sidebar being
 * closed and keeps the one control that reopens it. It deliberately carries no
 * Space title: the sidebar header names the Space and this names what is
 * drawing it (ADR 0053).
 */
export function AppShell({ sidebar, header, notice, children }: AppShellProps) {
  return (
    <SidebarProvider className="shell">
      {sidebar}
      <SidebarInset className="min-h-0">
        <header className="shell__header">
          {/* `nokey` for the same reason every other chrome control carries it:
              React Flow's delete key listens on `document`, and this button sits
              outside the canvas with nothing above it to exclude it. */}
          <SidebarTrigger className="nokey" />
          {header}
        </header>
        <div className="shell__main">
          {children}
          {/* The slot is unconditional and its own CSS hides it while the notice
              renders nothing, so a caller passes one component for the whole
              condition rather than repeating that component's own test here. */}
          <div className="shell__notice">{notice}</div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
