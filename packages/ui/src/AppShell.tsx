import type { ReactNode } from 'react';

export interface AppShellProps {
  title: string;
  toolbar?: ReactNode;
  children: ReactNode;
}

/** Minimal app frame: a header with a toolbar slot and a full-bleed main area. */
export function AppShell({ title, toolbar, children }: AppShellProps) {
  return (
    <div className="shell">
      <header className="shell__header">
        <h1 className="shell__title">{title}</h1>
        <div className="shell__toolbar">{toolbar}</div>
      </header>
      <main className="shell__main">{children}</main>
    </div>
  );
}
