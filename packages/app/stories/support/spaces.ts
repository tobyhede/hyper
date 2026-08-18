import { uuidSchema, type GraphEdge, type LayoutPosition, type SpaceSnapshot } from '@project/core';
import { loadSpace, loadSpaceSnapshot, newSpace, type Space } from '@project/graph';

/**
 * The Spaces the catalogue's stories draw.
 *
 * ADR 0052 makes the stable stories production-parity evidence, so a fixture
 * that *transcribes* what production derives is the one thing they must not be:
 * the sidebar's Graph colours used to be hex literals copied out of
 * `GRAPH_PALETTE` under a comment promising they matched, which is parity held
 * by a comment. These go through the same intake production does — a story
 * cannot draw a Space the app would refuse — and everything derived is derived
 * here too.
 *
 * Both are loaded at module scope, so a literal that stops parsing takes the
 * story down with a message instead of rendering something subtly wrong.
 */

const loaded = (result: { ok: true; space: Space } | { ok: false; errors: unknown[] }): Space => {
  if (!result.ok) throw new Error(`Story Space did not load: ${JSON.stringify(result.errors)}`);
  return result.space;
};

const CARD_A = uuidSchema.parse('00000000-0000-4000-8000-000000000002');
const CARD_B = uuidSchema.parse('00000000-0000-4000-8000-000000000003');
const CARD_C = uuidSchema.parse('00000000-0000-4000-8000-000000000005');
const CARD_D = uuidSchema.parse('00000000-0000-4000-8000-000000000006');
const CARD_E = uuidSchema.parse('00000000-0000-4000-8000-00000000000c');

/** Five Cards in a row. The sidebar draws none of them; the geometry only has to be legal. */
const SPINE = [CARD_A, CARD_B, CARD_C, CARD_D, CARD_E] as const;

const positions = (count: number): Record<string, LayoutPosition> =>
  Object.fromEntries(SPINE.slice(0, count).map((id, index) => [id, { x: index * 420, y: 0 }]));

/** The first `links` steps along the spine: three Graphs of one shape at three lengths. */
const chain = (links: number): GraphEdge[] =>
  SPINE.flatMap((from, index) => {
    const to = SPINE[index + 1];
    return index < links && to !== undefined ? [{ from, to }] : [];
  });

/**
 * A Space with two authored Layouts and the four Graphs they own.
 *
 * **No Graph carries a colour.** A Graph without one takes a palette slot by
 * order through `graphColorMap`, and the flatten across Layouts in declared
 * order (ADR 0045) puts Long, Mid, Short and Echo in the first four slots — the
 * same blue, amber, green and pink the fixture used to write out by hand.
 * Deriving them is the point: a palette edit reaches the story, and the story
 * cannot claim a colour production would not give it.
 */
const authoredSnapshot: SpaceSnapshot = {
  id: uuidSchema.parse('00000000-0000-4000-8000-000000000040'),
  document: {
    version: 1,
    title: 'Workspace',
    layouts: [
      {
        id: uuidSchema.parse('00000000-0000-4000-8000-000000000020'),
        title: 'Collection 1',
        kind: 'positioned',
        positions: positions(5),
        graphs: [
          {
            id: uuidSchema.parse('00000000-0000-4000-8000-000000000030'),
            title: 'Long',
            edges: chain(4),
          },
          {
            id: uuidSchema.parse('00000000-0000-4000-8000-000000000031'),
            title: 'Mid',
            edges: chain(3),
          },
          {
            id: uuidSchema.parse('00000000-0000-4000-8000-000000000032'),
            title: 'Short',
            edges: chain(2),
          },
        ],
      },
      {
        id: uuidSchema.parse('00000000-0000-4000-8000-000000000021'),
        title: 'Collection 2',
        kind: 'positioned',
        positions: positions(2),
        graphs: [
          {
            id: uuidSchema.parse('00000000-0000-4000-8000-000000000033'),
            title: 'Echo',
            edges: chain(1),
          },
        ],
      },
    ],
  },
  cards: SPINE.map((id, index) => ({
    id,
    document: { title: `Card ${index + 1}`, kind: 'markdown', body: '' },
  })),
};

export const authoredSpace: Space = loaded(loadSpaceSnapshot(authoredSnapshot));

/**
 * A Space before its first Edit: one Card, no Layout and so no Graph.
 *
 * `newSpace()` is the one encoding of ADR 0018, and a hand-written snapshot
 * beside it would be a second — the story would go on saying "one Card" long
 * after the rule said something else. It returns the **on-disk** shape, a space
 * file and its card files, which is why this is `loadSpace` rather than
 * `loadSpaceSnapshot`.
 *
 * It mints fresh ids on every page load, and nothing reads one: no story and no
 * Ladle spec names a Card, a Layout or a Graph of this Space.
 */
const minted = newSpace();
export const unauthoredSpace: Space = loaded(loadSpace(minted.file, minted.cardFiles));
