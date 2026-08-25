import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Background,
  Controls,
  ReactFlow,
  ReactFlowProvider,
  type OnNodesChange,
} from '@xyflow/react';
import type { CardId } from '@project/core';
import {
  resolveContentCard,
  type LayoutStrategyCard,
  type LayoutStrategyGraph,
} from '@project/graph';
import { edgeTypes, nodeTypes, type CardFlowNode } from '@project/react-flow-adapter';
import { MAX_ZOOM, OVERVIEW_FIT } from '#src/camera';
import { canvasProjection, type CanvasInteraction } from '#src/canvas-projection';
import { CARD_HEIGHT, CARD_WIDTH, cardSizeVars } from '#src/card';
import { createRendererResolver } from '#src/renderer';
import { graphIds, layoutId, space } from '../support/fixture';
import './expanding-cards.css';

/**
 * Opening a Card as that Card Expanding, on the canvas it already lives on
 * (ADR 0064).
 *
 * **This is the application's canvas.** The Space is the catalogue fixture,
 * through `loadSpace`; the renderer is `createRendererResolver` over the
 * fixture's own Layout; the placement is `positionedStrategy`; the nodes and
 * Edges are `canvasProjection`; the node and Edge components are the adapter's
 * `nodeTypes` and `edgeTypes`, so every Card is the production `CanvasCard` with
 * the production rail, palette, hover and drag treatment, alias marker, dotted
 * Alias border, Connect and Edit controls, title editor and refusal display, and
 * every Edge is the production `AuthorableEdge`. Handle geometry is
 * `declaredHandles`, at the offsets the strategy computed. The camera constants
 * are `OVERVIEW_FIT` and `MAX_ZOOM`.
 *
 * Nothing here redraws any of that. What this module holds is the **difference**
 * Expanding makes, and that difference is the implementation surface — read the
 * two functions below and the one decoration pass, and you have read the change.
 *
 * ## What is still the story's, and what replaces each
 *
 * Two things, both state plumbing rather than surface, both named in
 * `.scratch/expanded-cards/spec.md`:
 *
 *  - {@link expandCards} holds the rect and the displacement over a resolved
 *    `LayoutStrategyGraph`. In production the rect belongs to `Placement`
 *    (slice 2) and the displacement to `Placement.drawn`, with the inverse
 *    inside `Placement.next` and `buildLayoutStrategyGraph` taking a size per
 *    Card (slice 3).
 *  - {@link useAuthoring} holds expansion, drags, titles and bodies in React
 *    state. In production each is a completed Edit through Space Authoring —
 *    `settled-card-movement` exists today, and `opened-card`, `closed-card` and
 *    `resized-card` are slice 4.
 *
 * Neither touches what a Card *is*. Swapping them for the real seams changes
 * where the rects come from and nothing about what is drawn.
 */

/** The box a Card Expands to before an author resizes it. */
const EXPANDED_DEFAULT = { width: 560, height: 420 } as const;

/** The Graph the fixture Layout opens active, so the projection colours it. */
const ACTIVE_GRAPH = graphIds.long;

const resolveRenderer = createRendererResolver({
  // A selected Layout never converts, so the resolver cannot reach this. It is a
  // real id because the resolver takes no story-shaped partial (ADR 0016).
  newGraphId: () => graphIds.short,
});
const renderer = resolveRenderer(space, { kind: 'layout', layoutId });
const pending = canvasProjection(space, renderer);
const placed = renderer.strategy(pending.strategyGraph);

/**
 * Each Card's *own* title, for the readout.
 *
 * Deliberately not `resolveContentCard`, which answers the Card an occurrence
 * redraws — an Alias resolved through it prints its Target's name, and the
 * fixture's Alias and its Target then read as the same row twice.
 */
const titleOf = new Map(space.cards.map((card) => [card.id, card.title]));

/** Which Cards are Expanded, and how big each is. */
type Expansion = ReadonlyMap<CardId, { readonly width: number; readonly height: number }>;

/** Where the author has dragged a Card, in authored coordinates. */
type Moved = ReadonlyMap<CardId, { readonly x: number; readonly y: number }>;

