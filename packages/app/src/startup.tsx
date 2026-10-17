import { StrictMode, type ReactNode } from 'react';
import type { OpenSpace, OpenSpaces } from './open-spaces';
import { OpenSpacesApplication } from './components/OpenSpacesApplication';
import type { DestinationOpening } from './destination-opening';
import { StartupFailure } from './components/StartupFailure';
import { NotesWindowApplication } from './components/NotesWindowApplication';
import type { NotesWindow } from './notes-window';

export interface ApplicationRoot {
  render(children: ReactNode): void;
}

export interface OpenedApplicationStartup {
  kind: 'opened';
  opened: OpenSpace;
  /**
   * The session the opened Space belongs to.
   *
   * **Required.** Every host sets it (`space.ts`, the catalogue's
   * `storyOpening`, `startup.test.tsx`), and no startup result carries an
   * opened Space without its session.
   */
  spaces: OpenSpaces;
  opening?: DestinationOpening | undefined;
}

/** A Notes window, which opens no Space composition: it follows another window's (ADR 0129). */
export interface NotesApplicationStartup {
  kind: 'notes';
  notes: NotesWindow;
  /** The clock the presenting windows read their presentations' start from. */
  now: () => number;
}

export type ApplicationStartupResult = OpenedApplicationStartup | NotesApplicationStartup;

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
        {startup.kind === 'notes' ? (
          <NotesWindowApplication notes={startup.notes} now={startup.now} />
        ) : (
          <OpenSpacesApplication
            spaces={startup.spaces}
            initial={startup.opened}
            opening={startup.opening}
          />
        )}
      </StrictMode>,
    );
  } catch (error) {
    renderStartupError(root, error);
  }
};
