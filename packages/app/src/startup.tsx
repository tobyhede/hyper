import { StrictMode, type ReactNode } from 'react';
import type { UUID } from '@project/core';
import type { SpaceSummary } from '@project/persistence';
import { createAppRouter } from './router';
import type { OpenedSpace } from './open-workspace';
import { mountWorkspace } from './Workspace';

export interface ApplicationRoot {
  render(children: ReactNode): void;
}

export interface OpenedApplicationStartup {
  kind: 'opened';
  opened: OpenedSpace;
}

export interface SelectionApplicationStartup {
  kind: 'selection';
  spaces: readonly SpaceSummary[];
}

export type ApplicationStartupResult = OpenedApplicationStartup | SelectionApplicationStartup;

export type ApplicationStartupResolver = () => Promise<ApplicationStartupResult>;
export type WorkspaceSelectionOpener = (id: UUID) => Promise<OpenedSpace>;

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : 'An unknown startup error occurred.';

const renderOpenedWorkspace = (root: ApplicationRoot, opened: OpenedSpace): void => {
  mountWorkspace(opened, (app) => {
    const AppRouter = createAppRouter(() => app);
    root.render(
      <StrictMode>
        <AppRouter />
      </StrictMode>,
    );
  });
};

const renderStartupError = (root: ApplicationRoot, error: unknown): void => {
  root.render(
    <main className="startup-error" role="alert">
      <section className="startup-error__panel">
        <h1>Application could not start</h1>
        <p>The space could not be opened.</p>
        <pre>{errorMessage(error)}</pre>
      </section>
    </main>,
  );
};

/** Open and render the app, replacing an empty root with diagnostics on failure. */
export const startApplication = async (
  root: ApplicationRoot,
  resolveStartup: ApplicationStartupResolver,
  openSelected?: WorkspaceSelectionOpener,
): Promise<void> => {
  try {
    const startup = await resolveStartup();
    if (startup.kind === 'selection') {
      if (openSelected === undefined) {
        throw new Error('No workspace selection opener was configured.');
      }
      root.render(
        <StrictMode>
          <main className="workspace-selection">
            <section className="workspace-selection__panel">
              <h1>Choose a space</h1>
              <div className="workspace-selection__choices">
                {startup.spaces.map((space) => (
                  <button
                    key={space.id}
                    type="button"
                    onClick={() => {
                      void openSelected(space.id)
                        .then((opened) => {
                          renderOpenedWorkspace(root, opened);
                        })
                        .catch((error: unknown) => {
                          renderStartupError(root, error);
                        });
                    }}
                  >
                    <span>{space.title}</span>
                    <span>{space.id}</span>
                  </button>
                ))}
              </div>
            </section>
          </main>
        </StrictMode>,
      );
      return;
    }

    const { opened } = startup;
    renderOpenedWorkspace(root, opened);
  } catch (error) {
    renderStartupError(root, error);
  }
};
