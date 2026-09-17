import type { ReactNode } from 'react';
import {
  PaletteColorSwatchGrid,
  paletteSwatchPanelClassName,
  type PaletteColorEntry,
} from './PaletteColorPicker';
import {
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from './components/dropdown-menu';
import { CopyIcon, DeleteIcon, GraphIcon, PlusIcon } from './icons';

export interface DiagramMenuActionsProps {
  readonly title: string;
  readonly renameItem: ReactNode;
  readonly createDisabled: boolean;
  readonly deleteDisabled: boolean;
  readonly onCreate: () => void;
  readonly onCopyLink: () => void;
  readonly onDelete: () => void;
}

/**
 * The Diagram commands, shared by the Dock and a Space Thing's rail.
 *
 * One grouping grammar, below the selection list `ChoiceMenu` draws: New
 * Diagram on its own; Rename beside Copy link to Diagram, the two commands
 * that act on the name already showing; then Delete — one separator between
 * each group (`.scratch/dock-menu-reorganisation/issues/01`).
 */
export function DiagramMenuActions({
  title,
  renameItem,
  createDisabled,
  deleteDisabled,
  onCreate,
  onCopyLink,
  onDelete,
}: DiagramMenuActionsProps) {
  return (
    <>
      <DropdownMenuGroup>
        <DropdownMenuItem className="gap-2" disabled={createDisabled} onClick={onCreate}>
          <PlusIcon />
          New Diagram
        </DropdownMenuItem>
      </DropdownMenuGroup>
      <DropdownMenuSeparator />
      <DropdownMenuGroup>
        {renameItem}
        <DropdownMenuItem className="gap-2" onClick={onCopyLink}>
          <CopyIcon />
          Copy link to Diagram
        </DropdownMenuItem>
      </DropdownMenuGroup>
      <DropdownMenuSeparator />
      <DropdownMenuGroup>
        <DropdownMenuItem
          variant="destructive"
          className="gap-2"
          disabled={deleteDisabled}
          onClick={onDelete}
        >
          <DeleteIcon />
          Delete {title}
        </DropdownMenuItem>
      </DropdownMenuGroup>
    </>
  );
}

export interface GraphMenuActionsProps extends Omit<DiagramMenuActionsProps, 'createDisabled'> {
  readonly editsDisabled: boolean;
  readonly color: string;
  readonly colors: readonly PaletteColorEntry[];
  readonly onRecolor: (color: string) => void;
}

/**
 * Graph commands use the same palette and menu order wherever a Graph is
 * named.
 *
 * The same grouping grammar as {@link DiagramMenuActions}, with one group
 * ahead of it: Colour… stands alone immediately after the selection list,
 * because it is the one command a Graph carries that a Diagram does not.
 * Copy link to Graph copies the within-Diagram address; this menu offers no
 * separate permanent address for the Graph itself
 * (`.scratch/dock-menu-reorganisation/issues/01`).
 */
export function GraphMenuActions({
  title,
  renameItem,
  editsDisabled,
  deleteDisabled,
  color,
  colors,
  onRecolor,
  onCreate,
  onCopyLink,
  onDelete,
}: GraphMenuActionsProps) {
  return (
    <>
      <DropdownMenuGroup>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="gap-2" disabled={editsDisabled}>
            <GraphIcon color={color} size={14} />
            Colour…
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className={paletteSwatchPanelClassName}>
            <PaletteColorSwatchGrid
              entries={colors}
              value={color}
              onValueChange={onRecolor}
              disabled={editsDisabled}
              aria-label="Graph colour"
            />
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      </DropdownMenuGroup>
      <DropdownMenuSeparator />
      <DropdownMenuGroup>
        <DropdownMenuItem className="gap-2" disabled={editsDisabled} onClick={onCreate}>
          <PlusIcon />
          New Graph
        </DropdownMenuItem>
      </DropdownMenuGroup>
      <DropdownMenuSeparator />
      <DropdownMenuGroup>
        {renameItem}
        <DropdownMenuItem className="gap-2" onClick={onCopyLink}>
          <CopyIcon />
          Copy link to Graph
        </DropdownMenuItem>
      </DropdownMenuGroup>
      <DropdownMenuSeparator />
      <DropdownMenuGroup>
        <DropdownMenuItem
          variant="destructive"
          className="gap-2"
          disabled={deleteDisabled}
          onClick={onDelete}
        >
          <DeleteIcon />
          Delete {title}
        </DropdownMenuItem>
      </DropdownMenuGroup>
    </>
  );
}
