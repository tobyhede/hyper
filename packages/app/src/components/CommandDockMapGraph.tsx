/**
 * The Command Dock's Map and Graph clusters: each a named identity whose list
 * switches, renames, adds and deletes, and on the Graph side the Present
 * command. `CommandDock` mounts {@link MapControls} and {@link GraphControls}.
 */
import {
  ChoiceMenu,
  GraphColorLine,
  GraphIcon,
  GraphMenuActions,
  MapIcon,
  MapMenuActions,
  PresentIcon,
  ToolbarButton,
  ToolbarGroup,
  graphColor,
} from '@project/ui';
import type { Graph, GraphId, Map, MapId } from '@project/core';
import { GRAPH_PALETTE_ENTRIES } from '@project/graph';
import type { MenuSide } from '../dock-placement';
import { identityMenuRestoresFocusOnClose } from './identity-menu-focus-restore';
import {
  DISCLOSURE_ALIGN,
  DISCLOSURE_SIDE_OFFSET,
  DISCLOSURE_WIDTH,
  useIdentityCaret,
  type IdentityDisclosure,
} from './command-dock-shared';
import { IdentitySurface } from './CommandDockParts';

/**
 * The canvas's one exclusive choice: which authored Map is drawing (ADR
 * 0079, ADR 0082).
 *
 * Named `canvas` after the group the Space Sidebar carried for the same purpose,
 * and carrying `selected` as the Map rather than as an id for the same reason
 * that one did — the title belongs to the Map, so a cluster naming what is
 * drawing reads it off the Map instead of deriving a second title.
 */
export interface DockCanvas {
  /** The Space's authored Maps, in the order it declares them. */
  readonly maps: readonly Map[];
  /** The Map that is drawing. */
  readonly selected: Map;
  readonly onSelect: (mapId: MapId) => void;
  /**
   * Rename the drawing Map. Absent while no chrome rename may begin —
   * {@link DockSpace.onRename}'s second arm.
   */
  readonly onRename: ((title: string) => string | null) | null;
  /**
   * Create an empty Map and select it, or `null` while New Map may not run.
   *
   * One field, so the row's unavailable treatment and its press are the one
   * answer Map authoring's capability gave (`map-authoring-commands.ts`,
   * `offered`). Among that answer's terms is one beyond Create Resource's:
   * creating a Map **selects** it, and the created Map is empty — so the
   * canvas re-derives with no nodes and a Resource holding a live title draft
   * unmounts, taking the draft, the announced reason and the caret with it. A
   * valid draft is safe, because pressing the control blurs the input and a
   * valid blur completes the Title (ADR 0065); a refused one is re-focused
   * instead and the press lands anyway.
   */
  readonly onCreate: (() => void) | null;
  /**
   * Whether New Map's rename continuation landed — read when the menu closes.
   *
   * **The answer is the point.** New Map continues in the new Map's name,
   * so this cluster's menu must not take the caret back on close — but only once
   * the rename editor has actually opened. Asking at press time races the
   * post-selection window where rename is withdrawn; reading here keeps the two
   * halves of that decision in one place rather than one per module.
   */
  readonly didCreateMoveCaret: () => boolean;
  /**
   * Delete the drawing Map, or `null` while Delete may not run.
   *
   * One field for the same reason as {@link DockCanvas.onCreate}. The answer
   * holds two rules, and neither is derivable here without restating it: the
   * last Map cannot be deleted (ADR 0079), and every entity Edit is withdrawn
   * while a title editor or a live content edit owns the caret
   * (`authoring-availability.ts`). A row that read only the first used to
   * press cleanly, run nothing, and report nothing.
   */
  readonly onDelete: (() => void) | null;
  /**
   * Copy the drawing Map's address — the one form a Map has.
   *
   * A Map offers no permanent link because it has no second address to be
   * permanent *against*: its own address is the only one there is
   * (`entity-actions.tsx`), where a Graph and a Resource each have a within-Map
   * form as well.
   */
  readonly onCopyLink: () => void;
}

