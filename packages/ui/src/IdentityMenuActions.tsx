import type { ReactNode } from 'react';
import {
  PaletteColorSwatchGrid,
  paletteSwatchPanelClassName,
  type PaletteColorEntry,
} from './PaletteColorPicker';
import {
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

/** The Diagram commands, shared by the Dock and a Space Thing's rail. */
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
      {renameItem}
      <DropdownMenuItem className="gap-2" disabled={createDisabled} onClick={onCreate}>
        <PlusIcon />
        New Diagram
      </DropdownMenuItem>
      <DropdownMenuItem className="gap-2" onClick={onCopyLink}>
        <CopyIcon />
        Copy link
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem
        variant="destructive"
        className="gap-2"
        disabled={deleteDisabled}
        onClick={onDelete}
      >
        <DeleteIcon />
        Delete {title}
      </DropdownMenuItem>
    </>
  );
}

export interface GraphMenuActionsProps extends Omit<DiagramMenuActionsProps, 'createDisabled'> {
  readonly editsDisabled: boolean;
  readonly color: string;
  readonly colors: readonly PaletteColorEntry[];
  readonly onRecolor: (color: string) => void;
  readonly onCopyPermanentLink: () => void;
}

/** Graph commands use the same palette and menu order wherever a Graph is named. */
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
  onCopyPermanentLink,
  onDelete,
}: GraphMenuActionsProps) {
  return (
    <>
      {renameItem}
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
      <DropdownMenuItem className="gap-2" disabled={editsDisabled} onClick={onCreate}>
        <PlusIcon />
        New Graph
      </DropdownMenuItem>
      <DropdownMenuItem className="gap-2" onClick={onCopyLink}>
        <CopyIcon />
        Copy link
      </DropdownMenuItem>
      <DropdownMenuItem className="gap-2" onClick={onCopyPermanentLink}>
        <CopyIcon />
        Copy permanent link
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem
        variant="destructive"
        className="gap-2"
        disabled={deleteDisabled}
        onClick={onDelete}
      >
        <DeleteIcon />
        Delete {title}
      </DropdownMenuItem>
    </>
  );
}
