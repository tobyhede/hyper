import { useContext, useState, type ReactNode } from 'react';
import { EdgeLabelRenderer, type EdgeProps } from '@xyflow/react';
import type { CardId, GraphEdge, GraphId } from '@project/core';
import { RoutedEdge, routedEdgeGeometry, type RoutedFlowEdge } from '@project/react-flow-adapter';
import { CardPicker, Popover, PopoverAnchor, PopoverContent } from '@project/ui';
import { EdgeAuthoringContext, type EdgeAuthoringCommands } from './edge-authoring-context';

/**
 * Controls drawn beside one Edge, in the DOM rather than in the SVG.
 *
 * `EdgeLabelRenderer` is React Flow's own escape hatch for exactly this: it
 * portals children into a transformed div layered over the flow, so ordinary
 * buttons and popovers pan and zoom with the canvas. `nopan`/`nodrag` keep a
 * press on the toolbar from panning the canvas underneath it, and `.nokey`
 * keeps React Flow's document-level key handler from reading a keystroke typed
 * here as a canvas command.
 */
function EdgeToolbar({
  labelX,
  labelY,
  children,
}: {
  labelX: number;
  labelY: number;
  children: ReactNode;
}) {
  return (
    <EdgeLabelRenderer>
      <div
        className="edge-toolbar nodrag nopan nokey"
        style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
      >
        {children}
      </div>
    </EdgeLabelRenderer>
  );
}

/**
 * The application's authorable Edge: `RoutedEdge`'s path, plus Hyper's controls.
 *
 * It composes the reusable Edge rather than redrawing it — the routed polyline,
 * the bezier fallback and the point a toolbar sits at all come from
 * `routedEdgeGeometry`, so this cannot disagree with what is on screen.
 *
 * The toolbar's visibility rule is `selected`, React Flow's own default for edge
 * toolbars, and Enter and Space keep their native selection meaning on the Edge
 * itself: neither is overloaded to open the editor. Only the button does that.
 */
export function AuthorableEdge(props: EdgeProps<RoutedFlowEdge>) {
  const commands = useContext(EdgeAuthoringContext);
  const { labelX, labelY } = routedEdgeGeometry(props);
  const graphId = props.data?.graphId;
  const edge: GraphEdge = { from: props.source as CardId, to: props.target as CardId };

  if (!props.selected || commands === null || graphId === undefined) {
    return <RoutedEdge {...props} />;
  }

  const open =
    commands.editing !== null &&
    commands.editing.graphId === graphId &&
    commands.editing.edge.from === edge.from &&
    commands.editing.edge.to === edge.to;

  return (
    <>
      <RoutedEdge {...props} />
      <EdgeToolbar labelX={labelX} labelY={labelY}>
        <Popover
          open={open}
          onOpenChange={(next) =>
            next ? commands.openEditor(graphId, edge) : commands.closeEditor()
          }
        >
          <PopoverAnchor asChild>
            <div className="edge-toolbar__anchor">
              <button
                type="button"
                className="edge-toolbar__button"
                data-testid="edge-edit"
                aria-label="Edit this Edge"
                aria-expanded={open}
                onClick={() => (open ? commands.closeEditor() : commands.openEditor(graphId, edge))}
              >
                Edit
              </button>
              <button
                type="button"
                className="edge-toolbar__button"
                data-testid="edge-delete"
                aria-label="Delete this Edge"
                onClick={() => commands.deleteEdge(graphId, edge)}
              >
                Delete
              </button>
            </div>
          </PopoverAnchor>
          <PopoverContent
            className="edge-editor"
            data-testid="edge-editor"
            aria-label="Edge endpoints"
          >
            <EdgeEndpointFields graphId={graphId} edge={edge} commands={commands} />
          </PopoverContent>
        </Popover>
      </EdgeToolbar>
    </>
  );
}

/**
 * The Edge's two endpoints as pickers — the keyboard path to a reconnection.
 *
 * Both fields show the Card they currently name, so the existing endpoint is
 * unchanged until the author picks another; a result that would duplicate a
 * different Edge in this Graph arrives from eligibility already disabled.
 */
function EdgeEndpointFields({
  graphId,
  edge,
  commands,
}: {
  graphId: GraphId;
  edge: GraphEdge;
  commands: EdgeAuthoringCommands;
}) {
  // Read once per render of the open editor rather than per keystroke: the
  // choices are a function of the Space, and the Space cannot change while a
  // synchronous pick is being made.
  const [from] = useState(() => commands.endpointChoices(graphId, edge, 'from'));
  const [to] = useState(() => commands.endpointChoices(graphId, edge, 'to'));

  return (
    <div className="edge-editor__fields">
      <CardPicker
        label="From"
        testId="edge-from"
        choices={from}
        value={edge.from}
        onValueChange={(cardId) => commands.reconnect('from', cardId as CardId)}
      />
      <CardPicker
        label="To"
        testId="edge-to"
        choices={to}
        value={edge.to}
        onValueChange={(cardId) => commands.reconnect('to', cardId as CardId)}
      />
      {commands.refusal !== null && (
        <span role="alert" className="edge-editor__refusal" data-testid="edge-refusal">
          {commands.refusal}
        </span>
      )}
    </div>
  );
}
