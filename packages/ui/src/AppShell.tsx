import type { ReactNode } from 'react';

export interface AppShellProps {
  title: string;
  toolbar?: ReactNode;
  /**
   * Standing chrome pinned to the top right of the main area, directly under
   * the toolbar. For a condition the workspace stays usable through — one the
   * toolbar can only point at, and a dialog would overstate by blocking the
   * work that caused it.
   */
  notice?: ReactNode;
  children: ReactNode;
}

/** Minimal app frame: a header with a toolbar slot and a full-bleed main area. */
export function AppShell({ title, toolbar, notice, children }: AppShellProps) {
  return (
    <div className="shell">
      <header className="shell__header">
        <h1 className="shell__title">{title}</h1>
        <div className="shell__toolbar">{toolbar}</div>
      </header>
      <main className="shell__main">
        {children}
        {/* The slot is unconditional and its own CSS hides it while the notice
            renders nothing, so a caller passes one component for the whole
            condition rather than repeating that component's own test here. */}
        <div className="shell__notice">{notice}</div>
      </main>
    </div>
  );
}
