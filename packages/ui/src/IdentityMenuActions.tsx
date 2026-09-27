import type { ReactNode } from 'react';
import { GRAPH_HEAD_SHAPES, type GraphHeadShape } from '@project/core';
import { GRAPH_HEAD_SHAPE_LABELS, GraphHeadShapeIcon } from './GraphHeadShape';
import { PaletteColorSwatch, type PaletteColorEntry } from './PaletteColorPicker';
import { SwatchMenuRadioGroup, swatchPanelClassName } from './SwatchMenu';
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

const HEAD_SHAPE_ENTRIES = GRAPH_HEAD_SHAPES.map((value) => ({
  value,
  label: GRAPH_HEAD_SHAPE_LABELS[value],
}));

export interface GraphMenuActionsProps {
  readonly title: string;
  readonly renameItem: ReactNode;
  /**
   * New Graph's press, or `null` where it is unavailable — one field, as
   * {@link MapMenuActionsProps.onCreate} is.
   */
  readonly onCreate: (() => void) | null;
  readonly onCopyLink: () => void;
  /** Delete's press, or `null` where it is unavailable, as New Graph's is. */
  readonly onDelete: (() => void) | null;
  readonly color: string;
  readonly colors: readonly PaletteColorEntry[];
  /** Store the Graph's colour, or `null` while Colour… may not run. */
  readonly onRecolor: ((color: string) => void) | null;
  /** The head shape the Graph's Edges draw — its stored one, else the default. */
  readonly headShape: GraphHeadShape;
  /** Store the Graph's head shape, or `null` while Shape… may not run. */
  readonly onChangeHeadShape: ((headShape: GraphHeadShape) => void) | null;
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
          <DropdownMenuSubContent className={swatchPanelClassName}>
            <SwatchMenuRadioGroup
              entries={colors.map((entry) => ({ value: entry.color, label: entry.label }))}
              value={color}
              onValueChange={(next) => onRecolor?.(next)}
              disabled={onRecolor === null}
              aria-label="Graph colour"
              renderSwatch={(swatch) => <PaletteColorSwatch color={swatch} />}
            />
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="gap-2" disabled={onChangeHeadShape === null}>
            <GraphHeadShapeIcon headShape={headShape} color={color} className="size-[14px]" />
            Shape…
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className={swatchPanelClassName}>
            <SwatchMenuRadioGroup
              entries={HEAD_SHAPE_ENTRIES}
              value={headShape}
              onValueChange={(next) => onChangeHeadShape?.(next)}
              disabled={onChangeHeadShape === null}
              aria-label="Graph head shape"
              checkPlacement="corner"
              renderSwatch={(swatch) => (
                <GraphHeadShapeIcon headShape={swatch} color={color} className="size-full" />
              )}
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