/** A Card's title and source once the author has changed either. */
type Content = ReadonlyMap<CardId, { readonly title: string; readonly body: string }>;

/** Which field of which Card holds the caret. One at a time, canvas-wide. */
type Caret = { readonly cardId: CardId; readonly field: 'title' | 'body' } | null;

const NO_DISPLACEMENT = { x: 0, y: 0 } as const;

/**
 * How far a Card is pushed by every *other* Expanded Card: one `+x` of a Card
 * that grew takes that growth on its own `x`, and the same for `y`.
 *
 * Derived and never stored, which is the whole of ADR 0064's claim here. The two
 * rejected answers were that neighbours are *edited* out of the way — their
 * authored positions change, and collapsing cannot put them back — or that Cards
 * simply overlap and the author sorts it out. Deriving it leaves the authored
 * Layout exactly as authored, makes collapsing exact rather than approximate,
 * and needs no Edit.
 *
 * Both comparisons read authored positions on both sides, so the answer does not
 * depend on the order Cards are visited and two Expanded Cards displace a third
 * by the sum of their growth.
 */
const displacementOf = (cards: readonly LayoutStrategyCard[], self: LayoutStrategyCard) => {
  let x = 0;
  let y = 0;
  for (const other of cards) {
    if (other.id === self.id) continue;
    const grownX = other.width - CARD_WIDTH;
    const grownY = other.height - CARD_HEIGHT;
    if (grownX === 0 && grownY === 0) continue;
    if ((self.x ?? 0) > (other.x ?? 0)) x += grownX;
    if ((self.y ?? 0) > (other.y ?? 0)) y += grownY;
  }
  return { x, y };
};

/**
 * The resolved placement with the Expanded Cards at their real size, and every
 * Card where that leaves it drawn.
 *
 * **This is the seam the whole capability rests on.** Every consumer downstream
 * already reasons per Card: `projectCardNodes` declares `node.width`/
 * `node.height` from this rect, `declaredHandles` puts the four authoring
 * handles and each Graph's port on it, `resolveHandles` spreads the anchors down
 * it, and the Edge projection routes between them. None of that needed changing
 * — the render layer was built for varying rects and had only ever been handed a
 * constant.
 */
const expandCards = (
  laidOut: LayoutStrategyGraph,
  moved: Moved,
  expansion: Expansion,
  push: boolean,
): LayoutStrategyGraph => {
  const authored = laidOut.cards.map((card): LayoutStrategyCard => {
    const at = moved.get(card.id);
    const grown = expansion.get(card.id);
    const next: LayoutStrategyCard = { ...card };
    if (at !== undefined) {
      next.x = at.x;
      next.y = at.y;
    }
    if (grown !== undefined) {
      next.width = grown.width;
      next.height = grown.height;
    }
    return next;
  });
  if (!push) return { cards: authored, edges: laidOut.edges };
  return {
    cards: authored.map((card) => {
      const offset = displacementOf(authored, card);
      return { ...card, x: (card.x ?? 0) + offset.x, y: (card.y ?? 0) + offset.y };
    }),
    edges: laidOut.edges,
  };
};

/**
 * Everything a completed Edit will own, held in React state until it does.
 *
 * Kept in one hook so the story's stand-in is one thing to read and one thing to
 * delete, rather than five `useState` calls scattered through the canvas.
 */
