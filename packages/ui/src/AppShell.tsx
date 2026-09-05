import type { ReactNode } from 'react';
import { SidebarInset, SidebarProvider, SidebarTrigger } from './components/sidebar';

export interface AppShellProps {
  sidebarWidth?: string | undefined;
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
  /**
   * A width the main area yields at its end edge, for a surface overlaying it.
   *
   * The shell positions its own chrome, so it is the shell that has to know
   * something covers that edge — the canvas is pinned to it, and so is the
   * notice above. Yielding the strip rather than layering over it is what keeps
   * a Card the reader is dragging, the Graph key and a standing notice all
   * visible beside the panel instead of behind it. Any CSS length; omitted
   * means nothing overlays and the main area is full-bleed.
   */
  insetEnd?: string | undefined;
  /**
   * Whether this shell is the one on screen.
   *
   * A session mounts one shell per open Space and shows one of them, so the
   * sidebar's `Ctrl/Cmd-B` — a `window` listener — would otherwise toggle the
   * sidebars of Spaces nobody is looking at. Omitted means there is only this
   * one and it is showing.
   */
  active?: boolean | undefined;
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
export function AppShell({
  sidebar,
  header,
  notice,
  insetEnd,
  sidebarWidth,
  active = true,
  children,
}: AppShellProps) {
  const style =
    sidebarWidth === undefined ? undefined : { width: '100%', '--sidebar-width': sidebarWidth };
  return (
    <SidebarProvider className="shell" style={style} active={active}>
      {sidebar}
      <SidebarInset className="min-h-0">
        <header className="shell__header">
          {/* React Flow's live Space-key pan activation subscription reaches
              this chrome button outside the canvas, so `.nokey` excludes it. */}
          <SidebarTrigger className="nokey" />
          {header}
        </header>
        <div className="shell__main" style={{ paddingInlineEnd: insetEnd }}>
          {/* The padding is the yielded strip, and this fills what is left of it.
              An absolutely positioned box resolves against its containing block's
              *padding* box, so the notice below would ignore that padding and sit
              under the overlay — this element is what gives it a containing block
              the strip has already been taken out of. */}
          <div className="shell__area">
            {children}
            {/* The slot is unconditional and its own CSS hides it while the notice
                renders nothing, so a caller passes one component for the whole
                condition rather than repeating that component's own test here. */}
            <div className="shell__notice">{notice}</div>
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
