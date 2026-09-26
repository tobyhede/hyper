import type { ReactNode } from 'react';
import type { GraphHeadShape } from '@project/core';
import { GraphHeadShapeIcon, GraphHeadShapeSwatchGrid } from './GraphHeadShapeSwatchGrid';
import { PaletteColorSwatchGrid, type PaletteColorEntry } from './PaletteColorPicker';
import { swatchPanelClassName } from './SwatchGrid';
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
  readonly onCreate: () => void;
  readonly onCopyLink: () => void;
  readonly onDelete: () => void;
  readonly editsDisabled: boolean;
  readonly color: string;
  readonly colors: readonly PaletteColorEntry[];
  readonly onRecolor: (color: string) => void;
  /** The head shape the Graph's Edges draw — its stored one, else the default. */
  readonly headShape: GraphHeadShape;
  readonly onChangeHeadShape: (headShape: GraphHeadShape) => void;
}

/**
 * Graph commands use the same palette and menu order wherever a Graph is
 * named.
 *
 * The same grouping grammar as {@link MapMenuActions} — make one, this one,
 * remove this one — with Colour… and Shape… heading the group of commands on
 * the Graph you are on, the two a Graph carries that a Map does not: how its
 * Edges are drawn (ADR 0104, ADR 0105). Shape… is withdrawn exactly when
 * Colour… is. Copy link to Graph copies the within-Map address; this menu
 * offers no separate permanent address for the Graph itself.
 */
export function GraphMenuActions({
  title,
  renameItem,
  editsDisabled,
  deleteDisabled,
  color,
  colors,
  onRecolor,
  headShape,
  onChangeHeadShape,
  onCreate,
  onCopyLink,
  onDelete,
}: GraphMenuActionsProps) {
  return (
    <>
      <DropdownMenuGroup>
        <DropdownMenuItem className="gap-2" disabled={editsDisabled} onClick={onCreate}>
          <PlusIcon />
          New Graph
        </DropdownMenuItem>
      </DropdownMenuGroup>
      <DropdownMenuSeparator />
      <DropdownMenuGroup>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="gap-2" disabled={editsDisabled}>
            <GraphIcon color={color} size={14} />
            Colour…
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className={swatchPanelClassName}>
            <PaletteColorSwatchGrid
              entries={colors}
              value={color}
              onValueChange={onRecolor}
              disabled={editsDisabled}
              aria-label="Graph colour"
            />
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="gap-2" disabled={editsDisabled}>
            <GraphHeadShapeIcon headShape={headShape} color={color} className="size-[14px]" />
            Shape…
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className={swatchPanelClassName}>
            <GraphHeadShapeSwatchGrid
              value={headShape}
              color={color}
              onValueChange={onChangeHeadShape}
              disabled={editsDisabled}
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
