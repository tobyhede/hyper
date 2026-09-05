import { StrictMode, type ReactNode } from 'react';
import type { BrowserLocation } from './browser-location';
import type { OpenSpace, OpenSpaces } from './open-spaces';
import { OpenSpacesApplication } from './components/OpenSpacesApplication';
import type { DestinationOpening } from './destination-opening';
import { mountSpaceApp } from './SpaceApp';
import { StartupFailure } from './components/StartupFailure';

export interface ApplicationRoot {
  render(children: ReactNode): void;
}

export interface OpenedApplicationStartup {
  kind: 'opened';
  opened: OpenSpace;
  spaces?: OpenSpaces;
  /** The session's one browser location, already following the opened Space. */
  browserLocation: BrowserLocation;
  opening?: DestinationOpening | undefined;
}

export type ApplicationStartupResult = OpenedApplicationStartup;

export type ApplicationStartupResolver = () => Promise<ApplicationStartupResult>;

const renderOpenedSpace = (
  root: ApplicationRoot,
  opened: OpenSpace,
  browserLocation: BrowserLocation,
  opening?: DestinationOpening,
): void => {
  mountSpaceApp(
    opened,
    browserLocation,
    (app) => {
      root.render(<StrictMode>{app}</StrictMode>);
    },
    opening,
  );
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
    if (startup.spaces !== undefined) {
      root.render(
        <StrictMode>
          <OpenSpacesApplication
            spaces={startup.spaces}
            initial={startup.opened}
            opening={startup.opening}
          />
        </StrictMode>,
      );
      return;
    }
    renderOpenedSpace(root, startup.opened, startup.browserLocation, startup.opening);
  } catch (error) {
    renderStartupError(root, error);
  }
};
