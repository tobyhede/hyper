import { useContext, type ReactNode } from 'react';
import { EdgeLabelRenderer, type EdgeProps } from '@xyflow/react';
import { RoutedEdge, routedEdgeGeometry, type RoutedFlowEdge } from '@project/react-flow-adapter';
import { edgeSelectionOf, sameEdgeSubject } from '../render-adapter';
import { EdgeAuthoringContext } from './edge-authoring-context';
import { selectedEdgeRefusalOf } from '../edge-authoring';
import { SelectedEdgeControls } from './SelectedEdgeControls';

/**
 * Where a selected Edge's controls are drawn: in the DOM, over the SVG.
 *
 * `EdgeLabelRenderer` is React Flow's own escape hatch for exactly this: it
 * portals children into a transformed div layered over the flow, so ordinary
 * buttons and popovers pan and zoom with the canvas. `nopan`/`nodrag` keep a
 * press on the controls from panning the canvas underneath them. `.nokey`
 * excludes their buttons from React Flow's live Space-key pan activation
 * subscription; canvas deletion belongs to the app instead.
 *
 * Placement only. What sits inside it is `SelectedEdgeControls`, which knows
 * nothing about React Flow.
 */
function EdgeControlLayer({
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
        className="edge-control-layer nodrag nopan nokey"
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
 * the bezier fallback and the point the controls sit at all come from
 * `routedEdgeGeometry`, so this cannot disagree with what is on screen.
 *
 * The controls' visibility rule is `selected`, React Flow's own default for edge
 * toolbars, and Enter and Space keep their native selection meaning on the Edge
 * itself: neither is overloaded to open the editor. Only the Edit control does
 * that.
 *
 * This is the whole of the React Flow half. It translates the Edge into a domain
 * subject, resolves the module-wide refusal to the two channels the selected
 * Edge's controls own, and places the result — no field, no picker and no
 * refusal copy of its own.
 */
export function AuthorableEdge(props: EdgeProps<RoutedFlowEdge>) {
  const commands = useContext(EdgeAuthoringContext);
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
      <EdgeControlLayer labelX={labelX} labelY={labelY}>
        <SelectedEdgeControls
          from={subject.edge.from}
          to={subject.edge.to}
          editorOpen={open}
          endpointChoices={(endpoint) => commands.endpointChoices(subject, endpoint)}
          refusal={selectedEdgeRefusalOf(commands.refusal)}
          onOpenEditor={() => commands.openEditor(subject)}
          onCloseEditor={commands.closeEditor}
          onReconnect={commands.reconnect}
          onDelete={() => commands.deleteEdge(subject)}
        />
      </EdgeControlLayer>
    </>
  );
}
