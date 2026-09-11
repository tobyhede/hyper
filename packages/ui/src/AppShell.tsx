import type { ReactNode } from 'react';

export interface AppShellProps {
  /**
   * Standing chrome pinned to the top right of the main area. For a condition
   * the canvas stays usable through — one the chrome can only point at, and a
   * dialog would overstate by blocking the work that caused it.
   */
  notice?: ReactNode;
  /**
   * A width the main area yields at its end edge, for a surface overlaying it.
   *
   * The shell positions its own chrome, so it is the shell that has to know
   * something covers that edge — the canvas is pinned to it, and so is the
   * notice above. Yielding the strip rather than layering over it is what keeps
   * a Thing the reader is dragging, the Graph key and a standing notice all
   * visible beside the panel instead of behind it. Any CSS length; omitted
   * means nothing overlays and the main area is full-bleed.
   *
   * **This is not the command surface taking room.** ADR 0082 binds that the
   * Space's command surface takes no layout space from the canvas, and the
   * Command Dock takes none — it floats over `.shell__area`. The strip is the
   * Things drawer's, a surface the author opens and closes rather than furniture
   * standing on every screen.
   */
  insetEnd?: string | undefined;
  children: ReactNode;
}

/**
 * The app frame: a full-bleed canvas, and the two things pinned over it.
 *
 * **It used to be a sidebar beside a canvas, and the sidebar is what went.**
 * ADR 0053 put the Space's commands in a persistent left `Sidebar` and priced
 * the gutter honestly — sixteen rem, "the real price and it is paid on every
 * screen". ADR 0082 refuses that trade and binds the one spatial fact it kept:
 * the command surface takes no layout space from the canvas. So the registry
 * `Sidebar`, its `SidebarProvider`, its `Ctrl/Cmd-B` and the header row that
 * carried its trigger are all gone, and the Command Dock floats over the area
 * below instead. The primitive itself is deleted too, with `sheet.tsx`,
 * `skeleton.tsx` and `use-mobile.ts` behind it
 * (`.scratch/command-dock/issues/08`), so there is nothing left to compose back.
 *
 * What is left is three things a canvas cannot do for itself: pin the viewport
 * so the page never scrolls, yield the strip a drawer overlays, and give the
 * standing notice a containing block that strip has already been taken out of.
 * That is thinner than it was, and it is still the frame — the alternative is
 * every mount repeating the same three rules around its own canvas.
 */
export function AppShell({ notice, insetEnd, children }: AppShellProps) {
  return (
    <div className="shell">
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
    </div>
  );
}
