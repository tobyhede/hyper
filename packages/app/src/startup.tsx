import { StrictMode, type ReactNode } from 'react';
import { createAppRouter } from './router';
import type { OpenedSpace } from './open-space';
import { mountSpaceApp } from './SpaceApp';
import { StartupFailure } from './components/StartupFailure';

export interface ApplicationRoot {
  render(children: ReactNode): void;
}

export interface OpenedApplicationStartup {
  kind: 'opened';
  opened: OpenedSpace;
}

export type ApplicationStartupResult = OpenedApplicationStartup;

export type ApplicationStartupResolver = () => Promise<ApplicationStartupResult>;

const renderOpenedSpace = (root: ApplicationRoot, opened: OpenedSpace): void => {
  mountSpaceApp(opened, (app) => {
    const AppRouter = createAppRouter(() => app);
    root.render(
      <StrictMode>
        <AppRouter />
      </StrictMode>,
    );
  });
};

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : 'An unknown startup error occurred.';

const renderStartupError = (root: ApplicationRoot, error: unknown): void => {
  root.render(<StartupFailure message={errorMessage(error)} />);
};

/** Open and render the app, replacing an empty root with diagnostics on failure. */
export const startApplication = async (
  root: ApplicationRoot,
  resolveStartup: ApplicationStartupResolver,
): Promise<void> => {
  try {
    const startup = await resolveStartup();
    const { opened } = startup;
    renderOpenedSpace(root, opened);
  } catch (error) {
    renderStartupError(root, error);
  }
};