function useAuthoring(initiallyExpanded: readonly CardId[]) {
  const [expansion, setExpansion] = useState<Expansion>(
    () => new Map(initiallyExpanded.map((cardId) => [cardId, EXPANDED_DEFAULT])),
  );
  const [moved, setMoved] = useState<Moved>(new Map());
  const [content, setContent] = useState<Content>(new Map());

  /** `opened-card` / `closed-card`. The camera does not follow (ADR 0064). */
  const toggle = useCallback((cardId: CardId) => {
    setExpansion((current) => {
      const next = new Map(current);
      if (next.has(cardId)) next.delete(cardId);
      else next.set(cardId, EXPANDED_DEFAULT);
      return next;
    });
  }, []);

  /** `resized-card`: a size and no origin, so nothing needs inverting. */
  const resize = useCallback((cardId: CardId, size: { width: number; height: number }) => {
    setExpansion((current) => (current.has(cardId) ? new Map(current).set(cardId, size) : current));
  }, []);

  /**
   * `settled-card-movement`, with the inversion production owes to
   * `Placement.next`: React Flow reports where the Card was *drawn*, so the
   * displacement it is carrying comes back off before the authored position is
   * stored. Crossing an Expanded Card's authored `x` or `y` mid-drag flips which
   * side of it this Card is on and the drawn position steps by that Card's
   * growth — the rule is a step function, and this is what one feels like under
   * a pointer.
   */
  const move = useCallback(
    (cardId: CardId, drawn: { x: number; y: number }, offset: { x: number; y: number }) => {
      setMoved((current) =>
        new Map(current).set(cardId, { x: drawn.x - offset.x, y: drawn.y - offset.y }),
      );
    },
    [],
  );

  const rename = useCallback((cardId: CardId, title: string, was: string): string | null => {
    const settled = title.trim();
    // The one rule production applies to a Card title, with the sentence it
    // gives (`authoring-refusal.ts`), so the refusal is drawn by the production
    // editor where the author is typing.
    if (settled === '') return 'A Card title is required.';
    setContent((current) => {
      const existing = current.get(cardId);
      return new Map(current).set(cardId, {
        title: settled,
        body: existing?.body ?? was,
      });
    });
    return null;
  }, []);

  const write = useCallback((cardId: CardId, body: string, title: string) => {
    setContent((current) => {
      const existing = current.get(cardId);
      return new Map(current).set(cardId, { title: existing?.title ?? title, body });
    });
  }, []);

  return { expansion, moved, content, toggle, resize, move, rename, write };
}

export interface CanvasBehaviour {
  /** Push the Cards `+x` and `+y` of an Expanding Card out of its way. */
  readonly pushNeighbours: boolean;
}

/** A story that cannot lay out says so, rather than looking like it is loading. */
function PlacementFailure({ reason }: { readonly reason: Error }) {
  return <p role="alert">Placement failed: {reason.message}</p>;
}

