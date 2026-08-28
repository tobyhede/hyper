import { StrictMode, type ReactNode } from 'react';
import type { OpenedSpace } from './open-space';
import type { CanvasRendererId } from './renderer';
import { mountSpaceApp } from './SpaceApp';
import { StartupFailure } from './components/StartupFailure';

export interface ApplicationRoot {
  render(children: ReactNode): void;
}

export interface OpenedApplicationStartup {
  kind: 'opened';
  opened: OpenedSpace;
  selection?: CanvasRendererId | undefined;
}

export type ApplicationStartupResult = OpenedApplicationStartup;

export type ApplicationStartupResolver = () => Promise<ApplicationStartupResult>;

const renderOpenedSpace = (
  root: ApplicationRoot,
  opened: OpenedSpace,
  selection?: CanvasRendererId,
): void => {
  mountSpaceApp(
    opened,
    (app) => {
      root.render(<StrictMode>{app}</StrictMode>);
    },
    selection,
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
    const { opened, selection } = startup;
    renderOpenedSpace(root, opened, selection);
  } catch (error) {
    renderStartupError(root, error);
  }
};
