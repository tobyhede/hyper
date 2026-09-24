import { forwardRef } from 'react';
import {
  CanvasCommand,
  CanvasCommandToolbar,
  type CanvasCommandToolbarProps,
} from './CanvasCommandToolbar';
import { ToolbarGroup } from './components/toolbar';
import { DeleteIcon, EditIcon, HideTitleIcon, ShowTitleIcon } from './icons';

/**
 * Whether the Edge has a Title, and whether it is drawn at rest. One union, not
 * two booleans: as in the schema, an untitled Edge cannot be hidden.
 */
export type EdgeTitleState = 'none' | 'shown' | 'hidden';

export type EdgeToolbarProps = Omit<CanvasCommandToolbarProps, 'children' | 'aria-label'> & {
  /** The Edge's Title, or `From → To` when it has none. */
  readonly name: string;
  readonly title: EdgeTitleState;
  /**
   * The Title is being written, so the eye is disabled: it draws the projected
   * state, not the draft, and a press that blurred the field would complete the
   * draft and toggle a Title the draft may have cleared. A disabled press keeps
   * the caret (`ladle-e2e/edge-toolbar.spec.ts`).
   */
  readonly writingTitle: boolean;
  readonly onEdit: () => void;
  /** Hide a shown Title, or show a hidden one. */
  readonly onToggleTitle: () => void;
  readonly onDelete: () => void;
};

/** A group's row, tighter than the surface's gap between groups, as on a Resource rail. */
const GROUP_LAYOUT = 'inline-flex items-center gap-px';

/**
 * An Edge's commands on the canvas: `[Edit][Show/Hide Title][Delete]`. Reveal,
 * position and Escape focus belong to the mounting Edge, hence the prop pass-through.
 *
 * Edit edits the Title. The eye is disabled rather than absent without a Title:
 * Do not remove it, or Delete moves under a pointer already on its way.
 */
export const EdgeToolbar = forwardRef<HTMLDivElement, EdgeToolbarProps>(function EdgeToolbar(
  { name, title, writingTitle, onEdit, onToggleTitle, onDelete, ...props },
  ref,
) {
  return (
    <CanvasCommandToolbar ref={ref} data-slot="edge-toolbar" aria-label={`Edge ${name}`} {...props}>
      <ToolbarGroup aria-label="Edge commands" className={GROUP_LAYOUT}>
        <CanvasCommand aria-label={`Edit Edge ${name}`} onClick={onEdit}>
          <EditIcon data-icon="inline-start" />
        </CanvasCommand>
        <CanvasCommand
          aria-label={`${title === 'hidden' ? 'Show' : 'Hide'} Title ${name}`}
          disabled={title === 'none' || writingTitle}
          onClick={onToggleTitle}
        >
          {title === 'hidden' ? (
            <HideTitleIcon data-icon="inline-start" />
          ) : (
            <ShowTitleIcon data-icon="inline-start" />
          )}
        </CanvasCommand>
        <CanvasCommand aria-label={`Delete Edge ${name}`} onClick={onDelete}>
          <DeleteIcon data-icon="inline-start" />
        </CanvasCommand>
      </ToolbarGroup>
    </CanvasCommandToolbar>
  );
});
