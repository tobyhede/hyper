import type { ReactElement } from 'react';
import { SpaceAppFailure } from './components/SpaceAppFailure';
import { createApp } from './App';
import { SpaceAppFailureView } from './components/SpaceAppFailureView';
import type { BrowserLocation } from './browser-location';
import type { OpenSpace } from './open-spaces';
import type { DestinationOpening } from './destination-opening';

export type SpaceAppRenderer = (app: ReactElement) => void;

/** What a failure says, whichever of the two paths below caught it. */
const failureMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/**
 * Mount one application for the lifetime of the opened Space.
 *
 * Open Spaces validates the snapshot and composes the collaborators once, so
 * `createApp` no longer performs domain intake. What it still does before there
 * is a tree is apply the addressed opening against the session's working Space,
 * and that throws on a Space that has since stopped loading — with no boundary
 * mounted yet to catch it. Both paths report the same sentence, for the same
 * reason: an uncaught throw leaves a blank page, which says nothing. This guard
 * is a backstop for a broken invariant, not a second composition path.
 */
export function mountSpaceApp(
  opened: OpenSpace,
  browserLocation: BrowserLocation,
  render: SpaceAppRenderer,
  opening?: DestinationOpening,
): void {
  let App: ReturnType<typeof createApp>;
  try {
    App = createApp(opened, browserLocation, opening);
  } catch (error) {
    console.error('Composing the Space app failed', error);
    render(<SpaceAppFailureView message={failureMessage(error)} />);
    return;
  }
  render(
    <SpaceAppFailure>
      <App />
    </SpaceAppFailure>,
  );
}