function Canvas({
  behaviour,
  initiallyExpanded,
}: {
  readonly behaviour: CanvasBehaviour;
  readonly initiallyExpanded: readonly CardId[];
}) {
  const [laidOut, setLaidOut] = useState<LayoutStrategyGraph | Error | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [caret, setCaret] = useState<Caret>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  // Suppressed while a resize drag is live: an eased width lags the pointer,
  // which reads as the Card resisting rather than as it growing.
  const [resizing, setResizing] = useState(false);
  // A Layout authors expansion, so a Space can open with Cards already Expanded
  // — this is the ordinary case rather than a story convenience.
  const authoring = useAuthoring(initiallyExpanded);
  const { expansion, moved, content, toggle, resize, move, rename, write } = authoring;
  const push = behaviour.pushNeighbours;

  useEffect(() => {
    // A cell rather than a `let`, exactly as `support/ReactFlowCanvas.tsx` does
    // it: the compiler cannot see the cleanup assign through the closure and
    // narrows a plain boolean to `true`, which reads as a redundant guard.
    const mounted = { current: true };
    void (async () => {
      try {
        const resolved = await placed;
        if (mounted.current) setLaidOut(resolved);
      } catch (reason) {
        // A story that cannot lay out says so. Left unhandled, a rejected
        // strategy leaves the canvas blank for good — which reads as "still
        // loading", with the cause visible only as an unhandled rejection.
        if (mounted.current) {
          setLaidOut(reason instanceof Error ? reason : new Error(String(reason)));
        }
      }
    })();
    return () => {
      mounted.current = false;
    };
  }, []);

  const drawn = useMemo(
    () =>
      laidOut === null || laidOut instanceof Error
        ? null
        : expandCards(laidOut, moved, expansion, push),
    [laidOut, moved, expansion, push],
  );

  const projected = useMemo(() => {
    if (drawn === null) return null;
    const interaction: CanvasInteraction = {
      activeGraphId: ACTIVE_GRAPH,
      activeCardId: null,
      selectedCardId: null,
      presenting: false,
      // A dragged Card leaves the routing the strategy computed behind, which is
      // what a positioned view draws anyway.
      moved: moved.size > 0,
    };
    return pending.project(drawn, interaction);
  }, [drawn, moved]);

  /**
   * The one decoration pass, and the twin of `SpaceCanvas.editableNodes`.
   *
   * The projection is the Space; this is what the surface offers on top of it.
   * Everything above `expanded` is what `SpaceCanvas` already attaches today and
   * is written the same way — a flag beside the operation that performs it, so a
   * control cannot be drawn without something to run. Everything from `expanded`
   * down is what Expanding adds.
   */
  const nodes: CardFlowNode[] = useMemo(() => {
    if (projected === null) return [];
    return projected.nodes.map((node) => {
      const cardId = node.data.cardId;
      const grown = expansion.get(cardId);
      const written = content.get(cardId);
      const source = resolveContentCard(space, cardId);
      const title = written?.title ?? node.data.title;

      const data: CardFlowNode['data'] = {
        ...node.data,
        title,
        titleEditingEnabled: true,
        cardEditingEnabled: node.data.kind === 'markdown',
        connectingEnabled: true,
        onBeginConnect: () => undefined,
        onEditCard: () => {
          setCaret(null);
          setResizing(false);
          toggle(cardId);
        },
        onBeginTitleEditing: () => setCaret({ cardId, field: 'title' }),
      };
      if (caret?.cardId === cardId && caret.field === 'title') {
        data.titleEditor = {
          onComplete: (next) => {
            const refusal = rename(cardId, next, written?.body ?? source?.body ?? '');
            if (refusal === null) setCaret(null);
            return refusal;
          },
          onCancel: () => setCaret(null),
        };
      }

      if (grown !== undefined) {
        data.expanded = true;
        data.body = written?.body ?? source?.body ?? '';
        data.onBeginBodyEditing = () => setCaret({ cardId, field: 'body' });
        data.resize = {
          minWidth: CARD_WIDTH,
          minHeight: CARD_HEIGHT,
          onResize: (size) => {
            setResizing(true);
            resize(cardId, size);
          },
        };
        if (caret?.cardId === cardId && caret.field === 'body') {
          data.bodyEditor = {
            onComplete: (next) => write(cardId, next, title),
            onEnd: () => setCaret(null),
          };
        }
      }

      const next: CardFlowNode = { ...node, data, selected: selected === cardId };
      // Expanding raises the Card. React Flow paints in node order, so without
      // this a Card grows *under* whatever was declared after it, which reads as
      // the neighbours being in front of the thing just opened. Two Expanded
      // Cards still resolve by document order — nobody's rule, and the honest
      // first answer until a Layout carries an ordinal.
      if (grown !== undefined) next.zIndex = 10;
      // On the node wrapper, which is the element whose size and transform
      // change — so the growth is the Card's own, its handles and Edges travel
      // with it rather than snapping ahead of it, and a pushed neighbour slides.
      // Withheld from the Card being dragged, whose transform must track the
      // pointer, and from every Card during a resize for the same reason.
      if (!resizing) {
        next.style = {
          transition:
            dragging === node.id
              ? 'width 200ms ease, height 200ms ease'
              : 'width 200ms ease, height 200ms ease, transform 200ms ease',
        };
      }
      return next;
    });
  }, [
    projected,
    expansion,
    content,
    caret,
    selected,
    dragging,
    resizing,
    toggle,
    resize,
    rename,
    write,
  ]);

  /** Each Card's own name, following a rename, for the readout to print. */
  const titles = useMemo(
    () => new Map([...titleOf].map(([id, was]) => [id, content.get(id)?.title ?? was])),
    [content],
  );

  const onNodesChange: OnNodesChange<CardFlowNode> = useCallback(
    (changes) => {
      for (const change of changes) {
        if (change.type === 'select') {
          setResizing(false);
          setSelected(change.selected ? change.id : null);
        }
        if (change.type === 'position') {
          setDragging(change.dragging === true ? change.id : null);
          if (change.position === undefined || drawn === null) continue;
          // React Flow types a node id as `string`; the Card identity behind it
          // comes back off the placement rather than being asserted onto the
          // change, which is the repair CLAUDE.md puts at the adapter seam.
          const card = drawn.cards.find((candidate) => candidate.id === change.id);
          if (card === undefined) continue;
          const offset = push ? displacementOf(drawn.cards, card) : NO_DISPLACEMENT;
          move(card.id, change.position, offset);
        }
      }
    },
    [drawn, push, move],
  );

  if (laidOut instanceof Error) return <PlacementFailure reason={laidOut} />;

  return (
    <div className="proto-canvas proto-canvas--sectioned" style={cardSizeVars}>
      <ReactFlow
        nodes={nodes}
        edges={projected === null ? [] : [...projected.edges]}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        fitView
        fitViewOptions={OVERVIEW_FIT}
        minZoom={0.2}
        maxZoom={MAX_ZOOM}
        // Field controls own their clicks. Keep React Flow's double-click zoom
        // withdrawn too, so a rapid edit activation cannot zoom the canvas
        // underneath the Card as the display swaps to its editor.
        zoomOnDoubleClick={false}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={24} />
        <Controls showInteractive={false} />
      </ReactFlow>
      <PlacementReadout drawn={drawn} expansion={expansion} titles={titles} />
    </div>
  );
}

