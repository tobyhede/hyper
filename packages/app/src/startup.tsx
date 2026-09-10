import { StrictMode, type ReactNode } from 'react';
import type { OpenSpace, OpenSpaces } from './open-spaces';
import { OpenSpacesApplication } from './components/OpenSpacesApplication';
import type { DestinationOpening } from './destination-opening';
import { StartupFailure } from './components/StartupFailure';

export interface ApplicationRoot {
  render(children: ReactNode): void;
}

export interface OpenedApplicationStartup {
  kind: 'opened';
  opened: OpenSpace;
  /**
   * The session the opened Space belongs to.
   *
   * **Required, and not optional.** It was optional while a second startup
   * shape existed — one opened Space and no session, mounted through
   * `mountSpaceApp`. Every host sets it now (`space.ts`, the catalogue's
   * `storyOpening`, `startup.test.tsx`), so the arm that read its absence was
   * reachable from nothing and is gone with it. Optional here would be an
   * invitation to a branch that no longer exists.
   */
  spaces: OpenSpaces;
  opening?: DestinationOpening | undefined;
}

export type ApplicationStartupResult = OpenedApplicationStartup;

export type ApplicationStartupResolver = () => Promise<ApplicationStartupResult>;

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
    root.render(
      <StrictMode>
        <OpenSpacesApplication
          spaces={startup.spaces}
          initial={startup.opened}
          opening={startup.opening}
        />
      </StrictMode>,
    );
  } catch (error) {
    renderStartupError(root, error);
  }
};
