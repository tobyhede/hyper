import { StrictMode, type ReactNode } from 'react';
import type { UUID } from '@project/core';
import type { SpaceSummary } from '@project/persistence';
import { createAppRouter } from './router';
import type { OpenedSpace } from './open-space';
import { mountSpaceApp } from './SpaceApp';
import { StartupFailure } from './components/StartupFailure';
import { SpaceSelection } from './SpaceSelection';

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
export type SpaceSelectionOpener = (id: UUID) => Promise<OpenedSpace>;

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
  openSelected?: SpaceSelectionOpener,
): Promise<void> => {
  try {
    const startup = await resolveStartup();
    if (startup.kind === 'selection') {
      if (openSelected === undefined) {
        throw new Error('No space selection opener was configured.');
      }
      root.render(
        <StrictMode>
          <SpaceSelection
            spaces={startup.spaces}
            openSelected={openSelected}
            onOpened={(opened) => {
              renderOpenedSpace(root, opened);
            }}
            onError={(error) => {
              renderStartupError(root, error);
            }}
          />
        </StrictMode>,
      );
      return;
    }

    const { opened } = startup;
    renderOpenedSpace(root, opened);
  } catch (error) {
    renderStartupError(root, error);
  }
};