/** What a Layout would have to store, printed as it changes. */
function PlacementReadout({
  drawn,
  expansion,
  titles,
}: {
  readonly drawn: LayoutStrategyGraph | null;
  readonly expansion: Expansion;
  readonly titles: ReadonlyMap<CardId, string>;
}) {
  const rows =
    drawn === null
      ? []
      : drawn.cards.flatMap((card) => {
          const grown = expansion.get(card.id);
          const displaced = displacementOf(drawn.cards, card);
          if (grown === undefined && displaced.x === 0 && displaced.y === 0) return [];
          const name = titles.get(card.id) ?? card.id;
          const size = grown === undefined ? '' : ` · ${grown.width}x${grown.height}`;
          const push =
            displaced.x === 0 && displaced.y === 0
              ? ''
              : ` · pushed +${displaced.x},+${displaced.y}`;
          return [`${name}${size}${push}`];
        });

  return (
    <div className="proto-readout-panel inv-mono">
      <p className="proto-readout-panel__title">Placement</p>
      {rows.length === 0 ? (
        <p className="proto-readout-panel__row">no Card expanded</p>
      ) : (
        rows.map((row) => (
          <p key={row} className="proto-readout-panel__row">
            {row}
          </p>
        ))
      )}
    </div>
  );
}

export function ExpandingCanvas({
  behaviour,
  initiallyExpanded = [],
}: {
  readonly behaviour: CanvasBehaviour;
  /** The Cards the Layout opens Expanded. */
  readonly initiallyExpanded?: readonly CardId[];
}) {
  return (
    <ReactFlowProvider>
      <Canvas behaviour={behaviour} initiallyExpanded={initiallyExpanded} />
    </ReactFlowProvider>
  );
}

/** The one switch left, so the collision is still felt both ways (ADR 0064). */
export function BehaviourControls({
  behaviour,
  onChange,
}: {
  readonly behaviour: CanvasBehaviour;
  readonly onChange: (next: CanvasBehaviour) => void;
}) {
  return (
    <div className="proto-switches">
      <label className="proto-switch">
        <input
          type="checkbox"
          checked={behaviour.pushNeighbours}
          onChange={(event) => onChange({ pushNeighbours: event.currentTarget.checked })}
        />
        <span className="proto-switch__label inv-mono">push neighbours</span>
        <span className="proto-switch__note">
          On, the Cards +x and +y of an Expanding Card take its growth on their own position —
          derived, so collapsing puts them back exactly and the authored Layout never changes. Off,
          the Expanded Card overlaps whatever was there.
        </span>
      </label>
    </div>
  );
}
