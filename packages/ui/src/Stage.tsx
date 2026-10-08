import { useLayoutEffect, useRef, type ReactNode } from 'react';
import './stage.css';

export interface StageProps {
  /** What the frame shows: the Resource being presented. */
  readonly children: ReactNode;
  /** The controls drawn in the strip below the frame. */
  readonly chrome: ReactNode;
  /** The accessible name of the frame's scrolling body. */
  readonly label: string;
  /**
   * Which content the frame shows. A new key starts the body at its top, so a
   * long Resource scrolled down does not leave the next one scrolled as far.
   */
  readonly contentKey: string;
}

/**
 * The surface presenting draws on (ADR 0123): one fixed 16:9 frame, the largest
 * that fits above the chrome strip, letterboxed in the room the Stage fills.
 *
 * The frame's size never depends on its content. Content that overflows scrolls
 * vertically inside the frame's body, which takes focus so Page Up and Page
 * Down reach it; the body is a plain region rather than a control, so a
 * window-level key listener still sees every key pressed in it. Type inside the
 * frame is sized in container units, so it scales with the frame.
 *
 * Presentational: it draws what it is given and owns no traversal, keys or
 * focus beyond its own body.
 */
export function Stage({ children, chrome, label, contentKey }: StageProps) {
  const body = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (body.current !== null) body.current.scrollTop = 0;
  }, [contentKey]);

  return (
    <div className="stage" data-testid="stage">
      <div className="stage__room">
        <div className="stage__frame" data-testid="stage-frame">
          <div
            ref={body}
            className="stage__body"
            role="region"
            aria-label={label}
            // A scroll region the keyboard can reach, so Page Up and Page Down
            // scroll it.
            tabIndex={0}
          >
            {children}
          </div>
        </div>
      </div>
      <div className="stage__chrome">{chrome}</div>
    </div>
  );
}
