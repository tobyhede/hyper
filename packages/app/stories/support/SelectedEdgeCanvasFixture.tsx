import { useEffect, useMemo, useState } from 'react';
import { Background, ReactFlow, ReactFlowProvider, type EdgeTypes } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { GraphEdge, GraphId } from '@project/core';
import type { LayoutStrategyGraph } from '@project/graph';
import { nodeTypes } from '@project/react-flow-adapter';
// Through the package's own subpath imports, as `#components/*` already is: a
// story sits two directories above `src`, and climbing there by relative path is
// how a package boundary gets crossed without naming one (AGENTS.md).
import { canvasProjection } from '#src/canvas-projection';
import { cardChoiceOf } from '#src/card-choice';
import type { SelectedEdgeRefusal } from '#src/edge-authoring';
import { edgeSelectionOf } from '#src/render-adapter';
import { createRendererResolver, defaultRenderer } from '#src/renderer';
import { AuthorableEdge } from '#components/AuthorableEdge';
// `#components/*` maps to `src/components/*.tsx`; this seam is a `.ts`, so it
// comes through `#src/*` instead. Naming the wrong one resolves to nothing and
// hands every command an implicit `any`.
import {
  EdgeAuthoringContext,
  type EdgeAuthoringCommands,
} from '#src/components/edge-authoring-context';
import { authoredSpace, storyGraphIds } from './spaces';

/**
 * The selected Edge's controls where they actually live: on a routed Edge, on a
 * real React Flow canvas, at the zoom the canvas is showing.
 *
 * **This is a `Review/` story on purpose.** It carries no parity claim and
 * asserts nothing — it exists to be *looked at*, because the isolated component
 * stories cannot show the one thing that decides whether this surface works.
 * `EdgeLabelRenderer` portals the controls into the flow's transformed layer, so
 * they are drawn at the viewport's scale: the fixture opens at roughly 0.55 and
 * the controls are correspondingly small, which a story rendering the component
 * at 1:1 flatters out of existence. Legibility, collision with Cards and the
 * HUD, and weight against the drawn Edges are all questions only this can
 * answer.
 *
 * Nothing here is a stand-in. `canvasProjection` is the application's own
 * derivation, `nodeTypes` and `AuthorableEdge` are the production node and Edge,
 * and the commands come through the same context the canvas provides.
 */
const SPACE = authoredSpace;

/** The production Edge type, keyed as the projection keys it. */
const EDGE_TYPES: EdgeTypes = { routed: AuthorableEdge };

/**
 * The renderer the story opens on: the Space's declared default, which is its
 * first positioned Layout — so the placement comes from authored positions
 * rather than from running elkjs inside a story.
 */
const RENDERER = createRendererResolver({ newGraphId: storyGraphIds() })(
  SPACE,
  defaultRenderer(SPACE),
);

const PENDING = canvasProjection(SPACE, RENDERER);

const ACTIVE_GRAPH: GraphId | null = RENDERER.subject.graphs[0]?.id ?? null;

export interface SelectedEdgeCanvasFixtureProps {
  /**
   * How close the canvas is.
   *
   * `fit` is what an author sees on opening — every Card in view, and the
   * controls drawn at that scale. `close` is the same surface at 1:1, which is
   * what the component stories show; the pair together is the comparison worth
   * looking at.
   */
  readonly zoom?: 'fit' | 'close';
  /** Whether the endpoint editor opens with the story. */
  readonly editorOpen?: boolean;
  /** A structured refusal, shown on whichever channel owns it. */
  readonly refusal?: SelectedEdgeRefusal | null;
}

export function SelectedEdgeCanvasFixture({
  zoom = 'fit',
  editorOpen = false,
  refusal = null,
}: SelectedEdgeCanvasFixtureProps) {
  const [laidOut, setLaidOut] = useState<LayoutStrategyGraph | null>(null);
  const [open, setOpen] = useState(editorOpen);
  // A completed reconnection's endpoints, held so the controls redraw on the
  // Edge it produced — the canvas gets that from the next projection, and this
  // story has no Authoring behind it to produce one.
  const [reconnected, setReconnected] = useState<GraphEdge | null>(null);

  useEffect(() => {
    let live = true;
    void RENDERER.strategy(PENDING.strategyGraph).then((resolved) => {
      if (live) setLaidOut(resolved);
    });
    return () => {
      live = false;
    };
  }, []);

  const projected = useMemo(
    () =>
      laidOut === null
        ? null
        : PENDING.project(laidOut, {
            activeGraphId: ACTIVE_GRAPH,
            activeCardId: null,
            selectedCardId: null,
            presenting: false,
            moved: false,
          }),
    [laidOut],
  );

  /**
   * The first Edge of the Active Graph, and the domain subject behind it.
   *
   * Read through the production `edgeSelectionOf` rather than off `source` and
   * `target` here: that translation — including the widening React Flow's `Edge`
   * type does to a `CardId` — is the render adapter's, and a second copy in a
   * fixture is exactly the transcription ADR 0052 rules out.
   */
  const selected = useMemo(
    () =>
      (projected?.edges ?? []).flatMap((edge) => {
        const subject = edgeSelectionOf(edge);
        return subject !== null && subject.graphId === ACTIVE_GRAPH ? [{ edge, subject }] : [];
      })[0] ?? null,
    [projected],
  );

  const endpoints: GraphEdge | null = reconnected ?? selected?.subject.edge ?? null;

  const commands = useMemo<EdgeAuthoringCommands>(
    () => ({
      editing:
        open && selected !== null && endpoints !== null
          ? { graphId: selected.subject.graphId, edge: endpoints }
          : null,
      refusal,
      openEditor: () => setOpen(true),
      closeEditor: () => setOpen(false),
      reconnect: (endpoint, cardId) => {
        if (endpoints === null) return;
        setReconnected(
          endpoint === 'from'
            ? { from: cardId, to: endpoints.to }
            : { from: endpoints.from, to: cardId },
        );
        setOpen(false);
      },
      deleteEdge: () => setOpen(false),
      endpointChoices: () => SPACE.cards.map((card) => cardChoiceOf(card, { kind: 'eligible' })),
    }),
    [open, refusal, selected, endpoints],
  );

  const edges =
    projected === null
      ? []
      : projected.edges.map((edge) =>
          edge === selected?.edge ? { ...edge, selected: true } : edge,
        );

  return (
    <div className="h-[30rem] w-full bg-background p-[0.75rem] text-foreground">
      <div className="h-full overflow-hidden rounded-[8px] border border-border">
        <ReactFlowProvider>
          {/* The provider wraps the flow rather than sitting inside it: React
              Flow renders Edges as a sibling of the children it is given, so a
              provider in the children reaches no Edge at all. */}
          <EdgeAuthoringContext.Provider value={commands}>
            <ReactFlow
              nodes={projected === null ? [] : [...projected.nodes]}
              edges={edges}
              nodeTypes={nodeTypes}
              edgeTypes={EDGE_TYPES}
              // One camera property or the other, never both and never an
              // explicit `undefined`: `exactOptionalPropertyTypes` reads a
              // passed `undefined` as a value rather than an absence.
              {...(zoom === 'fit' ? { fitView: true } : { defaultViewport: CLOSE_VIEWPORT })}
              minZoom={0.05}
              maxZoom={4}
            >
              <Background gap={24} />
            </ReactFlow>
          </EdgeAuthoringContext.Provider>
        </ReactFlowProvider>
      </div>
    </div>
  );
}

/** 1:1, roughly over the first Edge, so the two zoom stories frame the same Cards. */
const CLOSE_VIEWPORT = { x: -120, y: -40, zoom: 1 };
