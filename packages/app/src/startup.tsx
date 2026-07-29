import { StrictMode, type ReactNode } from 'react';
import { createAppRouter } from './router';
import type { OpenedSpace } from './open-workspace';
import { mountWorkspace } from './Workspace';

export interface ApplicationRoot {
  render(children: ReactNode): void;
}

export type WorkspaceOpener = () => Promise<OpenedSpace>;

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : 'An unknown startup error occurred.';

/** Open and render the app, replacing an empty root with diagnostics on failure. */
export const startApplication = async (
  root: ApplicationRoot,
  open: WorkspaceOpener,
): Promise<void> => {
  try {
    const opened = await open();
    mountWorkspace(opened, (app) => {
      const AppRouter = createAppRouter(() => app);
      root.render(
        <StrictMode>
          <AppRouter />
        </StrictMode>,
      );
    });
  } catch (error) {
    root.render(
      <main className="startup-error" role="alert">
        <section className="startup-error__panel">
          <h1>Application could not start</h1>
          <p>The space could not be opened.</p>
          <pre>{errorMessage(error)}</pre>
        </section>
      </main>,
    );
  }
};
