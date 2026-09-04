import {
  createBrowserLocation,
  type BrowserLocation,
  type HistoryApi,
} from '../src/browser-location';
import type { DestinationOpening } from '../src/destination-opening';
import type { OpenSpace } from '../src/open-spaces';
import { mountSpaceApp, type SpaceAppRenderer } from '../src/SpaceApp';
import { recordingHistory } from './browser-history';

/**
 * Mount one Space the way Open Spaces opens one: the session's browser location
 * follows this composition, and the app is built over the location rather than
 * over a browser.
 *
 * The location is answered so a test that is about the browser can assert on it;
 * the many that are not simply ignore it and get a recording history at `/`.
 */
export const mountSpace = (
  opened: OpenSpace,
  render: SpaceAppRenderer,
  opening?: DestinationOpening,
  history: HistoryApi = recordingHistory(),
): BrowserLocation => {
  const browserLocation = createBrowserLocation(history);
  browserLocation.follow(opened.app);
  mountSpaceApp(opened, browserLocation, render, opening);
  return browserLocation;
};
