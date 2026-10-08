import type { Fullscreen } from './presenting-fullscreen';

/**
 * The part of `document` the fullscreen adapter reads and writes.
 *
 * `requestFullscreen` is optional because the DOM lib types it as always
 * present and it is not: iPhone Safari offers fullscreen on a video only.
 * `Document` satisfies this shape.
 */
export interface NativeFullscreenDocument {
  readonly documentElement: { readonly requestFullscreen?: (() => Promise<void>) | undefined };
  readonly fullscreenElement: object | null;
  readonly exitFullscreen: () => Promise<void>;
  readonly addEventListener: (type: 'fullscreenchange', listener: () => void) => void;
  readonly removeEventListener: (type: 'fullscreenchange', listener: () => void) => void;
}

/**
 * The one adapter over the browser's Fullscreen API.
 *
 * It asks for the whole document rather than one element, so that a dialog
 * portalled to the end of the page is inside what is fullscreen and stays
 * visible over the Stage. A refused request answers `false` rather than
 * rejecting, whichever way the browser refuses: a rejected promise without a
 * user activation, a synchronous throw, or no API at all.
 */
export function createBrowserFullscreen(native: NativeFullscreenDocument): Fullscreen {
  return {
    enter: async () => {
      const request = native.documentElement.requestFullscreen;
      if (request === undefined) return false;
      try {
        await request.call(native.documentElement);
        return true;
      } catch {
        return false;
      }
    },
    exit: () => {
      if (native.fullscreenElement === null) return;
      native.exitFullscreen().catch(() => undefined);
    },
    active: () => native.fullscreenElement !== null,
    subscribe: (listener) => {
      native.addEventListener('fullscreenchange', listener);
      return () => native.removeEventListener('fullscreenchange', listener);
    },
  };
}
