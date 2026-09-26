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

/**
 * The Map commands a surface offers.
 *
 * New Map and Delete are each one field — the press, or `null` where the
 * command is unavailable — so the row's unavailable treatment and what it
 * invokes cannot disagree: both surfaces hand over what Map authoring's
 * capability answered.
 */
export interface MapMenuActionsProps {
  readonly title: string;
  readonly renameItem: ReactNode;
  readonly onCreate: (() => void) | null;
  readonly onCopyLink: () => void;
  readonly onDelete: (() => void) | null;
}

/**
 * The Map commands, shared by the Dock and a Space Resource's rail.
 *
 * One grouping grammar, below the selection list `ChoiceMenu` draws: New
 * Map on its own; Rename beside Copy link to Map, the two commands
 * that act on the name already showing; then Delete — one separator between
 * each group.
 */
export function MapMenuActions({
  title,
  renameItem,
  onCreate,
  onCopyLink,
  onDelete,
}: MapMenuActionsProps) {
  return (
    <>
      <DropdownMenuGroup>
        <DropdownMenuItem
          className="gap-2"
          disabled={onCreate === null}
          onClick={() => onCreate?.()}
        >
          <PlusIcon />
          New Map
        </DropdownMenuItem>
      </DropdownMenuGroup>
      <DropdownMenuSeparator />
      <DropdownMenuGroup>
        {renameItem}
        <DropdownMenuItem className="gap-2" onClick={onCopyLink}>
          <CopyIcon />
          Copy link to Map
        </DropdownMenuItem>
      </DropdownMenuGroup>
      <DropdownMenuSeparator />
      <DropdownMenuGroup>
        <DropdownMenuItem
          variant="destructive"
          className="gap-2"
          disabled={onDelete === null}
          onClick={() => onDelete?.()}
        >
          <DeleteIcon />
          Delete {title}
        </DropdownMenuItem>
      </DropdownMenuGroup>
    </>
  );
}

export interface GraphMenuActionsProps {
  readonly title: string;
  readonly renameItem: ReactNode;
  readonly deleteDisabled: boolean;
  /**
   * New Graph's press, or `null` where it is unavailable — one field, as
   * {@link MapMenuActionsProps.onCreate} is.
   */
  readonly onCreate: (() => void) | null;
  readonly onCopyLink: () => void;
  readonly onDelete: () => void;
  readonly color: string;
  readonly colors: readonly PaletteColorEntry[];
  /** Store the Graph's colour, or `null` while Colour… may not run. */
  readonly onRecolor: ((color: string) => void) | null;
}

/**
 * Graph commands use the same palette and menu order wherever a Graph is
 * named.
 *
 * The same grouping grammar as {@link MapMenuActions} — make one, this one,
 * remove this one — with Colour… heading the group of commands on the Graph
 * you are on, the one command a Graph carries that a Map does not. Copy link
 * to Graph copies the within-Map address; this menu offers no separate
 * permanent address for the Graph itself.
 */
export function GraphMenuActions({
  title,
  renameItem,
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
        <DropdownMenuItem
          className="gap-2"
          disabled={onCreate === null}
          onClick={() => onCreate?.()}
        >
          <PlusIcon />
          New Graph
        </DropdownMenuItem>
      </DropdownMenuGroup>
      <DropdownMenuSeparator />
      <DropdownMenuGroup>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="gap-2" disabled={onRecolor === null}>
            <GraphIcon color={color} size={14} />
            Colour…
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className={paletteSwatchPanelClassName}>
            <PaletteColorSwatchGrid
              entries={colors}
              value={color}
              onValueChange={(next) => onRecolor?.(next)}
              disabled={onRecolor === null}
              aria-label="Graph colour"
            />
          </DropdownMenuSubContent>
        </DropdownMenuSub>
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