/** The Graphs the selected Map owns, the Active one, and Present. */
export interface DockGraph {
  /** The Graphs the selected Map owns, which are the only ones it draws. */
  readonly graphs: readonly Graph[];
  readonly active: Graph;
  /** Every visible Graph's resolved colour, derived by the production palette. */
  readonly colorByGraphId: Readonly<Record<string, string>>;
  /** The Active Graph's colour, which several controls carry as its identity. */
  readonly activeColor: string;
  readonly onActivate: (graphId: GraphId) => void;
  /** Absent while no chrome rename may begin — {@link DockSpace.onRename}'s second arm. */
  readonly onRename: ((graphId: GraphId, title: string) => string | null) | null;
  /** A Graph's stored colour, which the canvas draws its Edges in. */
  readonly onRecolor: (graphId: GraphId, color: string) => void;
  readonly onCreate: () => void;
  readonly onDelete: (graphId: GraphId) => void;
  /**
   * Whether this cluster's lifecycle commands may run at all.
   *
   * One term for the three of them, because they are withdrawn by one rule and
   * not by three: New Graph, Colour and Delete are entity Edits, and no entity
   * Edit runs while a title editor or a live content edit owns the caret
   * (`authoring-availability.ts`). Delete carries the ADR 0079 rule on top of
   * this one, read off `graphs` here; the Map cluster splits create from
   * delete because creating a Map **selects** it and so has a second reason
   * of its own, which no Graph command has.
   */
  readonly editsDisabled: boolean;
  /**
   * Copy this Graph's within-Map address — "Copy link to Graph" reproduces
   * what is on screen, so a recipient lands where the sender was.
   *
   * A Map **owns** its Graphs (ADR 0040) and a Graph also has its own
   * permanent address, but the Graph menu offers only this one
   * (`.scratch/dock-menu-reorganisation/issues/01`).
   */
  readonly onCopyLink: () => void;
  readonly presenting: boolean;
  readonly onPresent: () => void;
  /**
   * Whether Present may begin a traversal.
   *
   * An empty Graph is legal and ordinary — creating a Map mints one — and it
   * has nothing to traverse, so `present()` would return having changed nothing
   * and an enabled control would swallow the press. Unavailable rather than
   * absent: a control that disappears teaches nothing about why.
   */
  readonly presentDisabled: boolean;
}

/**
 * Map: `[name v]`. Graph: `[name v][>]`.
 *
 * Each is one named `ToolbarGroup` inside the Dock's single `Toolbar` — ADR
 * 0073's pair, the same one a Resource rail is built from — so the controls share a
 * box treatment with the rail, the whole bar is one tab stop, and the arrows
 * cross a group boundary exactly as they cross any other gap. What the grouping
 * says is that these are commands *on* one named entity, which is exactly what a
 * rail says about a Resource.
 *
 * Name and chevron are one disclosure. Rename sits with New, Copy link and
 * Delete on the current identity. Present is the exception on the Graph side:
 * it acts on the Active Graph the cluster is naming.
 */
export function MapControls({
  canvas,
  side = 'bottom',
}: {
  readonly canvas: DockCanvas;
  readonly side?: MenuSide;
}) {
  return (
    <ToolbarGroup aria-label="Map" className="command-dock__cluster">
      <IdentitySurface
        icon={<MapIcon />}
        kind="Map"
        testId="selected-canvas"
        title={canvas.selected.title}
        triggerTitle="Switch Map"
        onRename={canvas.onRename}
      >
        {(disclosure) => <MapIdentityMenu canvas={canvas} side={side} disclosure={disclosure} />}
      </IdentitySurface>
    </ToolbarGroup>
  );
}

/**
 * The list, the mark on the Map you are in and every key that moves
 * between them are `ChoiceMenu`'s — the same component an Open Space Resource
 * chooses its Map through. What stays here is what the list *is* and
 * what choosing one does, which on this surface is the canvas moving.
 * The commands below it are this cluster's own.
 */
function MapIdentityMenu({
  canvas,
  side,
  disclosure,
}: {
  readonly canvas: DockCanvas;
  readonly side: MenuSide;
  readonly disclosure: IdentityDisclosure;
}) {
  const { trigger, renameItem, triggerId, open, onOpenChange } = disclosure;
  const { restoresFocusOnClose } = useIdentityCaret();
  return (
    <ChoiceMenu<MapId>
      label="Maps"
      choices={canvas.maps}
      chosen={canvas.selected.id}
      onChoose={canvas.onSelect}
      open={open}
      onOpenChange={onOpenChange}
      triggerId={triggerId}
      side={side}
      align={DISCLOSURE_ALIGN}
      sideOffset={DISCLOSURE_SIDE_OFFSET}
      className={`nokey ${DISCLOSURE_WIDTH}`}
      restoresFocusOnClose={identityMenuRestoresFocusOnClose(
        canvas.didCreateMoveCaret,
        restoresFocusOnClose,
      )}
      trigger={trigger}
    >
      <MapMenuActions
        title={canvas.selected.title}
        renameItem={renameItem}
        onCreate={canvas.onCreate}
        onCopyLink={canvas.onCopyLink}
        onDelete={canvas.onDelete}
      />
    </ChoiceMenu>
  );
}

/**
 * Graph, carrying the colour that identifies it on the canvas and the one
 * command that is a Graph's alone: Present traverses the Active Graph.
 */
