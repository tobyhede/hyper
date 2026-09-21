import type { ReactNode } from 'react';

export interface AppShellProps {
  /**
   * Standing chrome pinned to the top right of the main area. For a condition
   * the canvas stays usable through — one the chrome can only point at, and a
   * dialog would overstate by blocking the work that caused it.
   */
  notice?: ReactNode;
  children: ReactNode;
}

/**
 * The app frame: a full-bleed canvas, and the two surfaces pinned over it.
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
 * What is left is two responsibilities a canvas cannot fulfil itself: pin the
 * viewport so the page never scrolls, and give the standing notice a containing
 * block to be positioned against. That is thinner than it was, and it is still the
 * frame — the alternative is every mount repeating the same rules around its
 * own canvas.
 *
 * The main area is that containing block itself, which is why there are two
 * elements here rather than three. A `.shell__area` child used to carry the
 * `position: relative` because this element carried an inline
 * `padding-inline-end` for the strip a drawer overlaid, and an absolutely
 * positioned box resolves against its containing block's *padding* box — so the
 * notice would have ignored the padding and sat under the drawer. Nothing yields
 * a strip now, so the two boxes coincide and one element does both jobs.
 */
export function AppShell({ notice, children }: AppShellProps) {
  return (
    <div className="shell">
      <div className="shell__main">
        {children}
        {/* The slot is unconditional and its own CSS hides it while the notice
            renders nothing, so a caller passes one component for the whole
            condition rather than repeating that component's own test here. */}
        <div className="shell__notice">{notice}</div>
      </div>
    </div>
  );
}
