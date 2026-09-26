/**
 * The Command Dock's Map and Graph clusters: each a named identity whose list
 * switches, renames, adds and deletes, and on the Graph side the Present
 * command. `CommandDock` mounts {@link MapControls} and {@link GraphControls}.
 */
import {
  ChoiceMenu,
  GraphIcon,
  GraphLegendMark,
  GraphMenuActions,
  MapIcon,
  MapMenuActions,
  PresentIcon,
  ToolbarButton,
  ToolbarGroup,
  graphColor,
} from '@project/ui';
import { graphHeadShape, type GraphId, type MapId } from '@project/core';
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
import type { DockCanvas, DockGraph } from './command-dock-chrome';
import { IdentitySurface } from './CommandDockParts';

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
   * control in the Dock the edge reorders.
   *
   * Along a row it leads: it acts on the named entity the cluster is showing, so
   * it sits at the edge the eye enters from, ahead of the name it acts on.
   *
   * Down a column it cannot, because a column pays for it differently. A
   * leading verb needs a track of its own on *every* row — three of the four
   * rows have no verb, and the track sits empty on each — and Resources' Create
   * trails, so a leading Present would make the grid a track wider. Trailing,
   * both verbs share one track.
   *
   * It is a **reorder of the JSX and not a second placement rule**, so what the
   * eye reads and what the Tab key visits stay the same order. Placing the
   * button visually while leaving it first in the DOM would give the same
   * picture with a focus order that contradicts it.
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
          the lightest mark on it. `filled` is the icon's own prop, so the
          surface asks the glyph for a fill rather than overriding Lucide's
          `fill="none"` from `command-dock.css`. */}
      <PresentIcon color={graph.activeColor} filled />
    </ToolbarButton>
  );

  return (
    <ToolbarGroup aria-label="Graph" className="command-dock__cluster">
      {vertical ? null : present}
      {/* The one identity that carries colour, and it carries it on the glyph
          alone — the stroke the Edges of this Graph are drawn in. A Graph
          glyph says which *kind* of entity the colour belongs to, and it is
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
 * than being rendered here. The mark is `GraphLegendMark`, the miniature Edge the
 * canvas HUD's key draws, rather than a Graph glyph on every row: the list is
 * already a list of Graphs, and the line and its head shape are how a Graph's
 * Edges are drawn on the canvas.
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
        icon: (
          <GraphLegendMark
            color={graphColor(each, graph.colorByGraphId)}
            headShape={graphHeadShape(each)}
          />
        ),
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
