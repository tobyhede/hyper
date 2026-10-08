/** The browser's fullscreen, as presenting needs it. */
export interface Fullscreen {
  /** Ask for the whole document fullscreen, answering whether it was entered. Never rejects. */
  readonly enter: () => Promise<boolean>;
  readonly exit: () => void;
  readonly active: () => boolean;
  readonly subscribe: (listener: () => void) => () => void;
}

/** Navigation's presenting mode, and the two operations that change it. */
export interface PresentingTraversal {
  readonly presenting: () => boolean;
  readonly subscribe: (listener: () => void) => () => void;
  readonly present: () => void;
  readonly exitPresenting: () => void;
}

export interface PresentingFullscreen {
  /** Start presenting and, within the same activation, ask for fullscreen. */
  readonly present: () => void;
  /** Follow fullscreen and presenting until the returned function is called. */
  readonly connect: () => () => void;
}

/**
 * Presenting and the fullscreen it entered, ending together.
 *
 * Only {@link PresentingFullscreen.present} requests fullscreen, and it does so
 * synchronously inside the gesture, because the browser grants a request only
 * within a user activation. A presentation opened from a link has none, and
 * never asks, and neither does Present while the document is already
 * fullscreen, since that fullscreen is not the presentation's.
 *
 * `entered` is the invariant: it is true only while a fullscreen this module
 * requested is on and presenting is on. While it holds, fullscreen ending
 * ends presenting and presenting ending exits fullscreen. A presentation that
 * never entered fullscreen — refused, opened from a link, begun while already
 * fullscreen, or already left — is not touched by fullscreen another script
 * or the reader turns on and off.
 * A request granted after presenting has already ended is exited at once.
 */
export function presentingFullscreen(
  fullscreen: Fullscreen,
  traversal: PresentingTraversal,
): PresentingFullscreen {
  let requested = false;
  let entered = false;
  const onFullscreenChange = () => {
    if (fullscreen.active()) {
      if (!requested) return;
      requested = false;
      if (traversal.presenting()) entered = true;
      else fullscreen.exit();
      return;
    }
    if (!entered) return;
    entered = false;
    if (traversal.presenting()) traversal.exitPresenting();
  };
  const onTraversalChange = () => {
    if (traversal.presenting() || !entered) return;
    entered = false;
    fullscreen.exit();
  };
  return {
    present: () => {
      traversal.present();
      if (!traversal.presenting() || fullscreen.active()) return;
      requested = true;
      void fullscreen.enter().then((granted) => {
        if (!granted) requested = false;
      });
    },
    connect: () => {
      const stopFullscreen = fullscreen.subscribe(onFullscreenChange);
      const stopTraversal = traversal.subscribe(onTraversalChange);
      return () => {
        stopFullscreen();
        stopTraversal();
      };
    },
  };
}
