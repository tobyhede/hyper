import {
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { EdgeLabelRenderer, type EdgeProps } from '@xyflow/react';
import {
  RoutedEdgePath,
  routedEdgePathProps,
  useRoutedEdgeGeometry,
  type RoutedFlowEdge,
} from '@project/react-flow-adapter';
import {
  cn,
  CommandSurface,
  EdgeTitle,
  EdgeToolbar,
  edgeTitleRoom,
  type EdgeTitleProps,
} from '@project/ui';
import { describeAuthoringRefusal } from '../authoring-refusal';
import { edgeSelectionOf, sameEdgeSubject, type EdgeSubject } from '../render-adapter';
import { EdgeAuthoringContext, type EdgeAuthoringCommands } from './edge-authoring-context';

/**
 * The Edge element focus returns to from its chrome. Searched from the chrome's
 * own flow, not `document`, because the page may hold several canvases.
 */
const edgeElementOf = (from: Element | null, edgeId: string): SVGElement | null =>
  from
    ?.closest('.react-flow')
    ?.querySelector<SVGElement>(`.react-flow__edge[data-id="${edgeId}"]`) ?? null;

/**
 * The application's authorable Edge: the reusable path, plus Hyper's chrome.
 *
 * Curve, midpoint and span all come from one `useRoutedEdgeGeometry`, so the
 * chrome cannot disagree with the drawn line. Only Active Graph Edges draw chrome.
 */
export function AuthorableEdge(props: EdgeProps<RoutedFlowEdge>) {
  const commands = useContext(EdgeAuthoringContext);
  const { path, labelX, labelY, span } = useRoutedEdgeGeometry(props);
  const line = <RoutedEdgePath {...routedEdgePathProps(props, path)} />;
  // The same translation the selection mirror and the callbacks use, so this
  // Edge cannot disagree with them about which Edge it is. It gates on `type`,
  // which React Flow passes into Edge props — held by edge-authoring-react.test.tsx,
  // 'appears on the selected Edge alone, named for its endpoints while it has no Title'.
  const subject = edgeSelectionOf(props);
  if (commands === null || subject?.graphId !== commands.activeGraphId) {
    return line;
  }
  return (
    <>
      {line}
      <EdgeChrome
        edgeId={props.id}
        subject={subject}
        title={props.data?.title ?? null}
        titleHidden={props.data?.titleHidden === true}
        stroke={{ color: props.style?.stroke, width: props.style?.strokeWidth }}
        span={span}
        labelX={labelX}
        labelY={labelY}
        authorable={props.selectable === true}
        selected={props.selected === true}
        commands={commands}
      />
    </>
  );
}

interface EdgeChromeProps {
  readonly edgeId: string;
  readonly subject: EdgeSubject;
  readonly title: string | null;
  readonly titleHidden: boolean;
  readonly stroke: EdgeTitleProps['stroke'];
  readonly span: number;
  readonly labelX: number;
  readonly labelY: number;
  /** In the Active Graph with authoring available: the Edge may reveal commands. */
  readonly authorable: boolean;
  readonly selected: boolean;
  readonly commands: EdgeAuthoringCommands;
}

/**
 * An Active Graph Edge's Title and, while revealed (hover, Selection or Title
 * editing), its toolbar.
 *
 * `nopan`/`nodrag` stop a press panning the canvas; `.nokey` keeps the controls
 * out of React Flow's key handling and the canvas delete command. The label
 * layer sits beneath Resources, so `.edge-control-layer` raises revealed chrome.
 * Escape returns focus to the Edge, which is the tab stop.
 */
function EdgeChrome({
  edgeId,
  subject,
  title,
  titleHidden,
  stroke,
  span,
  labelX,
  labelY,
  authorable,
  selected,
  commands,
}: EdgeChromeProps) {
  const layer = useRef<HTMLDivElement>(null);
  const titleControl = useRef<HTMLButtonElement>(null);
  const refusalId = useId();
  const editing = commands.editingTitle !== null && sameEdgeSubject(commands.editingTitle, subject);
  const revealed = authorable && (selected || editing || commands.hovered === edgeId);
  const name =
    title ??
    `${commands.resourceName(subject.edge.from)} → ${commands.resourceName(subject.edge.to)}`;
  const { refusal } = commands;
  const sentence =
    refusal?.kind === 'command' && sameEdgeSubject(refusal, subject)
      ? describeAuthoringRefusal(refusal.refusal)
      : null;

  // After the Title field closes, focus returns to the Title, or to the Edge if
  // there is none. Decided when the edit ends, because a written Title renders
  // only once its projection arrives; owed only when the field asks, so a blur
  // elsewhere leaves the caret alone.
  const endedWith = useRef<'title' | 'edge'>('edge');
  const [returning, setReturning] = useState(false);
  useEffect(() => {
    if (!returning || editing) return;
    if (endedWith.current === 'title') {
      if (titleControl.current === null) return;
      titleControl.current.focus();
    } else {
      edgeElementOf(layer.current, edgeId)?.focus();
    }
    setReturning(false);
  }, [returning, editing, edgeId, title]);

  const returnToEdge = (event: ReactKeyboardEvent<HTMLElement>): void => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    edgeElementOf(layer.current, edgeId)?.focus();
  };

  const onLine = title === null && !editing;

  return (
    <EdgeLabelRenderer>
      <div
        ref={layer}
        className="edge-control-layer nodrag nopan nokey"
        data-edge-chrome={edgeId}
        data-revealed={revealed}
        style={{ transform: `translate(${labelX}px, ${labelY}px)` }}
        onPointerEnter={authorable ? () => commands.hover(edgeId) : undefined}
        onPointerLeave={authorable ? () => commands.unhover(edgeId) : undefined}
        onKeyDown={returnToEdge}
      >
        <div className="absolute top-0 left-0 flex w-max -translate-x-1/2 -translate-y-1/2">
          <EdgeTitle
            ref={titleControl}
            title={title}
            name={name}
            hidden={titleHidden}
            revealed={revealed}
            room={edgeTitleRoom(span)}
            stroke={stroke}
            editor={
              editing
                ? {
                    onComplete: (draft) => {
                      const refused = commands.completeTitle(draft);
                      // An empty draft clears the Title.
                      if (refused === null)
                        endedWith.current = draft.trim() === '' ? 'edge' : 'title';
                      return refused;
                    },
                    onCancel: () => {
                      endedWith.current = title === null ? 'edge' : 'title';
                      commands.cancelTitleEdit();
                    },
                    onReturnFocus: () => setReturning(true),
                    errorShownBy: refusalId,
                  }
                : undefined
            }
            onBeginEdit={() => commands.beginTitleEdit(subject)}
          />
          {revealed && (
            // With no Title or field the toolbar sits on the midpoint and a refusal
            // hangs below it; otherwise it floats above the Title.
            <div
              className={
                onLine
                  ? 'absolute top-0 left-1/2 flex w-max -translate-x-1/2 -translate-y-1/2 flex-col items-center'
                  : 'absolute bottom-full left-1/2 flex w-max -translate-x-1/2 flex-col items-center gap-1 pb-2'
              }
            >
              <EdgeToolbar
                name={name}
                title={title === null ? 'none' : titleHidden ? 'hidden' : 'shown'}
                writingTitle={editing}
                onEdit={() => commands.beginTitleEdit(subject)}
                onToggleTitle={() => commands.setTitleHidden(subject, !titleHidden)}
                onDelete={() => commands.deleteEdge(subject)}
                onKeyDown={returnToEdge}
              />
              {sentence !== null && (
                <CommandSurface
                  id={refusalId}
                  role="alert"
                  className={cn(
                    'max-w-60 text-chrome-xs text-destructive',
                    onLine && 'absolute top-full mt-1 w-max',
                  )}
                >
                  {sentence}
                </CommandSurface>
              )}
            </div>
          )}
        </div>
      </div>
    </EdgeLabelRenderer>
  );
}
