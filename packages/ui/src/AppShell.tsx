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
 * **The command surface takes no layout space from the canvas** (ADR 0082): the
 * Command Dock floats over the main area, and no gutter or strip is yielded
 * beside it.
 *
 * The frame has two responsibilities a canvas cannot fulfil itself: pin the
 * viewport so the page never scrolls, and give the standing notice a containing
 * block to be positioned against. Without it every mount would repeat the same
 * rules around its own canvas.
 *
 * The main area is that containing block itself. It carries no padding, so its
 * padding box — the one an absolutely positioned box resolves against — and its
 * content box coincide, and one element does both jobs. Do not pad it without
 * moving the notice's containing block to a child.
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
