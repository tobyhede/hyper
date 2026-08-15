import { CardFace, type CardFaceState } from './CardFace';
import {
  CARD_HEIGHT,
  CARD_WIDTH,
  EDGE_COLOR,
  cardIds,
  cards,
  colorByGraphId,
  graphs,
  positions,
  spaceCard,
} from './fixture';

/**
 * The Layout overview, drawn statically: every Graph the Layout owns, each as a
 * coloured line, with the Active Graph emphasised.
 *
 * **No React Flow.** The inventory is about spacing and hierarchy, and a live
 * flow instance would bring async layout, a viewport transform and measured
 * handles into a page whose whole value is being deterministic. The geometry
 * here is hand-authored; the product's is ELK's.
 *
 * Activation is **emphasis, not filtering** — the non-active Graph stays drawn
 * and is dimmed. That is the rule at all times, not only while presenting, and
 * it is the reason two Graphs need to be told apart by colour at all.
 */

const EDGE_STROKE = 3;
/** Vertical separation between two Graphs meeting the same Card. */
const GRAPH_LANE = 16;

export interface StaticCanvasProps {
  readonly activeGraphId?: string;
  readonly cardStates?: Readonly<Record<string, CardFaceState>>;
  readonly width?: number;
  readonly height?: number;
}

export function StaticCanvas({
  activeGraphId = graphs[0]?.id,
  cardStates = {},
  width = 1720,
  height = 530,
}: StaticCanvasProps) {
  const lane = (graphIndex: number): number => (graphIndex - (graphs.length - 1) / 2) * GRAPH_LANE;

  return (
    <div className="inv-canvas" style={{ width, height }}>
      <svg
        width={width}
        height={height}
        style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
        aria-hidden="true"
      >
        {graphs.map((graph, graphIndex) => {
          const color = colorByGraphId[graph.id] ?? '#000';
          const stroke = EDGE_COLOR[color] ?? color;
          const dimmed = activeGraphId !== undefined && graph.id !== activeGraphId;
          return (
            <g key={graph.id} opacity={dimmed ? 0.35 : 1}>
              {graph.edges.map((edge) => {
                const from = positions[edge.from];
                const to = positions[edge.to];
                if (from === undefined || to === undefined) return null;
                const y = lane(graphIndex);
                const x1 = from.x + CARD_WIDTH;
                const y1 = from.y + CARD_HEIGHT / 2 + y;
                const x2 = to.x;
                const y2 = to.y + CARD_HEIGHT / 2 + y;
                const bend = Math.max(70, (x2 - x1) / 2);
                return (
                  <path
                    key={`${edge.from}-${edge.to}`}
                    d={`M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`}
                    fill="none"
                    stroke={stroke}
                    strokeWidth={EDGE_STROKE}
                    strokeLinecap="round"
                  />
                );
              })}
            </g>
          );
        })}
      </svg>

      {cards.map((card) => {
        const point = positions[card.id];
        if (point === undefined) return null;
        const target =
          card.kind === 'alias' ? cards.find((other) => other.id === card.target) : undefined;
        // The colour a Card's rail takes is the Active Graph's, whichever Graphs
        // it happens to sit on — the handles are Graph-independent (ADR 0033).
        const activeColor = colorByGraphId[activeGraphId ?? ''] ?? '#ffc53d';
        return (
          <div key={card.id} style={{ position: 'absolute', left: point.x, top: point.y }}>
            <CardFace
              title={card.title}
              kind={card.kind}
              state={cardStates[card.id] ?? 'rest'}
              graphColor={activeColor}
              {...(target === undefined ? {} : { aliasOf: target.title })}
            />
          </div>
        );
      })}

      {/* The proposed `space` kind, placed and on no Graph. */}
      <div
        style={{
          position: 'absolute',
          left: positions[cardIds.collection]?.x,
          top: positions[cardIds.collection]?.y,
        }}
      >
        <CardFace
          title={spaceCard.title}
          kind="space"
          state={cardStates[spaceCard.id] ?? 'rest'}
          graphColor={colorByGraphId[activeGraphId ?? ''] ?? '#ffc53d'}
        />
      </div>
    </div>
  );
}
