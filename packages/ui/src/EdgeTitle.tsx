import { forwardRef, type CSSProperties } from 'react';
import { Button } from './Button';
import { InlineTitleEditor } from './InlineTitleEditor';
import type { EdgeTitleRoom } from './edge-title-room';
import './edge-title.css';

/** What ends the Title's editing, held together so editing cannot be asked for without it. */
export interface EdgeTitleEditor {
  /** The refusal's reason, or `null` once settled. */
  readonly onComplete: (title: string) => string | null;
  readonly onCancel: () => void;
  readonly onReturnFocus: () => void;
  /** Id of the region outside the editor that reports a refusal. */
  readonly errorShownBy: string;
}

export interface EdgeTitleProps {
  /** `null` draws nothing unless the Title is being written. */
  readonly title: string | null;
  /** The Edge's name in the control's accessible name: its Title, or `From → To`. */
  readonly name: string;
  /** Nothing drawn at rest; dimmed while revealed. */
  readonly hidden: boolean;
  /** Hovered, selected or being written: drawn whole, and a control. */
  readonly revealed: boolean;
  readonly room: EdgeTitleRoom;
  /** The Edge's own stroke, continued as the box's border. */
  readonly stroke: {
    readonly color: CSSProperties['stroke'];
    readonly width: CSSProperties['strokeWidth'];
  };
  /** Present only while the Title is being written. */
  readonly editor?: EdgeTitleEditor | undefined;
  readonly onBeginEdit: () => void;
}

/** The stylesheet's stroke properties, typed rather than asserted. */
type StrokeStyle = CSSProperties &
  Record<'--edge-title-stroke' | '--edge-title-stroke-width', string | number | undefined>;

/**
 * An Edge's Title, boxed on the Edge's midpoint. The caller picks the state:
 *
 * - **At rest**: fitted and ellipsed, whole in the tooltip, or nothing when
 *   hidden or the Edge is too short (`edgeTitleRoom`).
 * - **Revealed**: whole, and a control that begins writing it. Raising it over
 *   the Resources is the mounting surface's job.
 * - **Writing**: `InlineTitleEditor`'s `edge` field inside the same box.
 *
 * The ref reaches the revealed control, so focus can return to it after an edit.
 */
export const EdgeTitle = forwardRef<HTMLButtonElement, EdgeTitleProps>(function EdgeTitle(
  { title, name, hidden, revealed, room, stroke, editor, onBeginEdit },
  ref,
) {
  const style: StrokeStyle = {
    '--edge-title-stroke': stroke.color,
    // Canvas units, read by the stylesheet as pixels.
    '--edge-title-stroke-width': stroke.width,
  };
  if (editor !== undefined) {
    return (
      <span className="edge-title edge-title--editing" style={style}>
        <InlineTitleEditor
          title={title ?? ''}
          label="Edge Title"
          variant="edge"
          errorShownBy={editor.errorShownBy}
          onComplete={editor.onComplete}
          onCancel={editor.onCancel}
          onReturnFocus={editor.onReturnFocus}
        />
      </span>
    );
  }
  if (title === null) return null;
  const text = <span className="edge-title__text">{title}</span>;
  if (revealed) {
    return (
      <Button
        ref={ref}
        variant="ghost"
        className="edge-title edge-title--control nodrag nopan"
        data-hidden={hidden}
        style={style}
        aria-label={`Edit Title ${name}`}
        title={title}
        onClick={(event) => {
          event.stopPropagation();
          onBeginEdit();
        }}
        onPointerDown={(event) => event.stopPropagation()}
      >
        {text}
      </Button>
    );
  }
  if (hidden || room.kind === 'none') return null;
  return (
    <span className="edge-title" style={{ ...style, maxWidth: room.width }} title={title}>
      {text}
    </span>
  );
});