export function GraphControls({
  graph,
  mapTitle,
  side = 'bottom',
  vertical = false,
}: {
  readonly graph: DockGraph;
  /** Only to caption the list: the Graphs a menu offers are the ones this Map owns. */
  readonly mapTitle: string;
  readonly side?: MenuSide;
  readonly vertical?: boolean;
}) {
  /**
   * **Present leads along a row and trails down a column**, and this is the one
   * resource in the Dock the edge reorders.
   *
   * Along a row it leads: it acts on the named entity the cluster is showing, so
   * it sits at the edge the eye enters from, ahead of the name it acts on.
   *
   * Down a column it cannot, because a column pays for it differently. A
   * leading verb needs a track of its own on *every* row — three of the four
   * rows have no verb, and the 28px sits empty on each — and Resources' Create
   * trails, so a leading Present makes the grid four tracks wide: 84px of a
   * 208px column spent on gutters. Trailing, both verbs share one track and the
   * column is three.
   *
   * It is a **reorder of the JSX and not a second placement rule**, so what the
   * eye reads and what the Tab key visits stay the same order. Placing the
   * button visually while leaving it first in the DOM would have bought the
   * same picture with a focus order that contradicts it.
   */
  const present = (
    <ToolbarButton
      variant="ghost"
      size="icon"
      className="command-dock__verb"
      aria-label={`Present ${graph.active.title}`}
      title={`Present ${graph.active.title}`}
      disabled={graph.presentDisabled}
      onClick={graph.onPresent}
    >
      {/* Filled rather than outlined, which is the transport convention and not
          a decoration: at 12px an outlined triangle is mostly the paper behind
          it, so the one control on this cluster that starts something reads as
          the lightest mark on it. `filled` is the icon's own prop — this used
          to be a rule in `command-dock.css` reaching through the button into
          the `svg` to beat Lucide's `fill="none"` attribute, which is a surface
          overriding a glyph's drawing rather than asking it for one. The
          Sidebar's Present is unfilled still, and stays that way until the
          surface it belongs to is decided. */}
      <PresentIcon color={graph.activeColor} filled />
    </ToolbarButton>
  );

  return (
    <ToolbarGroup aria-label="Graph" className="command-dock__cluster">
      {vertical ? null : present}
      {/* The one identity that carries colour, and it carries it on the glyph
          alone — the stroke the Edges of this Graph are drawn in. A neutral
          swatch stood here and said only "a colour applies"; a Graph glyph
          says which *kind* of entity the colour belongs to, and it is
          `@project/ui`'s own `GraphIcon` rather than a mark this module
          invents. */}
      <IdentitySurface
        icon={<GraphIcon color={graph.activeColor} size={14} />}
        kind="Graph"
        testId="active-graph"
        title={graph.active.title}
        triggerTitle="Switch Graph"
        onRename={
          graph.onRename === null
            ? null
            : (title) => graph.onRename?.(graph.active.id, title) ?? null
        }
      >
        {(disclosure) => (
          <GraphIdentityMenu
            graph={graph}
            mapTitle={mapTitle}
            side={side}
            disclosure={disclosure}
          />
        )}
      </IdentitySurface>
      {vertical ? present : null}
    </ToolbarGroup>
  );
}

/**
 * The same `ChoiceMenu` the Map cluster and an Open Space Resource draw,
 * with each row carrying the colour its Graph is drawn in — a choice's
 * own mark is the choice's, which is why it rides on the choice rather
 * than being rendered here. The mark is `GraphColorLine`, the line the canvas
 * HUD's key draws, rather than a Graph glyph on every row: the list is already
 * a list of Graphs, and the line is what a Graph's colour means on the canvas.
 * The cluster's own identity and Colour… keep the coloured glyph, where it says
 * which kind of entity the colour belongs to.
 */
function GraphIdentityMenu({
  graph,
  mapTitle,
  side,
  disclosure,
}: {
  readonly graph: DockGraph;
  readonly mapTitle: string;
  readonly side: MenuSide;
  readonly disclosure: IdentityDisclosure;
}) {
  const { trigger, renameItem, triggerId, open, onOpenChange } = disclosure;
  const { restoresFocusOnClose } = useIdentityCaret();
  return (
    <ChoiceMenu<GraphId>
      label={`Graphs in ${mapTitle}`}
      choices={graph.graphs.map((each) => ({
        id: each.id,
        title: each.title,
        icon: <GraphColorLine color={graphColor(each, graph.colorByGraphId)} />,
      }))}
      chosen={graph.active.id}
      onChoose={graph.onActivate}
      open={open}
      onOpenChange={onOpenChange}
      triggerId={triggerId}
      side={side}
      align={DISCLOSURE_ALIGN}
      sideOffset={DISCLOSURE_SIDE_OFFSET}
      className={`nokey ${DISCLOSURE_WIDTH}`}
      restoresFocusOnClose={restoresFocusOnClose}
      trigger={trigger}
    >
      <GraphMenuActions
        title={graph.active.title}
        renameItem={renameItem}
        editsDisabled={graph.editsDisabled}
        deleteDisabled={graph.editsDisabled || graph.graphs.length <= 1}
        color={graph.activeColor}
        colors={GRAPH_PALETTE_ENTRIES}
        onRecolor={(color) => {
          graph.onRecolor(graph.active.id, color);
          onOpenChange(false);
        }}
        onCreate={graph.onCreate}
        onCopyLink={graph.onCopyLink}
        onDelete={() => graph.onDelete(graph.active.id)}
      />
    </ChoiceMenu>
  );
}
