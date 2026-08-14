import { useContext, useRef, useState, type ReactNode } from 'react';
import { EdgeLabelRenderer, type EdgeProps } from '@xyflow/react';
import type { CardId } from '@project/core';
import { RoutedEdge, routedEdgeGeometry, type RoutedFlowEdge } from '@project/react-flow-adapter';
import { CardCombobox, Popover, PopoverContent } from '@project/ui';
import { edgeSelectionOf, sameEdgeSubject, type EdgeSubject } from '../render-adapter';
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
  const editorAnchor = useRef<HTMLDivElement>(null);
  const { labelX, labelY } = routedEdgeGeometry(props);
  // The same translation the selection mirror and the callbacks use, so this
  // Edge cannot disagree with them about which Edge it is.
  const subject = edgeSelectionOf({ ...props, id: props.id });

  // `selected` is the whole gate. The decoration conjoins it with the Active
  // Graph, so an Edge outside that Graph never reaches these controls.
  if (!props.selected || commands === null || subject === null) {
    return <RoutedEdge {...props} />;
  }
  const open = commands.editing !== null && sameEdgeSubject(subject, commands.editing);

  return (
    <>
      <RoutedEdge {...props} />
      <EdgeToolbar labelX={labelX} labelY={labelY}>
        <Popover
          open={open}
          onOpenChange={(next) => (next ? commands.openEditor(subject) : commands.closeEditor())}
        >
          <div ref={editorAnchor} className="edge-toolbar__anchor">
            <button
              type="button"
              className="edge-toolbar__button"
              data-testid="edge-edit"
              aria-label="Edit this Edge"
              aria-expanded={open}
              onClick={() => (open ? commands.closeEditor() : commands.openEditor(subject))}
            >
              Edit
            </button>
            <button
              type="button"
              className="edge-toolbar__button"
              data-testid="edge-delete"
              aria-label="Delete this Edge"
              onClick={() => commands.deleteEdge(subject)}
            >
              Delete
            </button>
            {/* A refused Delete is announced by the canvas-level alert rather
                  than here. The refusal is one module-wide value, so a toolbar
                  copy showed a sentence from an unrelated gesture on whichever
                  Edge happened to be selected. */}
          </div>
          <PopoverContent
            anchor={editorAnchor}
            className="edge-editor"
            data-testid="edge-editor"
            aria-label="Edge endpoints"
          >
            <EdgeEndpointFields subject={subject} commands={commands} />
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
  subject,
  commands,
}: {
  subject: EdgeSubject;
  commands: EdgeAuthoringCommands;
}) {
  const { edge } = subject;
  // Read once when the editor opens — Radix unmounts its content on close, so
  // this is per-open rather than per-render.
  //
  // A Space that changes while the editor stands therefore leaves the list
  // stale, and that is the design's own answer rather than an oversight: "the
  // completion can still return `refused` if the Space changed while the picker
  // was open". Recomputing would move the rows under a pointer already on its
  // way to one, and would still not make the pick safe — only the completion's
  // re-validation does that.
  const [from] = useState(() => commands.endpointChoices(subject, 'from'));
  const [to] = useState(() => commands.endpointChoices(subject, 'to'));

  return (
    <div className="edge-editor__fields">
      <CardCombobox
        label="From"
        testId="edge-from"
        choices={from}
        value={edge.from}
        onValueChange={(cardId) => commands.reconnect('from', cardId as CardId)}
      />
      <CardCombobox
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
